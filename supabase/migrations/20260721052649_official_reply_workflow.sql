BEGIN;

-- Restore the student-facing database contracts that previously lived in
-- supabase/20260720_operational_hardening.sql outside the migration chain.
-- Keeping them at the start of this still-pending migration guarantees that
-- every function below has its authorization dependencies available.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.is_admin = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_verified_school_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM auth.users account
    WHERE account.id = auth.uid()
      AND account.email_confirmed_at IS NOT NULL
      AND lower(account.email) ~ '^[a-z0-9._%+\-]+@dshs\.kr$'
  );
$$;

CREATE OR REPLACE FUNCTION public.proposal_allows_interaction(
  p_proposal_id UUID,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_is_verified_school_member() AND EXISTS (
    SELECT 1
    FROM public.proposals proposal
    WHERE proposal.id = p_proposal_id
      AND CASE p_action
        WHEN 'vote' THEN proposal.status = 'active'
          AND proposal.moderation_status = 'visible'
        WHEN 'comment' THEN proposal.status <> 'blinded'
          AND proposal.moderation_status = 'visible'
        WHEN 'report' THEN proposal.status <> 'blinded'
          AND proposal.moderation_status = 'visible'
          AND proposal.author_id <> auth.uid()
        WHEN 'save' THEN (
          proposal.moderation_status = 'visible'
          OR proposal.author_id = auth.uid()
          OR public.current_user_is_admin()
        )
        ELSE FALSE
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.create_proposal(
  p_category TEXT,
  p_title TEXT,
  p_body TEXT,
  p_is_anonymous BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;
  IF p_category NOT IN ('#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타')
     OR char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 2 AND 60
     OR char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Invalid proposal input';
  END IF;

  INSERT INTO public.proposals(author_id, category, title, body, is_anonymous)
  VALUES (auth.uid(), btrim(p_category), btrim(p_title), btrim(p_body), p_is_anonymous)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Recommendation changes are serialized against the proposal row. The vote
-- trigger remains responsible for the cached counter and automatic selection.
CREATE OR REPLACE FUNCTION public.set_proposal_vote(
  p_proposal_id UUID,
  p_should_vote BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status TEXT;
  current_moderation TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;

  SELECT proposal.status, proposal.moderation_status
  INTO current_status, current_moderation
  FROM public.proposals proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF current_status <> 'active' OR current_moderation <> 'visible' THEN
    RAISE EXCEPTION 'Recommendations are closed for this proposal';
  END IF;

  IF p_should_vote THEN
    INSERT INTO public.votes(proposal_id, user_id)
    VALUES (p_proposal_id, auth.uid())
    ON CONFLICT (proposal_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.votes vote
    WHERE vote.proposal_id = p_proposal_id
      AND vote.user_id = auth.uid();
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.votes vote
    WHERE vote.proposal_id = p_proposal_id
      AND vote.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_proposal_comments(p_proposal_id UUID)
RETURNS TABLE (
  id UUID,
  proposal_id UUID,
  author_id UUID,
  content TEXT,
  is_anonymous BOOLEAN,
  created_at TIMESTAMPTZ,
  author_name TEXT,
  author_grade INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.proposals proposal
    WHERE proposal.id = p_proposal_id
      AND (
        (proposal.status <> 'blinded' AND proposal.moderation_status = 'visible')
        OR proposal.author_id = auth.uid()
        OR public.current_user_is_admin()
      )
  ) THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  RETURN QUERY
  SELECT
    comment.id,
    comment.proposal_id,
    CASE
      WHEN comment.author_id = auth.uid() OR public.current_user_is_admin()
        THEN comment.author_id
      ELSE NULL
    END,
    comment.content,
    comment.is_anonymous,
    comment.created_at,
    CASE
      WHEN NOT comment.is_anonymous
        OR comment.author_id = auth.uid()
        OR public.current_user_is_admin()
        THEN profile.name
      ELSE NULL
    END,
    profile.grade
  FROM public.comments comment
  JOIN public.profiles profile ON profile.id = comment.author_id
  WHERE comment.proposal_id = p_proposal_id
  ORDER BY comment.created_at ASC, comment.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_proposal(
  p_proposal_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (outcome TEXT, report_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_rows INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;
  IF char_length(COALESCE(p_reason, '')) > 300 THEN
    RAISE EXCEPTION 'Report reason is too long';
  END IF;
  IF NOT public.proposal_allows_interaction(p_proposal_id, 'report') THEN
    RAISE EXCEPTION 'This proposal cannot be reported';
  END IF;

  INSERT INTO public.reports(proposal_id, reporter_id, reason)
  VALUES (
    p_proposal_id,
    auth.uid(),
    NULLIF(btrim(COALESCE(p_reason, '')), '')
  )
  ON CONFLICT (proposal_id, reporter_id) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  RETURN QUERY
  SELECT
    CASE WHEN inserted_rows = 1 THEN 'created' ELSE 'already_reported' END,
    count(*)::BIGINT
  FROM public.reports report
  WHERE report.proposal_id = p_proposal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_reported_proposal(p_proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_is_verified_school_member()
    AND EXISTS (
      SELECT 1
      FROM public.reports report
      WHERE report.proposal_id = p_proposal_id
        AND report.reporter_id = auth.uid()
    );
$$;

-- The notice ribbon represents actual delivery events, not unrelated updates
-- to proposals that happened to be in a later workflow state.
INSERT INTO public.proposal_status_events(
  proposal_id,
  from_status,
  to_status,
  public_message,
  internal_note,
  changed_by,
  source,
  created_at
)
SELECT
  proposal.id,
  'active',
  'selected',
  '추천 30표를 달성하여 학생회에 전달되었습니다.',
  NULL,
  NULL,
  'system',
  proposal.updated_at
FROM public.proposals proposal
WHERE proposal.status IN ('selected', 'discussing', 'done', 'rejected')
  AND proposal.vote_count >= 30
  AND NOT EXISTS (
    SELECT 1
    FROM public.proposal_status_events event
    WHERE event.proposal_id = proposal.id
      AND event.to_status = 'selected'
  );

CREATE OR REPLACE FUNCTION public.get_notice_stats()
RETURNS TABLE (delivered_this_month BIGINT, latest_delivered_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;

  RETURN QUERY
  WITH first_delivery AS (
    SELECT event.proposal_id, min(event.created_at) AS delivered_at
    FROM public.proposal_status_events event
    WHERE event.to_status = 'selected'
    GROUP BY event.proposal_id
  )
  SELECT
    count(*) FILTER (
      WHERE delivery.delivered_at >= date_trunc('month', NOW())
    )::BIGINT,
    max(delivery.delivered_at)
  FROM first_delivery delivery;
END;
$$;

-- RLS remains the final guard even though writes use the RPCs above.
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "votes_select_all" ON public.votes;
DROP POLICY IF EXISTS "votes_select_own" ON public.votes;
DROP POLICY IF EXISTS "votes_insert_own" ON public.votes;
DROP POLICY IF EXISTS "votes_delete_own" ON public.votes;
CREATE POLICY "votes_select_own"
  ON public.votes FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.current_user_is_admin())
  );
CREATE POLICY "votes_insert_own"
  ON public.votes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.proposal_allows_interaction(proposal_id, 'vote'))
  );
CREATE POLICY "votes_delete_own"
  ON public.votes FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.proposal_allows_interaction(proposal_id, 'vote'))
  );
REVOKE ALL ON public.votes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.votes TO authenticated;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "comments_select_own_or_admin" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_admin" ON public.comments;
CREATE POLICY "comments_select_own_or_admin"
  ON public.comments FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = author_id
    OR (SELECT public.current_user_is_admin())
  );
CREATE POLICY "comments_insert_own"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND (SELECT public.proposal_allows_interaction(proposal_id, 'comment'))
  );
CREATE POLICY "comments_delete_own"
  ON public.comments FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = author_id);
CREATE POLICY "comments_delete_admin"
  ON public.comments FOR DELETE TO authenticated
  USING ((SELECT public.current_user_is_admin()));
REVOKE ALL ON public.comments FROM PUBLIC, anon, authenticated;
GRANT INSERT (proposal_id, author_id, content, is_anonymous), DELETE
  ON public.comments TO authenticated;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
DROP POLICY IF EXISTS "reports_select_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_admin" ON public.reports;
CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = reporter_id);
CREATE POLICY "reports_select_admin"
  ON public.reports FOR SELECT TO authenticated
  USING ((SELECT public.current_user_is_admin()));
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND (SELECT public.proposal_allows_interaction(proposal_id, 'report'))
  );
CREATE POLICY "reports_delete_admin"
  ON public.reports FOR DELETE TO authenticated
  USING ((SELECT public.current_user_is_admin()));
REVOKE ALL ON public.reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reports TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_is_admin()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_is_verified_school_member()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.proposal_allows_interaction(UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_proposal(TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_proposal_vote(UUID, BOOLEAN)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_proposal_comments(UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_proposal(UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_reported_proposal(UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_notice_stats()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_verified_school_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_allows_interaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proposal(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_proposal_vote(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_comments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_proposal(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_reported_proposal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notice_stats() TO authenticated;

-- Preserve every published version even though official_replies keeps the
-- single currently displayed reply for backwards compatibility.
CREATE TABLE IF NOT EXISTS public.official_reply_revisions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
  action           TEXT NOT NULL CHECK (action IN ('published', 'updated')),
  content          TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 3 AND 1200),
  signed_by        TEXT NOT NULL CHECK (char_length(btrim(signed_by)) BETWEEN 2 AND 40),
  proposal_status  TEXT NOT NULL CHECK (proposal_status IN ('discussing', 'done', 'rejected')),
  public_message   TEXT NOT NULL CHECK (char_length(btrim(public_message)) BETWEEN 3 AND 500),
  changed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, revision_no)
);

ALTER TABLE public.official_reply_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reply_revisions_select_admin" ON public.official_reply_revisions;
CREATE POLICY "reply_revisions_select_admin"
  ON public.official_reply_revisions
  FOR SELECT
  TO authenticated
  USING ((SELECT public.current_user_is_admin()));

REVOKE ALL ON public.official_reply_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.official_reply_revisions TO authenticated;

CREATE INDEX IF NOT EXISTS idx_reply_revisions_proposal_created
  ON public.official_reply_revisions(proposal_id, created_at DESC, id DESC);

-- Preserve legacy replies that were published before revision tracking was
-- introduced. Invalid active-state replies stay hidden and are not promoted.
INSERT INTO public.official_reply_revisions(
  proposal_id,
  revision_no,
  action,
  content,
  signed_by,
  proposal_status,
  public_message,
  changed_by,
  created_at
)
SELECT
  reply.proposal_id,
  1,
  'published',
  reply.content,
  reply.signed_by,
  proposal.status,
  '기존 공식 답변이 공개되었습니다.',
  reply.updated_by,
  COALESCE(reply.updated_at, reply.created_at)
FROM public.official_replies reply
JOIN public.proposals proposal ON proposal.id = reply.proposal_id
WHERE proposal.status IN ('discussing', 'done', 'rejected')
ON CONFLICT (proposal_id, revision_no) DO NOTHING;

-- Stage-only changes may move an eligible proposal into review, but final
-- states must go through publish_official_reply_as_admin so a public answer
-- can never be skipped.
CREATE OR REPLACE FUNCTION public.transition_proposal_status(
  p_proposal_id UUID,
  p_new_status TEXT,
  p_public_message TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_status TEXT;
  current_votes INTEGER;
  current_moderation TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_new_status NOT IN ('active', 'selected', 'discussing', 'done', 'rejected') THEN
    RAISE EXCEPTION 'Invalid proposal status';
  END IF;
  IF p_new_status IN ('done', 'rejected') THEN
    RAISE EXCEPTION 'Publish an official reply together with the final status';
  END IF;
  IF char_length(COALESCE(p_public_message, '')) > 500
     OR char_length(COALESCE(p_internal_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Status message is too long';
  END IF;

  SELECT p.status, p.vote_count, p.moderation_status
  INTO previous_status, current_votes, current_moderation
  FROM public.proposals p
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF previous_status IN ('done', 'rejected') THEN
    RAISE EXCEPTION 'A completed proposal can only revise its existing official reply';
  END IF;
  IF previous_status IN ('selected', 'discussing')
     AND p_new_status <> previous_status
     AND EXISTS (
       SELECT 1 FROM public.official_replies r WHERE r.proposal_id = p_proposal_id
     ) THEN
    RAISE EXCEPTION 'Use the official reply workflow to change a proposal that already has a reply';
  END IF;
  IF current_moderation <> 'visible' OR previous_status = 'blinded' THEN
    RAISE EXCEPTION 'Restore the proposal before changing workflow status';
  END IF;
  IF p_new_status IN ('selected', 'discussing') AND current_votes < 30 THEN
    RAISE EXCEPTION 'At least 30 votes are required for the selected workflow';
  END IF;

  INSERT INTO public.proposal_status_events(
    proposal_id, from_status, to_status, public_message, internal_note, changed_by, source
  ) VALUES (
    p_proposal_id,
    previous_status,
    p_new_status,
    NULLIF(btrim(COALESCE(p_public_message, '')), ''),
    NULLIF(btrim(COALESCE(p_internal_note, '')), ''),
    auth.uid(),
    'admin'
  );

  UPDATE public.proposals
  SET status = p_new_status
  WHERE id = p_proposal_id;

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(),
    p_proposal_id,
    'status_changed',
    jsonb_build_object(
      'from', previous_status,
      'to', p_new_status,
      'public_message', NULLIF(btrim(COALESCE(p_public_message, '')), ''),
      'internal_note', NULLIF(btrim(COALESCE(p_internal_note, '')), '')
    )
  );
END;
$$;

-- Publish a reply and its workflow result atomically. This is the only write
-- endpoint granted to application users for official replies.
CREATE OR REPLACE FUNCTION public.publish_official_reply_as_admin(
  p_proposal_id UUID,
  p_content TEXT,
  p_signed_by TEXT,
  p_new_status TEXT,
  p_public_message TEXT,
  p_internal_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_status TEXT;
  current_votes INTEGER;
  current_moderation TEXT;
  reply_exists BOOLEAN;
  next_revision INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_new_status NOT IN ('discussing', 'done', 'rejected') THEN
    RAISE EXCEPTION 'A reply must publish with discussing, done, or rejected status';
  END IF;
  IF char_length(btrim(COALESCE(p_content, ''))) NOT BETWEEN 3 AND 1200 THEN
    RAISE EXCEPTION 'Reply content must be between 3 and 1200 characters';
  END IF;
  IF char_length(btrim(COALESCE(p_signed_by, ''))) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'A valid signer is required';
  END IF;
  IF char_length(btrim(COALESCE(p_public_message, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A public status message between 3 and 500 characters is required';
  END IF;
  IF char_length(COALESCE(p_internal_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Internal note is too long';
  END IF;

  SELECT p.status, p.vote_count, p.moderation_status
  INTO previous_status, current_votes, current_moderation
  FROM public.proposals p
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF current_moderation <> 'visible' OR previous_status = 'blinded' THEN
    RAISE EXCEPTION 'Restore the proposal before publishing a reply';
  END IF;
  IF previous_status NOT IN ('selected', 'discussing', 'done', 'rejected') THEN
    RAISE EXCEPTION 'The proposal must enter the selected workflow before publishing a reply';
  END IF;
  IF previous_status IN ('done', 'rejected') AND p_new_status <> previous_status THEN
    RAISE EXCEPTION 'A completed proposal reply can only be revised without changing its result';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.official_replies r WHERE r.proposal_id = p_proposal_id
  ) INTO reply_exists;

  IF current_votes < 30 AND NOT (
    reply_exists AND previous_status IN ('done', 'rejected')
  ) THEN
    RAISE EXCEPTION 'At least 30 votes are required before publishing an official reply';
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1
  INTO next_revision
  FROM public.official_reply_revisions r
  WHERE r.proposal_id = p_proposal_id;

  INSERT INTO public.official_replies(
    proposal_id, content, signed_by, created_at, updated_at, updated_by
  )
  VALUES (
    p_proposal_id, btrim(p_content), btrim(p_signed_by), NOW(), NOW(), auth.uid()
  )
  ON CONFLICT (proposal_id) DO UPDATE
  SET content = EXCLUDED.content,
      signed_by = EXCLUDED.signed_by,
      updated_at = NOW(),
      updated_by = auth.uid();

  INSERT INTO public.official_reply_revisions(
    proposal_id,
    revision_no,
    action,
    content,
    signed_by,
    proposal_status,
    public_message,
    changed_by
  ) VALUES (
    p_proposal_id,
    next_revision,
    CASE WHEN reply_exists THEN 'updated' ELSE 'published' END,
    btrim(p_content),
    btrim(p_signed_by),
    p_new_status,
    btrim(p_public_message),
    auth.uid()
  );

  IF previous_status <> p_new_status OR NOT EXISTS (
    SELECT 1
    FROM public.proposal_status_events e
    WHERE e.proposal_id = p_proposal_id
      AND e.to_status = p_new_status
  ) THEN
    INSERT INTO public.proposal_status_events(
      proposal_id, from_status, to_status, public_message, internal_note, changed_by, source
    ) VALUES (
      p_proposal_id,
      previous_status,
      p_new_status,
      btrim(p_public_message),
      NULLIF(btrim(COALESCE(p_internal_note, '')), ''),
      auth.uid(),
      'admin'
    );

  END IF;

  IF previous_status <> p_new_status THEN
    UPDATE public.proposals
    SET status = p_new_status
    WHERE id = p_proposal_id;
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(),
    p_proposal_id,
    'official_reply_published',
    jsonb_build_object(
      'from', previous_status,
      'to', p_new_status,
      'signed_by', btrim(p_signed_by),
      'revision_no', next_revision,
      'content_length', char_length(btrim(p_content)),
      'public_message', btrim(p_public_message),
      'internal_note', NULLIF(btrim(COALESCE(p_internal_note, '')), '')
    )
  );
END;
$$;

-- Students can read only the public portion of workflow events. Internal
-- notes and the administrator identity never leave this function.
CREATE OR REPLACE FUNCTION public.get_public_proposal_status_history(
  p_proposal_id UUID
)
RETURNS TABLE (
  id UUID,
  proposal_id UUID,
  from_status TEXT,
  to_status TEXT,
  public_message TEXT,
  source TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.proposals p
    WHERE p.id = p_proposal_id
      AND (
        (p.moderation_status = 'visible' AND p.status <> 'blinded')
        OR p.author_id = auth.uid()
        OR public.current_user_is_admin()
      )
  ) THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.proposal_id,
    e.from_status,
    e.to_status,
    e.public_message,
    e.source,
    e.created_at
  FROM public.proposal_status_events e
  WHERE e.proposal_id = p_proposal_id
  ORDER BY e.created_at ASC, e.id ASC;
END;
$$;

-- Reply notifications go to the author and to voters who explicitly enabled
-- notifications for proposals they recommended.
CREATE OR REPLACE FUNCTION public.notify_official_reply_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proposal_author UUID;
  proposal_title TEXT;
BEGIN
  SELECT p.author_id, p.title INTO proposal_author, proposal_title
  FROM public.proposals p WHERE p.id = NEW.proposal_id;

  IF proposal_author IS NOT NULL
     AND COALESCE((
       SELECT s.on_reply
       FROM public.notification_settings s
       WHERE s.user_id = proposal_author
     ), TRUE) THEN
    INSERT INTO public.notifications(
      user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at
    )
    VALUES (
      proposal_author,
      NEW.proposal_id,
      'reply',
      '학생회 공식 답변이 등록되었습니다',
      proposal_title,
      NOW(),
      NULL,
      NULL
    )
    ON CONFLICT (user_id, proposal_id, kind) DO UPDATE
    SET title = EXCLUDED.title,
        message = EXCLUDED.message,
        created_at = NOW(),
        read_at = NULL,
        dismissed_at = NULL;
  END IF;

  INSERT INTO public.notifications(
    user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at
  )
  SELECT
    v.user_id,
    NEW.proposal_id,
    'reply',
    '추천한 안건에 공식 답변이 등록되었습니다',
    proposal_title,
    NOW(),
    NULL,
    NULL
  FROM public.votes v
  LEFT JOIN public.notification_settings settings ON settings.user_id = v.user_id
  WHERE v.proposal_id = NEW.proposal_id
    AND v.user_id <> proposal_author
    AND COALESCE(settings.on_voted, FALSE)
  ON CONFLICT (user_id, proposal_id, kind) DO UPDATE
  SET title = EXCLUDED.title,
      message = EXCLUDED.message,
      created_at = NOW(),
      read_at = NULL,
      dismissed_at = NULL;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_official_reply_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- Remove all bypasses around the transactional publishing function.
REVOKE EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_public_proposal_status_history(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_proposal_status_history(UUID)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_official_reply_as_admin(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_proposal_status(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON public.official_replies FROM authenticated;

COMMIT;

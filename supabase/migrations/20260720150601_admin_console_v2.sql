-- StudentVoice admin console v2 (additive rollout)
-- Apply together with the admin console frontend. This migration keeps the
-- legacy `status = 'blinded'` convention so the currently deployed frontend
-- continues to hide moderated posts during a staged rollout.

-- ── 1. Workflow and moderation metadata ──────────────────────

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS status_before_moderation TEXT,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID;

ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('active', 'selected', 'discussing', 'done', 'rejected', 'blinded'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposals_moderation_status_check'
      AND conrelid = 'public.proposals'::regclass
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_moderation_status_check
      CHECK (moderation_status IN ('visible', 'blinded', 'trashed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposals_moderated_by_fkey'
      AND conrelid = 'public.proposals'::regclass
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_moderated_by_fkey
      FOREIGN KEY (moderated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

UPDATE public.proposals
SET moderation_status = 'blinded',
    status_before_moderation = COALESCE(status_before_moderation, 'active')
WHERE status = 'blinded'
  AND moderation_status = 'visible';

ALTER TABLE public.official_replies
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'official_replies_updated_by_fkey'
      AND conrelid = 'public.official_replies'::regclass
  ) THEN
    ALTER TABLE public.official_replies
      ADD CONSTRAINT official_replies_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 2. Audit, status history, and notifications ─────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposal_id  UUID,
  action       TEXT NOT NULL,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_status_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  public_message   TEXT,
  internal_note    TEXT,
  changed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source           TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'system')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_status IS NULL OR from_status IN ('active', 'selected', 'discussing', 'done', 'rejected')),
  CHECK (to_status IN ('active', 'selected', 'discussing', 'done', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposal_id   UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('selected', 'discussing', 'done', 'rejected', 'reply')),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at       TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  UNIQUE (user_id, proposal_id, kind)
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_admin" ON public.admin_audit_logs;
CREATE POLICY "audit_select_admin" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING ((SELECT public.current_user_is_admin()));

DROP POLICY IF EXISTS "status_events_select_admin" ON public.proposal_status_events;
CREATE POLICY "status_events_select_admin" ON public.proposal_status_events FOR SELECT TO authenticated
  USING ((SELECT public.current_user_is_admin()));

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.proposal_status_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at, dismissed_at) ON public.notifications TO authenticated;

-- ── 3. Query indexes ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_proposals_admin_workflow
  ON public.proposals(status, moderation_status, vote_count DESC, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_near_threshold
  ON public.proposals(vote_count DESC, updated_at DESC, id DESC)
  WHERE status = 'active' AND vote_count >= 20 AND vote_count < 30;
CREATE INDEX IF NOT EXISTS idx_reports_proposal_created
  ON public.reports(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON public.admin_audit_logs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created
  ON public.admin_audit_logs(admin_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_status_events_proposal_created
  ON public.proposal_status_events(proposal_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- ── 4. Admin dashboard and list RPCs ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_dashboard()
RETURNS TABLE (
  profiles BIGINT,
  active BIGINT,
  near_threshold BIGINT,
  selected BIGINT,
  discussing BIGINT,
  done_this_month BIGINT,
  reported_proposals BIGINT,
  total_reports BIGINT,
  blinded BIGINT,
  trashed BIGINT,
  last_activity_at TIMESTAMPTZ,
  schema_version TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.proposals WHERE status = 'active' AND moderation_status = 'visible'),
    (SELECT count(*) FROM public.proposals WHERE status = 'active' AND moderation_status = 'visible' AND vote_count BETWEEN 20 AND 29),
    (SELECT count(*) FROM public.proposals WHERE status = 'selected' AND moderation_status = 'visible'),
    (SELECT count(*) FROM public.proposals WHERE status = 'discussing' AND moderation_status = 'visible'),
    (SELECT count(*) FROM public.proposals WHERE status = 'done' AND updated_at >= date_trunc('month', now())),
    (SELECT count(*) FROM (
      SELECT r.proposal_id FROM public.reports r GROUP BY r.proposal_id HAVING count(*) >= 3
    ) reported),
    (SELECT count(*) FROM public.reports),
    (SELECT count(*) FROM public.proposals WHERE moderation_status = 'blinded'),
    (SELECT count(*) FROM public.proposals WHERE moderation_status = 'trashed'),
    (SELECT max(a.created_at) FROM public.admin_audit_logs a),
    'admin-console-v2'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_proposals(
  p_scope TEXT DEFAULT 'all',
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  category TEXT,
  title TEXT,
  body TEXT,
  is_anonymous BOOLEAN,
  status TEXT,
  moderation_status TEXT,
  moderation_reason TEXT,
  vote_count INTEGER,
  view_count INTEGER,
  comment_count INTEGER,
  report_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  author_name TEXT,
  author_email TEXT,
  author_grade INTEGER,
  author_class INTEGER,
  official_reply_content TEXT,
  official_reply_signed_by TEXT,
  latest_public_message TEXT,
  latest_internal_note TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_scope NOT IN ('all', 'near', 'open', 'completed', 'blinded', 'trashed') THEN
    RAISE EXCEPTION 'Invalid scope';
  END IF;

  RETURN QUERY
  WITH report_totals AS (
    SELECT r.proposal_id, count(*) AS report_count
    FROM public.reports r
    GROUP BY r.proposal_id
  )
  SELECT
    p.id,
    p.author_id,
    p.category,
    p.title,
    p.body,
    p.is_anonymous,
    p.status,
    p.moderation_status,
    p.moderation_reason,
    p.vote_count,
    p.view_count,
    p.comment_count,
    COALESCE(rt.report_count, 0),
    p.created_at,
    p.updated_at,
    pr.name,
    pr.email,
    pr.grade,
    pr.class,
    reply.content,
    reply.signed_by,
    latest_event.public_message,
    latest_event.internal_note
  FROM public.proposals p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  LEFT JOIN report_totals rt ON rt.proposal_id = p.id
  LEFT JOIN public.official_replies reply ON reply.proposal_id = p.id
  LEFT JOIN LATERAL (
    SELECT e.public_message, e.internal_note
    FROM public.proposal_status_events e
    WHERE e.proposal_id = p.id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  ) latest_event ON TRUE
  WHERE
    CASE p_scope
      WHEN 'near' THEN p.status = 'active' AND p.moderation_status = 'visible' AND p.vote_count BETWEEN 20 AND 29
      WHEN 'open' THEN p.status IN ('selected', 'discussing') AND p.moderation_status = 'visible'
      WHEN 'completed' THEN p.status IN ('done', 'rejected') AND p.moderation_status = 'visible'
      WHEN 'blinded' THEN p.moderation_status = 'blinded'
      WHEN 'trashed' THEN p.moderation_status = 'trashed'
      ELSE TRUE
    END
    AND (p_category IS NULL OR p.category = p_category)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR p.title ILIKE '%' || btrim(p_search) || '%'
      OR p.body ILIKE '%' || btrim(p_search) || '%'
      OR pr.email ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      p_cursor_updated_at IS NULL
      OR (p.updated_at, p.id) < (p_cursor_updated_at, p_cursor_id)
    )
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_report_queue(
  p_limit INTEGER DEFAULT 100,
  p_cursor_latest_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_proposal_id UUID DEFAULT NULL
)
RETURNS TABLE (
  proposal_id UUID,
  report_count BIGINT,
  latest_at TIMESTAMPTZ,
  reasons JSONB,
  title TEXT,
  body TEXT,
  category TEXT,
  status TEXT,
  moderation_status TEXT,
  moderation_reason TEXT,
  vote_count INTEGER,
  comment_count INTEGER,
  is_anonymous BOOLEAN,
  author_name TEXT,
  author_email TEXT,
  author_grade INTEGER,
  author_class INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH report_rollup AS (
    SELECT
      r.proposal_id,
      count(*) AS report_count,
      max(r.created_at) AS latest_at,
      jsonb_agg(
        jsonb_build_object('id', r.id, 'reason', COALESCE(r.reason, ''), 'created_at', r.created_at)
        ORDER BY r.created_at DESC
      ) AS reasons
    FROM public.reports r
    GROUP BY r.proposal_id
    HAVING count(*) >= 3
  )
  SELECT
    rr.proposal_id,
    rr.report_count,
    rr.latest_at,
    rr.reasons,
    p.title,
    p.body,
    p.category,
    p.status,
    p.moderation_status,
    p.moderation_reason,
    p.vote_count,
    p.comment_count,
    p.is_anonymous,
    pr.name,
    pr.email,
    pr.grade,
    pr.class,
    p.created_at,
    p.updated_at
  FROM report_rollup rr
  JOIN public.proposals p ON p.id = rr.proposal_id
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p_cursor_latest_at IS NULL
     OR (rr.latest_at, rr.proposal_id) < (p_cursor_latest_at, p_cursor_proposal_id)
  ORDER BY rr.latest_at DESC, rr.proposal_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_activity(
  p_limit INTEGER DEFAULT 50,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  admin_id UUID,
  admin_name TEXT,
  admin_email TEXT,
  proposal_id UUID,
  proposal_title TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.admin_id,
    pr.name,
    pr.email,
    a.proposal_id,
    COALESCE(p.title, a.details ->> 'title'),
    a.action,
    a.details,
    a.created_at
  FROM public.admin_audit_logs a
  LEFT JOIN public.profiles pr ON pr.id = a.admin_id
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
  WHERE p_cursor_created_at IS NULL
     OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

-- ── 5. Transactional admin actions ──────────────────────────

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
  IF char_length(COALESCE(p_public_message, '')) > 500 OR char_length(COALESCE(p_internal_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Status message is too long';
  END IF;
  IF p_new_status IN ('done', 'rejected') AND char_length(btrim(COALESCE(p_public_message, ''))) < 3 THEN
    RAISE EXCEPTION 'A public result message is required';
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
    RAISE EXCEPTION 'Restore the proposal before changing workflow status';
  END IF;
  IF p_new_status IN ('selected', 'discussing', 'done', 'rejected') AND current_votes < 30 THEN
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

CREATE OR REPLACE FUNCTION public.moderate_proposal(
  p_proposal_id UUID,
  p_action TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status TEXT;
  current_moderation TEXT;
  previous_workflow TEXT;
  deleted_title TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_action NOT IN ('blind', 'unblind', 'trash', 'restore', 'delete') THEN
    RAISE EXCEPTION 'Invalid moderation action';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'A moderation reason between 3 and 300 characters is required';
  END IF;

  SELECT p.status, p.moderation_status, p.status_before_moderation, p.title
  INTO current_status, current_moderation, previous_workflow, deleted_title
  FROM public.proposals p
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF p_action = 'blind' THEN
    IF current_moderation <> 'visible' THEN RAISE EXCEPTION 'Proposal is already moderated'; END IF;
    UPDATE public.proposals
    SET status_before_moderation = current_status,
        status = 'blinded',
        moderation_status = 'blinded',
        moderation_reason = btrim(p_reason),
        moderated_at = NOW(),
        moderated_by = auth.uid()
    WHERE id = p_proposal_id;
  ELSIF p_action = 'unblind' THEN
    IF current_moderation <> 'blinded' THEN RAISE EXCEPTION 'Proposal is not blinded'; END IF;
    UPDATE public.proposals
    SET status = COALESCE(previous_workflow, 'active'),
        moderation_status = 'visible',
        moderation_reason = NULL,
        moderated_at = NOW(),
        moderated_by = auth.uid(),
        status_before_moderation = NULL
    WHERE id = p_proposal_id;
  ELSIF p_action = 'trash' THEN
    IF current_moderation = 'trashed' THEN RAISE EXCEPTION 'Proposal is already in trash'; END IF;
    UPDATE public.proposals
    SET status_before_moderation = CASE WHEN current_status = 'blinded' THEN previous_workflow ELSE current_status END,
        status = 'blinded',
        moderation_status = 'trashed',
        moderation_reason = btrim(p_reason),
        moderated_at = NOW(),
        moderated_by = auth.uid()
    WHERE id = p_proposal_id;
  ELSIF p_action = 'restore' THEN
    IF current_moderation <> 'trashed' THEN RAISE EXCEPTION 'Proposal is not in trash'; END IF;
    UPDATE public.proposals
    SET status = COALESCE(previous_workflow, 'active'),
        moderation_status = 'visible',
        moderation_reason = NULL,
        moderated_at = NOW(),
        moderated_by = auth.uid(),
        status_before_moderation = NULL
    WHERE id = p_proposal_id;
  ELSIF p_action = 'delete' THEN
    INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
    VALUES (
      auth.uid(), p_proposal_id, 'proposal_deleted',
      jsonb_build_object('title', deleted_title, 'reason', btrim(p_reason), 'previous_moderation', current_moderation)
    );
    DELETE FROM public.proposals WHERE id = p_proposal_id;
    RETURN;
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(), p_proposal_id, 'proposal_' || p_action,
    jsonb_build_object('title', deleted_title, 'reason', btrim(p_reason), 'previous_moderation', current_moderation)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_proposal_reports(
  p_proposal_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  removed_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'A resolution reason between 3 and 300 characters is required';
  END IF;

  DELETE FROM public.reports WHERE proposal_id = p_proposal_id;
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(), p_proposal_id, 'reports_resolved',
    jsonb_build_object('count', removed_count, 'reason', btrim(p_reason))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_official_reply_as_admin(
  p_proposal_id UUID,
  p_content TEXT,
  p_signed_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF char_length(btrim(COALESCE(p_content, ''))) < 3 OR char_length(p_content) > 1200 THEN
    RAISE EXCEPTION 'Reply content must be between 3 and 1200 characters';
  END IF;
  IF char_length(btrim(COALESCE(p_signed_by, ''))) < 2 OR char_length(p_signed_by) > 40 THEN
    RAISE EXCEPTION 'A valid signer is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = p_proposal_id) THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  INSERT INTO public.official_replies(proposal_id, content, signed_by, created_at, updated_at, updated_by)
  VALUES (p_proposal_id, btrim(p_content), btrim(p_signed_by), NOW(), NOW(), auth.uid())
  ON CONFLICT (proposal_id) DO UPDATE
  SET content = EXCLUDED.content,
      signed_by = EXCLUDED.signed_by,
      updated_at = NOW(),
      updated_by = auth.uid();

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(), p_proposal_id, 'official_reply_saved',
    jsonb_build_object('signed_by', btrim(p_signed_by))
  );
END;
$$;

-- ── 6. Student notifications for admin actions ──────────────

CREATE OR REPLACE FUNCTION public.update_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_status TEXT;
  current_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.status, p.vote_count
    INTO current_status, current_count
    FROM public.proposals p
    WHERE p.id = NEW.proposal_id
    FOR UPDATE;

    IF current_status = 'active' AND current_count + 1 >= 30 THEN
      INSERT INTO public.proposal_status_events(
        proposal_id, from_status, to_status, public_message, internal_note, changed_by, source
      ) VALUES (
        NEW.proposal_id, 'active', 'selected', '추천 30표를 달성하여 학생회에 자동 전달되었습니다.', NULL, NULL, 'system'
      );
      INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
      VALUES (
        NULL, NEW.proposal_id, 'proposal_auto_selected',
        jsonb_build_object('from', 'active', 'to', 'selected', 'vote_count', current_count + 1)
      );
    END IF;

    UPDATE public.proposals
    SET vote_count = current_count + 1,
        status = CASE
          WHEN current_status = 'active' AND current_count + 1 >= 30 THEN 'selected'
          ELSE current_status
        END
    WHERE id = NEW.proposal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.proposals
    SET vote_count = GREATEST(vote_count - 1, 0)
    WHERE id = OLD.proposal_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_vote_change ON public.votes;
CREATE TRIGGER on_vote_change
  AFTER INSERT OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.update_vote_count();

CREATE OR REPLACE FUNCTION public.notify_proposal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  status_title TEXT;
  status_message TEXT;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('selected', 'discussing', 'done', 'rejected') THEN
    RETURN NEW;
  END IF;

  status_title := CASE NEW.status
    WHEN 'selected' THEN '안건이 학생회에 전달되었습니다'
    WHEN 'discussing' THEN '안건 협의가 시작되었습니다'
    WHEN 'done' THEN '안건이 반영 완료되었습니다'
    WHEN 'rejected' THEN '안건 검토 결과가 등록되었습니다'
  END;

  SELECT COALESCE(e.public_message, NEW.title)
  INTO status_message
  FROM public.proposal_status_events e
  WHERE e.proposal_id = NEW.id AND e.to_status = NEW.status
  ORDER BY e.created_at DESC
  LIMIT 1;

  status_message := COALESCE(status_message, NEW.title);

  IF COALESCE((SELECT s.on_selected FROM public.notification_settings s WHERE s.user_id = NEW.author_id), TRUE) THEN
    INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
    VALUES (NEW.author_id, NEW.id, NEW.status, status_title, status_message, NOW(), NULL, NULL)
    ON CONFLICT (user_id, proposal_id, kind) DO UPDATE
    SET title = EXCLUDED.title,
        message = EXCLUDED.message,
        created_at = NOW(),
        read_at = NULL,
        dismissed_at = NULL;
  END IF;

  INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
  SELECT v.user_id, NEW.id, NEW.status, status_title, status_message, NOW(), NULL, NULL
  FROM public.votes v
  LEFT JOIN public.notification_settings settings ON settings.user_id = v.user_id
  WHERE v.proposal_id = NEW.id
    AND v.user_id <> NEW.author_id
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

DROP TRIGGER IF EXISTS on_proposal_status_notification ON public.proposals;
CREATE TRIGGER on_proposal_status_notification
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_status_change();

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
     AND COALESCE((SELECT s.on_reply FROM public.notification_settings s WHERE s.user_id = proposal_author), TRUE) THEN
    INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
    VALUES (proposal_author, NEW.proposal_id, 'reply', '학생회 공식 답변이 등록되었습니다', proposal_title, NOW(), NULL, NULL)
    ON CONFLICT (user_id, proposal_id, kind) DO UPDATE
    SET title = EXCLUDED.title,
        message = EXCLUDED.message,
        created_at = NOW(),
        read_at = NULL,
        dismissed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_official_reply_notification ON public.official_replies;
CREATE TRIGGER on_official_reply_notification
  AFTER INSERT OR UPDATE ON public.official_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_official_reply_change();

-- ── 7. Explicit RPC privileges ───────────────────────────────

REVOKE ALL ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_proposals(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_report_queue(INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_activity(INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_proposal_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_proposal(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_proposal_reports(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_official_reply_as_admin(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_vote_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_proposals(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_report_queue(INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_activity(INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_proposal_status(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_proposal(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_reports(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_official_reply_as_admin(UUID, TEXT, TEXT) TO authenticated;

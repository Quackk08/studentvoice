BEGIN;

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
  IF current_votes < 30 THEN
    RAISE EXCEPTION 'At least 30 votes are required before publishing an official reply';
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

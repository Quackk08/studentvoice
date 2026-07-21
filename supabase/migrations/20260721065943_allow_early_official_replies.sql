BEGIN;

-- Official replies may be published while an agenda is still collecting
-- recommendations. Early replies keep the agenda active, so the existing
-- 30-vote trigger can still promote it into the selected workflow later.
ALTER TABLE public.official_reply_revisions
  DROP CONSTRAINT IF EXISTS official_reply_revisions_proposal_status_check;

ALTER TABLE public.official_reply_revisions
  ADD CONSTRAINT official_reply_revisions_proposal_status_check
  CHECK (proposal_status IN ('active', 'discussing', 'done', 'rejected'))
  NOT VALID;

ALTER TABLE public.official_reply_revisions
  VALIDATE CONSTRAINT official_reply_revisions_proposal_status_check;

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
  IF p_new_status NOT IN ('active', 'discussing', 'done', 'rejected') THEN
    RAISE EXCEPTION 'A reply must publish with active, discussing, done, or rejected status';
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

  SELECT proposal.status, proposal.vote_count, proposal.moderation_status
  INTO previous_status, current_votes, current_moderation
  FROM public.proposals proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF current_moderation <> 'visible' OR previous_status = 'blinded' THEN
    RAISE EXCEPTION 'Restore the proposal before publishing a reply';
  END IF;
  IF previous_status NOT IN ('active', 'selected', 'discussing', 'done', 'rejected') THEN
    RAISE EXCEPTION 'This proposal cannot receive an official reply';
  END IF;
  IF previous_status = 'active' AND p_new_status <> 'active' THEN
    RAISE EXCEPTION 'An early reply must keep the proposal active until it reaches 30 votes';
  END IF;
  IF previous_status <> 'active' AND p_new_status = 'active' THEN
    RAISE EXCEPTION 'A selected proposal cannot return to active through the reply workflow';
  END IF;
  IF previous_status IN ('done', 'rejected') AND p_new_status <> previous_status THEN
    RAISE EXCEPTION 'A completed proposal reply can only be revised without changing its result';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.official_replies reply
    WHERE reply.proposal_id = p_proposal_id
  ) INTO reply_exists;

  IF current_votes < 30
     AND previous_status <> 'active'
     AND NOT (reply_exists AND previous_status IN ('done', 'rejected')) THEN
    RAISE EXCEPTION 'At least 30 votes are required after a proposal enters the selected workflow';
  END IF;

  SELECT COALESCE(MAX(revision.revision_no), 0) + 1
  INTO next_revision
  FROM public.official_reply_revisions revision
  WHERE revision.proposal_id = p_proposal_id;

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
    FROM public.proposal_status_events event
    WHERE event.proposal_id = p_proposal_id
      AND event.to_status = p_new_status
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
      'early_reply', previous_status = 'active',
      'signed_by', btrim(p_signed_by),
      'revision_no', next_revision,
      'content_length', char_length(btrim(p_content)),
      'public_message', btrim(p_public_message),
      'internal_note', NULLIF(btrim(COALESCE(p_internal_note, '')), '')
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

COMMIT;

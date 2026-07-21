BEGIN;

-- Administrators may move a visible proposal between the non-final workflow
-- states regardless of its current vote count. Final outcomes still require an
-- official reply so the public result and the workflow state stay atomic.
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

  SELECT proposal.status, proposal.moderation_status
  INTO previous_status, current_moderation
  FROM public.proposals proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF previous_status IN ('done', 'rejected') THEN
    RAISE EXCEPTION 'A completed proposal can only revise its existing official reply';
  END IF;
  IF current_moderation <> 'visible' OR previous_status = 'blinded' THEN
    RAISE EXCEPTION 'Restore the proposal before changing workflow status';
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
      'manual_override', TRUE,
      'public_message', NULLIF(btrim(COALESCE(p_public_message, '')), ''),
      'internal_note', NULLIF(btrim(COALESCE(p_internal_note, '')), '')
    )
  );
END;
$$;

-- An official reply may either keep an active proposal collecting votes or
-- move it directly into discussion/a final result. Returning a selected
-- proposal to active remains a separate, explicit status-only action.
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

  SELECT proposal.status, proposal.moderation_status
  INTO previous_status, current_moderation
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
  IF previous_status <> 'active' AND p_new_status = 'active' THEN
    RAISE EXCEPTION 'Use the status-only workflow to return a proposal to active';
  END IF;
  IF previous_status IN ('done', 'rejected') AND p_new_status <> previous_status THEN
    RAISE EXCEPTION 'A completed proposal reply can only be revised without changing its result';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.official_replies reply
    WHERE reply.proposal_id = p_proposal_id
  ) INTO reply_exists;

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
      'early_reply', previous_status = 'active' AND p_new_status = 'active',
      'manual_override', previous_status = 'active' AND p_new_status <> 'active',
      'signed_by', btrim(p_signed_by),
      'revision_no', next_revision,
      'content_length', char_length(btrim(p_content)),
      'public_message', btrim(p_public_message),
      'internal_note', NULLIF(btrim(COALESCE(p_internal_note, '')), '')
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_proposal_status(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_proposal_status(UUID, TEXT, TEXT, TEXT)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_official_reply_as_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

COMMIT;

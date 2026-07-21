-- Prevent database functions from becoming Data API endpoints unless a later
-- migration grants EXECUTE explicitly to the roles that need them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

-- This counter runs only from the comments trigger. Keep all relation names
-- schema-qualified so the SECURITY DEFINER function can use an empty path.
CREATE OR REPLACE FUNCTION public.update_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.proposals AS proposal
    SET comment_count = proposal.comment_count + 1
    WHERE proposal.id = NEW.proposal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.proposals AS proposal
    SET comment_count = GREATEST(proposal.comment_count - 1, 0)
    WHERE proposal.id = OLD.proposal_id;
  END IF;

  RETURN NULL;
END;
$$;

-- The remaining functions already use schema-qualified relations (or only
-- built-ins), so their lookup paths can be locked without changing behavior.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- Trigger and event-trigger functions must never be callable through the Data
-- API. Triggers continue to invoke them after EXECUTE is revoked from API roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_comment_count()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_vote_count()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.notify_proposal_status_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.notify_official_reply_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_profile_account_role()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;

-- Student and legacy admin RPCs are signed-in operations. Their function
-- bodies perform the verified-student/admin checks; anonymous callers do not
-- need an executable endpoint at all.
REVOKE EXECUTE ON FUNCTION public.increment_view_count(UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_reported_proposals()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_proposal_status(UUID, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.increment_view_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reported_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_status(UUID, TEXT) TO authenticated;

-- Aggregate home statistics are intentionally available before login, but the
-- grant is explicit instead of inherited from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_public_home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_home_stats() TO anon, authenticated;

-- ============================================================
-- Security hardening for Student Voice
-- Run this after the base schema/migrations in Supabase SQL Editor.
-- ============================================================

-- Do not expose full profile rows to every signed-in user. The app should only
-- fetch full profile details for the current user or for administrators.
CREATE OR REPLACE FUNCTION current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  );
$$;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR current_user_is_admin()
  );

-- Restrict server-side status changes to admins inside the SECURITY DEFINER
-- function itself. RLS policies alone do not protect SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION update_proposal_status(proposal_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_status NOT IN ('active', 'selected', 'done', 'rejected', 'blinded') THEN
    RAISE EXCEPTION 'Invalid proposal status';
  END IF;

  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE proposals
  SET status = new_status
  WHERE id = proposal_id;
END;
$$;

-- Report aggregation is admin-only because reports can contain sensitive user
-- supplied moderation context.
CREATE OR REPLACE FUNCTION get_reported_proposals()
RETURNS TABLE (
  proposal_id UUID,
  report_count BIGINT,
  latest_reason TEXT,
  latest_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      r.proposal_id,
      COUNT(r.id) AS report_count,
      (SELECT reason FROM reports WHERE reports.proposal_id = r.proposal_id ORDER BY created_at DESC LIMIT 1) AS latest_reason,
      MAX(r.created_at) AS latest_at
    FROM reports r
    GROUP BY r.proposal_id
    HAVING COUNT(r.id) >= 3
    ORDER BY report_count DESC, latest_at DESC;
END;
$$;

-- Keep the view counter callable but make the execution context explicit.
CREATE OR REPLACE FUNCTION increment_view_count(proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE proposals
  SET view_count = view_count + 1
  WHERE id = proposal_id
    AND status != 'blinded';
END;
$$;

-- Public aggregate stats expose counts only, never profile rows.
CREATE OR REPLACE FUNCTION get_public_home_stats()
RETURNS TABLE (
  profiles BIGINT,
  active BIGINT,
  selected BIGINT,
  done_this_month BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM profiles) AS profiles,
    (SELECT COUNT(*) FROM proposals WHERE status = 'active') AS active,
    (SELECT COUNT(*) FROM proposals WHERE status IN ('selected', 'done', 'rejected')) AS selected,
    (
      SELECT COUNT(*)
      FROM proposals
      WHERE status = 'done'
        AND updated_at >= date_trunc('month', now())
    ) AS done_this_month;
$$;

-- Allow proposal authors to delete their own active proposals.
-- Without this, only admins can delete (proposals_delete_admin covers admins).
DROP POLICY IF EXISTS "proposals_delete_own" ON proposals;
CREATE POLICY "proposals_delete_own" ON proposals FOR DELETE
  USING (auth.uid() = author_id AND status = 'active');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_title_length') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_title_length CHECK (char_length(trim(title)) BETWEEN 5 AND 60);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_body_length') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_body_length CHECK (char_length(trim(body)) BETWEEN 50 AND 2000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_category_length') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_category_length CHECK (char_length(trim(category)) BETWEEN 2 AND 20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_length') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_content_length CHECK (char_length(trim(content)) BETWEEN 1 AND 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_reason_length') THEN
    ALTER TABLE reports ADD CONSTRAINT reports_reason_length CHECK (reason IS NULL OR char_length(trim(reason)) <= 300);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replies_content_length') THEN
    ALTER TABLE official_replies ADD CONSTRAINT replies_content_length CHECK (char_length(trim(content)) BETWEEN 1 AND 1200);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replies_signed_by_length') THEN
    ALTER TABLE official_replies ADD CONSTRAINT replies_signed_by_length CHECK (char_length(trim(signed_by)) BETWEEN 1 AND 40);
  END IF;
END;
$$;

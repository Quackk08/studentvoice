-- ============================================================
-- 학생의 목소리 — Additional SQL (migrations.sql)
-- Run this AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- 1. increment_view_count RPC
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

CREATE OR REPLACE FUNCTION increment_view_count(proposal_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE proposals SET view_count = view_count + 1 WHERE id = proposal_id AND status != 'blinded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Admin: update proposal status (bypasses author-only RLS)
CREATE OR REPLACE FUNCTION update_proposal_status(proposal_id UUID, new_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF new_status NOT IN ('active', 'selected', 'done', 'rejected', 'blinded') THEN
    RAISE EXCEPTION 'Invalid proposal status';
  END IF;

  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE proposals SET status = new_status WHERE id = proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Admin RLS: allow admins to see all reports
DROP POLICY IF EXISTS "reports_select_admin" ON reports;
CREATE POLICY "reports_select_admin" ON reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- 4. Admin RLS: allow admins to update any proposal status
DROP POLICY IF EXISTS "proposals_update_admin" ON proposals;
CREATE POLICY "proposals_update_admin" ON proposals FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- 5. Admin RLS: allow admins to blind/delete proposals
DROP POLICY IF EXISTS "proposals_delete_admin" ON proposals;
CREATE POLICY "proposals_delete_admin" ON proposals FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- 6. Admin RLS: allow admins to insert official_replies
DROP POLICY IF EXISTS "replies_insert_admin" ON official_replies;
CREATE POLICY "replies_insert_admin" ON official_replies FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "replies_update_admin" ON official_replies;
CREATE POLICY "replies_update_admin" ON official_replies FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- 7. get_report_counts: returns proposal_id + report count (for admin)
CREATE OR REPLACE FUNCTION get_reported_proposals()
RETURNS TABLE (
  proposal_id UUID,
  report_count BIGINT,
  latest_reason TEXT,
  latest_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      r.proposal_id,
      COUNT(r.id) AS report_count,
      (SELECT reason FROM reports WHERE proposal_id = r.proposal_id ORDER BY created_at DESC LIMIT 1) AS latest_reason,
      MAX(r.created_at) AS latest_at
    FROM reports r
    GROUP BY r.proposal_id
    HAVING COUNT(r.id) >= 3
    ORDER BY report_count DESC, latest_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

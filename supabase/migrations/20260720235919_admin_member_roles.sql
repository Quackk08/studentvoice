-- StudentVoice member roles and admin directory
-- Keeps the legacy `is_admin` flag synchronized while introducing a
-- future-ready application role for students, administrators, teachers,
-- and parents. Parent-specific sign-in and service flows are intentionally
-- outside this migration.

-- ── 1. Profile role metadata ─────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_role TEXT NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS role_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS role_updated_by UUID;

UPDATE public.profiles
SET account_role = 'admin'
WHERE COALESCE(is_admin, FALSE) AND account_role <> 'admin';

UPDATE public.profiles
SET account_role = 'student'
WHERE account_role NOT IN ('student', 'admin', 'teacher', 'parent');

UPDATE public.profiles SET is_admin = (account_role = 'admin');
ALTER TABLE public.profiles ALTER COLUMN is_admin SET DEFAULT FALSE;
ALTER TABLE public.profiles ALTER COLUMN is_admin SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_role_check
      CHECK (account_role IN ('student', 'admin', 'teacher', 'parent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_admin_consistency'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_admin_consistency
      CHECK (is_admin = (account_role = 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_updated_by_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_updated_by_fkey
      FOREIGN KEY (role_updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_account_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.account_role := CASE
      WHEN COALESCE(NEW.is_admin, FALSE) THEN 'admin'
      ELSE COALESCE(NEW.account_role, 'student')
    END;
    NEW.is_admin := NEW.account_role = 'admin';
  ELSIF NEW.account_role IS DISTINCT FROM OLD.account_role THEN
    NEW.is_admin := NEW.account_role = 'admin';
    NEW.role_updated_at := NOW();
  ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    NEW.account_role := CASE WHEN NEW.is_admin THEN 'admin' ELSE 'student' END;
    NEW.role_updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_account_role_sync ON public.profiles;
CREATE TRIGGER on_profile_account_role_sync
  BEFORE INSERT OR UPDATE OF account_role, is_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_account_role();

CREATE INDEX IF NOT EXISTS idx_profiles_role_created
  ON public.profiles(account_role, created_at DESC, id DESC);

-- Keep all existing authorization checks compatible with the new source of truth.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND account_role = 'admin'
      AND is_admin = TRUE
  );
$$;

-- ── 2. Admin member directory RPCs ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_member_summary()
RETURNS TABLE (
  total BIGINT,
  students BIGINT,
  admins BIGINT,
  teachers BIGINT,
  parents BIGINT,
  email_unverified BIGINT
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
    count(*),
    count(*) FILTER (WHERE p.account_role = 'student'),
    count(*) FILTER (WHERE p.account_role = 'admin'),
    count(*) FILTER (WHERE p.account_role = 'teacher'),
    count(*) FILTER (WHERE p.account_role = 'parent'),
    count(*) FILTER (WHERE u.email_confirmed_at IS NULL)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_members(
  p_search TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  grade INTEGER,
  class INTEGER,
  account_role TEXT,
  is_admin BOOLEAN,
  agreed_to_guidelines BOOLEAN,
  created_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  role_updated_at TIMESTAMPTZ,
  role_updated_by UUID,
  proposal_count BIGINT,
  comment_count BIGINT,
  vote_count BIGINT,
  report_count BIGINT
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
  IF p_role IS NOT NULL AND p_role NOT IN ('student', 'admin', 'teacher', 'parent') THEN
    RAISE EXCEPTION 'Invalid account role';
  END IF;

  RETURN QUERY
  WITH proposal_totals AS (
    SELECT p.author_id AS user_id, count(*) AS total
    FROM public.proposals p
    GROUP BY p.author_id
  ),
  comment_totals AS (
    SELECT c.author_id AS user_id, count(*) AS total
    FROM public.comments c
    GROUP BY c.author_id
  ),
  vote_totals AS (
    SELECT v.user_id, count(*) AS total
    FROM public.votes v
    GROUP BY v.user_id
  ),
  report_totals AS (
    SELECT r.reporter_id AS user_id, count(*) AS total
    FROM public.reports r
    GROUP BY r.reporter_id
  )
  SELECT
    pr.id,
    pr.email,
    pr.name,
    pr.grade,
    pr.class,
    pr.account_role,
    pr.is_admin,
    pr.agreed_to_guidelines,
    pr.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    pr.role_updated_at,
    pr.role_updated_by,
    COALESCE(proposals.total, 0),
    COALESCE(comments.total, 0),
    COALESCE(votes.total, 0),
    COALESCE(reports.total, 0)
  FROM public.profiles pr
  LEFT JOIN auth.users u ON u.id = pr.id
  LEFT JOIN proposal_totals proposals ON proposals.user_id = pr.id
  LEFT JOIN comment_totals comments ON comments.user_id = pr.id
  LEFT JOIN vote_totals votes ON votes.user_id = pr.id
  LEFT JOIN report_totals reports ON reports.user_id = pr.id
  WHERE (p_role IS NULL OR pr.account_role = p_role)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR pr.email ILIKE '%' || btrim(p_search) || '%'
      OR pr.name ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      p_cursor_created_at IS NULL
      OR (pr.created_at, pr.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY pr.created_at DESC, pr.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_member_role(
  p_member_id UUID,
  p_new_role TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_role TEXT;
  member_email TEXT;
  member_name TEXT;
  admin_count BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_new_role NOT IN ('student', 'admin', 'teacher', 'parent') THEN
    RAISE EXCEPTION 'Invalid account role';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'A role change reason between 3 and 300 characters is required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('studentvoice:member-role-change'));

  SELECT p.account_role, p.email, p.name
  INTO previous_role, member_email, member_name
  FROM public.profiles p
  WHERE p.id = p_member_id
  FOR UPDATE;

  IF previous_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF previous_role = p_new_role THEN
    RAISE EXCEPTION 'Member already has this role';
  END IF;
  IF p_member_id = auth.uid() AND p_new_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own administrator role';
  END IF;

  IF previous_role = 'admin' AND p_new_role <> 'admin' THEN
    SELECT count(*) INTO admin_count
    FROM public.profiles
    WHERE account_role = 'admin' AND is_admin = TRUE;
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'At least one administrator must remain';
    END IF;
  END IF;

  UPDATE public.profiles
  SET account_role = p_new_role,
      role_updated_at = NOW(),
      role_updated_by = auth.uid()
  WHERE id = p_member_id;

  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(),
    NULL,
    'member_role_changed',
    jsonb_build_object(
      'member_id', p_member_id,
      'member_email', member_email,
      'member_name', member_name,
      'from_role', previous_role,
      'to_role', p_new_role,
      'reason', btrim(p_reason)
    )
  );
END;
$$;

-- Include account changes in the existing admin activity feed.
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
    actor.name,
    actor.email,
    a.proposal_id,
    COALESCE(p.title, a.details ->> 'title', a.details ->> 'member_name', a.details ->> 'member_email'),
    a.action,
    a.details,
    a.created_at
  FROM public.admin_audit_logs a
  LEFT JOIN public.profiles actor ON actor.id = a.admin_id
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
  WHERE p_cursor_created_at IS NULL
     OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

-- ── 3. Explicit RPC privileges ──────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (name, grade, class, agreed_to_guidelines) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.sync_profile_account_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_member_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_members(TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_admin_member_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_activity(INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_member_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_members(TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_member_role(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_activity(INTEGER, TIMESTAMPTZ, UUID) TO authenticated;

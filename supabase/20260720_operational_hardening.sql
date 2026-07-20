-- ============================================================
-- Student Voice operational hardening
-- 2026-07-20
--
-- Apply once after the existing schema/master scripts.
-- This migration is intentionally non-destructive and can be run again.
-- ============================================================

BEGIN;

-- ── 1. Trusted identity helpers ──────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_verified_school_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email_confirmed_at IS NOT NULL
      AND lower(email) ~ '^[a-z0-9._%+\-]+@dshs\.kr$'
  );
$$;

CREATE OR REPLACE FUNCTION public.proposal_allows_interaction(p_proposal_id UUID, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_verified_school_member() AND EXISTS (
    SELECT 1
    FROM public.proposals p
    WHERE p.id = p_proposal_id
      AND CASE p_action
        WHEN 'vote' THEN p.status = 'active'
        WHEN 'comment' THEN p.status <> 'blinded'
        WHEN 'report' THEN p.status <> 'blinded' AND p.author_id <> auth.uid()
        WHEN 'save' THEN p.status <> 'blinded' OR p.author_id = auth.uid() OR public.current_user_is_admin()
        ELSE FALSE
      END
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_verified_school_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proposal_allows_interaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_verified_school_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_allows_interaction(UUID, TEXT) TO authenticated;

-- Supabase Auth "Before User Created" hook.
CREATE OR REPLACE FUNCTION public.hook_restrict_signup_to_school_email(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  signup_email TEXT := lower(trim(event->'user'->>'email'));
  signup_metadata JSONB := COALESCE(event->'user'->'user_metadata', '{}'::jsonb);
  signup_name TEXT;
  signup_grade INTEGER;
  signup_class INTEGER;
BEGIN
  IF signup_email IS NULL OR signup_email !~ '^[a-z0-9._%+\-]+@dshs\.kr$' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', '대전대신고 학교 이메일(@dshs.kr)만 가입할 수 있습니다.'
      )
    );
  END IF;

  signup_name := trim(signup_metadata->>'name');
  BEGIN
    signup_grade := (signup_metadata->>'grade')::INTEGER;
    signup_class := (signup_metadata->>'class')::INTEGER;
  EXCEPTION WHEN invalid_text_representation THEN
    signup_grade := NULL;
    signup_class := NULL;
  END;

  IF signup_name IS NULL OR char_length(signup_name) NOT BETWEEN 2 AND 40
     OR signup_grade IS NULL OR signup_grade NOT BETWEEN 1 AND 3
     OR signup_class IS NULL OR signup_class NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', '이름, 학년, 반 정보를 올바르게 입력해주세요.'
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_to_school_email(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_to_school_email(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, grade, class)
  VALUES (
    NEW.id,
    lower(NEW.email),
    trim(NEW.raw_user_meta_data->>'name'),
    (NEW.raw_user_meta_data->>'grade')::INTEGER,
    (NEW.raw_user_meta_data->>'class')::INTEGER
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    grade = EXCLUDED.grade,
    class = EXCLUDED.class;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Constraints and workflow state ────────────────────────
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('active', 'selected', 'discussing', 'done', 'rejected', 'blinded'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_school_email') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_school_email
      CHECK (lower(email) ~ '^[a-z0-9._%+\-]+@dshs\.kr$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_grade_range') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_grade_range CHECK (grade IS NULL OR grade BETWEEN 1 AND 3) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_class_range') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_class_range CHECK (class IS NULL OR class BETWEEN 1 AND 20) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_category_allowed') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_category_allowed
      CHECK (category IN ('#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_title_length') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_title_length
      CHECK (char_length(trim(title)) BETWEEN 5 AND 60) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_body_length') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_body_length
      CHECK (char_length(trim(body)) BETWEEN 50 AND 2000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_length') THEN
    ALTER TABLE public.comments ADD CONSTRAINT comments_content_length
      CHECK (char_length(trim(content)) BETWEEN 1 AND 500) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_reason_length') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_reason_length
      CHECK (reason IS NULL OR char_length(reason) <= 300) NOT VALID;
  END IF;
END;
$$;

-- ── 3. Audit log and persisted notifications ─────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposal_id  UUID,
  action       TEXT NOT NULL,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_admin" ON public.admin_audit_logs;
CREATE POLICY "audit_select_admin" ON public.admin_audit_logs FOR SELECT
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id AND public.current_user_is_verified_school_member());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id AND public.current_user_is_verified_school_member())
  WITH CHECK (auth.uid() = user_id AND public.current_user_is_verified_school_member());

REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at, dismissed_at) ON public.notifications TO authenticated;

-- ── 4. Harden table policies and column privileges ───────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.current_user_is_admin());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND public.current_user_is_verified_school_member())
  WITH CHECK (auth.uid() = id AND public.current_user_is_verified_school_member());

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (name, grade, class, agreed_to_guidelines) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "proposals_select" ON public.proposals;
DROP POLICY IF EXISTS "proposals_insert_own" ON public.proposals;
DROP POLICY IF EXISTS "proposals_update_own" ON public.proposals;
DROP POLICY IF EXISTS "proposals_update_admin" ON public.proposals;
DROP POLICY IF EXISTS "proposals_delete_own" ON public.proposals;
DROP POLICY IF EXISTS "proposals_delete_admin" ON public.proposals;

CREATE POLICY "proposals_select" ON public.proposals FOR SELECT
  USING (
    public.current_user_is_verified_school_member()
    AND (status <> 'blinded' OR author_id = auth.uid() OR public.current_user_is_admin())
  );
CREATE POLICY "proposals_insert_own" ON public.proposals FOR INSERT
  WITH CHECK (public.current_user_is_verified_school_member() AND auth.uid() = author_id);
CREATE POLICY "proposals_update_own" ON public.proposals FOR UPDATE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = author_id AND status = 'active')
  WITH CHECK (public.current_user_is_verified_school_member() AND auth.uid() = author_id AND status = 'active');
CREATE POLICY "proposals_delete_own" ON public.proposals FOR DELETE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = author_id AND status = 'active');
CREATE POLICY "proposals_delete_admin" ON public.proposals FOR DELETE
  USING (public.current_user_is_admin());

REVOKE ALL ON public.proposals FROM anon, authenticated;
GRANT INSERT (author_id, category, title, body, is_anonymous) ON public.proposals TO authenticated;
GRANT UPDATE (category, title, body) ON public.proposals TO authenticated;
GRANT DELETE ON public.proposals TO authenticated;

DROP POLICY IF EXISTS "votes_select_all" ON public.votes;
DROP POLICY IF EXISTS "votes_select_own" ON public.votes;
DROP POLICY IF EXISTS "votes_insert_own" ON public.votes;
DROP POLICY IF EXISTS "votes_delete_own" ON public.votes;
CREATE POLICY "votes_select_own" ON public.votes FOR SELECT
  USING (public.current_user_is_verified_school_member() AND (auth.uid() = user_id OR public.current_user_is_admin()));
CREATE POLICY "votes_insert_own" ON public.votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.proposal_allows_interaction(proposal_id, 'vote')
  );
CREATE POLICY "votes_delete_own" ON public.votes FOR DELETE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
REVOKE ALL ON public.votes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.votes TO authenticated;

DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "comments_select_own_or_admin" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_admin" ON public.comments;
CREATE POLICY "comments_select_own_or_admin" ON public.comments FOR SELECT
  USING (public.current_user_is_verified_school_member() AND (auth.uid() = author_id OR public.current_user_is_admin()));
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND public.proposal_allows_interaction(proposal_id, 'comment')
  );
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = author_id);
CREATE POLICY "comments_delete_admin" ON public.comments FOR DELETE
  USING (public.current_user_is_admin());
REVOKE SELECT ON public.comments FROM anon, authenticated;
GRANT INSERT (proposal_id, author_id, content, is_anonymous) ON public.comments TO authenticated;
GRANT DELETE ON public.comments TO authenticated;

DROP POLICY IF EXISTS "replies_select_all" ON public.official_replies;
DROP POLICY IF EXISTS "replies_select_members" ON public.official_replies;
CREATE POLICY "replies_select_members" ON public.official_replies FOR SELECT
  USING (public.proposal_allows_interaction(proposal_id, 'save'));
DROP POLICY IF EXISTS "replies_insert_admin" ON public.official_replies;
DROP POLICY IF EXISTS "replies_update_admin" ON public.official_replies;
CREATE POLICY "replies_insert_admin" ON public.official_replies FOR INSERT
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "replies_update_admin" ON public.official_replies FOR UPDATE
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
REVOKE ALL ON public.official_replies FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.official_replies TO authenticated;

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
DROP POLICY IF EXISTS "reports_select_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_admin" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports FOR SELECT
  USING (public.current_user_is_verified_school_member() AND auth.uid() = reporter_id);
CREATE POLICY "reports_select_admin" ON public.reports FOR SELECT
  USING (public.current_user_is_admin());
CREATE POLICY "reports_insert_own" ON public.reports FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
    AND public.proposal_allows_interaction(proposal_id, 'report')
  );
CREATE POLICY "reports_delete_admin" ON public.reports FOR DELETE
  USING (public.current_user_is_admin());
REVOKE ALL ON public.reports FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.reports TO authenticated;

DROP POLICY IF EXISTS "saves_select_own" ON public.saves;
DROP POLICY IF EXISTS "saves_insert_own" ON public.saves;
DROP POLICY IF EXISTS "saves_delete_own" ON public.saves;
CREATE POLICY "saves_select_own" ON public.saves FOR SELECT
  USING (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
CREATE POLICY "saves_insert_own" ON public.saves FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.proposal_allows_interaction(proposal_id, 'save')
  );
CREATE POLICY "saves_delete_own" ON public.saves FOR DELETE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
REVOKE ALL ON public.saves FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.saves TO authenticated;

DROP POLICY IF EXISTS "notification_settings_select_own" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_insert_own" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_update_own" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_select_own" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_insert_own" ON public.notification_settings;
DROP POLICY IF EXISTS "notif_update_own" ON public.notification_settings;
CREATE POLICY "notification_settings_select_own" ON public.notification_settings FOR SELECT
  USING (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
CREATE POLICY "notification_settings_insert_own" ON public.notification_settings FOR INSERT
  WITH CHECK (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
CREATE POLICY "notification_settings_update_own" ON public.notification_settings FOR UPDATE
  USING (public.current_user_is_verified_school_member() AND auth.uid() = user_id)
  WITH CHECK (public.current_user_is_verified_school_member() AND auth.uid() = user_id);
REVOKE ALL ON public.notification_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;

-- ── 5. Safe proposal feed (no cross-user author UUID exposure) ─
DROP VIEW IF EXISTS public.proposal_feed;
CREATE VIEW public.proposal_feed
WITH (security_barrier = true)
AS
SELECT
  p.id,
  CASE WHEN p.author_id = auth.uid() OR public.current_user_is_admin() THEN p.author_id ELSE NULL END AS author_id,
  p.category,
  p.title,
  p.body,
  p.is_anonymous,
  p.status,
  p.vote_count,
  p.view_count,
  p.comment_count,
  p.created_at,
  p.updated_at,
  CASE WHEN NOT p.is_anonymous OR p.author_id = auth.uid() OR public.current_user_is_admin() THEN pr.name ELSE NULL END AS author_name,
  pr.grade AS author_grade,
  CASE WHEN public.current_user_is_admin() THEN pr.class ELSE NULL END AS author_class,
  CASE WHEN public.current_user_is_admin() THEN pr.email ELSE NULL END AS author_email,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'proposal_id', r.proposal_id,
          'content', r.content,
          'signed_by', r.signed_by,
          'created_at', r.created_at
        ) ORDER BY r.created_at ASC
      )
      FROM public.official_replies r
      WHERE r.proposal_id = p.id
    ),
    '[]'::jsonb
  ) AS official_replies
FROM public.proposals p
JOIN public.profiles pr ON pr.id = p.author_id
WHERE public.current_user_is_verified_school_member()
  AND (p.status <> 'blinded' OR p.author_id = auth.uid() OR public.current_user_is_admin());

REVOKE ALL ON public.proposal_feed FROM PUBLIC, anon;
GRANT SELECT ON public.proposal_feed TO authenticated;

-- ── 6. Safe read/write RPCs ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_view_count(proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.proposals p
  SET view_count = p.view_count + 1
  WHERE p.id = proposal_id
    AND (p.status <> 'blinded' OR p.author_id = auth.uid() OR public.current_user_is_admin());
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.proposals
    SET vote_count = vote_count + 1,
        status = CASE WHEN vote_count + 1 >= 30 AND status = 'active' THEN 'selected' ELSE status END
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

CREATE OR REPLACE FUNCTION public.create_proposal(
  p_category TEXT,
  p_title TEXT,
  p_body TEXT,
  p_is_anonymous BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Verified school account required';
  END IF;
  IF p_category NOT IN ('#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타')
     OR char_length(trim(p_title)) NOT BETWEEN 5 AND 60
     OR char_length(trim(p_body)) NOT BETWEEN 50 AND 2000
     OR char_length(trim(p_category)) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'Invalid proposal input';
  END IF;

  INSERT INTO public.proposals (author_id, category, title, body, is_anonymous)
  VALUES (auth.uid(), trim(p_category), trim(p_title), trim(p_body), p_is_anonymous)
  RETURNING id INTO new_id;
  RETURN new_id;
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_verified_school_member() OR NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = p_proposal_id
      AND (p.status <> 'blinded' OR p.author_id = auth.uid() OR public.current_user_is_admin())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      c.id,
      c.proposal_id,
      CASE WHEN c.author_id = auth.uid() OR public.current_user_is_admin() THEN c.author_id ELSE NULL END,
      c.content,
      c.is_anonymous,
      c.created_at,
      CASE WHEN NOT c.is_anonymous OR c.author_id = auth.uid() OR public.current_user_is_admin() THEN pr.name ELSE NULL END,
      pr.grade
    FROM public.comments c
    JOIN public.profiles pr ON pr.id = c.author_id
    WHERE c.proposal_id = p_proposal_id
    ORDER BY c.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_proposal_save_count(p_proposal_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_verified_school_member() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (SELECT count(*) FROM public.saves WHERE proposal_id = p_proposal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_notice_stats()
RETURNS TABLE (delivered_this_month BIGINT, latest_delivered_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE updated_at >= date_trunc('month', now())),
    max(updated_at)
  FROM public.proposals
  WHERE public.current_user_is_verified_school_member()
    AND status IN ('selected', 'discussing', 'done', 'rejected');
$$;

CREATE OR REPLACE FUNCTION public.get_public_home_stats()
RETURNS TABLE (profiles BIGINT, active BIGINT, selected BIGINT, done_this_month BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.proposals WHERE status = 'active'),
    (SELECT count(*) FROM public.proposals WHERE status IN ('selected', 'discussing', 'done', 'rejected')),
    (SELECT count(*) FROM public.proposals WHERE status = 'done' AND updated_at >= date_trunc('month', now()));
$$;

CREATE OR REPLACE FUNCTION public.get_reported_proposals()
RETURNS TABLE (
  proposal_id UUID,
  report_count BIGINT,
  latest_reason TEXT,
  latest_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT
      grouped.proposal_id,
      grouped.report_count,
      latest.reason,
      grouped.latest_at
    FROM (
      SELECT r.proposal_id, count(*) AS report_count, max(r.created_at) AS latest_at
      FROM public.reports r
      GROUP BY r.proposal_id
      HAVING count(*) >= 3
    ) grouped
    LEFT JOIN LATERAL (
      SELECT r2.reason
      FROM public.reports r2
      WHERE r2.proposal_id = grouped.proposal_id
      ORDER BY r2.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    ORDER BY grouped.report_count DESC, grouped.latest_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_proposal_reports(p_proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_count INTEGER;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.reports WHERE proposal_id = p_proposal_id;
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (auth.uid(), p_proposal_id, 'reports_dismissed', jsonb_build_object('count', removed_count));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_proposal_as_admin(p_proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_title TEXT;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.proposals WHERE id = p_proposal_id RETURNING title INTO deleted_title;
  IF deleted_title IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (auth.uid(), p_proposal_id, 'proposal_deleted', jsonb_build_object('title', deleted_title));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_proposal_status(proposal_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_status TEXT;
  current_vote_count INTEGER;
BEGIN
  IF new_status NOT IN ('active', 'selected', 'discussing', 'done', 'rejected', 'blinded') THEN
    RAISE EXCEPTION 'Invalid proposal status';
  END IF;
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, vote_count INTO previous_status, current_vote_count
  FROM public.proposals WHERE id = proposal_id FOR UPDATE;
  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF new_status IN ('selected', 'discussing', 'done', 'rejected') AND current_vote_count < 30 THEN
    RAISE EXCEPTION 'At least 30 votes are required for the selected workflow';
  END IF;
  UPDATE public.proposals SET status = new_status WHERE id = proposal_id;
  INSERT INTO public.admin_audit_logs(admin_id, proposal_id, action, details)
  VALUES (
    auth.uid(), proposal_id, 'status_changed',
    jsonb_build_object('from', previous_status, 'to', new_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_proposal(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_view_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_proposal_comments(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_proposal_save_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_notice_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_reported_proposals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_proposal_reports(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_proposal_as_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_proposal_status(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_proposal(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_view_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_comments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_save_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notice_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reported_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_proposal_reports(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_proposal_as_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_home_stats() TO anon, authenticated;

-- ── 7. Notification triggers ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_proposal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  status_message := NEW.title;

  IF COALESCE((SELECT on_selected FROM public.notification_settings WHERE user_id = NEW.author_id), TRUE) THEN
    INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
    VALUES (NEW.author_id, NEW.id, NEW.status, status_title, status_message, NOW(), NULL, NULL)
    ON CONFLICT (user_id, proposal_id, kind)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, created_at = NOW(), read_at = NULL, dismissed_at = NULL;
  END IF;

  INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
  SELECT v.user_id, NEW.id, NEW.status, status_title, status_message, NOW(), NULL, NULL
  FROM public.votes v
  LEFT JOIN public.notification_settings ns ON ns.user_id = v.user_id
  WHERE v.proposal_id = NEW.id
    AND v.user_id <> NEW.author_id
    AND COALESCE(ns.on_voted, FALSE)
  ON CONFLICT (user_id, proposal_id, kind)
  DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, created_at = NOW(), read_at = NULL, dismissed_at = NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_official_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal_author UUID;
  proposal_title TEXT;
BEGIN
  SELECT author_id, title INTO proposal_author, proposal_title
  FROM public.proposals WHERE id = NEW.proposal_id;

  IF proposal_author IS NOT NULL
     AND COALESCE((SELECT on_reply FROM public.notification_settings WHERE user_id = proposal_author), TRUE) THEN
    INSERT INTO public.notifications(user_id, proposal_id, kind, title, message, created_at, read_at, dismissed_at)
    VALUES (proposal_author, NEW.proposal_id, 'reply', '학생회 공식 답변이 등록되었습니다', proposal_title, NOW(), NULL, NULL)
    ON CONFLICT (user_id, proposal_id, kind)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, created_at = NOW(), read_at = NULL, dismissed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_proposal_status_notification ON public.proposals;
CREATE TRIGGER on_proposal_status_notification
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_status_change();

DROP TRIGGER IF EXISTS on_official_reply_notification ON public.official_replies;
CREATE TRIGGER on_official_reply_notification
  AFTER INSERT OR UPDATE ON public.official_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_official_reply();

COMMIT;

-- Dashboard step required after running this file:
-- Authentication > Hooks > Before User Created
-- Select: public.hook_restrict_signup_to_school_email

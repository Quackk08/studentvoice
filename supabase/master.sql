-- ============================================================
-- 학생의 목소리 — MASTER SQL (전체 초기화 + 재생성)
-- Supabase SQL Editor에서 한 번만 실행하세요.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 0. 전체 초기화 (기존 테이블/함수/트리거 전부 삭제)
-- ════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS notification_settings CASCADE;
DROP TABLE IF EXISTS saves                 CASCADE;
DROP TABLE IF EXISTS reports               CASCADE;
DROP TABLE IF EXISTS comments              CASCADE;
DROP TABLE IF EXISTS official_replies      CASCADE;
DROP TABLE IF EXISTS votes                 CASCADE;
DROP TABLE IF EXISTS proposals             CASCADE;
DROP TABLE IF EXISTS profiles              CASCADE;

DROP FUNCTION IF EXISTS handle_new_user()      CASCADE;
DROP FUNCTION IF EXISTS update_vote_count()    CASCADE;
DROP FUNCTION IF EXISTS update_comment_count() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at()    CASCADE;
DROP FUNCTION IF EXISTS increment_view_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_proposal_status(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_reported_proposals() CASCADE;


-- ════════════════════════════════════════════════════════════
-- 1. 테이블 생성
-- ════════════════════════════════════════════════════════════

-- profiles (auth.users 확장)
CREATE TABLE profiles (
  id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                TEXT NOT NULL,
  name                 TEXT,
  grade                INTEGER,          -- 학년 1~3
  class                INTEGER,          -- 반
  is_admin             BOOLEAN DEFAULT FALSE,
  agreed_to_guidelines BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- proposals (안건)
CREATE TABLE proposals (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  is_anonymous  BOOLEAN DEFAULT TRUE,
  status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active','selected','done','rejected','blinded')),
  vote_count    INTEGER DEFAULT 0,
  view_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- votes (추천)
CREATE TABLE votes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

-- official_replies (학생회 공식 답변)
CREATE TABLE official_replies (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content     TEXT NOT NULL,
  signed_by   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- comments (의견)
CREATE TABLE comments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id  UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  author_id    UUID REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  content      TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- reports (신고)
CREATE TABLE reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, reporter_id)
);

-- saves (저장)
CREATE TABLE saves (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

-- notification_settings (알림 설정)
CREATE TABLE notification_settings (
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  on_selected BOOLEAN DEFAULT TRUE,
  on_reply    BOOLEAN DEFAULT TRUE,
  on_voted    BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════
-- 2. RLS 활성화
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_replies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE saves                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- 3. RLS 정책
-- ════════════════════════════════════════════════════════════

-- profiles
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

CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR current_user_is_admin()
  );
CREATE POLICY "profiles_insert_own"  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE USING (auth.uid() = id);

-- proposals
CREATE POLICY "proposals_select" ON proposals FOR SELECT
  USING (status != 'blinded' OR author_id = auth.uid());

CREATE POLICY "proposals_insert_own" ON proposals FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- 작성자: status='active'일 때만 수정 가능
CREATE POLICY "proposals_update_own" ON proposals FOR UPDATE
  USING (auth.uid() = author_id AND status = 'active');

-- 어드민: 상태 변경 등 모든 수정 가능
CREATE POLICY "proposals_update_admin" ON proposals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- 작성자: status='active'일 때만 본인 안건 삭제 가능
CREATE POLICY "proposals_delete_own" ON proposals FOR DELETE
  USING (auth.uid() = author_id AND status = 'active');

-- 어드민: 모든 안건 삭제 가능
CREATE POLICY "proposals_delete_admin" ON proposals FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- votes
CREATE POLICY "votes_select_all"  ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_own"  ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_delete_own"  ON votes FOR DELETE USING (auth.uid() = user_id);

-- official_replies
CREATE POLICY "replies_select_all"    ON official_replies FOR SELECT USING (true);
CREATE POLICY "replies_insert_admin"  ON official_replies FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "replies_update_admin"  ON official_replies FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- comments
CREATE POLICY "comments_select_all"   ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own"   ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete_own"   ON comments FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "comments_delete_admin" ON comments FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- reports
CREATE POLICY "reports_select_own"   ON reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "reports_insert_own"   ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_select_admin" ON reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- saves
CREATE POLICY "saves_select_own" ON saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saves_insert_own" ON saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saves_delete_own" ON saves FOR DELETE USING (auth.uid() = user_id);

-- notification_settings
CREATE POLICY "notif_select_own" ON notification_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_insert_own" ON notification_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON notification_settings FOR UPDATE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 4. 함수 & 트리거
-- ════════════════════════════════════════════════════════════

-- ── 신규 가입 시 profile 자동 생성 ──────────────────────────
-- EXCEPTION 블록으로 metadata 캐스팅 오류 방지
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name  TEXT;
  v_grade INTEGER;
  v_class INTEGER;
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    v_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), '');

    BEGIN
      v_grade := NULLIF(NEW.raw_user_meta_data->>'grade', '')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_grade := NULL;
    END;

    BEGIN
      v_class := NULLIF(NEW.raw_user_meta_data->>'class', '')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_class := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, email, name, grade, class)
  VALUES (NEW.id, NEW.email, v_name, v_grade, v_class)
  ON CONFLICT (id) DO UPDATE SET
    name  = COALESCE(EXCLUDED.name,  public.profiles.name),
    grade = COALESCE(EXCLUDED.grade, public.profiles.grade),
    class = COALESCE(EXCLUDED.class, public.profiles.class);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 추천 수 자동 업데이트 + 30표 달성 시 selected ───────────
CREATE OR REPLACE FUNCTION update_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proposals
    SET vote_count = vote_count + 1,
        status = CASE WHEN vote_count + 1 >= 30 AND status = 'active'
                      THEN 'selected' ELSE status END
    WHERE id = NEW.proposal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE proposals
    SET vote_count = GREATEST(vote_count - 1, 0)
    WHERE id = OLD.proposal_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_vote_change
  AFTER INSERT OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_vote_count();


-- ── 댓글 수 자동 업데이트 ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proposals SET comment_count = comment_count + 1 WHERE id = NEW.proposal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE proposals SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.proposal_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();


-- ── proposals.updated_at 자동 갱신 ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ════════════════════════════════════════════════════════════
-- 5. RPC 함수
-- ════════════════════════════════════════════════════════════

-- 조회수 증가 (중복 방지 없음, 단순 카운터)
CREATE OR REPLACE FUNCTION increment_view_count(proposal_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE proposals SET view_count = view_count + 1 WHERE id = proposal_id AND status != 'blinded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 어드민 전용: 안건 상태 강제 변경
CREATE OR REPLACE FUNCTION update_proposal_status(proposal_id UUID, new_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF new_status NOT IN ('active', 'selected', 'done', 'rejected', 'blinded') THEN
    RAISE EXCEPTION 'Invalid proposal status';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE proposals SET status = new_status WHERE id = proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ════════════════════════════════════════════════════════════
-- 6. 인덱스 (성능)
-- ════════════════════════════════════════════════════════════

CREATE INDEX idx_proposals_status     ON proposals(status);
CREATE INDEX idx_proposals_vote_count ON proposals(vote_count DESC);
CREATE INDEX idx_proposals_author_id  ON proposals(author_id);
CREATE INDEX idx_proposals_created_at ON proposals(created_at DESC);
CREATE INDEX idx_votes_proposal_id    ON votes(proposal_id);
CREATE INDEX idx_votes_user_id        ON votes(user_id);
CREATE INDEX idx_comments_proposal_id ON comments(proposal_id);
CREATE INDEX idx_saves_user_id        ON saves(user_id);
CREATE INDEX idx_reports_proposal_id  ON reports(proposal_id);


-- ════════════════════════════════════════════════════════════
-- 7. 완료
-- ════════════════════════════════════════════════════════════
-- 관리자 계정은 가입 후 아래 쿼리로 설정하세요:
-- UPDATE profiles SET is_admin = TRUE WHERE email = 'your@email.com';

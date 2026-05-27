-- ============================================================
-- 학생의 목소리 — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. profiles (auth.users 확장)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email           TEXT NOT NULL,
  name            TEXT,
  grade           INTEGER,        -- 학년 (1-3)
  class           INTEGER,        -- 반
  is_admin        BOOLEAN DEFAULT FALSE,
  agreed_to_guidelines BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. proposals (안건)
CREATE TABLE IF NOT EXISTS proposals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  is_anonymous    BOOLEAN DEFAULT TRUE,
  status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active','selected','done','rejected','blinded')),
  vote_count      INTEGER DEFAULT 0,
  view_count      INTEGER DEFAULT 0,
  comment_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. votes (추천)
CREATE TABLE IF NOT EXISTS votes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

-- 4. official_replies (학생회 공식 답변)
CREATE TABLE IF NOT EXISTS official_replies (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content         TEXT NOT NULL,
  signed_by       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. reports (신고)
CREATE TABLE IF NOT EXISTS reports (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  reporter_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, reporter_id)
);

-- 6. saves (저장)
CREATE TABLE IF NOT EXISTS saves (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE saves           ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY "profiles_insert_own"   ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON profiles FOR UPDATE USING (auth.uid() = id);

-- proposals
CREATE POLICY "proposals_select"      ON proposals FOR SELECT
  USING (status != 'blinded' OR author_id = auth.uid());
CREATE POLICY "proposals_insert_own"  ON proposals FOR INSERT
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "proposals_update_own"  ON proposals FOR UPDATE
  USING (auth.uid() = author_id AND vote_count < 5);

-- votes
CREATE POLICY "votes_select_all"      ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_own"      ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_delete_own"      ON votes FOR DELETE USING (auth.uid() = user_id);

-- official_replies
CREATE POLICY "replies_select_all"    ON official_replies FOR SELECT USING (true);

-- reports
CREATE POLICY "reports_insert_own"    ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_select_own"    ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- saves
CREATE POLICY "saves_select_own"      ON saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saves_insert_own"      ON saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saves_delete_own"      ON saves FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Triggers
-- ============================================================

-- 신규 가입 시 profile 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 추천 수 자동 업데이트 + 30표 달성 시 selected로 변경
CREATE OR REPLACE FUNCTION update_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proposals
    SET vote_count = vote_count + 1,
        status = CASE WHEN vote_count + 1 >= 30 THEN 'selected' ELSE status END
    WHERE id = NEW.proposal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE proposals
    SET vote_count = GREATEST(vote_count - 1, 0)
    WHERE id = OLD.proposal_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_vote_change ON votes;
CREATE TRIGGER on_vote_change
  AFTER INSERT OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_vote_count();

-- proposals updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS proposals_updated_at ON proposals;
CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Seed data (optional — 테스트용)
-- ============================================================

-- 관리자 계정 설정 (이메일로 찾아서 admin 설정)
-- UPDATE profiles SET is_admin = TRUE WHERE email = '<admin-school-email>';

-- ============================================================
-- 학생의 목소리 — Comments, Notifications, Indexes, Trigger Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. comments 테이블 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id  UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  author_id    UUID REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  content      TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_all"  ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own"  ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete_own"  ON comments FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "comments_delete_admin" ON comments FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- 댓글 수 자동 업데이트 트리거
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

DROP TRIGGER IF EXISTS on_comment_change ON comments;
CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();


-- ── 2. notification_settings 테이블 ───────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  on_selected  BOOLEAN DEFAULT TRUE,   -- 내 안건 선정됐을 때
  on_reply     BOOLEAN DEFAULT TRUE,   -- 학생회 답변 달렸을 때
  on_voted     BOOLEAN DEFAULT FALSE,  -- 추천한 안건 상태 변경
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own"  ON notification_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_insert_own"  ON notification_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_update_own"  ON notification_settings FOR UPDATE USING (auth.uid() = user_id);


-- ── 3. proposals update RLS 수정 ──────────────────────────
-- 기존: vote_count < 5 (너무 낮음)
-- 변경: status = 'active' 동안만 수정 가능
DROP POLICY IF EXISTS "proposals_update_own" ON proposals;
CREATE POLICY "proposals_update_own" ON proposals FOR UPDATE
  USING (auth.uid() = author_id AND status = 'active');


-- ── 4. 인덱스 추가 (성능) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_proposals_status       ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_vote_count   ON proposals(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_author_id    ON proposals(author_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at   ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_proposal_id      ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id          ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_proposal_id   ON comments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_id          ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_proposal_id    ON reports(proposal_id);


-- ── 5. 회원가입 트리거 개선 (metadata → profile 자동 반영) ─
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, grade, class)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(NEW.raw_user_meta_data->>'grade', '')::INTEGER,
    NULLIF(NEW.raw_user_meta_data->>'class', '')::INTEGER
  )
  ON CONFLICT (id) DO UPDATE SET
    name  = COALESCE(EXCLUDED.name,  profiles.name),
    grade = COALESCE(EXCLUDED.grade, profiles.grade),
    class = COALESCE(EXCLUDED.class, profiles.class);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 트리거 재등록 (이미 존재하면 교체)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 智学错题集 · Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中运行此脚本即可完成所有建表
-- ============================================================

-- 1. 错题表
CREATE TABLE IF NOT EXISTS questions (
  id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  category TEXT DEFAULT '',
  knowledge_points TEXT DEFAULT '',
  level TEXT DEFAULT 'medium',
  question_text TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  important BOOLEAN DEFAULT false,
  image_id TEXT,
  create_time BIGINT NOT NULL
);

-- 2. 科目表（每个用户一行，subjects 存 JSON 数组）
CREATE TABLE IF NOT EXISTS subjects (
  user_id UUID PRIMARY KEY,
  subjects_json JSONB DEFAULT '["数学","语文","英语","物理","化学","生物","历史","地理","政治"]'
);

-- 3. 图片表（base64 存储）
CREATE TABLE IF NOT EXISTS images (
  id TEXT NOT NULL,
  user_id UUID NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (id, user_id)
);

-- 4. 用户配置表（存储用户昵称、角色等）
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_create_time ON questions(create_time DESC);
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);

-- ============================================================
-- RLS 策略
-- ============================================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 自己的错题：完全控制
CREATE POLICY "own_questions_all" ON questions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 所有人的错题：允许读取（用于「探索他人」功能）
CREATE POLICY "questions_read_all" ON questions
  FOR SELECT USING (true);

-- 自己的科目：完全控制
CREATE POLICY "own_subjects_all" ON subjects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 所有人的科目：允许读取
CREATE POLICY "subjects_read_all" ON subjects
  FOR SELECT USING (true);

-- 自己的图片：完全控制
CREATE POLICY "own_images_all" ON images
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 所有人的图片：允许读取（用于查看他人配图）
CREATE POLICY "images_read_all" ON images
  FOR SELECT USING (true);

-- 用户资料：自己可读写，所有人可读
CREATE POLICY "own_profile_all" ON user_profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_read_all" ON user_profiles
  FOR SELECT USING (true);

-- ============================================================
-- 管理员函数：获取所有用户及其错题数
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_users_stats()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  question_count BIGINT,
  image_count BIGINT
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.role,
    p.created_at,
    COALESCE(qc.cnt, 0) AS question_count,
    COALESCE(ic.cnt, 0) AS image_count
  FROM user_profiles p
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS cnt FROM questions GROUP BY user_id
  ) qc ON qc.user_id = p.user_id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS cnt FROM images GROUP BY user_id
  ) ic ON ic.user_id = p.user_id
  ORDER BY p.created_at;
$$;

-- ============================================================
-- 触发器：新用户注册时自动创建 profile
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)), 'user')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）后重建
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 创建默认管理员（可选：在 Supabase 认证页面手动创建 admin 用户后执行）
-- UPDATE user_profiles SET role = 'admin' WHERE display_name = 'admin';
-- ============================================================

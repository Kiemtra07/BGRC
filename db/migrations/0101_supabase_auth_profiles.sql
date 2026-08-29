-- 0101_supabase_auth_profiles.sql
-- Liên kết hồ sơ nghiệp vụ trong public.app_users với danh tính do Supabase Auth quản lý.
-- Không lưu password_hash mới khi AUTH_MODE=supabase; mật khẩu nằm độc quyền ở auth.users.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_auth_user_id
  ON app_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN app_users.auth_user_id IS
  'Supabase auth.users.id; chỉ backend dùng service role được phép liên kết hoặc thay đổi.';

-- Supabase exposes public tables via PostgREST. Keep the identity link inaccessible to client roles;
-- the existing 0090 deny-by-default policy remains the final guard for public.app_users.

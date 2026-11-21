-- Phiên đăng nhập tách khỏi snapshot JSON. Trước đây mỗi lượt đăng nhập, đăng xuất, xác thực lại hay
-- thu hồi phiên đều ghi lại cả snapshot (hàng chục MB ở quy mô mục tiêu); bảng riêng cho phép
-- tra và sửa đúng một hàng. Token không bao giờ được lưu, chỉ lưu SHA-256 của nó.
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_digest TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  step_up_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
  ON public.auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
  ON public.auth_sessions(expires_at);

SELECT set_config('app.runtime_role', 'backend', true);

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_auth_sessions_access ON public.auth_sessions;
CREATE POLICY backend_auth_sessions_access
  ON public.auth_sessions
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.auth_sessions FROM PUBLIC;

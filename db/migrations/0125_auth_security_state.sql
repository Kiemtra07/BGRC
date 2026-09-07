-- Trạng thái bảo mật phải dùng chung giữa các instance: snapshot JSON không thể làm khoá đăng
-- nhập hoặc chặn TOTP replay một cách nguyên tử khi serverless scale ngang.
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  login_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL CHECK (failed_count > 0),
  first_failed_at TIMESTAMPTZ NOT NULL,
  last_failed_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_updated_at_idx
  ON public.auth_login_attempts(updated_at);

CREATE TABLE IF NOT EXISTS public.auth_used_totp_counters (
  user_id TEXT NOT NULL,
  counter BIGINT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, counter)
);

CREATE INDEX IF NOT EXISTS auth_used_totp_counters_used_at_idx
  ON public.auth_used_totp_counters(used_at);

SELECT set_config('app.runtime_role', 'backend', true);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_auth_login_attempts_access ON public.auth_login_attempts;
CREATE POLICY backend_auth_login_attempts_access
  ON public.auth_login_attempts
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.auth_login_attempts FROM PUBLIC;

ALTER TABLE public.auth_used_totp_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_used_totp_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_auth_used_totp_counters_access ON public.auth_used_totp_counters;
CREATE POLICY backend_auth_used_totp_counters_access
  ON public.auth_used_totp_counters
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.auth_used_totp_counters FROM PUBLIC;

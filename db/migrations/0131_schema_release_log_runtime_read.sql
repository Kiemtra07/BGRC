-- `0090_rls_all_public_tables.sql` correctly enables RLS on every public table,
-- including this migration ledger. The application runtime is not the table owner,
-- so it needs an explicit read policy for the read-only acceptance check.
--
-- This policy does not grant table privileges. It merely permits rows for a role
-- that already has SELECT and enters a transaction with the server-only backend
-- context. Migration writers remain administrative roles.
ALTER TABLE public.schema_release_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_schema_release_log_read ON public.schema_release_log;
CREATE POLICY backend_schema_release_log_read
  ON public.schema_release_log
  FOR SELECT
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend');

REVOKE ALL ON TABLE public.schema_release_log FROM PUBLIC;

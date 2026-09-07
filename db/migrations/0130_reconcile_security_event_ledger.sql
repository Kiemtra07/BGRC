-- Reconcile the one known legacy 0120 deployment before later migrations proceed.
-- This migration deliberately fails if the ledger itself is absent: a migration-log
-- entry without its durable security ledger is not safe to normalize silently.

DO $$
BEGIN
  IF to_regclass('public.security_event_ledger') IS NULL THEN
    RAISE EXCEPTION 'security_event_ledger is missing although migration 0120 is recorded';
  END IF;
END;
$$;

ALTER TABLE public.security_event_ledger
  ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subject VARCHAR(500),
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_security_event_ledger_occurred
  ON public.security_event_ledger(occurred_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS idx_security_event_ledger_actor
  ON public.security_event_ledger(actor_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_security_event_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'security_event_ledger is immutable. UPDATE or DELETE is forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_security_event_ledger ON public.security_event_ledger;
CREATE TRIGGER trg_immutable_security_event_ledger
BEFORE UPDATE OR DELETE ON public.security_event_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_security_event_ledger_modification();

ALTER TABLE public.security_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_event_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_security_event_ledger_access ON public.security_event_ledger;
CREATE POLICY backend_security_event_ledger_access
  ON public.security_event_ledger
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.security_event_ledger FROM PUBLIC;

-- Outbox 0030 đã tồn tại nhưng chưa có cơ chế worker cạnh tranh an toàn hoặc dedupe delivery.
ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE public.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE public.outbox_events
  ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER'));

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_dedupe_key_unique
  ON public.outbox_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_events_claim_idx
  ON public.outbox_events(status, next_retry_at, lease_until, created_at);

SELECT set_config('app.runtime_role', 'backend', true);
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_outbox_events_access ON public.outbox_events;
CREATE POLICY backend_outbox_events_access
  ON public.outbox_events
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.outbox_events FROM PUBLIC;

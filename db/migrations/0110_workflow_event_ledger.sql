-- Move runtime workflow history out of the hot JSON snapshot without changing legacy IDs.
-- The normalized workflow_events table predates the runtime and requires UUIDs, while the
-- application deliberately uses identifiers such as evt-001 and find-001. This ledger keeps
-- those identifiers as text so the migration cannot discard or silently remap audit history.

SELECT set_config('app.runtime_role', 'backend', true);

CREATE TABLE IF NOT EXISTS workflow_event_ledger (
  event_id VARCHAR(255) PRIMARY KEY,
  finding_id VARCHAR(255) NOT NULL,
  command VARCHAR(100) NOT NULL,
  from_status VARCHAR(100) NOT NULL,
  to_status VARCHAR(100) NOT NULL,
  actor_user_id VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  notes TEXT,
  rejection_reason TEXT,
  rejected_from_stage VARCHAR(100),
  evidence_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_workflow_event_ledger_evidence_array
    CHECK (jsonb_typeof(evidence_snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_workflow_event_ledger_finding_created
  ON workflow_event_ledger(finding_id, created_at ASC, event_id ASC);
CREATE INDEX IF NOT EXISTS idx_workflow_event_ledger_created
  ON workflow_event_ledger(created_at DESC, event_id DESC);

CREATE OR REPLACE FUNCTION public.prevent_workflow_event_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'workflow_event_ledger is immutable. UPDATE or DELETE is forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_workflow_event_ledger ON public.workflow_event_ledger;
CREATE TRIGGER trg_immutable_workflow_event_ledger
BEFORE UPDATE OR DELETE ON public.workflow_event_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_workflow_event_ledger_modification();

-- Backfill the exact application event IDs. Invalid/missing legacy timestamps are retained with
-- a deterministic fallback time rather than aborting the entire migration.
INSERT INTO workflow_event_ledger(
  event_id, finding_id, command, from_status, to_status, actor_user_id, actor_name, actor_role,
  notes, rejection_reason, rejected_from_stage, evidence_snapshot, created_at
)
SELECT
  COALESCE(NULLIF(event_data->>'id', ''), 'legacy-' || md5(event_data::text)),
  COALESCE(NULLIF(event_data->>'findingId', ''), 'unknown'),
  COALESCE(NULLIF(event_data->>'command', ''), 'UNKNOWN'),
  COALESCE(NULLIF(event_data->>'fromStatus', ''), 'UNKNOWN'),
  COALESCE(NULLIF(event_data->>'toStatus', ''), 'UNKNOWN'),
  COALESCE(NULLIF(event_data->>'actorUserId', ''), 'unknown'),
  COALESCE(NULLIF(event_data->>'actorName', ''), 'unknown'),
  COALESCE(NULLIF(event_data->>'actorRole', ''), 'UNKNOWN'),
  NULLIF(event_data->>'notes', ''),
  NULLIF(event_data->>'rejectionReason', ''),
  NULLIF(event_data->>'rejectedFromStage', ''),
  CASE
    WHEN jsonb_typeof(event_data->'evidenceSnapshot') = 'array' THEN event_data->'evidenceSnapshot'
    ELSE '[]'::jsonb
  END,
  CASE
    WHEN event_data->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN (event_data->>'createdAt')::timestamptz
    ELSE NOW()
  END
FROM app_state_snapshots AS snapshot
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(snapshot.payload->'workflowEvents') = 'array'
      THEN snapshot.payload->'workflowEvents'
    ELSE '[]'::jsonb
  END
) AS event_data
WHERE snapshot.id = 'primary'
ON CONFLICT (event_id) DO NOTHING;

-- Only after the backfill succeeded is the growing array removed from the hot snapshot.
UPDATE app_state_snapshots
SET payload = payload - 'workflowEvents',
    version = version + 1,
    updated_at = NOW()
WHERE id = 'primary' AND payload ? 'workflowEvents';

ALTER TABLE public.workflow_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_event_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_workflow_event_ledger_access ON public.workflow_event_ledger;
CREATE POLICY backend_workflow_event_ledger_access
  ON public.workflow_event_ledger
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.workflow_event_ledger FROM PUBLIC;

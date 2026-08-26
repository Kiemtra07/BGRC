-- 0030_evidence_and_workflow.sql

-- 1. Evidence Objects (P0-10, P0-11)
CREATE TABLE IF NOT EXISTS evidence_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  drive_file_id VARCHAR(255) NOT NULL,
  drive_url TEXT NOT NULL,
  sha256_checksum VARCHAR(64) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING_UPLOAD', 'AVAILABLE', 'FAILED', 'REVOKED')),
  uploaded_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_by_name VARCHAR(255) NOT NULL,
  uploaded_by_role VARCHAR(50) NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  notes TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  revoked_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Workflow Events (Append-only audit trail P0-13, P0-14)
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE RESTRICT,
  command VARCHAR(50) NOT NULL,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  notes TEXT,
  rejection_reason TEXT,
  rejected_from_stage VARCHAR(50),
  evidence_snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger cấm xóa/sửa workflow_events
CREATE OR REPLACE FUNCTION prevent_workflow_events_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'workflow_events is immutable. UPDATE or DELETE is forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_workflow_events ON workflow_events;
CREATE TRIGGER trg_immutable_workflow_events
BEFORE UPDATE OR DELETE ON workflow_events
FOR EACH ROW EXECUTE FUNCTION prevent_workflow_events_modification();

-- 3. Outbox Events for Notifications (P0-13)
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED')),
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 4. SLA Extension Requests
CREATE TABLE IF NOT EXISTS sla_extension_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  current_deadline DATE NOT NULL,
  requested_deadline DATE NOT NULL,
  reason TEXT NOT NULL,
  evidence_drive_url TEXT,
  requested_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  requested_by_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_by_name VARCHAR(255),
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_finding ON evidence_objects(finding_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_finding ON workflow_events(finding_id);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, next_retry_at);

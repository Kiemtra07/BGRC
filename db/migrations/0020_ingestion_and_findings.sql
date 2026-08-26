-- 0020_ingestion_and_findings.sql

-- 1. Import Batches & Staging
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES report_channels(id) ON DELETE CASCADE,
  channel_version_id UUID REFERENCES channel_versions(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('EXCEL_IMPORT', 'API_BULK', 'WEB_FORM')),
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows_count INT NOT NULL DEFAULT 0,
  error_rows_count INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL CHECK (status IN ('STAGING', 'VALIDATING', 'VALIDATED_WITH_ERRORS', 'READY_TO_COMMIT', 'COMMITTED', 'FAILED')),
  uploaded_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  committed_findings_count INT DEFAULT 0,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  raw_data JSONB NOT NULL,
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT FALSE,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Core Findings Table (P0-01, P0-02, P0-06, P0-08)
CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES report_channels(id) ON DELETE RESTRICT,
  channel_version_id UUID REFERENCES channel_versions(id) ON DELETE RESTRICT,
  workflow_version_id UUID,
  sla_policy_version_id UUID,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,

  -- Customer & Branch Identification
  cif VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  cluster_name VARCHAR(100) NOT NULL,
  branch_code VARCHAR(50) NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  decision_no VARCHAR(100),
  audit_date DATE,
  inspector_name VARCHAR(255),
  credit_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  loan_group VARCHAR(50),
  collateral_value NUMERIC(20,2) NOT NULL DEFAULT 0,
  loan_purpose TEXT,
  officer_name VARCHAR(255),
  dept_head_name VARCHAR(255),

  -- Finding & Error details
  error_code VARCHAR(50) NOT NULL,
  error_group VARCHAR(50),
  error_title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  exposure_amount NUMERIC(20,2) NOT NULL DEFAULT 0,

  -- Status & Optimistic Locking (P0-02, P0-08)
  workflow_status VARCHAR(50) NOT NULL CHECK (workflow_status IN ('PENDING', 'SUBMITTED_BRANCH', 'SUBMITTED_INTERNAL', 'REJECTED', 'WAIVED_RESOLVED')),
  sla_status VARCHAR(50) NOT NULL CHECK (sla_status IN ('ON_TRACK', 'DUE_SOON', 'OVERDUE', 'CLOSED')),
  version INT NOT NULL DEFAULT 1,
  deadline_date DATE NOT NULL,
  resolution_notes TEXT,

  -- Rejection projection (P0-09)
  rejected_from_stage VARCHAR(50),
  rejection_reason TEXT,
  rejected_by_user_name VARCHAR(255),
  rejected_at TIMESTAMPTZ,

  -- Dynamic payload for custom fields
  dynamic_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique business deduplication index
CREATE INDEX IF NOT EXISTS idx_findings_cif_error ON findings(cif, error_code, branch_code);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(workflow_status, sla_status);
CREATE INDEX IF NOT EXISTS idx_findings_branch ON findings(branch_code);
CREATE INDEX IF NOT EXISTS idx_findings_cluster ON findings(cluster_name);
CREATE INDEX IF NOT EXISTS idx_findings_deadline ON findings(deadline_date);

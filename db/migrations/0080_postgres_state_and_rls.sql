-- 0080_postgres_state_and_rls.sql
-- Serverless aggregate persistence plus normalized entities that were present only in local-state.json.

CREATE TABLE IF NOT EXISTS app_state_snapshots (
  id VARCHAR(50) PRIMARY KEY,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_app_state_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_app_state_snapshots_updated
  ON app_state_snapshots(updated_at DESC);

CREATE TABLE IF NOT EXISTS report_catalog_configurations (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  key_version VARCHAR(50) NOT NULL DEFAULT 'report-keys.v1',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_report_catalog_configuration_object
    CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE TABLE IF NOT EXISTS finding_follows (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_finding_follows_finding_created
  ON finding_follows(finding_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_accepted_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('CLUSTER', 'BRANCH', 'CUSTOMER')),
  target_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_accepted_user_created
  ON workspace_accepted_targets(user_id, created_at DESC);

-- The browser never connects to these persistence tables directly. The API sets this
-- transaction-local context before every operation, including the one-time backfill.
ALTER TABLE app_state_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE report_catalog_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_catalog_configurations FORCE ROW LEVEL SECURITY;
ALTER TABLE finding_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_follows FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_accepted_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_accepted_targets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_app_state_access ON app_state_snapshots;
CREATE POLICY backend_app_state_access ON app_state_snapshots
  FOR ALL
  USING (current_setting('app.runtime_role', true) = 'backend')
  WITH CHECK (current_setting('app.runtime_role', true) = 'backend');

DROP POLICY IF EXISTS backend_report_catalog_access ON report_catalog_configurations;
CREATE POLICY backend_report_catalog_access ON report_catalog_configurations
  FOR ALL
  USING (current_setting('app.runtime_role', true) = 'backend')
  WITH CHECK (current_setting('app.runtime_role', true) = 'backend');

DROP POLICY IF EXISTS backend_finding_follows_access ON finding_follows;
CREATE POLICY backend_finding_follows_access ON finding_follows
  FOR ALL
  USING (current_setting('app.runtime_role', true) = 'backend')
  WITH CHECK (current_setting('app.runtime_role', true) = 'backend');

DROP POLICY IF EXISTS backend_workspace_accepted_access ON workspace_accepted_targets;
CREATE POLICY backend_workspace_accepted_access ON workspace_accepted_targets
  FOR ALL
  USING (current_setting('app.runtime_role', true) = 'backend')
  WITH CHECK (current_setting('app.runtime_role', true) = 'backend');

REVOKE ALL ON app_state_snapshots FROM PUBLIC;
REVOKE ALL ON report_catalog_configurations FROM PUBLIC;
REVOKE ALL ON finding_follows FROM PUBLIC;
REVOKE ALL ON workspace_accepted_targets FROM PUBLIC;

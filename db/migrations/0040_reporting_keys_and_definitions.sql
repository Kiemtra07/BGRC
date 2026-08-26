-- 0040_reporting_keys_and_definitions.sql
-- Canonical reporting-key persistence. Runtime key definitions remain versioned in application contracts.

CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version VARCHAR(50) NOT NULL DEFAULT 'report-keys.v1',
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500),
  query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  export_columns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  legacy_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_columns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_report_query_object CHECK (jsonb_typeof(query_config) = 'object'),
  CONSTRAINT chk_report_legacy_filters_object CHECK (jsonb_typeof(legacy_filters) = 'object'),
  CONSTRAINT chk_report_has_export_columns CHECK (cardinality(export_columns) > 0 OR cardinality(legacy_columns) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_definitions_owner_name
  ON report_definitions(created_by_user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_report_definitions_owner_updated
  ON report_definitions(created_by_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_definitions_key_version
  ON report_definitions(key_version);
CREATE INDEX IF NOT EXISTS idx_report_definitions_query_gin
  ON report_definitions USING GIN(query_config);

CREATE TABLE IF NOT EXISTS report_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_definition_id UUID REFERENCES report_definitions(id) ON DELETE SET NULL,
  key_version VARCHAR(50) NOT NULL,
  query_snapshot JSONB NOT NULL,
  output_format VARCHAR(20) NOT NULL CHECK (output_format IN ('SCREEN', 'CSV')),
  matched_finding_count INT NOT NULL DEFAULT 0 CHECK (matched_finding_count >= 0),
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_report_run_query_object CHECK (jsonb_typeof(query_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_report_run_events_actor_created
  ON report_run_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_run_events_definition_created
  ON report_run_events(report_definition_id, created_at DESC);

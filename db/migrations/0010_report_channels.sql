-- 0010_report_channels.sql

CREATE TABLE IF NOT EXISTS report_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  icon VARCHAR(50) DEFAULT 'FileSpreadsheet',
  badge_color VARCHAR(50) DEFAULT 'blue',
  input_methods TEXT[] NOT NULL DEFAULT ARRAY['EXCEL_IMPORT', 'WEB_FORM'],
  issuing_department VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES report_channels(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  schema_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_report_channels_current_version'
  ) THEN
    ALTER TABLE report_channels
      ADD CONSTRAINT fk_report_channels_current_version
      FOREIGN KEY (current_version_id) REFERENCES channel_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_one_published_version
  ON channel_versions(channel_id)
  WHERE status = 'PUBLISHED';

-- 0070_auth_campaign_drive_priority.sql
-- Real local credentials/sessions, reusable audit campaigns and per-user priority monitoring.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS google_workspace_email VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_google_workspace_email
  ON app_users(LOWER(google_workspace_email))
  WHERE google_workspace_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_digest CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  decision_no VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
  lead_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  drive_root_folder_id VARCHAR(255),
  drive_root_url TEXT,
  drive_provision_status VARCHAR(30) NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK (drive_provision_status IN ('NOT_CONFIGURED', 'PROVISIONING', 'READY', 'FAILED')),
  drive_last_error TEXT,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS audit_campaign_members (
  campaign_id UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  member_role VARCHAR(10) NOT NULL CHECK (member_role IN ('LEAD', 'MEMBER')),
  assigned_branch_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_campaign_branches (
  campaign_id UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  branch_code VARCHAR(50) NOT NULL,
  PRIMARY KEY (campaign_id, branch_code)
);

CREATE TABLE IF NOT EXISTS audit_campaign_report_channels (
  campaign_id UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES report_channels(id) ON DELETE RESTRICT,
  PRIMARY KEY (campaign_id, channel_id)
);

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES audit_campaigns(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_findings_campaign_status
  ON findings(campaign_id, workflow_status, sla_status);

CREATE TABLE IF NOT EXISTS workspace_watch_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('CLUSTER', 'BRANCH', 'CUSTOMER')),
  target_key VARCHAR(500) NOT NULL,
  is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  prioritized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_watch_priority
  ON workspace_watch_targets(user_id, is_priority DESC, prioritized_at DESC, created_at DESC);

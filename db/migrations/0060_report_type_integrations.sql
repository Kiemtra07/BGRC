-- 0060_report_type_integrations.sql
-- Non-secret Google Sheets and email automation settings are versioned with the report type.

ALTER TABLE channel_versions
  ADD COLUMN IF NOT EXISTS integration_config JSONB NOT NULL DEFAULT jsonb_build_object(
    'googleSheets', jsonb_build_object('enabled', false, 'sheetName', 'AuditBGS', 'syncMode', 'APPEND'),
    'email', jsonb_build_object(
      'enabled', false,
      'sendOnSubmission', true,
      'sendBeforeDeadline', true,
      'sendWhenOverdue', true,
      'sendTime', '08:00',
      'recipientRoles', jsonb_build_array('INTERNAL_APPROVER'),
      'additionalRecipients', '[]'::jsonb,
      'subjectTemplate', '[Audit BGS] {{reportName}} - {{status}}'
    )
  );

CREATE INDEX IF NOT EXISTS idx_channel_versions_channel_created
  ON channel_versions(channel_id, created_at DESC);

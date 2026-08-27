-- 0100_import_provenance_and_sources.sql
-- Đồng bộ nguồn nhập và dấu vết bất biến giữa hợp đồng ứng dụng với PostgreSQL.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES audit_campaigns(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255);

ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_source_type_check;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_source_type_check CHECK (
    source_type IN (
      'EXCEL_IMPORT',
      'XLSX',
      'ZIP_XLSX',
      'CLIPBOARD',
      'DOCX',
      'API_BULK',
      'WEB_FORM'
    )
  );

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS imported_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_by_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS import_source_file_name VARCHAR(255);

ALTER TABLE findings
  DROP CONSTRAINT IF EXISTS findings_import_source_type_check;

ALTER TABLE findings
  ADD CONSTRAINT findings_import_source_type_check CHECK (
    import_source_type IS NULL OR import_source_type IN (
      'XLSX',
      'ZIP_XLSX',
      'CLIPBOARD',
      'DOCX',
      'API_BULK',
      'WEB_FORM'
    )
  );

CREATE INDEX IF NOT EXISTS idx_import_batches_campaign_created
  ON import_batches(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_findings_import_provenance
  ON findings(import_batch_id, imported_by_user_id, imported_at DESC);

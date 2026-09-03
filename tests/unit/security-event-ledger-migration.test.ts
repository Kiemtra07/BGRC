import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ledgerPath = path.resolve('db/migrations/0120_security_event_ledger.sql');
const scopePath = path.resolve('db/migrations/0121_findings_scope_columns_and_indexes.sql');

describe('security event ledger migration', () => {
  const migration = fs.readFileSync(ledgerPath, 'utf8');

  it('keeps runtime string IDs and backfills before stripping the hot snapshot array', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS security_event_ledger/i);
    expect(migration).toMatch(/event_id\s+VARCHAR\(255\) PRIMARY KEY/i);
    expect(migration).toMatch(/jsonb_array_elements/i);
    expect(migration).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/i);
    expect(migration).toMatch(/payload - 'securityEvents'/i);
    // Gỡ mảng khỏi snapshot trước khi backfill xong là mất trắng nhật ký an ninh đã có.
    expect(migration.indexOf('INSERT INTO security_event_ledger')).toBeLessThan(
      migration.indexOf("payload = payload - 'securityEvents'"),
    );
  });

  it('enforces append-only audit history and backend-only RLS', () => {
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.security_event_ledger/i);
    expect(migration).toMatch(/SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/ALTER TABLE public\.security_event_ledger FORCE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/SELECT current_setting\('app\.runtime_role', true\)/i);
    expect(migration).toMatch(/REVOKE ALL ON public\.security_event_ledger FROM PUBLIC/i);
  });

  it('indexes the two access patterns the audit screen actually uses', () => {
    expect(migration).toMatch(/idx_security_event_ledger_occurred[\s\S]*occurred_at DESC/i);
    expect(migration).toMatch(/idx_security_event_ledger_actor[\s\S]*actor_user_id/i);
  });
});

describe('findings scope columns and indexes migration', () => {
  const migration = fs.readFileSync(scopePath, 'utf8');

  it('adds the columns the UI filters already offer', () => {
    // riskLevel và businessLine đã là bộ lọc trên màn hình nhưng chưa có cột; thiếu chúng thì luồng
    // đọc bằng SQL sẽ quét tuần tự toàn bảng đúng ở hai bộ lọc người dùng bấm nhiều nhất.
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS risk_level/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS business_line/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS is_special_case/i);
  });

  it('covers all three data scopes from hasFindingAccess', () => {
    expect(migration).toMatch(/idx_findings_branch_queue[\s\S]*branch_code, workflow_status, deadline_date/i);
    expect(migration).toMatch(/idx_findings_cluster_queue[\s\S]*cluster_name, workflow_status, deadline_date/i);
    expect(migration).toMatch(/idx_findings_dept_queue[\s\S]*branch_code, department, workflow_status/i);
  });

  it('builds free-text search on an IMMUTABLE generated column', () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
    expect(migration).toMatch(/GENERATED ALWAYS AS[\s\S]*STORED/i);
    expect(migration).toMatch(/USING GIN \(search_text gin_trgm_ops\)/i);
    // unaccent() không IMMUTABLE nên không được phép xuất hiện trong biểu thức cột dẫn xuất.
    expect(migration).not.toMatch(/GENERATED ALWAYS AS[\s\S]*unaccent\(/i);
  });

  it('avoids CONCURRENTLY because the migration runner wraps each file in a transaction', () => {
    // db/migrate.ts chạy BEGIN ... COMMIT quanh từng migration; CREATE INDEX CONCURRENTLY sẽ lỗi.
    expect(migration).not.toMatch(/CREATE INDEX CONCURRENTLY/i);
  });
});

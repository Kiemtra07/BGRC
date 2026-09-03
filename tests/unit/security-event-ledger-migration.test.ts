import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ledgerPath = path.resolve('db/migrations/0120_security_event_ledger.sql');
const recordsPath = path.resolve('db/migrations/0121_findings_scope_columns_and_indexes.sql');
const idempotencyPath = path.resolve('db/migrations/0122_idempotency_keys_backend_policy.sql');

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

describe('finding records table migration', () => {
  const migration = fs.readFileSync(recordsPath, 'utf8');

  it('keeps runtime string identifiers instead of the legacy UUID findings table', () => {
    // Bảng findings ở 0020 khai id UUID và bị bốn khoá ngoại UUID trỏ vào, trong khi ứng dụng dùng
    // định danh dạng chữ (find-001, chan-...). Đây đúng tình huống 0110 đã giải bằng bảng riêng.
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS finding_records/i);
    expect(migration).toMatch(/finding_id\s+VARCHAR\(255\) PRIMARY KEY/i);
    expect(migration).toMatch(/channel_id\s+VARCHAR\(255\)/i);
    expect(migration).not.toMatch(/finding_id\s+UUID/i);
  });

  it('carries the whole finding so the SQL read path returns what the memory path returns', () => {
    expect(migration).toMatch(/payload\s+JSONB\s+NOT NULL/i);
    expect(migration).toMatch(/jsonb_typeof\(payload\) = 'object'/i);
    // Vân tay nội dung để lượt đồng bộ chỉ ghi những dòng thật sự đổi.
    expect(migration).toMatch(/content_hash\s+VARCHAR\(64\)\s+NOT NULL/i);
  });

  it('carries the columns the UI filters already offer', () => {
    // riskLevel và businessLine đã là bộ lọc trên màn hình; thiếu cột thì mỗi lần lọc là một lần
    // quét tuần tự toàn bảng, đúng ở hai bộ lọc người dùng bấm nhiều nhất.
    expect(migration).toMatch(/risk_level\s+VARCHAR/i);
    expect(migration).toMatch(/business_line\s+VARCHAR/i);
    expect(migration).toMatch(/is_special_case\s+BOOLEAN/i);
  });

  it('covers all three data scopes from hasFindingAccess', () => {
    expect(migration).toMatch(/idx_finding_records_branch_queue[\s\S]*branch_code, workflow_status, deadline_date/i);
    expect(migration).toMatch(/idx_finding_records_cluster_queue[\s\S]*cluster_name, workflow_status, deadline_date/i);
    expect(migration).toMatch(/idx_finding_records_dept_queue[\s\S]*branch_code, department, workflow_status/i);
  });

  it('builds free-text search on an IMMUTABLE generated column', () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
    expect(migration).toMatch(/GENERATED ALWAYS AS[\s\S]*STORED/i);
    expect(migration).toMatch(/USING GIN \(search_text gin_trgm_ops\)/i);
    // unaccent() không IMMUTABLE nên không được phép nằm trong biểu thức cột dẫn xuất.
    expect(migration).not.toMatch(/GENERATED ALWAYS AS[\s\S]*unaccent\(/i);
  });

  it('restricts the table to the backend runtime role', () => {
    expect(migration).toMatch(/ALTER TABLE public\.finding_records FORCE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/SELECT current_setting\('app\.runtime_role', true\)/i);
    expect(migration).toMatch(/REVOKE ALL ON public\.finding_records FROM PUBLIC/i);
  });

  it('avoids CONCURRENTLY because the migration runner wraps each file in a transaction', () => {
    // db/migrate.ts chạy BEGIN ... COMMIT quanh từng migration; CREATE INDEX CONCURRENTLY sẽ lỗi.
    expect(migration).not.toMatch(/CREATE INDEX CONCURRENTLY/i);
  });
});

describe('idempotency keys backend policy migration', () => {
  const migration = fs.readFileSync(idempotencyPath, 'utf8');

  it('declares the backend policy instead of assuming the runtime owns the table', () => {
    // 0090 chỉ ENABLE (không FORCE) rồi REVOKE, tức dựa vào việc chủ sở hữu bảng đi vòng qua RLS.
    // Khi runtime bắt đầu đọc/ghi bảng này thật, giả định đó phải được thay bằng khai báo tường minh.
    expect(migration).toMatch(/ALTER TABLE public\.idempotency_keys FORCE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE POLICY backend_idempotency_keys_access/i);
    expect(migration).toMatch(/SELECT current_setting\('app\.runtime_role', true\)/i);
    expect(migration).toMatch(/REVOKE ALL ON public\.idempotency_keys FROM PUBLIC/i);
  });
});

describe('migration file hygiene', () => {
  it('keeps every migration on LF so the checksum matches across platforms', () => {
    // db/migrate.ts băm nội dung file theo byte. Cùng một file ở CRLF trên Windows và LF trên CI sẽ
    // cho hai checksum khác nhau, và runner sẽ báo "Checksum drift detected" cho file chưa hề đổi.
    const directory = path.resolve('db/migrations');
    const offenders = fs.readdirSync(directory)
      .filter(name => name.endsWith('.sql'))
      .filter(name => fs.readFileSync(path.join(directory, name), 'utf8').includes('\r\n'));
    expect(offenders).toEqual([]);
  });
});

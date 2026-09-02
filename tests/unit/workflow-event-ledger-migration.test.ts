import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve('db/migrations/0110_workflow_event_ledger.sql');
const hardeningPath = path.resolve('db/migrations/0111_supabase_security_hardening.sql');

describe('workflow event ledger migration', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const hardening = fs.readFileSync(hardeningPath, 'utf8');

  it('preserves runtime string IDs and backfills before removing hot snapshot history', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS workflow_event_ledger/i);
    expect(migration).toMatch(/event_id VARCHAR\(255\) PRIMARY KEY/i);
    expect(migration).toMatch(/finding_id VARCHAR\(255\) NOT NULL/i);
    expect(migration).toMatch(/jsonb_array_elements/i);
    expect(migration).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/i);
    expect(migration).toMatch(/payload - 'workflowEvents'/i);
    expect(migration.indexOf('INSERT INTO workflow_event_ledger')).toBeLessThan(
      migration.indexOf("payload = payload - 'workflowEvents'"),
    );
  });

  it('enforces append-only history and backend-only RLS', () => {
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.workflow_event_ledger/i);
    expect(migration).toMatch(/SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/ALTER TABLE public\.workflow_event_ledger FORCE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/SELECT current_setting\('app\.runtime_role', true\)/i);
  });

  it('hardens the advisor findings without granting client access', () => {
    expect(hardening).toMatch(/CREATE POLICY client_deny_all/i);
    expect(hardening).toMatch(/USING \(false\) WITH CHECK \(false\)/i);
    expect(hardening).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC/i);
    expect(hardening).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM anon/i);
    expect(hardening).toMatch(/security_invoker = true/i);
    expect(hardening).toMatch(/SELECT current_setting\('app\.runtime_role', true\)/i);
  });
});

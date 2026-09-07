import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAcceptedLegacyChecksum } from '../../db/migrate';

const migrationPath = path.resolve('db/migrations/0080_postgres_state_and_rls.sql');
const runtimeManifestPolicyPath = path.resolve('db/migrations/0131_schema_release_log_runtime_read.sql');

describe('Postgres state migration 0080', () => {
  it('accepts only the audited legacy checksum for migration 0120', () => {
    expect(isAcceptedLegacyChecksum('0120', 'ba7cb687c305cebc8f2f0c78af9749573cb3bbdfef28a36587fcefa2394c059')).toBe(true);
    expect(isAcceptedLegacyChecksum('0120', 'ba7cb687c305ceb8c2f2f0c78af9749573cb3bbdfef28a36587fcefa2394c059')).toBe(false);
    expect(isAcceptedLegacyChecksum('0121', 'ba7cb687c305cebc8f2f0c78af9749573cb3bbdfef28a36587fcefa2394c059')).toBe(false);
  });

  it('allows the least-privilege backend transaction to read the migration ledger through RLS', () => {
    const sql = fs.readFileSync(runtimeManifestPolicyPath, 'utf8');

    expect(sql).toMatch(/CREATE POLICY backend_schema_release_log_read/i);
    expect(sql).toMatch(/FOR SELECT/i);
    expect(sql).toMatch(/current_setting\('app\.runtime_role',\s*true\)\)\s*=\s*'backend'/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.schema_release_log FROM PUBLIC/i);
  });

  it('adds a concurrency-safe aggregate snapshot and the normalized entities missing from 0001-0070', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS app_state_snapshots/i);
    expect(sql).toMatch(/payload\s+JSONB\s+NOT NULL/i);
    expect(sql).toMatch(/version\s+BIGINT\s+NOT NULL/i);
    expect(sql).toMatch(/jsonb_typeof\(payload\)\s*=\s*'object'/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS report_catalog_configurations/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS finding_follows/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS workspace_accepted_targets/i);
  });

  it('forces RLS and grants snapshot access only to the backend transaction context', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/ALTER TABLE app_state_snapshots ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE app_state_snapshots FORCE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY backend_app_state_access/i);
    expect(sql).toMatch(/current_setting\('app\.runtime_role',\s*true\)\s*=\s*'backend'/i);
    expect(sql).toMatch(/REVOKE ALL ON app_state_snapshots FROM PUBLIC/i);
  });
});

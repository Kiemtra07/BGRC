import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAcceptedLegacyChecksum, listMigrationFiles } from '../db/migrate';

type PreflightResult = {
  command: 'acceptance:preflight';
  readOnly: true;
  configuration: { databaseUrlPresent: boolean; dataStoreMode: string | null };
  database: {
    connected: boolean;
    migrationLogPresent: boolean | null;
    applicationMigrationCount: number;
    missingMigrations: string[];
    unexpectedMigrations: string[];
    checksumDrift: string[];
    authSecurityStateReady: boolean | null;
    runtimeRole: { superuser: boolean | null; bypassRls: boolean | null };
  };
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  errorCode?: string;
};

function report(result: PreflightResult): void {
  console.log(JSON.stringify(result, null, 2));
  if (!result.checks.every(check => check.passed)) process.exitCode = 1;
}

function baseResult(applicationMigrationCount: number): PreflightResult {
  return {
    command: 'acceptance:preflight',
    readOnly: true,
    configuration: {
      databaseUrlPresent: Boolean(process.env.DATABASE_URL),
      dataStoreMode: process.env.DATA_STORE_MODE ?? null,
    },
    database: {
      connected: false,
      migrationLogPresent: null,
      applicationMigrationCount,
      missingMigrations: [],
      unexpectedMigrations: [],
      checksumDrift: [],
      authSecurityStateReady: null,
      runtimeRole: { superuser: null, bypassRls: null },
    },
    checks: [],
  };
}

export async function runAcceptanceEnvironmentPreflight(): Promise<PreflightResult> {
  const migrations = await listMigrationFiles();
  const result = baseResult(migrations.length);
  const configurationValid = result.configuration.databaseUrlPresent && result.configuration.dataStoreMode === 'postgres';
  result.checks.push({
    name: 'postgres-configuration',
    passed: configurationValid,
    detail: configurationValid
      ? 'DATABASE_URL is present and DATA_STORE_MODE=postgres.'
      : 'Set DATABASE_URL and DATA_STORE_MODE=postgres in the acceptance environment.',
  });

  if (!configurationValid) return result;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const [migrationLogResult, roleResult, authSecurityStateResult] = await Promise.all([
        client.query<{ present: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'schema_release_log'
          ) AS present
        `),
        client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(`
          SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
        `),
        client.query<{ login_attempts: boolean; used_totp_counters: boolean }>(`
          SELECT
            to_regclass('public.auth_login_attempts') IS NOT NULL AS login_attempts,
            to_regclass('public.auth_used_totp_counters') IS NOT NULL AS used_totp_counters
        `),
      ]);

      result.database.connected = true;
      result.database.migrationLogPresent = migrationLogResult.rows[0]?.present ?? false;
      const role = roleResult.rows[0];
      result.database.runtimeRole = {
        superuser: role?.rolsuper ?? null,
        bypassRls: role?.rolbypassrls ?? null,
      };
      const authSecurityState = authSecurityStateResult.rows[0];
      result.database.authSecurityStateReady = authSecurityState?.login_attempts === true
        && authSecurityState?.used_totp_counters === true;

      result.checks.push({
        name: 'postgres-read-only-connection',
        passed: true,
        detail: 'Connected inside a read-only transaction.',
      });
      const leastPrivilege = role?.rolsuper === false && role?.rolbypassrls === false;
      result.checks.push({
        name: 'runtime-role-least-privilege',
        passed: leastPrivilege,
        detail: leastPrivilege
          ? 'Runtime role is neither superuser nor BYPASSRLS.'
          : 'Runtime role must not be superuser or BYPASSRLS.',
      });

      if (result.database.migrationLogPresent) {
        const appliedResult = await client.query<{ version: string; checksum: string | null }>(
          'SELECT version, checksum FROM schema_release_log ORDER BY version',
        );
        const applied = new Map(appliedResult.rows.map(row => [row.version, row.checksum]));
        const expected = new Map(migrations.map(migration => [migration.version, migration.checksum]));
        result.database.missingMigrations = migrations
          .filter(migration => !applied.has(migration.version))
          .map(migration => migration.version);
        result.database.unexpectedMigrations = [...applied.keys()].filter(version => !expected.has(version));
        result.database.checksumDrift = migrations
          .filter(migration => {
            const actual = applied.get(migration.version);
            return actual !== undefined
              && actual !== null
              && actual !== migration.checksum
              && !isAcceptedLegacyChecksum(migration.version, actual);
          })
          .map(migration => migration.version);
      }

      const migrationsCurrent = result.database.migrationLogPresent === true
        && result.database.missingMigrations.length === 0
        && result.database.unexpectedMigrations.length === 0
        && result.database.checksumDrift.length === 0;
      result.checks.push({
        name: 'migration-manifest',
        passed: migrationsCurrent,
        detail: migrationsCurrent
          ? 'schema_release_log matches the local migration manifest.'
          : 'Apply or reconcile migrations before acceptance testing.',
      });
      result.checks.push({
        name: 'auth-security-state',
        passed: result.database.authSecurityStateReady === true,
        detail: result.database.authSecurityStateReady
          ? 'Authentication rate-limit and TOTP replay tables are present.'
          : 'Apply migration 0125_auth_security_state.sql before deploying authentication changes.',
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } catch (error) {
    result.errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? 'UNKNOWN')
      : 'UNKNOWN';
    result.checks.push({
      name: 'postgres-read-only-connection',
      passed: false,
      detail: 'Read-only PostgreSQL probe failed. Review the safe error code and database connectivity.',
    });
  } finally {
    await pool.end();
  }

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAcceptanceEnvironmentPreflight()
    .then(report)
    .catch(error => {
      const result = baseResult(0);
      result.errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'UNKNOWN')
        : 'UNKNOWN';
      result.checks.push({
        name: 'migration-manifest',
        passed: false,
        detail: 'Could not load the local migration manifest.',
      });
      report(result);
    });
}

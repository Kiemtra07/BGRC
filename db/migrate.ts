import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDatabaseConfigured, pool } from '../server/src/adapters/postgres';

export interface MigrationFile {
  version: string;
  name: string;
  absolutePath: string;
  sql: string;
  checksum: string;
}

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function listMigrationFiles(directory = migrationsDirectory): Promise<MigrationFile[]> {
  const names = (await fs.readdir(directory))
    .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  const seenVersions = new Set<string>();
  const migrations: MigrationFile[] = [];
  for (const name of names) {
    const version = name.slice(0, 4);
    if (seenVersions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    seenVersions.add(version);
    const absolutePath = path.join(directory, name);
    const sql = await fs.readFile(absolutePath, 'utf8');
    if (!sql.trim()) throw new Error(`Empty migration: ${name}`);
    migrations.push({
      version,
      name,
      absolutePath,
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
    });
  }
  return migrations;
}

export async function migrate(options: { dryRun?: boolean } = {}): Promise<void> {
  const migrations = await listMigrationFiles();
  if (options.dryRun) {
    console.log(`Migration dry-run: ${migrations.length} file(s) hợp lệ.`);
    for (const migration of migrations) {
      console.log(`- ${migration.name} ${migration.checksum.slice(0, 12)}`);
    }
    return;
  }

  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_release_log (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('ALTER TABLE schema_release_log ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');

    const appliedResult = await client.query<{ version: string; checksum: string | null }>(
      'SELECT version, checksum FROM schema_release_log ORDER BY version',
    );
    const applied = new Map(appliedResult.rows.map(row => [row.version, row.checksum]));

    for (const migration of migrations) {
      const priorChecksum = applied.get(migration.version);
      if (priorChecksum !== undefined) {
        if (priorChecksum && priorChecksum !== migration.checksum) {
          throw new Error(`Checksum drift detected for migration ${migration.name}`);
        }
        if (!priorChecksum) {
          await client.query(
            'UPDATE schema_release_log SET checksum = $1 WHERE version = $2 AND checksum IS NULL',
            [migration.checksum, migration.version],
          );
        }
        console.log(`SKIP ${migration.name}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_release_log(version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        console.log(`APPLIED ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  migrate({ dryRun })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

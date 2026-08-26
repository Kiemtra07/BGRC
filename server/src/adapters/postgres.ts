import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

export function assertDatabaseConfigured(): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_REQUIRED — Hãy khai báo database AuditBGS rõ ràng trước khi migrate/seed.');
  }
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  scopeContext?: { userId?: string; orgScope?: string }
): Promise<T> {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (scopeContext?.userId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [scopeContext.userId]);
    }
    if (scopeContext?.orgScope) {
      await client.query("SELECT set_config('app.current_org_scope', $1, true)", [scopeContext.orgScope]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

export function assertDatabaseConfigured(): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_REQUIRED — Hãy khai báo database AuditBGS rõ ràng trước khi migrate/seed.');
  }
}

/**
 * Tham số chọn cho serverless chạy sau connection pooler (Supabase transaction pooler, cổng 6543).
 *
 * `max` để thấp vì pooler đã gộp kết nối rồi: mỗi instance Vercel giữ tới 20 client connection thì
 * chỉ vài instance là cạn hạn mức của pooler, và `connect()` bắt đầu timeout — một trong những
 * nguồn HTTP 500 hay gặp nhất. `idleTimeoutMillis` ngắn hơn khoảng thời gian một lambda bị đóng
 * băng, nên pool tự nhả socket trước khi phía bên kia đóng, thay vì phát cho request sau một kết
 * nối đã chết.
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  allowExitOnIdle: true,
});

/**
 * Bắt buộc phải có. `pg` phát sự kiện `error` trên Pool khi một client đang rảnh bị ngắt kết nối.
 * `EventEmitter` không có listener cho `error` sẽ ném thẳng ra ngoài và làm sập cả function — mọi
 * request đang chạy cùng lúc đều trả HTTP 500. Ghi log rồi bỏ qua là đủ: pool tự loại client hỏng
 * và mở kết nối mới ở lần `connect()` kế tiếp.
 */
pool.on('error', (error) => {
  console.error('[pg] Client rảnh bị lỗi; pool sẽ tự mở lại kết nối.', error);
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
    const settings: string[] = [];
    const values: string[] = [];
    if (scopeContext?.userId) {
      settings.push(`set_config('app.current_user_id', $${values.length + 1}, true)`);
      values.push(scopeContext.userId);
    }
    if (scopeContext?.orgScope) {
      settings.push(`set_config('app.current_org_scope', $${values.length + 1}, true)`);
      values.push(scopeContext.orgScope);
    }
    if (settings.length > 0) {
      // Scope context is transaction-local; combine both settings into one parameterized query.
      await client.query(`SELECT ${settings.join(', ')}`, values);
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

import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';

/**
 * Mở transaction và đặt context backend trong cùng một simple-query round-trip.
 *
 * Chuỗi này là hằng số, không nhận dữ liệu người dùng. `SET LOCAL` vẫn sống đến
 * hết transaction nên các policy RLS dùng `current_setting` không bị mất context.
 */
export async function withBackendTransaction<TResult>(
  pool: PostgresPoolLike,
  operation: (client: PostgresClientLike) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN; SET LOCAL app.runtime_role = 'backend'");
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Giữ lỗi gốc; connection hỏng thì rollback explicit cũng không đáng tin.
    }
    throw error;
  } finally {
    client.release();
  }
}

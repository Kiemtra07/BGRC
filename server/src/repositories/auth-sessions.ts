import type { AuthSessionRecord } from '../../../shared/contracts';
import type { PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

function toIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function toRecord(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: String(row.session_id),
    userId: String(row.user_id),
    tokenDigest: String(row.token_digest),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    lastSeenAt: toIso(row.last_seen_at) ?? new Date(0).toISOString(),
    expiresAt: toIso(row.expires_at) ?? new Date(0).toISOString(),
    ...(toIso(row.step_up_at) ? { stepUpAt: toIso(row.step_up_at) } : {}),
    ...(toIso(row.revoked_at) ? { revokedAt: toIso(row.revoked_at) } : {}),
  };
}

/**
 * Phiên đăng nhập trong bảng riêng. Mỗi thao tác chạm đúng một hàng theo chỉ mục, không đọc hay ghi
 * snapshot, nên đăng nhập, đăng xuất và thu hồi phiên không còn tốn theo số hồ sơ trong hệ thống.
 * Chỉ lưu SHA-256 của token.
 */
export class PostgresAuthSessions {
  public constructor(private readonly pool: PostgresPoolLike) {}

  public async insert(record: AuthSessionRecord): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query(
        `INSERT INTO auth_sessions(session_id, user_id, token_digest, created_at, last_seen_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [record.id, record.userId, record.tokenDigest, record.createdAt, record.lastSeenAt, record.expiresAt],
      );
    });
  }

  /** Phiên còn hiệu lực theo digest, hoặc `undefined`. Việc kiểm hạn do người gọi quyết định. */
  public async findActiveByDigest(tokenDigest: string): Promise<AuthSessionRecord | undefined> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        `SELECT session_id, user_id, token_digest, created_at, last_seen_at, expires_at, step_up_at, revoked_at
           FROM auth_sessions
          WHERE token_digest = $1 AND revoked_at IS NULL`,
        [tokenDigest],
      );
      return result.rows[0] ? toRecord(result.rows[0] as Record<string, unknown>) : undefined;
    });
  }

  public async touch(sessionId: string, seenAt: string): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query('UPDATE auth_sessions SET last_seen_at = $2 WHERE session_id = $1', [sessionId, seenAt]);
    });
  }

  public async markStepUp(tokenDigest: string, at: string): Promise<boolean> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        'UPDATE auth_sessions SET step_up_at = $2 WHERE token_digest = $1 AND revoked_at IS NULL',
        [tokenDigest, at],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  public async revokeByDigest(tokenDigest: string, at: string): Promise<boolean> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE token_digest = $1 AND revoked_at IS NULL',
        [tokenDigest, at],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  public async revokeById(sessionId: string, at: string): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query('UPDATE auth_sessions SET revoked_at = $2 WHERE session_id = $1', [sessionId, at]);
    });
  }

  public async revokeAllForUser(userId: string, at: string): Promise<number> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        'UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [userId, at],
      );
      return result.rowCount ?? 0;
    });
  }

  /** Xóa phiên đã hết hạn hoặc đã thu hồi trước mốc `before` để bảng không phình. */
  public async purge(before: string): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query('DELETE FROM auth_sessions WHERE expires_at < $1 OR revoked_at < $1', [before]);
    });
  }
}

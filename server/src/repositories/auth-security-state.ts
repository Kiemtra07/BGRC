import crypto from 'node:crypto';
import type { PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

function hashedLoginKey(loginKey: string): string {
  return crypto.createHash('sha256').update(`auditbgs:login:${loginKey}`, 'utf8').digest('hex');
}

function toIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

/**
 * Trạng thái chống dò được tách khỏi snapshot để mọi instance cùng nhìn một hàng đã khoá.
 * Khoá tên đăng nhập luôn là SHA-256 có namespace, không lưu email/tên đăng nhập thô trong bảng.
 */
export class PostgresAuthSecurityState {
  public constructor(private readonly pool: PostgresPoolLike) {}

  public async lockedUntil(loginKey: string, nowMs: number): Promise<string | undefined> {
    const digest = hashedLoginKey(loginKey);
    return withBackendTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [digest]);
      const result = await client.query(
        `SELECT locked_until
           FROM auth_login_attempts
          WHERE login_key = $1
          FOR UPDATE`,
        [digest],
      );
      const lockedUntil = toIso(result.rows[0]?.locked_until);
      if (!lockedUntil || Date.parse(lockedUntil) <= nowMs) return undefined;
      return lockedUntil;
    });
  }

  public async recordLoginFailure(
    loginKey: string,
    nowMs: number,
    failureLimit: number,
    failureWindowMs: number,
    lockoutMs: number,
  ): Promise<{ locked: boolean }> {
    const digest = hashedLoginKey(loginKey);
    const now = new Date(nowMs).toISOString();
    return withBackendTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [digest]);
      const existingResult = await client.query(
        `SELECT failed_count, first_failed_at
           FROM auth_login_attempts
          WHERE login_key = $1
          FOR UPDATE`,
        [digest],
      );
      const existing = existingResult.rows[0];
      const firstFailedAt = toIso(existing?.first_failed_at);
      const inWindow = firstFailedAt !== undefined && nowMs - Date.parse(firstFailedAt) <= failureWindowMs;
      const failedCount = (inWindow ? Number(existing?.failed_count ?? 0) : 0) + 1;
      const lockedUntil = failedCount >= failureLimit ? new Date(nowMs + lockoutMs).toISOString() : null;

      await client.query(
        `INSERT INTO auth_login_attempts(
           login_key, failed_count, first_failed_at, last_failed_at, locked_until, updated_at
         ) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (login_key) DO UPDATE
           SET failed_count = EXCLUDED.failed_count,
               first_failed_at = EXCLUDED.first_failed_at,
               last_failed_at = EXCLUDED.last_failed_at,
               locked_until = EXCLUDED.locked_until,
               updated_at = NOW()`,
        [digest, failedCount, inWindow ? firstFailedAt : now, now, lockedUntil],
      );
      return { locked: lockedUntil !== null };
    });
  }

  public async clearLoginFailures(loginKey: string): Promise<void> {
    const digest = hashedLoginKey(loginKey);
    await withBackendTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [digest]);
      await client.query('DELETE FROM auth_login_attempts WHERE login_key = $1', [digest]);
    });
  }

  public async consumeTotpCounter(userId: string, counter: number, nowMs: number, retentionSteps: number): Promise<boolean> {
    const lockKey = crypto.createHash('sha256').update(`auditbgs:totp:${userId}:${counter}`, 'utf8').digest('hex');
    const oldestCounter = Math.floor(nowMs / 30_000) - retentionSteps;
    return withBackendTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      await client.query('DELETE FROM auth_used_totp_counters WHERE counter < $1', [oldestCounter]);
      const result = await client.query(
        `INSERT INTO auth_used_totp_counters(user_id, counter, used_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, counter) DO NOTHING`,
        [userId, counter],
      );
      return result.rowCount === 1;
    });
  }
}

import { describe, expect, it } from 'vitest';
import { PostgresAuthSecurityState } from '../../server/src/repositories/auth-security-state';

class FakeClient {
  public readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  public released = false;
  private readonly consumed = new Set<string>();
  private readonly attempts = new Map<string, Record<string, unknown>>();

  public async query(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalized, params });
    if (/INSERT INTO auth_used_totp_counters/i.test(normalized)) {
      const key = `${params[0]}:${params[1]}`;
      if (this.consumed.has(key)) return { rows: [], rowCount: 0 };
      this.consumed.add(key);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT locked_until FROM auth_login_attempts/i.test(normalized)) {
      const record = this.attempts.get(String(params[0]));
      return { rows: record ? [{ locked_until: record.locked_until }] : [], rowCount: record ? 1 : 0 };
    }
    if (/SELECT failed_count, first_failed_at FROM auth_login_attempts/i.test(normalized)) {
      const record = this.attempts.get(String(params[0]));
      return { rows: record ? [record] : [], rowCount: record ? 1 : 0 };
    }
    if (/INSERT INTO auth_login_attempts/i.test(normalized)) {
      this.attempts.set(String(params[0]), {
        failed_count: params[1],
        first_failed_at: params[2],
        last_failed_at: params[3],
        locked_until: params[4],
      });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  public release(): void { this.released = true; }
}

class FakePool {
  public constructor(public readonly client: FakeClient) {}
  public async connect(): Promise<FakeClient> { return this.client; }
}

describe('PostgresAuthSecurityState', () => {
  it('consumes a TOTP counter only once across callers', async () => {
    const client = new FakeClient();
    const state = new PostgresAuthSecurityState(new FakePool(client));

    await expect(state.consumeTotpCounter('user-1', 581234, Date.parse('2026-09-05T11:30:00.000Z'))).resolves.toBe(true);
    await expect(state.consumeTotpCounter('user-1', 581234, Date.parse('2026-09-05T11:30:00.000Z'))).resolves.toBe(false);

    expect(client.queries.filter(query => /pg_advisory_xact_lock/i.test(query.sql))).toHaveLength(2);
    expect(client.queries.filter(query => /INSERT INTO auth_used_totp_counters/i.test(query.sql))).toHaveLength(2);
    expect(client.queries.some(query => /ON CONFLICT \(user_id, counter\) DO NOTHING/i.test(query.sql))).toBe(true);
    expect(client.released).toBe(true);
  });

  it('stores a digest instead of a raw login identifier when it locks a login key', async () => {
    const client = new FakeClient();
    const state = new PostgresAuthSecurityState(new FakePool(client));

    await state.recordLoginFailure('nguyen.van.a@bidv.com.vn', Date.parse('2026-09-05T11:30:00.000Z'), 5, 15 * 60_000, 30 * 60_000);

    const lock = client.queries.find(query => /pg_advisory_xact_lock/i.test(query.sql));
    expect(lock?.params[0]).not.toBe('nguyen.van.a@bidv.com.vn');
    expect(String(lock?.params[0])).toMatch(/^[a-f0-9]{64}$/);
  });

  it('shares the failed-login threshold and temporary lock between instances', async () => {
    const client = new FakeClient();
    const firstInstance = new PostgresAuthSecurityState(new FakePool(client));
    const secondInstance = new PostgresAuthSecurityState(new FakePool(client));
    const now = Date.parse('2026-09-05T11:30:00.000Z');

    await firstInstance.recordLoginFailure('admin.hethong', now, 2, 15 * 60_000, 30 * 60_000);
    await secondInstance.recordLoginFailure('admin.hethong', now + 1_000, 2, 15 * 60_000, 30 * 60_000);

    await expect(firstInstance.lockedUntil('admin.hethong', now + 2_000)).resolves.toBe(
      '2026-09-05T12:00:01.000Z',
    );
  });
});

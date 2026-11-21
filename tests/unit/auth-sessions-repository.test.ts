import { describe, expect, it } from 'vitest';
import { PostgresAuthSessions } from '../../server/src/repositories/auth-sessions';
import { AuthSessionStore, sessionTokenDigest } from '../../server/src/security/session-store';
import { SnapshotSessionBackend, TableSessionBackend, type SessionBackend } from '../../server/src/security/session-backend';

type Row = Record<string, unknown>;

/** Bảng auth_sessions trong bộ nhớ, đủ để chạy các câu lệnh mà repository phát ra. */
class FakeClient {
  public readonly rows = new Map<string, Row>();
  public readonly statements: string[] = [];

  public async query(sql: string, params: unknown[] = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    this.statements.push(text);
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(text)) return { rows: [], rowCount: 0 };
    if (/^INSERT INTO auth_sessions/i.test(text)) {
      this.rows.set(String(params[0]), {
        session_id: params[0], user_id: params[1], token_digest: params[2], created_at: params[3],
        last_seen_at: params[4], expires_at: params[5], revoked_at: null, step_up_at: null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT .* FROM auth_sessions WHERE token_digest = /i.test(text)) {
      const found = [...this.rows.values()].find(row => row.token_digest === params[0] && row.revoked_at === null);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (/^UPDATE auth_sessions SET last_seen_at/i.test(text)) {
      const row = this.rows.get(String(params[0]));
      if (row) row.last_seen_at = params[1];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE auth_sessions SET step_up_at/i.test(text)) {
      const row = [...this.rows.values()].find(item => item.token_digest === params[0] && item.revoked_at === null);
      if (row) row.step_up_at = params[1];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE auth_sessions SET revoked_at = .* WHERE token_digest = /i.test(text)) {
      const row = [...this.rows.values()].find(item => item.token_digest === params[0] && item.revoked_at === null);
      if (row) row.revoked_at = params[1];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE auth_sessions SET revoked_at = .* WHERE session_id = /i.test(text)) {
      const row = this.rows.get(String(params[0]));
      if (row) row.revoked_at = params[1];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE auth_sessions SET revoked_at = .* WHERE user_id = /i.test(text)) {
      let count = 0;
      for (const row of this.rows.values()) {
        if (row.user_id === params[0] && row.revoked_at === null) { row.revoked_at = params[1]; count += 1; }
      }
      return { rows: [], rowCount: count };
    }
    if (/^DELETE FROM auth_sessions/i.test(text)) {
      let count = 0;
      for (const [key, row] of this.rows) {
        if (Date.parse(String(row.expires_at)) < Date.parse(String(params[0])) || row.revoked_at) { this.rows.delete(key); count += 1; }
      }
      return { rows: [], rowCount: count };
    }
    throw new Error(`Unexpected statement: ${text}`);
  }

  public release(): void {}
}

class FakePool {
  public constructor(public readonly client: FakeClient) {}
  public async connect(): Promise<FakeClient> { return this.client; }
}

let clock = Date.parse('2026-11-21T08:00:00.000Z');
const now = () => new Date(clock);
const advanceMinutes = (minutes: number) => { clock += minutes * 60_000; };

const tableBackend = (client: FakeClient) => new TableSessionBackend(
  new PostgresAuthSessions(new FakePool(client)),
  { now, idleMs: 30 * 60_000, touchAfterMs: 2 * 60_000 },
);

const backends: Array<[string, () => { backend: SessionBackend; client?: FakeClient }]> = [
  ['bộ nhớ (snapshot)', () => {
    let store = new AuthSessionStore({ now });
    return { backend: new SnapshotSessionBackend(() => store, records => { store = new AuthSessionStore({ now, records }); }) };
  }],
  ['bảng PostgreSQL', () => {
    const client = new FakeClient();
    return { client, backend: tableBackend(client) };
  }],
];

describe.each(backends)('phiên đăng nhập: %s', (_name, build) => {
  it('cấp token, tra lại đúng người và không lưu token thô', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const { backend, client } = build();
    const created = await backend.create('user-1');
    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(created.record.tokenDigest).toBe(sessionTokenDigest(created.token));
    await expect(backend.resolve(created.token)).resolves.toMatchObject({ userId: 'user-1' });
    await expect(backend.resolve('khong-phai-token')).resolves.toBeUndefined();
    if (client) expect(JSON.stringify([...client.rows.values()])).not.toContain(created.token);
  });

  it('thu hồi một phiên và mọi phiên của một người', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const { backend } = build();
    const first = await backend.create('user-1');
    const second = await backend.create('user-1');
    const other = await backend.create('user-2');

    await expect(backend.revoke(first.token)).resolves.toBe(true);
    await expect(backend.resolve(first.token)).resolves.toBeUndefined();
    await expect(backend.revokeAllForUser('user-1')).resolves.toBe(1);
    await expect(backend.resolve(second.token)).resolves.toBeUndefined();
    await expect(backend.resolve(other.token)).resolves.toMatchObject({ userId: 'user-2' });
  });

  it('ghi nhận xác thực lại cho đúng phiên đó', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const { backend } = build();
    const session = await backend.create('user-1');
    await expect(backend.markStepUp(session.token)).resolves.toBe(true);
    await expect(backend.resolve(session.token)).resolves.toMatchObject({ stepUpAt: new Date(clock).toISOString() });
    await expect(backend.markStepUp('khong-phai-token')).resolves.toBe(false);
  });

  it('phiên hết hạn tuyệt đối sau 8 giờ dù người dùng vẫn thao tác', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const { backend } = build();
    const session = await backend.create('user-1');
    for (let step = 0; step < 15; step += 1) {
      advanceMinutes(30);
      await backend.resolve(session.token);
    }
    advanceMinutes(31);
    await expect(backend.resolve(session.token)).resolves.toBeUndefined();
  });
});

describe('hạn nhàn rỗi của phiên trên bảng', () => {
  it('đăng xuất người bỏ máy quá 30 phút nhưng giữ người còn thao tác', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const backend = tableBackend(new FakeClient());
    const idle = await backend.create('user-idle');
    const busy = await backend.create('user-busy');

    for (let step = 0; step < 4; step += 1) {
      advanceMinutes(20);
      await backend.resolve(busy.token);
    }
    await expect(backend.resolve(idle.token)).resolves.toBeUndefined();
    await expect(backend.resolve(busy.token)).resolves.toMatchObject({ userId: 'user-busy' });
  });

  it('chỉ ghi lại lần hoạt động cuối khi đã quá ngưỡng, không ghi ở mỗi yêu cầu', async () => {
    clock = Date.parse('2026-11-21T08:00:00.000Z');
    const client = new FakeClient();
    const backend = tableBackend(client);
    const session = await backend.create('user-1');
    const touches = () => client.statements.filter(statement => /^UPDATE auth_sessions SET last_seen_at/i.test(statement)).length;

    await backend.resolve(session.token);
    advanceMinutes(1);
    await backend.resolve(session.token);
    expect(touches()).toBe(0);
    advanceMinutes(2);
    await backend.resolve(session.token);
    expect(touches()).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PostgresSecurityEventLedger,
  SecurityEventRecord,
  insertSecurityEvents,
} from '../../server/src/repositories/security-event-ledger';

interface QueryResult { rows: Array<Record<string, unknown>>; rowCount: number }

class FakeClient {
  public readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  public released = false;
  public constructor(private readonly rows: Array<Record<string, unknown>> = []) {}

  public async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalized, params });
    if (/FROM security_event_ledger/i.test(normalized)) {
      return { rows: this.rows, rowCount: this.rows.length };
    }
    return { rows: [], rowCount: 0 };
  }

  public release(): void { this.released = true; }
}

class FakePool {
  public constructor(public readonly client: FakeClient) {}
  public async connect(): Promise<FakeClient> { return this.client; }
}

const event = (overrides: Partial<SecurityEventRecord> = {}): SecurityEventRecord => ({
  id: 'sec-1',
  type: 'DATA_REPORT_EXPORTED',
  outcome: 'SUCCESS',
  detail: 'Xuất CSV 12 dòng.',
  occurredAt: '2026-09-03T10:00:00.000Z',
  ...overrides,
});

describe('security event ledger', () => {
  it('writes every event of a batch in a single parameterised INSERT', async () => {
    const client = new FakeClient();
    await insertSecurityEvents(client, [event({ id: 'sec-1' }), event({ id: 'sec-2' })]);

    const insert = client.queries.find(entry => /INSERT INTO security_event_ledger/i.test(entry.sql));
    expect(insert).toBeDefined();
    // Hai sự kiện, mười cột: một câu lệnh chứ không phải hai vòng tới database.
    expect(insert!.params).toHaveLength(20);
    expect(insert!.sql).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/i);
    expect(client.queries.filter(entry => /INSERT INTO/i.test(entry.sql))).toHaveLength(1);
  });

  it('sends nothing at all for an empty batch', async () => {
    const client = new FakeClient();
    await insertSecurityEvents(client, []);
    expect(client.queries).toHaveLength(0);
  });

  it('maps optional columns to absent fields rather than the string "null"', async () => {
    const client = new FakeClient([{
      event_id: 'sec-9',
      event_type: 'AUTH_LOGIN_FAILED',
      outcome: 'FAILURE',
      detail: 'Sai mật khẩu.',
      actor_user_id: null,
      actor_name: null,
      actor_role: null,
      subject: null,
      ip_address: null,
      occurred_at: '2026-09-03T09:00:00.000Z',
    }]);
    const ledger = new PostgresSecurityEventLedger({ pool: new FakePool(client) as never });

    const [loaded] = await ledger.loadRecent(100);
    expect(loaded).toEqual({
      id: 'sec-9',
      type: 'AUTH_LOGIN_FAILED',
      outcome: 'FAILURE',
      detail: 'Sai mật khẩu.',
      occurredAt: '2026-09-03T09:00:00.000Z',
    });
    expect('actorUserId' in loaded).toBe(false);
  });

  it('bounds the read with LIMIT and hands rows back oldest-first', async () => {
    const client = new FakeClient([]);
    const ledger = new PostgresSecurityEventLedger({ pool: new FakePool(client) as never });
    await ledger.loadRecent(5_000);

    const select = client.queries.find(entry => /FROM security_event_ledger/i.test(entry.sql));
    expect(select).toBeDefined();
    // LIMIT là toàn bộ lý do sổ này tồn tại: nạp cả lịch sử mỗi lần dựng state chính là cái đang
    // làm chậm workflow ledger, và nhật ký an ninh không được lặp lại sai lầm đó.
    expect(select!.sql).toMatch(/ORDER BY occurred_at DESC, event_id DESC LIMIT \$1/i);
    expect(select!.params).toEqual([5_000]);
    // Bọc ngoài sắp lại tăng dần để khớp thứ tự mà mảng trong bộ nhớ vẫn giữ.
    expect(select!.sql).toMatch(/AS recent ORDER BY occurred_at ASC, event_id ASC/i);
  });

  it('runs inside the backend transaction that RLS requires, and always releases the client', async () => {
    const client = new FakeClient([]);
    const ledger = new PostgresSecurityEventLedger({ pool: new FakePool(client) as never });
    await ledger.append([event()]);

    expect(client.queries[0].sql).toMatch(/app\.runtime_role = 'backend'/);
    expect(client.queries.at(-1)!.sql).toBe('COMMIT');
    expect(client.released).toBe(true);
  });
});

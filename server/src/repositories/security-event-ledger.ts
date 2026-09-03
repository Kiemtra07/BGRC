import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

/**
 * Nhật ký an ninh, lưu ngoài snapshot.
 *
 * Trước đây mảng này nằm chung một dòng JSONB với toàn bộ dữ liệu nghiệp vụ, nên ghi một dòng
 * nhật ký nghĩa là đọc, gộp và ghi đè lại cả snapshot. Hai endpoint GET — xem minh chứng và xuất
 * CSV — phải trả cái giá đó chỉ để để lại dấu vết, và đó là loại chi phí lớn dần theo lượng hồ sơ
 * chứ không theo số lần ghi nhật ký.
 *
 * Ở đây sổ là append-only và độc lập: một INSERT có kích thước cố định, không phụ thuộc hệ thống
 * đang có 9 hay 20.000 hồ sơ.
 */
export interface SecurityEventRecord {
  id: string;
  type: string;
  occurredAt: string;
  outcome: 'SUCCESS' | 'FAILURE';
  detail: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  subject?: string;
  ipAddress?: string;
}

/** Ghi nhiều sự kiện trong đúng transaction đang mở (dùng khi ghi kèm app state). */
export async function insertSecurityEvents(
  client: PostgresClientLike,
  events: readonly SecurityEventRecord[],
): Promise<void> {
  if (events.length === 0) return;

  const params: unknown[] = [];
  const values = events.map((event, index) => {
    const offset = index * 10;
    params.push(
      event.id,
      event.type,
      event.outcome,
      event.detail,
      event.actorUserId ?? null,
      event.actorName ?? null,
      event.actorRole ?? null,
      event.subject ?? null,
      event.ipAddress ?? null,
      event.occurredAt,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::timestamptz)`;
  });

  await client.query(
    `INSERT INTO security_event_ledger(
       event_id, event_type, outcome, detail, actor_user_id,
       actor_name, actor_role, subject, ip_address, occurred_at
     ) VALUES ${values.join(', ')}
     ON CONFLICT (event_id) DO NOTHING`,
    params,
  );
}

export interface SecurityEventLedgerOptions {
  pool: PostgresPoolLike;
}

export class PostgresSecurityEventLedger {
  private readonly pool: PostgresPoolLike;

  public constructor(options: SecurityEventLedgerOptions) {
    this.pool = options.pool;
  }

  /**
   * Nạp `limit` sự kiện gần nhất, trả về theo thứ tự thời gian tăng dần để khớp với thứ tự mà
   * mảng trong bộ nhớ vẫn giữ. Có LIMIT ngay từ đầu: màn hình Nhật ký chỉ hiển thị phần gần đây,
   * còn toàn bộ lịch sử thì đã nằm an toàn trong sổ và tra bằng SQL khi cần.
   */
  public async loadRecent(limit: number): Promise<SecurityEventRecord[]> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        `SELECT event_id, event_type, outcome, detail, actor_user_id,
                actor_name, actor_role, subject, ip_address, occurred_at
           FROM (
             SELECT * FROM security_event_ledger
              ORDER BY occurred_at DESC, event_id DESC
              LIMIT $1
           ) AS recent
          ORDER BY occurred_at ASC, event_id ASC`,
        [limit],
      );
      return result.rows.map(mapSecurityEvent);
    });
  }

  /** Ghi sổ mà không đụng tới snapshot. Đây là đường mà các endpoint chỉ đọc dùng. */
  public async append(events: readonly SecurityEventRecord[]): Promise<void> {
    if (events.length === 0) return;
    await withBackendTransaction(this.pool, client => insertSecurityEvents(client, events));
  }
}

function mapSecurityEvent(row: Record<string, unknown>): SecurityEventRecord {
  const optional = (value: unknown): string | undefined =>
    value === null || value === undefined ? undefined : String(value);
  return {
    id: String(row.event_id),
    type: String(row.event_type),
    outcome: String(row.outcome) === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    detail: String(row.detail ?? ''),
    ...(optional(row.actor_user_id) ? { actorUserId: String(row.actor_user_id) } : {}),
    ...(optional(row.actor_name) ? { actorName: String(row.actor_name) } : {}),
    ...(optional(row.actor_role) ? { actorRole: String(row.actor_role) } : {}),
    ...(optional(row.subject) ? { subject: String(row.subject) } : {}),
    ...(optional(row.ip_address) ? { ipAddress: String(row.ip_address) } : {}),
    occurredAt: toIsoString(row.occurred_at),
  };
}

function toIsoString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

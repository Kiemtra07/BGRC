import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';
import {
  IDEMPOTENCY_RETENTION_MS,
  pruneExpiredIdempotencyRecords,
} from '../state/idempotency-retention';

export interface IdempotencyRecord {
  requestHash: string;
  response: unknown;
  storedAt?: string;
}

export interface IdempotencyPutOptions {
  method: string;
  path: string;
  status: number;
}

/**
 * Bộ nhớ chống xử lý lặp.
 *
 * Trước đây nó là một trường trong snapshot JSON, và không bao giờ được dọn: mỗi lệnh ghi để lại
 * vĩnh viễn một bản sao **toàn bộ phản hồi**, ngay trong cái blob mà mọi request đều phải đọc và
 * ghi. Ở nhịp 500 người dùng, đó là nguồn làm phình snapshot nhanh nhất — nhanh hơn cả việc thêm
 * hồ sơ nghiệp vụ.
 *
 * Bảng `idempotency_keys` đã có sẵn từ migration 0003 kèm cột `expires_at` và chỉ mục cho nó,
 * nhưng ứng dụng chưa bao giờ dùng tới. Đây là chỗ đúng của dữ liệu này: nó có hạn sống, nó tra
 * theo khoá, và nó không liên quan gì tới phần state mà các request khác cần đọc.
 */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | undefined>;
  put(key: string, record: IdempotencyRecord, options: IdempotencyPutOptions): Promise<void>;
  /** Dọn bản ghi hết hạn. Trả về số dòng đã bỏ. */
  prune(): Promise<number>;
}

/**
 * Bản trong bộ nhớ cho chế độ local-json/memory. Vẫn là cùng một `Record` nằm trong snapshot, nên
 * hành vi ở môi trường phát triển không lệch khỏi trước; hạn sống do `pruneExpiredIdempotencyRecords`
 * áp, để hai chế độ có cùng ngữ nghĩa hết hạn.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly read: () => Record<string, IdempotencyRecord>) {}

  public async get(key: string): Promise<IdempotencyRecord | undefined> {
    const records = this.read();
    pruneExpiredIdempotencyRecords(records);
    return records[key];
  }

  public async put(key: string, record: IdempotencyRecord): Promise<void> {
    this.read()[key] = { ...record, storedAt: new Date().toISOString() };
  }

  public async prune(): Promise<number> {
    return pruneExpiredIdempotencyRecords(this.read());
  }
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly pool: PostgresPoolLike) {}

  public async get(key: string): Promise<IdempotencyRecord | undefined> {
    return withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      // Lọc theo `expires_at` ngay trong truy vấn: một bản ghi đã hết hạn thì không được phát lại,
      // kể cả khi lượt dọn định kỳ chưa kịp chạy. Hạn sống phải đúng theo đồng hồ, không theo lịch dọn.
      const result = await client.query(
        `SELECT request_hash, response_body, created_at
           FROM idempotency_keys
          WHERE key = $1 AND expires_at > NOW()`,
        [key],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        requestHash: String(row.request_hash),
        response: row.response_body,
        storedAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      };
    });
  }

  public async put(
    key: string,
    record: IdempotencyRecord,
    options: IdempotencyPutOptions,
  ): Promise<void> {
    await withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      await client.query(
        `INSERT INTO idempotency_keys(
           key, request_path, request_method, request_hash,
           response_status, response_body, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW() + ($7 || ' milliseconds')::interval)
         ON CONFLICT (key) DO UPDATE SET
           request_hash    = EXCLUDED.request_hash,
           response_status = EXCLUDED.response_status,
           response_body   = EXCLUDED.response_body,
           expires_at      = EXCLUDED.expires_at`,
        [
          key,
          options.path.slice(0, 255),
          options.method,
          record.requestHash,
          options.status,
          JSON.stringify(record.response ?? null),
          String(IDEMPOTENCY_RETENTION_MS),
        ],
      );
    });
  }

  public async prune(): Promise<number> {
    return withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      const result = await client.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
      return result.rowCount ?? 0;
    });
  }
}

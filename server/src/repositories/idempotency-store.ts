import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';
import {
  IDEMPOTENCY_RETENTION_MS,
  pruneExpiredIdempotencyRecords,
} from '../state/idempotency-retention';

export interface IdempotencyRecord {
  requestHash: string;
  response: unknown;
  /** 102 means a request has claimed the key but has not completed yet. */
  status?: number;
  storedAt?: string;
}

export interface IdempotencyPutOptions {
  method: string;
  path: string;
  status: number;
}

export interface IdempotencyClaimOptions {
  method: string;
  path: string;
}

export type IdempotencyClaim =
  | { state: 'CLAIMED' }
  | { state: 'IN_PROGRESS' }
  | { state: 'CONFLICT' }
  | { state: 'REPLAY'; record: IdempotencyRecord };

export const IDEMPOTENCY_PENDING_STATUS = 102;
export const IDEMPOTENCY_PENDING_RETENTION_MS = 2 * 60_000;

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
  claim(key: string, requestHash: string, options: IdempotencyClaimOptions): Promise<IdempotencyClaim>;
  put(key: string, record: IdempotencyRecord, options: IdempotencyPutOptions): Promise<void>;
  release(key: string, requestHash: string): Promise<void>;
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

  public async claim(key: string, requestHash: string, _options: IdempotencyClaimOptions): Promise<IdempotencyClaim> {
    const records = this.read();
    pruneExpiredIdempotencyRecords(records);
    const existing = records[key];
    if (!existing) {
      records[key] = {
        requestHash,
        response: undefined,
        status: IDEMPOTENCY_PENDING_STATUS,
        storedAt: new Date().toISOString(),
      };
      return { state: 'CLAIMED' };
    }
    if (existing.requestHash !== requestHash) return { state: 'CONFLICT' };
    if (existing.status === IDEMPOTENCY_PENDING_STATUS) {
      const pendingSince = existing.storedAt ? Date.parse(existing.storedAt) : Number.NaN;
      if (!Number.isFinite(pendingSince) || Date.now() - pendingSince < IDEMPOTENCY_PENDING_RETENTION_MS) {
        return { state: 'IN_PROGRESS' };
      }
      delete records[key];
      records[key] = {
        requestHash,
        response: undefined,
        status: IDEMPOTENCY_PENDING_STATUS,
        storedAt: new Date().toISOString(),
      };
      return { state: 'CLAIMED' };
    }
    return { state: 'REPLAY', record: structuredClone(existing) };
  }

  public async put(key: string, record: IdempotencyRecord): Promise<void> {
    const records = this.read();
    const existing = records[key];
    if (!existing || existing.requestHash !== record.requestHash || existing.status !== IDEMPOTENCY_PENDING_STATUS) {
      throw new Error('IDEMPOTENCY_CLAIM_LOST — không tìm thấy claim đang chờ để hoàn tất.');
    }
    records[key] = { ...record, status: undefined, storedAt: new Date().toISOString() };
  }

  public async release(key: string, requestHash: string): Promise<void> {
    const records = this.read();
    if (records[key]?.requestHash === requestHash && records[key]?.status === IDEMPOTENCY_PENDING_STATUS) {
      delete records[key];
    }
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
        `SELECT request_hash, response_status, response_body, created_at
           FROM idempotency_keys
          WHERE key = $1 AND expires_at > NOW()`,
        [key],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        requestHash: String(row.request_hash),
        response: row.response_body,
        status: Number(row.response_status),
        storedAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      };
    });
  }

  public async claim(key: string, requestHash: string, options: IdempotencyClaimOptions): Promise<IdempotencyClaim> {
    return withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      // Serialize claims for the same key even when two serverless instances race before INSERT.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      await client.query('DELETE FROM idempotency_keys WHERE key = $1 AND expires_at <= NOW()', [key]);
      const result = await client.query(
        `SELECT request_hash, response_status, response_body, created_at
           FROM idempotency_keys
          WHERE key = $1 AND expires_at > NOW()
          FOR UPDATE`,
        [key],
      );
      const row = result.rows[0];
      if (row) {
        if (String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
        if (Number(row.response_status) === IDEMPOTENCY_PENDING_STATUS) return { state: 'IN_PROGRESS' };
        return { state: 'REPLAY', record: {
          requestHash: String(row.request_hash),
          response: row.response_body,
          status: Number(row.response_status),
          storedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        } };
      }
      await client.query(
        `INSERT INTO idempotency_keys(
           key, request_path, request_method, request_hash,
           response_status, response_body, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW() + ($7 || ' milliseconds')::interval)`,
        [key, options.path.slice(0, 255), options.method, requestHash, IDEMPOTENCY_PENDING_STATUS, JSON.stringify(null), String(IDEMPOTENCY_PENDING_RETENTION_MS)],
      );
      return { state: 'CLAIMED' };
    });
  }

  public async put(
    key: string,
    record: IdempotencyRecord,
    options: IdempotencyPutOptions,
  ): Promise<void> {
    await withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      const result = await client.query(
        `UPDATE idempotency_keys
            SET response_status = $3,
                response_body = $4::jsonb,
                expires_at = NOW() + ($5 || ' milliseconds')::interval
          WHERE key = $1 AND request_hash = $2 AND response_status = $6`,
        [
          key,
          record.requestHash,
          options.status,
          JSON.stringify(record.response ?? null),
          String(IDEMPOTENCY_RETENTION_MS),
          IDEMPOTENCY_PENDING_STATUS,
        ],
      );
      if (result.rowCount !== 1) throw new Error('IDEMPOTENCY_CLAIM_LOST — không tìm thấy claim đang chờ để hoàn tất.');
    });
  }

  public async release(key: string, requestHash: string): Promise<void> {
    await withBackendTransaction(this.pool, client => client.query(
      'DELETE FROM idempotency_keys WHERE key = $1 AND request_hash = $2 AND response_status = $3',
      [key, requestHash, IDEMPOTENCY_PENDING_STATUS],
    ).then(() => undefined));
  }

  public async prune(): Promise<number> {
    return withBackendTransaction(this.pool, async (client: PostgresClientLike) => {
      const result = await client.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
      return result.rowCount ?? 0;
    });
  }
}

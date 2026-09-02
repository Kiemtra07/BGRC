import type { WorkflowEvent } from '../../../shared/contracts';
import { withBackendTransaction } from './postgres-transaction';
import { insertWorkflowEvents } from './workflow-event-ledger';

export interface PostgresQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

export interface PostgresClientLike {
  query(sql: string, params?: unknown[]): Promise<PostgresQueryResult>;
  release(): void;
}

export interface PostgresPoolLike {
  connect(): Promise<PostgresClientLike>;
}

export interface PostgresStateStatus {
  mode: 'postgres';
  durable: boolean;
  ready: boolean;
  warning?: string;
}

export interface PostgresStateRepositoryOptions {
  pool: PostgresPoolLike;
  snapshotId?: string;
}

type StateTransform<T> = (latest: T) => T | void | Promise<T | void>;

export class PostgresStateRepository<T> {
  private readonly pool: PostgresPoolLike;
  private readonly snapshotId: string;
  /**
   * Version của snapshot mà tiến trình này đang giữ trong bộ nhớ; `undefined` khi chưa đọc lần nào.
   * Giữ nguyên dạng chuỗi vì cột là `BIGINT` và `pg` trả bigint về dưới dạng chuỗi để không mất
   * độ chính xác — so sánh chuỗi với chuỗi thì không có chỗ nào để sai lệch len vào.
   */
  private observedVersion: string | undefined;

  public constructor(options: PostgresStateRepositoryOptions) {
    this.pool = options.pool;
    this.snapshotId = options.snapshotId ?? 'primary';
  }

  public async getStatus(): Promise<PostgresStateStatus> {
    let client: PostgresClientLike | undefined;
    try {
      client = await this.pool.connect();
      await client.query('SELECT 1');
      return { mode: 'postgres', durable: true, ready: true };
    } catch (error) {
      return {
        mode: 'postgres',
        durable: false,
        ready: false,
        warning: `POSTGRES_UNAVAILABLE — ${error instanceof Error ? error.message : 'Không thể kết nối database.'}`,
      };
    } finally {
      client?.release();
    }
  }

  public async load(fallback: T): Promise<T> {
    return this.withTransaction(async client => {
      const row = await this.loadRow(client);
      this.observedVersion = readVersion(row);
      return structuredClone(row?.payload as T | undefined ?? fallback);
    });
  }

  /**
   * Đọc snapshot chỉ khi nó đã đổi kể từ lần đọc gần nhất của tiến trình này; trả `undefined` khi
   * không đổi, để phía gọi bỏ qua luôn việc dựng lại state trong bộ nhớ.
   *
   * Phép so `version` nằm ngay trong database, nên khi state không đổi thì cột `payload` không hề
   * được trả về: không tốn băng thông, không `JSON.parse`, không `structuredClone`, và phía gọi
   * cũng không phải chiếu lại toàn bộ mảng. Đó là gần như toàn bộ chi phí của một request GET.
   *
   * Vẫn phải nằm trong transaction vì RLS của `app_state_snapshots` đòi
   * `current_setting('app.runtime_role') = 'backend'`, mà `set_config(..., true)` chỉ có hiệu lực
   * trong transaction hiện tại. Chạy ngoài transaction thì policy lọc sạch dòng và câu lệnh trả về
   * rỗng — không phải lỗi, mà là "chưa có snapshot", đúng kiểu hỏng dữ liệu âm thầm.
   *
   * Vẫn đúng tuyệt đối: `version` chỉ tăng khi `saveRow` ghi, nên "không đổi" nghĩa là state trong
   * bộ nhớ bằng đúng state dưới database, chứ không phải chấp nhận đọc dữ liệu cũ.
   */
  public async loadIfChanged(): Promise<T | undefined> {
    return this.withTransaction(async client => {
      const result = await client.query(
        `SELECT version, CASE WHEN version = $2::bigint THEN NULL ELSE payload END AS payload
         FROM app_state_snapshots WHERE id = $1`,
        [this.snapshotId, this.observedVersion ?? '-1'],
      );
      const row = result.rows[0];
      // Chưa có snapshot: giữ nguyên state hiện có — phía gọi đã có mặc định từ lúc khởi động.
      if (!row) return undefined;
      const version = readVersion(row);
      if (version !== undefined && version === this.observedVersion) return undefined;
      this.observedVersion = version;
      return structuredClone(row.payload as T);
    });
  }

  public async hasSnapshot(): Promise<boolean> {
    return this.withTransaction(async client => (await this.loadRow(client)) !== undefined);
  }

  public async save(data: T): Promise<void> {
    await this.saveWithWorkflowEvents(data, []);
  }

  public async update(fallback: T, transform: StateTransform<T>): Promise<T> {
    return this.updateWithWorkflowEvents(fallback, transform, []);
  }

  /**
   * Ghi snapshot và các sự kiện workflow mới trong cùng một transaction.
   * Snapshot không chứa mảng lịch sử nữa; ledger append-only là nguồn đọc lịch sử.
   */
  public async saveWithWorkflowEvents(data: T, events: readonly WorkflowEvent[]): Promise<void> {
    await this.withTransaction(async client => {
      await this.acquireWriteLock(client);
      await this.saveRow(client, data);
      await insertWorkflowEvents(client, events);
    });
  }

  public async updateWithWorkflowEvents(
    fallback: T,
    transform: StateTransform<T>,
    events: readonly WorkflowEvent[],
  ): Promise<T> {
    return this.withTransaction(async client => {
      await this.acquireWriteLock(client);
      const row = await this.loadRow(client);
      const latest = structuredClone(row?.payload as T | undefined ?? fallback);
      const transformed = await transform(latest);
      const next = transformed ?? latest;
      await this.saveRow(client, next);
      await insertWorkflowEvents(client, events);
      return structuredClone(next);
    });
  }

  private async withTransaction<TResult>(operation: (client: PostgresClientLike) => Promise<TResult>): Promise<TResult> {
    // BEGIN + SET LOCAL được gửi cùng một simple query hằng số; context RLS vẫn sống đến COMMIT.
    const previousObservedVersion = this.observedVersion;
    try {
      return await withBackendTransaction(this.pool, operation);
    } catch (error) {
      // saveRow sees RETURNING before a later ledger insert/COMMIT can fail. Do not let a rolled-back
      // version make the next read-through request incorrectly believe its snapshot is current.
      this.observedVersion = previousObservedVersion;
      throw error;
    }
  }

  private async acquireWriteLock(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('audit_bgs_app_state'))");
  }

  private async loadRow(client: PostgresClientLike): Promise<Record<string, unknown> | undefined> {
    const result = await client.query(
      'SELECT payload, version FROM app_state_snapshots WHERE id = $1',
      [this.snapshotId],
    );
    return result.rows[0];
  }

  private async saveRow(client: PostgresClientLike, data: T): Promise<void> {
    const result = await client.query(
      `INSERT INTO app_state_snapshots(id, payload, version, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload,
         version = app_state_snapshots.version + 1,
         updated_at = NOW()
       RETURNING version`,
      [this.snapshotId, data],
    );
    // Sau khi ghi, state trong bộ nhớ chính là state vừa ghi. Nhớ lại version mới để request GET
    // kế tiếp trên cùng instance không phải tải lại nguyên payload chỉ vì chính mình vừa ghi.
    this.observedVersion = readVersion(result.rows[0]);
  }
}

/**
 * `pg` trả `BIGINT` về dạng chuỗi; chuẩn hoá mọi kiểu khác về chuỗi để phép so sánh version luôn
 * cùng kiểu. Trả `undefined` khi không có dòng nào, để phân biệt "chưa có snapshot" với version 0.
 */
function readVersion(row: Record<string, unknown> | undefined): string | undefined {
  const version = row?.version;
  return version === undefined || version === null ? undefined : String(version);
}

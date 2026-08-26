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
      return structuredClone(row?.payload as T | undefined ?? fallback);
    });
  }

  public async hasSnapshot(): Promise<boolean> {
    return this.withTransaction(async client => (await this.loadRow(client)) !== undefined);
  }

  public async save(data: T): Promise<void> {
    await this.withTransaction(async client => {
      await this.acquireWriteLock(client);
      await this.saveRow(client, data);
    });
  }

  public async update(fallback: T, transform: StateTransform<T>): Promise<T> {
    return this.withTransaction(async client => {
      await this.acquireWriteLock(client);
      const row = await this.loadRow(client);
      const latest = structuredClone(row?.payload as T | undefined ?? fallback);
      const transformed = await transform(latest);
      const next = transformed ?? latest;
      await this.saveRow(client, next);
      return structuredClone(next);
    });
  }

  private async withTransaction<TResult>(operation: (client: PostgresClientLike) => Promise<TResult>): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.runtime_role', 'backend', true)");
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the operation error; a broken connection cannot reliably roll back explicitly.
      }
      throw error;
    } finally {
      client.release();
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
    await client.query(
      `INSERT INTO app_state_snapshots(id, payload, version, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload,
         version = app_state_snapshots.version + 1,
         updated_at = NOW()
       RETURNING version`,
      [this.snapshotId, data],
    );
  }
}

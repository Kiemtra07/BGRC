import { describe, expect, it } from 'vitest';
import { PostgresStateRepository } from '../../server/src/repositories/postgres-state';
import { createStateRepository } from '../../server/src/repositories/state-repository';

interface TestState {
  label: string;
  values: number[];
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

class FakePostgresClient {
  public readonly queries: string[] = [];
  public released = false;
  private transactionState: TestState | undefined;
  private transactionVersion = 0;

  public constructor(
    public state?: TestState,
    public version = 0,
  ) {}

  public async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push(normalized);
    if (normalized === 'BEGIN') {
      this.transactionState = structuredClone(this.state);
      this.transactionVersion = this.version;
    } else if (normalized === 'ROLLBACK') {
      this.state = structuredClone(this.transactionState);
      this.version = this.transactionVersion;
    } else if (/SELECT payload, version FROM app_state_snapshots/i.test(normalized)) {
      return this.state
        ? { rows: [{ payload: structuredClone(this.state), version: this.version }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    } else if (/INSERT INTO app_state_snapshots/i.test(normalized)) {
      this.state = structuredClone(params[1] as TestState);
      this.version += 1;
      return { rows: [{ version: this.version }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  public release(): void {
    this.released = true;
  }
}

class FakePostgresPool {
  public constructor(public readonly client: FakePostgresClient) {}

  public async connect(): Promise<FakePostgresClient> {
    return this.client;
  }
}

describe('PostgresStateRepository', () => {
  it('reports durable only after a live PostgreSQL probe succeeds', async () => {
    const client = new FakePostgresClient();
    const repository = new PostgresStateRepository<TestState>({ pool: new FakePostgresPool(client) });

    await expect(repository.getStatus()).resolves.toEqual({ mode: 'postgres', durable: true, ready: true });
    expect(client.queries).toContain('SELECT 1');
    expect(client.released).toBe(true);
  });

  it('loads a cloned fallback when PostgreSQL has not been backfilled yet', async () => {
    const fallback = { label: 'Khởi tạo', values: [1] };
    const client = new FakePostgresClient();
    const repository = new PostgresStateRepository<TestState>({ pool: new FakePostgresPool(client) });

    const loaded = await repository.load(fallback);
    loaded.values.push(2);

    expect(fallback.values).toEqual([1]);
    expect(client.queries).toContain('COMMIT');
  });

  it('exposes whether the one-time backfill target already exists', async () => {
    const client = new FakePostgresClient();
    const repository = new PostgresStateRepository<TestState>({ pool: new FakePostgresPool(client) });

    await expect(repository.hasSnapshot()).resolves.toBe(false);
    await repository.save({ label: 'Đã backfill', values: [1] });
    await expect(repository.hasSnapshot()).resolves.toBe(true);
  });

  it('serializes updates and persists the latest database snapshot in one transaction', async () => {
    const client = new FakePostgresClient({ label: 'Bản mới nhất', values: [1, 2] }, 4);
    const repository = new PostgresStateRepository<TestState>({ pool: new FakePostgresPool(client) });

    const saved = await repository.update({ label: 'Bản cũ', values: [] }, latest => {
      latest.values.push(3);
    });

    expect(saved).toEqual({ label: 'Bản mới nhất', values: [1, 2, 3] });
    expect(client.state).toEqual(saved);
    expect(client.queries.some(sql => /pg_advisory_xact_lock/i.test(sql))).toBe(true);
    expect(client.queries.at(-1)).toBe('COMMIT');
  });

  it('rolls back and keeps the committed snapshot when a transform fails', async () => {
    const committed = { label: 'Đã bền vững', values: [7] };
    const client = new FakePostgresClient(committed, 2);
    const repository = new PostgresStateRepository<TestState>({ pool: new FakePostgresPool(client) });

    await expect(repository.update(committed, latest => {
      latest.values.push(8);
      throw new Error('transform failed');
    })).rejects.toThrow('transform failed');

    expect(client.state).toEqual(committed);
    expect(client.queries.at(-1)).toBe('ROLLBACK');
  });

  it('fails readiness truthfully when PostgreSQL cannot be reached', async () => {
    const repository = new PostgresStateRepository<TestState>({
      pool: {
        connect: async () => {
          throw new Error('connection refused');
        },
      },
    });

    await expect(repository.getStatus()).resolves.toMatchObject({
      mode: 'postgres',
      durable: false,
      ready: false,
      warning: expect.stringMatching(/connection refused/i),
    });
  });

  it('selects Postgres explicitly while retaining local-json for development', () => {
    const pool = new FakePostgresPool(new FakePostgresClient());
    const postgresRepository = createStateRepository<TestState>({
      dataStoreMode: 'postgres',
      filePath: 'unused-in-postgres.json',
      postgresPool: pool,
    });
    const localRepository = createStateRepository<TestState>({
      dataStoreMode: 'local-json',
      filePath: 'data/local-state.json',
      persistenceEnabled: false,
    });

    expect(postgresRepository).toBeInstanceOf(PostgresStateRepository);
    expect(localRepository.getStatus()).toEqual({ mode: 'local-json', durable: true });
    expect(() => createStateRepository<TestState>({
      dataStoreMode: 'postgres-typo',
      filePath: 'unused.json',
    })).toThrow(/DATA_STORE_MODE.*postgres.*local-json.*memory/i);
  });
});

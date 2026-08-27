import { describe, expect, it } from 'vitest';
import { PostgresStateRepository } from '../../server/src/repositories/postgres-state';
import { createLocalStateRepository } from '../../server/src/repositories/local-state';
import { DurableStateCoordinator } from '../../server/src/state/durable-state-coordinator';
import {
  RuntimeRequestLock,
  shouldHydrateRuntimeStatePerRequest,
} from '../../server/src/state/runtime-request-lock';

/**
 * Hồi quy cho lỗi ĐỌC DỮ LIỆU STALE trên serverless.
 *
 * Trước đây mỗi instance chỉ hydrate state MỘT LẦN lúc cold start rồi các handler GET đọc thẳng
 * biến ở phạm vi module. Trên Vercel nhiều instance: instance A ghi -> chỉ DB + bộ nhớ A đổi;
 * instance B vẫn giữ snapshot cold-start -> B trả dữ liệu CŨ.
 *
 * Bản vá: hook onRequest re-hydrate read-through từ Postgres TRƯỚC handler khi
 * DATA_STORE_MODE=postgres (trừ endpoint liveness). Với local-json/memory giữ nguyên hành vi cũ.
 *
 * Test này mô phỏng hai instance dùng chung một kho lưu trữ và xác nhận:
 *  - postgres: instance 2 sau khi qua hook đọc thấy đúng dữ liệu instance 1 vừa ghi;
 *  - postgres + endpoint liveness: KHÔNG re-hydrate (giữ nhẹ cho health/ready);
 *  - local-json: hook KHÔNG chạy -> instance 2 vẫn giữ snapshot cold-start (hành vi cũ không đổi).
 */

interface DemoState {
  findings: Array<{ id: string; title: string }>;
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

/** Một hàng app_state_snapshots dùng chung cho mọi client "kết nối" tới cùng Postgres. */
class SharedPostgresDatabase {
  public payload: DemoState | undefined;
  public version = 0;
}

class SharedPostgresClient {
  private txnPayload: DemoState | undefined;
  private txnVersion = 0;

  public constructor(private readonly db: SharedPostgresDatabase) {}

  public async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'BEGIN') {
      this.txnPayload = structuredClone(this.db.payload);
      this.txnVersion = this.db.version;
    } else if (normalized === 'ROLLBACK') {
      this.db.payload = structuredClone(this.txnPayload);
      this.db.version = this.txnVersion;
    } else if (/SELECT payload, version FROM app_state_snapshots/i.test(normalized)) {
      return this.db.payload !== undefined
        ? { rows: [{ payload: structuredClone(this.db.payload), version: this.db.version }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    } else if (/INSERT INTO app_state_snapshots/i.test(normalized)) {
      this.db.payload = structuredClone(params[1] as DemoState);
      this.db.version += 1;
      return { rows: [{ version: this.db.version }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  public release(): void {}
}

class SharedPostgresPool {
  public constructor(private readonly db: SharedPostgresDatabase) {}

  public async connect(): Promise<SharedPostgresClient> {
    return new SharedPostgresClient(this.db);
  }
}

interface RuntimeRepository {
  load(fallback: DemoState): DemoState | Promise<DemoState>;
  update(fallback: DemoState, transform: (latest: DemoState) => DemoState | void): DemoState | Promise<DemoState>;
}

/**
 * Một "serverless instance": giữ state ở phạm vi module (biến `moduleState`), hydrate một lần lúc
 * cold start, và chạy đúng logic hook onRequest của app.ts trước mỗi request.
 */
class SimulatedInstance {
  private moduleState: DemoState;
  private readonly durableState: DurableStateCoordinator<DemoState>;
  private readonly lock = new RuntimeRequestLock();

  public constructor(
    private readonly repository: RuntimeRepository,
    coldStart: DemoState,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.moduleState = structuredClone(coldStart);
    this.durableState = new DurableStateCoordinator<DemoState>(this.moduleState);
  }

  /** Bản sao logic hook `app.addHook('onRequest', ...)` trong server/src/app.ts. */
  private async runRequestHook(requestUrl: string): Promise<void> {
    if (!shouldHydrateRuntimeStatePerRequest(this.env, requestUrl)) return;
    const release = await this.lock.acquire();
    try {
      const latest = await this.repository.load(structuredClone(this.moduleState));
      this.moduleState = latest;
      this.durableState.hydrate(latest);
    } finally {
      release();
    }
  }

  /** Handler GET: đọc thẳng biến module, y như các endpoint hiện tại. */
  public async handleGet(requestUrl: string): Promise<DemoState> {
    await this.runRequestHook(requestUrl);
    return this.moduleState;
  }

  /** Ghi qua kho lưu trữ (write đã tự re-read latest trong transaction). */
  public async appendFinding(finding: { id: string; title: string }): Promise<void> {
    const saved = await this.repository.update(structuredClone(this.moduleState), latest => {
      latest.findings.push(finding);
    });
    this.moduleState = saved;
    this.durableState.hydrate(saved);
  }
}

describe('serverless read-through re-hydrate', () => {
  const coldStart: DemoState = { findings: [{ id: 'f-seed', title: 'Seed' }] };

  it('postgres: instance 2 đọc thấy dữ liệu instance 1 vừa ghi sau khi qua hook', async () => {
    const db = new SharedPostgresDatabase();
    const pool = new SharedPostgresPool(db);
    const repoA = new PostgresStateRepository<DemoState>({ pool });
    const repoB = new PostgresStateRepository<DemoState>({ pool });
    const env = { DATA_STORE_MODE: 'postgres' } as NodeJS.ProcessEnv;

    const instanceA = new SimulatedInstance(repoA, coldStart, env);
    const instanceB = new SimulatedInstance(repoB, coldStart, env);

    // Instance A ghi một finding mới.
    await instanceA.appendFinding({ id: 'f-new', title: 'Sai sót mới' });

    // Instance B vẫn ở snapshot cold-start cho tới khi hook chạy; GET nghiệp vụ kích hoạt re-hydrate.
    const seen = await instanceB.handleGet('/api/v1/findings');
    expect(seen.findings.map(f => f.id)).toEqual(['f-seed', 'f-new']);
  });

  it('postgres: endpoint liveness KHÔNG re-hydrate', async () => {
    const db = new SharedPostgresDatabase();
    const pool = new SharedPostgresPool(db);
    const repoA = new PostgresStateRepository<DemoState>({ pool });
    const repoB = new PostgresStateRepository<DemoState>({ pool });
    const env = { DATA_STORE_MODE: 'postgres' } as NodeJS.ProcessEnv;

    const instanceA = new SimulatedInstance(repoA, coldStart, env);
    const instanceB = new SimulatedInstance(repoB, coldStart, env);

    await instanceA.appendFinding({ id: 'f-new', title: 'Sai sót mới' });

    const health = await instanceB.handleGet('/api/v1/health');
    expect(health.findings.map(f => f.id)).toEqual(['f-seed']);
    const ready = await instanceB.handleGet('/api/v1/ready?probe=1');
    expect(ready.findings.map(f => f.id)).toEqual(['f-seed']);
  });

  it('local-json: hook KHÔNG chạy nên instance 2 giữ nguyên snapshot cold-start (hành vi cũ)', async () => {
    const env = { DATA_STORE_MODE: 'local-json' } as NodeJS.ProcessEnv;
    expect(shouldHydrateRuntimeStatePerRequest(env, '/api/v1/findings')).toBe(false);

    // Kho local-json dùng chung (persistenceEnabled:false -> memory, mỗi repo cô lập giống mỗi
    // instance có bộ nhớ riêng). Điểm mấu chốt: hook bị tắt nên GET không bao giờ re-hydrate.
    const repoA = createLocalStateRepository<DemoState>({
      filePath: 'unused-a.json', dataStoreMode: 'local-json', persistenceEnabled: false,
    });
    const repoB = createLocalStateRepository<DemoState>({
      filePath: 'unused-b.json', dataStoreMode: 'local-json', persistenceEnabled: false,
    });

    const instanceA = new SimulatedInstance(repoA, coldStart, env);
    const instanceB = new SimulatedInstance(repoB, coldStart, env);

    await instanceA.appendFinding({ id: 'f-new', title: 'Sai sót mới' });

    const seen = await instanceB.handleGet('/api/v1/findings');
    expect(seen.findings.map(f => f.id)).toEqual(['f-seed']);
  });
});

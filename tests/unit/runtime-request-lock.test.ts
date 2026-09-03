import fs from 'node:fs';
import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RuntimeStateGate,
  requestCarriesCredentials,
  shouldHydrateRuntimeStatePerRequest,
} from '../../server/src/state/runtime-request-lock';

const tick = (ms: number) => new Promise(resolve => { setTimeout(resolve, ms); });

describe('shouldHydrateRuntimeStatePerRequest', () => {
  it('hydrates only business requests that use the Postgres runtime', () => {
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/findings')).toBe(true);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'local-json' }, '/api/v1/findings')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/health')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/ready')).toBe(false);
  });

  /**
   * Trên màn hình đăng nhập, `GET /api/v1/me` từng tốn trọn một vòng Postgres chỉ để `preHandler`
   * trả về "chưa xác thực" — mỗi lần mở ứng dụng, cho mọi khách chưa đăng nhập.
   */
  it('skips the snapshot read for a request that cannot possibly authenticate', () => {
    const env = { DATA_STORE_MODE: 'postgres' } as NodeJS.ProcessEnv;
    expect(shouldHydrateRuntimeStatePerRequest(env, '/api/v1/me', 'GET', {
      requiresAuth: true, carriesCredentials: false,
    })).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(env, '/api/v1/me', 'GET', {
      requiresAuth: true, carriesCredentials: true,
    })).toBe(true);
    // Đường dẫn công khai vẫn phải dựng state: callback Google OIDC là một GET, và nó cần thấy
    // danh sách người dùng mới nhất để tra ra chủ nhân của email vừa đăng nhập.
    expect(shouldHydrateRuntimeStatePerRequest(env, '/api/v1/auth/google/callback', 'GET', {
      requiresAuth: false, carriesCredentials: false,
    })).toBe(true);
  });

  it('keeps a cold-start state merge conflict from terminating the API module', () => {
    const appSource = fs.readFileSync('server/src/app.ts', 'utf8');
    expect(appSource).toContain('async function persistStartupCompatibilityState()');
    expect(appSource).toContain('if (!(error instanceof StateMergeConflictError)) throw error;');
    expect(appSource).toContain('].some(Boolean)) await persistStartupCompatibilityState();');
  });
});

describe('requestCarriesCredentials', () => {
  const local = { DATA_STORE_MODE: 'postgres' } as NodeJS.ProcessEnv;

  it('reads the session cookie the way app.ts parses it', () => {
    expect(requestCarriesCredentials(local, { cookie: 'audit_bgs_session=abc123' })).toBe(true);
    expect(requestCarriesCredentials(local, { cookie: 'other=1; audit_bgs_session=abc123; more=2' })).toBe(true);
    expect(requestCarriesCredentials(local, {})).toBe(false);
    expect(requestCarriesCredentials(local, { cookie: 'other=1' })).toBe(false);
    // Cookie rỗng cũng bằng không có: nó không tra ra phiên nào.
    expect(requestCarriesCredentials(local, { cookie: 'audit_bgs_session=' })).toBe(false);
    // Không được nhầm một cookie có tên chứa tên phiên là chính nó.
    expect(requestCarriesCredentials(local, { cookie: 'x_audit_bgs_session=abc' })).toBe(false);
  });

  it('accepts the Supabase access cookie or a bearer token in supabase mode', () => {
    const supabase = { DATA_STORE_MODE: 'postgres', AUTH_MODE: 'supabase' } as NodeJS.ProcessEnv;
    expect(requestCarriesCredentials(supabase, { cookie: 'audit_bgs_supabase_access=tok' })).toBe(true);
    expect(requestCarriesCredentials(supabase, { authorization: 'Bearer tok' })).toBe(true);
    // Cookie phiên cục bộ không phải chứng chỉ hợp lệ ở chế độ Supabase.
    expect(requestCarriesCredentials(supabase, { cookie: 'audit_bgs_session=abc' })).toBe(false);
  });

  it('keeps the test-only x-user-id header working', () => {
    const testEnv = { DATA_STORE_MODE: 'postgres', NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    expect(requestCarriesCredentials(testEnv, { 'x-user-id': 'user-admin' })).toBe(true);
    expect(requestCarriesCredentials({ ...testEnv, ALLOW_TEST_USER_HEADER: 'false' }, { 'x-user-id': 'user-admin' })).toBe(false);
    // Ngoài môi trường test thì header này không là gì cả.
    expect(requestCarriesCredentials(local, { 'x-user-id': 'user-admin' })).toBe(false);
  });
});

describe('RuntimeStateGate', () => {
  /**
   * Hồi quy cho chi phí của bản vá read-through: trước đây cổng này là một khoá độc quyền giữ suốt
   * vòng đời từng request, nên mọi GET trên cùng instance xếp hàng một và mỗi cái tự đi một vòng
   * Postgres. Nhóm request đến cùng lúc phải chung đúng một lần đọc, rồi chạy song song.
   */
  it('coalesces a burst into one hydration and then runs the burst concurrently', async () => {
    let hydrations = 0;
    let peakConcurrency = 0;
    const gate = new RuntimeStateGate({
      hydrate: async () => { hydrations += 1; await tick(10); },
    });

    let running = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      const release = await gate.enter();
      running += 1;
      peakConcurrency = Math.max(peakConcurrency, running);
      await tick(15);
      running -= 1;
      release();
    }));

    expect(hydrations).toBe(1);
    expect(peakConcurrency).toBe(6);
    expect(gate.activeRequests).toBe(0);
  });

  /**
   * Lý do duy nhất khiến cổng phải tồn tại: `hydrate` thay nguyên các mảng state ở phạm vi module,
   * nên nó không được chạy khi còn handler nằm giữa hai `await`.
   */
  it('never hydrates while a request is still running', async () => {
    const events: string[] = [];
    const gate = new RuntimeStateGate({
      hydrate: async () => { events.push('hydrate'); },
    });

    const first = await gate.enter();
    events.push('request-1-start');

    const second = gate.enter().then(release => { events.push('request-2-start'); return release; });
    await tick(20);
    // Lần dựng thứ hai vẫn phải đứng chờ: request 1 chưa rút.
    expect(events).toEqual(['hydrate', 'request-1-start']);

    events.push('request-1-end');
    first();
    (await second)();

    expect(events).toEqual([
      'hydrate', 'request-1-start', 'request-1-end', 'hydrate', 'request-2-start',
    ]);
  });

  /**
   * Lớp bảo hiểm cuối cùng: một suất bị rò — vì bất kỳ lý do nào chưa lường tới — chỉ được làm chậm
   * một nhịp, chứ không khoá chết cả instance.
   */
  it('frees a leaked slot after the watchdog timeout instead of wedging the gate', async () => {
    const gate = new RuntimeStateGate({ hydrate: async () => undefined, timeoutMs: 40 });
    await gate.enter(); // suất bị bỏ rơi: không ai gọi release

    const started = Date.now();
    const release = await gate.enter();
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
    expect(gate.activeRequests).toBe(1);
    release();
  });

  it('fails the waiting requests instead of hanging when hydration stalls', async () => {
    const gate = new RuntimeStateGate({
      hydrate: () => new Promise<void>(() => undefined),
      timeoutMs: 40,
    });

    await expect(gate.enter()).rejects.toThrow('RUNTIME_STATE_HYDRATION_TIMEOUT');
    // Lần dựng hỏng không được để lại rác: request kế tiếp phải thử lại từ đầu.
    const healthy = new RuntimeStateGate({ hydrate: async () => undefined });
    (await healthy.enter())();
    expect(healthy.activeRequests).toBe(0);
  });

  it('surfaces a hydration failure to every request waiting on it', async () => {
    let attempts = 0;
    const gate = new RuntimeStateGate({
      hydrate: async () => { attempts += 1; await tick(5); throw new Error('SNAPSHOT_UNAVAILABLE'); },
    });

    const results = await Promise.allSettled([gate.enter(), gate.enter(), gate.enter()]);
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(attempts).toBe(1);

    // Cổng vẫn dùng được sau đó: lần sau mở một lần dựng mới chứ không dính lỗi cũ.
    await expect(gate.enter()).rejects.toThrow('SNAPSHOT_UNAVAILABLE');
    expect(attempts).toBe(2);
  });
});

/**
 * Hồi quy cho lỗi TREO VĨNH VIỄN MỌI REQUEST GET sau một kết nối bị ngắt giữa chừng.
 *
 * Fastify không chạy `onResponse` lẫn `onError` khi client bỏ đi trước lúc phản hồi được gửi —
 * chuyện xảy ra liên tục trên di động: chuyển sóng, khoá màn hình, kéo làm mới, bấm sang màn khác.
 * Khi đó suất ở cổng không bao giờ được nhả; lần dựng state kế tiếp chờ mãi không rút hết được, nên
 * *mọi* GET sau đó trên cùng instance chờ vô hạn. Triệu chứng người dùng nhìn thấy: nút "Tìm kiếm"
 * quay mãi không ra kết quả, và màn hình đăng nhập đứng ở "Đang đăng nhập..." vì `/api/v1/me` không
 * bao giờ trả lời.
 *
 * Bản vá gắn thêm người nghe `close` trên socket — tín hiệu duy nhất còn phát ra khi request bị
 * huỷ. Test dựng đúng cách mắc hook của `app.ts` trên một máy chủ HTTP thật, vì `app.inject` không
 * đi qua socket nên không tái hiện được tình huống này.
 */
describe('runtime state hydration hooks survive an aborted connection', () => {
  let server: FastifyInstance | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const buildServer = (options: { releaseOnClose: boolean }) => {
    const gate = new RuntimeStateGate({ hydrate: async () => undefined, timeoutMs: 60_000 });
    const releases = new WeakMap<FastifyRequest, () => void>();
    const release = (request: FastifyRequest) => {
      const pending = releases.get(request);
      releases.delete(request);
      pending?.();
    };

    const instance = fastify();
    instance.addHook('onRequest', async (request) => {
      const slot = await gate.enter();
      releases.set(request, slot);
      if (options.releaseOnClose) {
        request.raw.on('close', () => release(request));
        if (request.raw.destroyed) release(request);
      }
    });
    instance.addHook('onResponse', async (request) => release(request));
    instance.addHook('onError', async (request) => release(request));
    instance.get('/slow', async () => {
      await tick(300);
      return { ok: true };
    });
    instance.get('/quick', async () => ({ ok: true }));
    return instance;
  };

  const abortMidFlight = async (base: string) => {
    const controller = new AbortController();
    const inFlight = fetch(`${base}/slow`, { signal: controller.signal }).catch(() => undefined);
    setTimeout(() => controller.abort(), 30);
    await inFlight;
  };

  /** Trả `undefined` khi request treo quá `budgetMs` — nghĩa là suất ở cổng đã bị bỏ lại. */
  const requestWithin = async (base: string, budgetMs: number): Promise<number | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      return (await fetch(`${base}/quick`, { signal: controller.signal })).status;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  it('keeps serving GET requests after a client abandons one mid-flight', async () => {
    server = buildServer({ releaseOnClose: true });
    const base = await server.listen({ port: 0, host: '127.0.0.1' });

    await abortMidFlight(base);

    expect(await requestWithin(base, 2_000)).toBe(200);
    expect(await requestWithin(base, 2_000)).toBe(200);
  });

  it('demonstrates the deadlock the close hook prevents', async () => {
    server = buildServer({ releaseOnClose: false });
    const base = await server.listen({ port: 0, host: '127.0.0.1' });

    await abortMidFlight(base);

    expect(await requestWithin(base, 700)).toBeUndefined();
  });

  it('wires the close hook and the credential short-circuit in the real application', () => {
    const appSource = fs.readFileSync('server/src/app.ts', 'utf8');
    expect(appSource).toContain("request.raw.on('close', () => releaseRuntimeRequest(request))");
    expect(appSource).toContain('if (request.raw.destroyed) releaseRuntimeRequest(request);');
    expect(appSource).toContain('carriesCredentials: requestCarriesCredentials(process.env, request.headers)');
    expect(appSource).toContain('requiresAuth: !publicPaths.has(');
  });
});

const livenessPaths = new Set(['/api/v1/health', '/api/v1/ready']);

// Paths that must never trigger a read-through re-hydration: liveness probes carry no
// business state, and the internal SLA cron endpoint (reachable by GET from Vercel Cron)
// runs its own transactional state update — re-hydrating module state ahead of it is
// pointless work and must not interleave with that write.
const nonHydratedPaths = new Set([...livenessPaths, '/api/v1/internal/sla/run']);

// Only safe, side-effect-free reads pull the latest snapshot from Postgres. Writes are
// already correct on any instance: PostgresStateRepository.update re-reads the latest row
// inside the transaction under pg_advisory_xact_lock and three-way merges the local delta.
const readMethods = new Set(['GET', 'HEAD']);

export interface RuntimeHydrationContext {
  /**
   * `false` khi request không mang bất kỳ chứng chỉ nào. Bỏ trống nghĩa là "không biết", và khi
   * không biết thì vẫn dựng lại state — mặc định an toàn.
   */
  carriesCredentials?: boolean;
  /** `false` cho những đường dẫn công khai, vốn chạy được mà không cần phiên đăng nhập. */
  requiresAuth?: boolean;
}

export function shouldHydrateRuntimeStatePerRequest(
  env: NodeJS.ProcessEnv,
  requestPath: string,
  method = 'GET',
  context: RuntimeHydrationContext = {},
): boolean {
  if (env.DATA_STORE_MODE !== 'postgres') return false;
  if (!readMethods.has(method.toUpperCase())) return false;
  if (nonHydratedPaths.has(requestPath.split('?')[0])) return false;
  // Một request không mang chứng chỉ nào, trên một đường dẫn đòi xác thực, thì chắc chắn bị
  // `preHandler` trả 401 dù state có mới tới đâu. Dựng lại state cho nó là đổi trọn một vòng
  // Postgres lấy đúng một câu "chưa xác thực" — mà trên màn hình đăng nhập thì đó chính là toàn bộ
  // những gì `GET /api/v1/me` làm, ở mỗi lần mở ứng dụng.
  if (context.requiresAuth !== false && context.carriesCredentials === false) return false;
  return true;
}

const SESSION_COOKIE = 'audit_bgs_session';
const SUPABASE_ACCESS_COOKIE = 'audit_bgs_supabase_access';

export interface CredentialHeaders {
  cookie?: string | string[];
  authorization?: string | string[];
  'x-user-id'?: string | string[];
}

const headerText = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';

/** Đọc theo đúng cách `cookieValue` trong app.ts tách chuỗi cookie, để hai bên không lệch nhau. */
const hasCookie = (cookieHeader: string, name: string): boolean => {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    // Cookie rỗng cũng bằng không có: `authSessionStore.resolve('')` không tra ra phiên nào.
    if (part.slice(separator + 1).trim().length > 0) return true;
  }
  return false;
};

/**
 * Request có mang thứ gì đó để `preHandler` xác thực hay không. Chỉ trả lời câu "có chứng chỉ để mà
 * xét không", tuyệt đối không phải "chứng chỉ này hợp lệ không" — việc xác thực thật vẫn nguyên vẹn
 * ở `preHandler`, nơi duy nhất được quyền quyết định.
 */
export function requestCarriesCredentials(env: NodeJS.ProcessEnv, headers: CredentialHeaders): boolean {
  if (env.NODE_ENV === 'test' && env.ALLOW_TEST_USER_HEADER !== 'false' && headerText(headers['x-user-id'])) {
    return true;
  }
  const cookie = headerText(headers.cookie);
  if (env.AUTH_MODE === 'supabase') {
    return hasCookie(cookie, SUPABASE_ACCESS_COOKIE)
      || headerText(headers.authorization).startsWith('Bearer ');
  }
  return hasCookie(cookie, SESSION_COOKIE);
}

/**
 * Trần thời gian cho một request được tính là "đang chạy", và cho một lần dựng lại state.
 *
 * Vercel đã cắt hàm ở 60s nên không có request lành mạnh nào cần tới ngần này. Nó tồn tại thuần tuý
 * để một suất bị rò không thể khoá chết cả instance: khi còn request đang chạy thì không lần dựng
 * lại state nào được phép bắt đầu, nên đúng một suất không nhả là mọi GET sau đó chờ vô hạn.
 */
const DEFAULT_GATE_TIMEOUT_MS = 30_000;

const HYDRATION_TIMEOUT_MESSAGE = 'RUNTIME_STATE_HYDRATION_TIMEOUT: không đọc được snapshot trong thời gian cho phép.';

const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
  // Một chiếc đồng hồ chỉ ngồi canh chừng thì không được phép giữ tiến trình sống.
  (timer as unknown as { unref?: () => void }).unref?.();
};

function withTimeout(task: Promise<void>, timeoutMs: number, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    unrefTimer(timer);
  });
  // Nếu `task` hỏng sau khi đã hết giờ thì không còn ai chờ nó nữa. Gắn sẵn một người nghe để lỗi
  // muộn đó không nổi lên thành unhandled rejection và kéo đổ cả tiến trình.
  task.catch(() => undefined);
  return Promise.race([task, expiry]).finally(() => clearTimeout(timer));
}

export interface RuntimeStateGateOptions {
  /**
   * Đọc snapshot mới nhất và chiếu lại state trong bộ nhớ. Cổng bảo đảm hàm này chỉ chạy khi không
   * còn request nào đang dở dang.
   */
  hydrate: () => Promise<void>;
  timeoutMs?: number;
}

/**
 * Cổng vào cho các request GET cần state mới: gộp chung một lần đọc snapshot cho cả nhóm request
 * đến cùng lúc, rồi thả tất cả cùng chạy song song.
 *
 * Trước đây chỗ này là một khoá độc quyền giữ suốt vòng đời từng request, nên mọi GET trên cùng một
 * instance xếp hàng một, mỗi cái tự đi một vòng Postgres. Đo trên bản đang chạy: 6 request đồng
 * thời cho ra 1,1s → 4,8s theo bậc thang; 8 request thì một cái mất 13,1s và một cái trả về 500.
 * Mà giao diện thì mở màn hình lên là bắn 6 request một lượt, mỗi lần tìm kiếm bắn 2.
 *
 * Điều thật sự cần bảo vệ hẹp hơn thế nhiều: `hydrate` thay nguyên các mảng state ở phạm vi module,
 * nên nó không được chạy khi còn handler nằm giữa hai `await` — nếu không handler đó đọc nửa đầu ở
 * snapshot cũ, nửa sau ở snapshot mới. Vậy nên:
 *
 *   - request đến trong lúc một lần dựng state đang chạy thì **nối vào chính lần đó**, không mở
 *     thêm vòng Postgres nào;
 *   - dựng xong, cả nhóm cùng chạy song song, không ai chờ ai;
 *   - lần dựng kế tiếp chờ nhóm hiện tại rút hết rồi mới thay state.
 *
 * Không có chuyện bỏ đói: request đến sau xếp hàng sau lần dựng state chứ không tính vào nhóm đang
 * chạy, nên nhóm đang chạy luôn rút cạn được.
 */
export class RuntimeStateGate {
  private readonly hydrate: () => Promise<void>;
  private readonly timeoutMs: number;
  private inFlight = 0;
  private drained: Promise<void> | undefined;
  private resolveDrained: (() => void) | undefined;
  private hydration: Promise<void> | undefined;

  public constructor(options: RuntimeStateGateOptions) {
    this.hydrate = options.hydrate;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
  }

  /** Số request đang chạy sau cổng. Dùng để khẳng định trong test rằng cổng không rò suất nào. */
  public get activeRequests(): number {
    return this.inFlight;
  }

  /**
   * Chờ state được dựng lại (nối vào lần đang chạy nếu có), rồi ghi danh là một request đang chạy.
   * Trả về hàm nhả suất; gọi bao nhiêu lần cũng chỉ tính một.
   */
  public async enter(): Promise<() => void> {
    await (this.hydration ?? this.beginHydration());
    return this.beginRequest();
  }

  private beginHydration(): Promise<void> {
    const run = (async () => {
      await this.drain();
      await withTimeout(this.hydrate(), this.timeoutMs, HYDRATION_TIMEOUT_MESSAGE);
    })();
    this.hydration = run;
    // Dọn chỗ cho lần sau. Nuốt lỗi ở riêng nhánh dọn dẹp này thôi — lỗi thật vẫn đi tới từng
    // request đang chờ qua chính `run`.
    void run.catch(() => undefined).then(() => {
      if (this.hydration === run) this.hydration = undefined;
    });
    return run;
  }

  private drain(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    if (!this.drained) {
      this.drained = new Promise<void>(resolve => { this.resolveDrained = resolve; });
    }
    return this.drained;
  }

  private beginRequest(): () => void {
    this.inFlight += 1;
    let released = false;
    const finish = () => {
      if (released) return;
      released = true;
      clearTimeout(watchdog);
      this.inFlight -= 1;
      if (this.inFlight > 0) return;
      const resolve = this.resolveDrained;
      this.drained = undefined;
      this.resolveDrained = undefined;
      resolve?.();
    };
    // Suất tự nhả sau `timeoutMs` kể cả khi không ai gọi. Fastify không phát `onResponse` lẫn
    // `onError` cho request bị client ngắt giữa chừng, nên nếu thiếu lớp này thì một kết nối rớt
    // là đủ để không lần dựng state nào chạy được nữa.
    const watchdog = setTimeout(finish, this.timeoutMs);
    unrefTimer(watchdog);
    return finish;
  }
}

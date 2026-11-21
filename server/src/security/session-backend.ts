import { randomBytes } from 'node:crypto';
import type { AuthSessionRecord } from '../../../shared/contracts';
import type { PostgresAuthSessions } from '../repositories/auth-sessions';
import { AuthSessionStore, sessionTokenDigest } from './session-store';

/** Nơi giữ phiên đăng nhập: trong snapshot (local, bộ nhớ) hoặc bảng riêng (PostgreSQL). */
export interface SessionBackend {
  create(userId: string): Promise<{ token: string; record: AuthSessionRecord }>;
  resolve(token: string): Promise<AuthSessionRecord | undefined>;
  revoke(token: string): Promise<boolean>;
  markStepUp(token: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<number>;
}

/**
 * Phiên nằm trong snapshot như trước. Mỗi thay đổi báo lại danh sách bản ghi để snapshot mang đúng
 * trạng thái; việc ghi snapshot vẫn do người gọi làm.
 */
export class SnapshotSessionBackend implements SessionBackend {
  public constructor(
    private readonly store: () => AuthSessionStore,
    private readonly onChange: (records: AuthSessionRecord[]) => void = () => undefined,
  ) {}

  public async create(userId: string) {
    const created = this.store().create(userId);
    this.onChange(this.store().records());
    return created;
  }

  public async resolve(token: string) {
    return this.store().resolve(token);
  }

  public async revoke(token: string) {
    const revoked = this.store().revoke(token);
    this.onChange(this.store().records());
    return revoked;
  }

  public async markStepUp(token: string) {
    const marked = this.store().markStepUp(token);
    this.onChange(this.store().records());
    return marked;
  }

  public async revokeAllForUser(userId: string) {
    const revoked = this.store().revokeAllForUser(userId);
    this.onChange(this.store().records());
    return revoked;
  }
}

export interface TableSessionOptions {
  now?: () => Date;
  /** Thời hạn tuyệt đối của phiên. */
  ttlMs?: number;
  /** Quá thời gian này không thao tác thì phiên bị đóng; 0 là tắt. */
  idleMs?: number;
  /** Ghi lại lần hoạt động cuối chỉ khi đã cũ hơn ngưỡng này, để đọc dữ liệu không kéo theo ghi ở mỗi yêu cầu. */
  touchAfterMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Phiên trong bảng `auth_sessions`: mỗi thao tác chạm đúng một hàng, không đụng snapshot. */
export class TableSessionBackend implements SessionBackend {
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly idleMs: number;
  private readonly touchAfterMs: number;

  public constructor(private readonly sessions: PostgresAuthSessions, options: TableSessionOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 8 * 60 * 60 * 1_000;
    this.idleMs = options.idleMs ?? 0;
    this.touchAfterMs = options.touchAfterMs ?? 2 * 60 * 1_000;
  }

  public async create(userId: string) {
    const createdAt = this.now();
    await this.sessions.purge(new Date(createdAt.getTime() - DAY_MS).toISOString());
    const token = randomBytes(32).toString('hex');
    const record: AuthSessionRecord = {
      id: `session-${randomBytes(16).toString('hex')}`,
      userId,
      tokenDigest: sessionTokenDigest(token),
      createdAt: createdAt.toISOString(),
      lastSeenAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlMs).toISOString(),
    };
    await this.sessions.insert(record);
    return { token, record };
  }

  public async resolve(token: string) {
    if (!token) return undefined;
    const record = await this.sessions.findActiveByDigest(sessionTokenDigest(token));
    if (!record) return undefined;
    const nowMs = this.now().getTime();
    if (Date.parse(record.expiresAt) <= nowMs) return undefined;
    const idleFor = nowMs - Date.parse(record.lastSeenAt);
    if (this.idleMs > 0 && idleFor > this.idleMs) {
      await this.sessions.revokeById(record.id, new Date(nowMs).toISOString());
      return undefined;
    }
    if (idleFor > this.touchAfterMs) {
      const seenAt = new Date(nowMs).toISOString();
      await this.sessions.touch(record.id, seenAt);
      return { ...record, lastSeenAt: seenAt };
    }
    return record;
  }

  public revoke(token: string) {
    return token ? this.sessions.revokeByDigest(sessionTokenDigest(token), this.now().toISOString()) : Promise.resolve(false);
  }

  public markStepUp(token: string) {
    return token ? this.sessions.markStepUp(sessionTokenDigest(token), this.now().toISOString()) : Promise.resolve(false);
  }

  public revokeAllForUser(userId: string) {
    return this.sessions.revokeAllForUser(userId, this.now().toISOString());
  }
}

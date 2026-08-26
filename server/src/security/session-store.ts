import { createHash, randomBytes } from 'node:crypto';
import { AuthSessionRecord } from '../../../shared/contracts';

export interface AuthSessionStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  records?: AuthSessionRecord[];
  onChange?: (records: AuthSessionRecord[]) => void;
}

export class AuthSessionStore {
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly onChange?: (records: AuthSessionRecord[]) => void;
  private sessionRecords: AuthSessionRecord[];

  public constructor(options: AuthSessionStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 8 * 60 * 60 * 1_000;
    this.sessionRecords = structuredClone(options.records ?? []);
    this.onChange = options.onChange;
  }

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publish(): void {
    this.onChange?.(this.records());
  }

  public create(userId: string): { token: string; record: AuthSessionRecord } {
    this.purgeExpired();
    const token = randomBytes(32).toString('hex');
    const createdAt = this.now();
    const record: AuthSessionRecord = {
      id: `session-${randomBytes(16).toString('hex')}`,
      userId,
      tokenDigest: this.digest(token),
      createdAt: createdAt.toISOString(),
      lastSeenAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlMs).toISOString(),
    };
    this.sessionRecords.push(record);
    this.publish();
    return { token, record: structuredClone(record) };
  }

  public resolve(token: string): AuthSessionRecord | undefined {
    this.purgeExpired();
    if (!token) return undefined;
    const record = this.sessionRecords.find(item => item.tokenDigest === this.digest(token) && !item.revokedAt);
    if (!record) return undefined;
    record.lastSeenAt = this.now().toISOString();
    return structuredClone(record);
  }

  public revoke(token: string): boolean {
    if (!token) return false;
    const record = this.sessionRecords.find(item => item.tokenDigest === this.digest(token) && !item.revokedAt);
    if (!record) return false;
    record.revokedAt = this.now().toISOString();
    this.publish();
    return true;
  }

  public purgeExpired(): number {
    const nowMs = this.now().getTime();
    const before = this.sessionRecords.length;
    this.sessionRecords = this.sessionRecords.filter(item => !item.revokedAt && Date.parse(item.expiresAt) > nowMs);
    if (this.sessionRecords.length !== before) this.publish();
    return before - this.sessionRecords.length;
  }

  public records(): AuthSessionRecord[] {
    return structuredClone(this.sessionRecords);
  }
}

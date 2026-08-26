import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface LocalStateEnvelope<T> {
  schemaVersion: 1;
  savedAt: string;
  data: T;
}

interface LocalStateLockOwner {
  pid: number;
  createdAt: number;
  token: string;
}

const LOCK_RETRY_ATTEMPTS = 21;
const LOCK_RETRY_DELAY_MS = 10;
const MALFORMED_LOCK_GRACE_MS = 1_000;

interface LocalStateRepositoryOptions {
  filePath: string;
  enabled: boolean;
  status?: { mode: 'memory' | 'local-json'; durable: boolean };
}

export interface ConfiguredLocalStateRepositoryOptions {
  filePath: string;
  dataStoreMode: string | undefined;
  persistenceEnabled?: boolean;
}

export class LocalStateRepository<T> {
  private readonly filePath: string;
  private readonly enabled: boolean;
  private readonly status: { mode: 'memory' | 'local-json'; durable: boolean };
  private activeLockToken: string | undefined;
  private readonly recoverableSelfLockTokens = new Set<string>();

  public constructor(options: LocalStateRepositoryOptions) {
    this.filePath = path.resolve(options.filePath);
    this.enabled = options.enabled;
    this.status = options.status ?? (this.enabled ? { mode: 'local-json', durable: true } : { mode: 'memory', durable: false });
  }

  public getStatus(): { mode: 'memory' | 'local-json'; durable: boolean } {
    return this.status;
  }

  private readEnvelope(snapshotPath: string): LocalStateEnvelope<T> {
    const envelope = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as LocalStateEnvelope<T>;
    if (envelope.schemaVersion !== 1 || envelope.data === undefined) throw new Error('invalid envelope');
    return envelope;
  }

  private readSnapshot(snapshotPath: string): T {
    return this.readEnvelope(snapshotPath).data;
  }

  private get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  private readLockOwner(lockPath = this.lockPath): LocalStateLockOwner | undefined {
    try {
      const candidate = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LocalStateLockOwner>;
      return typeof candidate.pid === 'number'
        && Number.isInteger(candidate.pid)
        && typeof candidate.createdAt === 'number'
        && Number.isFinite(candidate.createdAt)
        && typeof candidate.token === 'string'
        && candidate.token.length > 0
        ? candidate as LocalStateLockOwner
        : undefined;
    } catch {
      return undefined;
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    if (pid === process.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  private recoverAbandonedLock(): boolean {
    if (!fs.existsSync(this.lockPath)) return true;
    const owner = this.readLockOwner();
    const selfOwnedOrphan = owner?.pid === process.pid
      && owner.token !== this.activeLockToken
      && this.recoverableSelfLockTokens.has(owner.token);
    if (owner && this.isProcessAlive(owner.pid) && !selfOwnedOrphan) return false;
    if (!owner) {
      try {
        if (Date.now() - fs.statSync(this.lockPath).mtimeMs < MALFORMED_LOCK_GRACE_MS) return false;
      } catch {
        return true;
      }
    }

    const quarantinedPath = `${this.lockPath}.abandoned.${process.pid}.${randomUUID()}`;
    try {
      fs.renameSync(this.lockPath, quarantinedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      return false;
    }

    const movedOwner = this.readLockOwner(quarantinedPath);
    const ownerChangedDuringQuarantine = owner
      ? movedOwner?.token !== owner.token
      : movedOwner !== undefined;
    if (ownerChangedDuringQuarantine) {
      this.restoreQuarantinedPath(quarantinedPath, this.lockPath);
      return false;
    }
    try {
      fs.rmSync(quarantinedPath, { force: true });
    } catch {
      return false;
    }
    if (owner?.token) this.recoverableSelfLockTokens.delete(owner.token);
    return true;
  }

  private restoreQuarantinedPath(quarantinedPath: string, targetPath: string): void {
    if (fs.existsSync(targetPath)) return;
    try {
      fs.renameSync(quarantinedPath, targetPath);
    } catch {
      // A concurrent owner may have recreated the lock; leave its lock untouched.
    }
  }

  private waitBeforeRetry(): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_DELAY_MS);
  }

  private transientLockError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
  }

  private releaseLock(owner: LocalStateLockOwner): Error | undefined {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      const currentOwner = this.readLockOwner();
      if (currentOwner?.token !== owner.token) return undefined;
      const releasedPath = `${this.lockPath}.released.${owner.pid}.${owner.token}.${randomUUID()}`;
      try {
        fs.renameSync(this.lockPath, releasedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.transientLockError(error) || attempt === LOCK_RETRY_ATTEMPTS - 1) return lastError;
        this.waitBeforeRetry();
        continue;
      }

      const releasedOwner = this.readLockOwner(releasedPath);
      if (releasedOwner?.token !== owner.token) {
        this.restoreQuarantinedPath(releasedPath, this.lockPath);
        return undefined;
      }

      try {
        fs.rmSync(releasedPath, { force: true });
        return undefined;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.restoreQuarantinedPath(releasedPath, this.lockPath);
        if (!this.transientLockError(error) || attempt === LOCK_RETRY_ATTEMPTS - 1) return lastError;
        this.waitBeforeRetry();
      }
    }
    return lastError;
  }

  private acquireExclusiveLock(): LocalStateLockOwner {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const owner: LocalStateLockOwner = { pid: process.pid, createdAt: Date.now(), token: randomUUID() };

    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      let lockHandle: number | undefined;
      try {
        lockHandle = fs.openSync(this.lockPath, 'wx');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (this.recoverAbandonedLock()) continue;
        if (attempt < LOCK_RETRY_ATTEMPTS - 1) this.waitBeforeRetry();
        continue;
      }

      try {
        fs.writeFileSync(lockHandle, JSON.stringify(owner), 'utf8');
      } catch (error) {
        if (lockHandle !== undefined) fs.closeSync(lockHandle);
        const releaseError = this.releaseLock(owner);
        throw releaseError ?? error;
      }
      fs.closeSync(lockHandle);
      return owner;
    }

    throw new Error(`LOCAL_STATE_BUSY — Đang có tiến trình khác cập nhật ${this.filePath}.`);
  }

  private withExclusiveLock<R>(operation: (owner: LocalStateLockOwner) => R): R {
    const owner = this.acquireExclusiveLock();
    this.activeLockToken = owner.token;
    let operationError: unknown;
    try {
      return operation(owner);
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      const releaseError = this.releaseLock(owner);
      this.activeLockToken = undefined;
      if (releaseError) {
        this.recoverableSelfLockTokens.add(owner.token);
        console.error(
          operationError === undefined
            ? '[LocalStateRepository] Snapshot đã ghi thành công nhưng chưa dọn được lock; lần thao tác sau sẽ tự phục hồi.'
            : '[LocalStateRepository] Không dọn được lock sau khi thao tác thất bại.',
          releaseError,
        );
      } else {
        this.recoverableSelfLockTokens.delete(owner.token);
      }
    }
  }

  private temporarySnapshotPaths(): string[] {
    const directory = path.dirname(this.filePath);
    const prefix = `${path.basename(this.filePath)}.tmp`;
    try {
      return fs.readdirSync(directory)
        .filter(name => name === prefix || name.startsWith(`${prefix}.`))
        .map(name => path.join(directory, name));
    } catch {
      return [];
    }
  }

  private removeTemporarySnapshots(temporaryPaths: string[]): void {
    for (const temporaryPath of temporaryPaths) fs.rmSync(temporaryPath, { force: true });
  }

  private temporarySnapshotCandidates(temporaryPaths: string[]): Array<{ temporaryPath: string; savedAt: number; data: T }> {
    return temporaryPaths.flatMap(temporaryPath => {
      try {
        const envelope = this.readEnvelope(temporaryPath);
        const savedAt = Date.parse(envelope.savedAt);
        return Number.isFinite(savedAt) ? [{ temporaryPath, savedAt, data: envelope.data }] : [];
      } catch {
        return [];
      }
    }).sort((left, right) => right.savedAt - left.savedAt);
  }

  private replaceTemporarySnapshot(temporaryPath: string, owner: LocalStateLockOwner): void {
    try {
      fs.renameSync(temporaryPath, this.filePath);
      return;
    } catch (firstError) {
      const code = (firstError as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') throw firstError;
    }

    const backupPath = `${this.filePath}.backup.${owner.pid}.${owner.token}`;
    let mainBackedUp = false;
    if (fs.existsSync(this.filePath)) {
      fs.renameSync(this.filePath, backupPath);
      mainBackedUp = true;
    }

    try {
      fs.renameSync(temporaryPath, this.filePath);
    } catch (secondError) {
      if (mainBackedUp && !fs.existsSync(this.filePath)) this.restoreQuarantinedPath(backupPath, this.filePath);
      throw secondError;
    }

    if (mainBackedUp) {
      try {
        fs.rmSync(backupPath, { force: true });
      } catch {
        // The committed main snapshot is authoritative; a stale backup is harmless.
      }
    }
  }

  private recoverNewestTemporarySnapshot(temporaryPaths: string[], owner: LocalStateLockOwner): T | undefined {
    const candidates = this.temporarySnapshotCandidates(temporaryPaths);
    const newest = candidates[0];
    if (!newest) return undefined;

    this.replaceTemporarySnapshot(newest.temporaryPath, owner);
    this.removeTemporarySnapshots(temporaryPaths.filter(temporaryPath => temporaryPath !== newest.temporaryPath));
    return newest.data;
  }

  private loadUnlocked(fallback: T, owner: LocalStateLockOwner): T {
    const temporaryPaths = this.temporarySnapshotPaths();
    const mainExists = fs.existsSync(this.filePath);
    if (!mainExists) {
      const recovered = this.recoverNewestTemporarySnapshot(temporaryPaths, owner);
      if (recovered !== undefined) return recovered;
      if (!temporaryPaths.length) return structuredClone(fallback);
      throw new Error(`LOCAL_STATE_CORRUPTED — Không thể phục hồi ${this.filePath} từ snapshot tạm.`);
    }

    try {
      const mainEnvelope = this.readEnvelope(this.filePath);
      const newestTemporary = this.temporarySnapshotCandidates(temporaryPaths)[0];
      const mainSavedAt = Date.parse(mainEnvelope.savedAt);
      if (newestTemporary && (!Number.isFinite(mainSavedAt) || newestTemporary.savedAt > mainSavedAt)) {
        this.replaceTemporarySnapshot(newestTemporary.temporaryPath, owner);
        this.removeTemporarySnapshots(temporaryPaths.filter(temporaryPath => temporaryPath !== newestTemporary.temporaryPath));
        return newestTemporary.data;
      }
      this.removeTemporarySnapshots(temporaryPaths);
      return mainEnvelope.data;
    } catch (error) {
      const recovered = this.recoverNewestTemporarySnapshot(temporaryPaths, owner);
      if (recovered !== undefined) return recovered;
      this.removeTemporarySnapshots(temporaryPaths);
      throw new Error(`LOCAL_STATE_CORRUPTED — Không thể đọc ${this.filePath}: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  public load(fallback: T): T {
    if (!this.enabled) return structuredClone(fallback);
    return this.withExclusiveLock(owner => this.loadUnlocked(fallback, owner));
  }

  private writeSnapshot(data: T, owner: LocalStateLockOwner): void {
    const temporaryPath = `${this.filePath}.tmp.${owner.pid}.${owner.token}`;
    const envelope: LocalStateEnvelope<T> = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      data,
    };
    fs.writeFileSync(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
    this.replaceTemporarySnapshot(temporaryPath, owner);
  }

  public save(data: T): void {
    if (!this.enabled) return;
    this.withExclusiveLock(owner => this.writeSnapshot(data, owner));
  }

  public update(fallback: T, transform: (latest: T) => T | void): T {
    if (!this.enabled) {
      const latest = structuredClone(fallback);
      return transform(latest) ?? latest;
    }

    return this.withExclusiveLock(owner => {
      const latest = this.loadUnlocked(fallback, owner);
      const next = transform(latest) ?? latest;
      this.writeSnapshot(next, owner);
      return next;
    });
  }
}

export function createLocalStateRepository<T>(options: ConfiguredLocalStateRepositoryOptions): LocalStateRepository<T> {
  const dataStoreMode = options.dataStoreMode ?? 'local-json';
  if (dataStoreMode !== 'local-json' && dataStoreMode !== 'memory') {
    throw new Error(`INVALID_DATA_STORE_MODE: DATA_STORE_MODE must be local-json or memory; received ${dataStoreMode}.`);
  }
  const status = dataStoreMode === 'local-json'
    ? { mode: 'local-json' as const, durable: true }
    : { mode: 'memory' as const, durable: false };
  return new LocalStateRepository<T>({
    filePath: options.filePath,
    enabled: status.durable && options.persistenceEnabled !== false,
    status,
  });
}

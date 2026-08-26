import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createdDirectories: string[] = [];

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('LocalStateRepository', () => {
  it('persists UTF-8 state atomically and restores it after a new repository instance', async () => {
    const modulePath = '../../server/src/repositories/local-state';
    const repositoryModule = await import(modulePath).catch(() => null);
    expect(repositoryModule).not.toBeNull();
    if (!repositoryModule) return;

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const first = new repositoryModule.LocalStateRepository<{ label: string; values: number[] }>({ filePath, enabled: true });
    const fallback = { label: 'Khởi tạo', values: [1] };
    expect(first.load(fallback)).toEqual(fallback);

    first.save({ label: 'Kiểm soát chi nhánh', values: [1, 2, 3] });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);

    const second = new repositoryModule.LocalStateRepository<{ label: string; values: number[] }>({ filePath, enabled: true });
    expect(second.load(fallback)).toEqual({ label: 'Kiểm soát chi nhánh', values: [1, 2, 3] });
    expect(fs.readFileSync(filePath, 'utf8')).toContain('Kiểm soát chi nhánh');
  });

  it('fails closed when the local state file is corrupted', async () => {
    const modulePath = '../../server/src/repositories/local-state';
    const repositoryModule = await import(modulePath).catch(() => null);
    expect(repositoryModule).not.toBeNull();
    if (!repositoryModule) return;

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    fs.writeFileSync(filePath, '{not-json', 'utf8');
    const repository = new repositoryModule.LocalStateRepository<{ ok: boolean }>({ filePath, enabled: true });
    expect(() => repository.load({ ok: true })).toThrow(/LOCAL_STATE_CORRUPTED/);
  });

  it('recovers a valid temporary snapshot after an interrupted atomic replacement', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    fs.writeFileSync(`${filePath}.tmp`, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      data: { label: 'Dữ liệu đã phục hồi' },
    }), 'utf8');

    const repository = new repositoryModule.LocalStateRepository<{ label: string }>({ filePath, enabled: true });
    expect(repository.load({ label: 'Mặc định' })).toEqual({ label: 'Dữ liệu đã phục hồi' });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it('updates the newest snapshot under an exclusive lock and refuses a busy writer', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ apiMutation: string; slaStatus: string; unknownField: { retained: boolean } }>({ filePath, enabled: true });
    const fallback = { apiMutation: 'initial', slaStatus: 'ON_TRACK', unknownField: { retained: true } };
    repository.save(fallback);
    const staleSnapshot = repository.load(fallback);
    repository.save({ ...staleSnapshot, apiMutation: 'written-after-stale-read' });

    const updated = repository.update(fallback, latest => ({ ...latest, slaStatus: 'OVERDUE' }));

    expect(updated).toEqual({ apiMutation: 'written-after-stale-read', slaStatus: 'OVERDUE', unknownField: { retained: true } });
    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: 'live-owner' }), 'utf8');
    expect(() => repository.save({ ...updated, apiMutation: 'must-not-overwrite' })).toThrow(/LOCAL_STATE_BUSY/);
    expect(() => repository.load(fallback)).toThrow(/LOCAL_STATE_BUSY/);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('recovers a dead lock owner but keeps every live owner locked regardless of its timestamp', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    repository.save({ value: 'stable' });

    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: 2_147_483_647, createdAt: 0, token: 'dead-owner' }), 'utf8');
    repository.save({ value: 'recovered-after-dead-owner' });
    expect(repository.load({ value: 'fallback' })).toEqual({ value: 'recovered-after-dead-owner' });

    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: process.pid, createdAt: 0, token: 'slow-live-owner' }), 'utf8');
    expect(() => repository.save({ value: 'must-not-steal-slow-live-owner' })).toThrow(/LOCAL_STATE_BUSY/);
    expect(() => repository.load({ value: 'fallback' })).toThrow(/LOCAL_STATE_BUSY/);
    fs.rmSync(`${filePath}.lock`);

    fs.writeFileSync(`${filePath}.tmp`, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      data: { value: 'legacy-writer-temp' },
    }), 'utf8');
    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: 'live-owner' }), 'utf8');

    expect(() => repository.load({ value: 'fallback' })).toThrow(/LOCAL_STATE_BUSY/);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(true);
    expect(() => repository.save({ value: 'must-not-write-through-live-lock' })).toThrow(/LOCAL_STATE_BUSY/);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(true);
  });

  it('recovers the newest valid unique writer temporary snapshot after a crash', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    const writeTemporaryEnvelope = (suffix: string, savedAt: string, value: string) => fs.writeFileSync(`${filePath}.tmp.${suffix}`, JSON.stringify({
      schemaVersion: 1,
      savedAt,
      data: { value },
    }), 'utf8');

    writeTemporaryEnvelope('111.old', '2026-08-25T01:00:00.000Z', 'old-crash-snapshot');
    writeTemporaryEnvelope('222.new', '2026-08-25T01:01:00.000Z', 'newest-crash-snapshot');

    expect(repository.load({ value: 'fallback' })).toEqual({ value: 'newest-crash-snapshot' });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readdirSync(directory).some(name => name.startsWith('local-state.json.tmp.'))).toBe(false);
  });

  it('fails closed when the main snapshot is missing and every temporary snapshot is invalid', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });

    fs.writeFileSync(`${filePath}.tmp`, '{invalid-legacy-temp', 'utf8');
    fs.writeFileSync(`${filePath}.tmp.123.invalid`, JSON.stringify({
      schemaVersion: 1,
      savedAt: 'not-a-date',
      data: { value: 'invalid-unique-temp' },
    }), 'utf8');

    expect(() => repository.load({ value: 'fallback-must-not-be-used' })).toThrow(/LOCAL_STATE_CORRUPTED/);
    expect(() => repository.load({ value: 'fallback-must-not-be-used' })).toThrow(/LOCAL_STATE_CORRUPTED/);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(true);
  });

  it('recovers a newer valid writer temporary snapshot even when the main snapshot is readable', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    fs.writeFileSync(filePath, JSON.stringify({
      schemaVersion: 1,
      savedAt: '2026-08-25T01:00:00.000Z',
      data: { value: 'main-snapshot' },
    }), 'utf8');
    fs.writeFileSync(`${filePath}.tmp.crashed-writer`, JSON.stringify({
      schemaVersion: 1,
      savedAt: '2026-08-25T01:01:00.000Z',
      data: { value: 'newer-writer-snapshot' },
    }), 'utf8');
    fs.writeFileSync(`${filePath}.tmp.partial`, '{partial', 'utf8');

    expect(repository.load({ value: 'fallback' })).toEqual({ value: 'newer-writer-snapshot' });
    expect(fs.readdirSync(directory).some(name => name.startsWith('local-state.json.tmp.'))).toBe(false);
  });

  it('keeps a recoverable newer temporary snapshot when Windows replacement fails twice', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-25T01:00:00.000Z'));
      repository.save({ value: 'durable-main' });
      vi.setSystemTime(new Date('2026-08-25T01:01:00.000Z'));
      const originalRename = fs.renameSync;
      let replacements = 0;
      const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (String(source).includes('.tmp.') && String(destination) === filePath) {
          replacements += 1;
          const error = new Error(replacements === 1 ? 'Windows first replacement failure' : 'Windows second replacement failure') as NodeJS.ErrnoException;
          error.code = replacements === 1 ? 'EPERM' : 'EACCES';
          throw error;
        }
        originalRename(source, destination);
      });

      try {
        expect(() => repository.save({ value: 'recoverable-newer-write' })).toThrow(/second replacement failure/);
      } finally {
        renameSpy.mockRestore();
      }

      expect(fs.existsSync(filePath) || fs.readdirSync(directory).some(name => name.startsWith('local-state.json.tmp.'))).toBe(true);
      expect(repository.load({ value: 'fallback' })).toEqual({ value: 'recoverable-newer-write' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores a quarantined replacement lock when its token changes during dead-owner recovery', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    repository.save({ value: 'stable' });
    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: 2_147_483_647, createdAt: 0, token: 'dead-owner' }), 'utf8');

    const originalRename = fs.renameSync;
    let replacementInjected = false;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      originalRename(source, destination);
      if (!replacementInjected && String(destination).includes('.abandoned.')) {
        replacementInjected = true;
        fs.writeFileSync(String(destination), JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: 'replacement-owner' }), 'utf8');
      }
    });

    try {
      expect(() => repository.save({ value: 'must-not-overwrite-replacement' })).toThrow(/LOCAL_STATE_BUSY/);
    } finally {
      renameSpy.mockRestore();
    }

    expect(JSON.parse(fs.readFileSync(`${filePath}.lock`, 'utf8'))).toMatchObject({ token: 'replacement-owner' });
    expect(() => repository.load({ value: 'fallback' })).toThrow(/LOCAL_STATE_BUSY/);
  });

  it('restores a malformed lock when it becomes a live owner while being quarantined', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    repository.save({ value: 'stable' });
    fs.writeFileSync(`${filePath}.lock`, '{malformed-lock', 'utf8');
    fs.utimesSync(`${filePath}.lock`, new Date(0), new Date(0));

    const originalRename = fs.renameSync;
    let replacementInjected = false;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      originalRename(source, destination);
      if (!replacementInjected && String(destination).includes('.abandoned.')) {
        replacementInjected = true;
        fs.writeFileSync(String(destination), JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: 'live-replacement-owner' }), 'utf8');
      }
    });

    try {
      expect(() => repository.save({ value: 'must-not-overwrite-live-replacement' })).toThrow(/LOCAL_STATE_BUSY/);
    } finally {
      renameSpy.mockRestore();
    }

    expect(JSON.parse(fs.readFileSync(`${filePath}.lock`, 'utf8'))).toMatchObject({ token: 'live-replacement-owner' });
  });

  it('does not replay an operation error that happens after lock acquisition', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    const operationError = new Error('transform already exists') as NodeJS.ErrnoException;
    operationError.code = 'EEXIST';
    let transforms = 0;

    expect(() => repository.update({ value: 'fallback' }, () => {
      transforms += 1;
      throw operationError;
    })).toThrow(operationError);
    expect(transforms).toBe(1);
  });

  it('retries a transient Windows lock-release error after a successful operation', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    const originalRemove = fs.rmSync;
    let lockRemovalAttempts = 0;
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if ((String(target) === `${filePath}.lock` || String(target).includes('.released.')) && lockRemovalAttempts++ === 0) {
        const error = new Error('Windows sharing violation') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return originalRemove(target, options);
    });

    try {
      repository.save({ value: 'saved-after-retry' });
    } finally {
      removeSpy.mockRestore();
    }

    expect(lockRemovalAttempts).toBeGreaterThan(1);
    expect(fs.existsSync(`${filePath}.lock`)).toBe(false);
  });

  it('keeps a committed snapshot authoritative when lock release keeps failing and recovers its own orphan lock', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-state-'));
    createdDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new repositoryModule.LocalStateRepository<{ value: string }>({ filePath, enabled: true });
    const originalRename = fs.renameSync;
    let failRelease = true;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (failRelease && String(source) === `${filePath}.lock` && String(destination).includes('.released.')) {
        const error = new Error('Persistent Windows lock release failure') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      originalRename(source, destination);
    });

    try {
      expect(() => repository.save({ value: 'committed-despite-release-cleanup' })).not.toThrow();
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).data).toEqual({ value: 'committed-despite-release-cleanup' });
      expect(fs.existsSync(`${filePath}.lock`)).toBe(true);

      failRelease = false;
      expect(repository.load({ value: 'fallback' })).toEqual({ value: 'committed-despite-release-cleanup' });
      expect(fs.existsSync(`${filePath}.lock`)).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('fails closed for an unsupported configured data store mode', async () => {
    const repositoryModule = await import('../../server/src/repositories/local-state');

    expect(() => repositoryModule.createLocalStateRepository<{ ok: boolean }>({
      dataStoreMode: 'local-json-typo',
      filePath: path.join(os.tmpdir(), 'audit-bgs-invalid-state.json'),
    })).toThrow(/DATA_STORE_MODE.*local-json.*memory/i);
  });
});

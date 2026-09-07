import { describe, expect, it } from 'vitest';
import {
  clearStagedImportCheckpointKey,
  clearStagedImportSession,
  getOrCreateStagedImportCheckpointKey,
  stagedImportStorageKey,
  type KeyValueStorage,
} from '../../src/services/staged-import-retry';

function storage(): KeyValueStorage & Pick<Storage, 'key' | 'length'> {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('staged import checkpoint retry key', () => {
  it('retains one idempotency key until the checkpoint result is confirmed', () => {
    const session = storage();
    let keysCreated = 0;
    const createKey = () => `checkpoint-${++keysCreated}`;

    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', createKey)).toBe('checkpoint-1');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', createKey)).toBe('checkpoint-1');
    expect(keysCreated).toBe(1);

    clearStagedImportCheckpointKey(session, 'user-a', 'batch-a');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', createKey)).toBe('checkpoint-2');
  });

  it('isolates retry keys by both user and batch', () => {
    const session = storage();
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', () => 'key-a')).toBe('key-a');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-b', 'batch-a', () => 'key-b')).toBe('key-b');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-b', () => 'key-c')).toBe('key-c');
  });

  it('removes only the signed-out user\'s resumable batch and retry keys', () => {
    const session = storage();
    session.setItem(stagedImportStorageKey('user-a'), 'batch-a');
    session.setItem(stagedImportStorageKey('user-b'), 'batch-b');
    getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', () => 'key-a');
    getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-old', () => 'key-old');
    getOrCreateStagedImportCheckpointKey(session, 'user-b', 'batch-b', () => 'key-b');

    clearStagedImportSession(session, 'user-a');

    expect(session.getItem(stagedImportStorageKey('user-a'))).toBeNull();
    expect(session.getItem(stagedImportStorageKey('user-b'))).toBe('batch-b');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-a', 'batch-a', () => 'key-a-new')).toBe('key-a-new');
    expect(getOrCreateStagedImportCheckpointKey(session, 'user-b', 'batch-b', () => 'key-b-new')).toBe('key-b');
  });
});

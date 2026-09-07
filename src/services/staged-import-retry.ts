export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type EnumerableKeyValueStorage = KeyValueStorage & Pick<Storage, 'key' | 'length'>;

const checkpointKey = (userId: string, batchId: string) =>
  `audit-bgs:staged-finding-import:checkpoint:${userId}:${batchId}`;

export const stagedImportStorageKey = (userId: string) => `audit-bgs:staged-finding-import:${userId}`;

export function getOrCreateStagedImportCheckpointKey<TKey extends string>(
  storage: KeyValueStorage,
  userId: string,
  batchId: string,
  createKey: () => TKey,
): TKey {
  const storageKey = checkpointKey(userId, batchId);
  const existing = storage.getItem(storageKey);
  if (existing) return existing as TKey;
  const next = createKey();
  storage.setItem(storageKey, next);
  return next;
}

export function clearStagedImportCheckpointKey(storage: KeyValueStorage, userId: string, batchId: string): void {
  storage.removeItem(checkpointKey(userId, batchId));
}

/** Remove only the signed-out user's resumable import state from this browser tab. */
export function clearStagedImportSession(storage: EnumerableKeyValueStorage, userId: string): void {
  storage.removeItem(stagedImportStorageKey(userId));
  const prefix = `audit-bgs:staged-finding-import:checkpoint:${userId}:`;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => Boolean(key?.startsWith(prefix)),
  );
  keys.forEach(key => storage.removeItem(key));
}

import { isDeepStrictEqual } from 'node:util';

const missing = Symbol('missing');
type Missing = typeof missing;

export class StateMergeConflictError extends Error {
  public readonly code = 'STATE_MERGE_CONFLICT';

  public constructor(public readonly conflictPath: string) {
    super(`STATE_MERGE_CONFLICT — Dữ liệu đã được thay đổi đồng thời tại ${conflictPath}. Hãy tải lại và thử lại.`);
    this.name = 'StateMergeConflictError';
  }
}

function equal(left: unknown | Missing, right: unknown | Missing): boolean {
  if (left === missing || right === missing) return left === right;
  return isDeepStrictEqual(left, right);
}

function clone<T>(value: T): T {
  return value === missing ? value : structuredClone(value);
}

function isPlainObject(value: unknown | Missing): value is Record<string, unknown> {
  return value !== missing && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function entityKey(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;
  if (typeof value.id === 'string') return `id:${value.id}`;
  if (typeof value.userId === 'string' && typeof value.findingId === 'string') {
    return `user-finding:${value.userId}:${value.findingId}`;
  }
  if (typeof value.userId === 'string' && typeof value.targetKey === 'string') {
    return `user-target:${value.userId}:${value.targetKey}`;
  }
  if (typeof value.userId === 'string') return `user:${value.userId}`;
  if (typeof value.code === 'string') return `code:${value.code}`;
  if (typeof value.key === 'string') return `key:${value.key}`;
  return undefined;
}

function keyedArray(values: unknown[]): Map<string, unknown> | undefined {
  const result = new Map<string, unknown>();
  for (const value of values) {
    const key = entityKey(value);
    if (!key || result.has(key)) return undefined;
    result.set(key, value);
  }
  return result;
}

function mergeArrays(base: unknown[], local: unknown[], remote: unknown[], path: string): unknown[] {
  const baseByKey = keyedArray(base);
  const localByKey = keyedArray(local);
  const remoteByKey = keyedArray(remote);
  if (!baseByKey || !localByKey || !remoteByKey) throw new StateMergeConflictError(path);

  const orderedKeys = [
    ...remoteByKey.keys(),
    ...[...localByKey.keys()].filter(key => !remoteByKey.has(key)),
  ];
  const merged: unknown[] = [];
  for (const key of orderedKeys) {
    const value = mergeValue(
      baseByKey.get(key) ?? missing,
      localByKey.get(key) ?? missing,
      remoteByKey.get(key) ?? missing,
      `${path}[${key.replace(/^[^:]+:/, '')}]`,
    );
    if (value !== missing) merged.push(value);
  }
  return merged;
}

function mergeObjects(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)]);
  for (const key of keys) {
    const merged = mergeValue(
      Object.prototype.hasOwnProperty.call(base, key) ? base[key] : missing,
      Object.prototype.hasOwnProperty.call(local, key) ? local[key] : missing,
      Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : missing,
      path ? `${path}.${key}` : key,
    );
    if (merged !== missing) result[key] = merged;
  }
  return result;
}

function mergeValue(
  base: unknown | Missing,
  local: unknown | Missing,
  remote: unknown | Missing,
  path: string,
): unknown | Missing {
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);
  if (equal(local, remote)) return clone(local);

  if (base === missing || local === missing || remote === missing) {
    throw new StateMergeConflictError(path);
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeArrays(base, local, remote, path);
  }
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    return mergeObjects(base, local, remote, path);
  }
  throw new StateMergeConflictError(path);
}

function jsonSnapshot<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('State snapshot must be JSON-serializable.');
  }
  return JSON.parse(serialized) as T;
}

export function threeWayMergeState<T>(base: T, local: T, remote: T): T {
  return mergeValue(jsonSnapshot(base), jsonSnapshot(local), jsonSnapshot(remote), '') as T;
}

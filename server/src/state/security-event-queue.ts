/**
 * Append a snapshot of pending events and return only the ids proven durable.
 * The caller filters its current queue after this resolves, so events appended while the ledger
 * write is in flight are not accidentally removed. A rejected append leaves the queue untouched.
 */
export async function flushPendingEventIds<T extends { id: string }>(
  pending: readonly T[],
  append: (events: readonly T[]) => Promise<void>,
): Promise<Set<string>> {
  if (pending.length === 0) return new Set();
  const flushing = structuredClone(pending);
  await append(flushing);
  return new Set(flushing.map(event => event.id));
}

import { WorkspaceTarget } from '../../../../shared/contracts';

export function sortWatchTargets<T extends WorkspaceTarget>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (Boolean(left.isPriority) !== Boolean(right.isPriority)) return left.isPriority ? -1 : 1;
    if (left.isPriority && right.isPriority) {
      const priorityOrder = (right.prioritizedAt ?? '').localeCompare(left.prioritizedAt ?? '');
      if (priorityOrder !== 0) return priorityOrder;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

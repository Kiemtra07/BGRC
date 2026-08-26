import { describe, expect, it } from 'vitest';
import { sortWatchTargets } from '../../server/src/modules/workspace/workspace-priority';
import { WorkspaceTarget } from '../../shared/contracts';

const target = (id: string, overrides: Partial<WorkspaceTarget> = {}): WorkspaceTarget => ({
  id,
  targetType: 'CUSTOMER',
  targetKey: id,
  label: id,
  clusterName: 'Cụm Tây Nguyên',
  branchCode: '635',
  cif: id,
  matchedFindingCount: 1,
  createdAt: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

describe('priority monitoring ordering', () => {
  it('places starred targets first and the newest star first', () => {
    const sorted = sortWatchTargets([
      target('ordinary'),
      target('older-star', { isPriority: true, prioritizedAt: '2026-08-25T01:00:00.000Z' }),
      target('newer-star', { isPriority: true, prioritizedAt: '2026-08-25T02:00:00.000Z' }),
    ]);

    expect(sorted.map(item => item.id)).toEqual(['newer-star', 'older-star', 'ordinary']);
  });

  it('does not mutate the original queue', () => {
    const original = [target('ordinary'), target('star', { isPriority: true })];
    const snapshot = structuredClone(original);
    sortWatchTargets(original);
    expect(original).toEqual(snapshot);
  });
});

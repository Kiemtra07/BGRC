import { describe, expect, it } from 'vitest';
import {
  StateMergeConflictError,
  threeWayMergeState,
} from '../../server/src/state/three-way-state-merge';

describe('threeWayMergeState', () => {
  it('retains independent records appended by two serverless instances', () => {
    const base = { authSessions: [{ id: 'session-base', userId: 'user-1' }] };
    const local = { authSessions: [...base.authSessions, { id: 'session-local', userId: 'user-2' }] };
    const remote = { authSessions: [...base.authSessions, { id: 'session-remote', userId: 'user-3' }] };

    expect(threeWayMergeState(base, local, remote).authSessions).toEqual([
      { id: 'session-base', userId: 'user-1' },
      { id: 'session-remote', userId: 'user-3' },
      { id: 'session-local', userId: 'user-2' },
    ]);
  });

  it('applies a local deletion without discarding a concurrent remote addition', () => {
    const base = { findings: [{ id: 'find-1' }, { id: 'find-2' }] };
    const local = { findings: [{ id: 'find-2' }] };
    const remote = { findings: [...base.findings, { id: 'find-3' }] };

    expect(threeWayMergeState(base, local, remote).findings).toEqual([
      { id: 'find-2' },
      { id: 'find-3' },
    ]);
  });

  it('merges disjoint fields of the same entity, including a concurrent SLA projection', () => {
    const base = { findings: [{ id: 'find-1', errorTitle: 'Cũ', slaStatus: 'ON_TRACK', version: 1 }] };
    const local = { findings: [{ id: 'find-1', errorTitle: 'Đã sửa', slaStatus: 'ON_TRACK', version: 2 }] };
    const remote = { findings: [{ id: 'find-1', errorTitle: 'Cũ', slaStatus: 'OVERDUE', version: 1 }] };

    expect(threeWayMergeState(base, local, remote).findings[0]).toEqual({
      id: 'find-1',
      errorTitle: 'Đã sửa',
      slaStatus: 'OVERDUE',
      version: 2,
    });
  });

  it('uses the finding-follow composite key when records have no id', () => {
    const base = { findingFollows: [] as Array<{ userId: string; findingId: string }> };
    const local = { findingFollows: [{ userId: 'user-1', findingId: 'find-1' }] };
    const remote = { findingFollows: [{ userId: 'user-2', findingId: 'find-1' }] };

    expect(threeWayMergeState(base, local, remote).findingFollows).toHaveLength(2);
  });

  it('treats undefined properties as omitted because PostgreSQL JSONB drops them', () => {
    const base = { appUsers: [] as Array<{ id: string; phone?: string }> };
    const local = { appUsers: [{ id: 'user-1', phone: undefined }] };
    const remote = { appUsers: [{ id: 'user-1' }] };

    expect(threeWayMergeState(base, local, remote)).toEqual({ appUsers: [{ id: 'user-1' }] });
  });

  it('fails closed when both instances change the same scalar incompatibly', () => {
    const base = { campaigns: [{ id: 'campaign-1', status: 'DRAFT' }] };
    const local = { campaigns: [{ id: 'campaign-1', status: 'ACTIVE' }] };
    const remote = { campaigns: [{ id: 'campaign-1', status: 'ARCHIVED' }] };

    expect(() => threeWayMergeState(base, local, remote)).toThrow(StateMergeConflictError);
    expect(() => threeWayMergeState(base, local, remote)).toThrow(/campaigns.*campaign-1.*status/i);
  });
});

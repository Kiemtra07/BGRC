import { describe, expect, it } from 'vitest';
import { branchScopeTypeForRole, hasFindingAccess } from '../../server/src/security/access-control';
import type { Finding, UserProfile, UserRole } from '../../shared/contracts';

/**
 * Data scoping is the rule that keeps one chi nhánh — and now one phòng — from reading another's
 * hồ sơ. It used to be asserted nowhere, which is how `scopeType: 'DEPARTMENT'` shipped supported
 * by the checker but never produced by the code that creates accounts.
 */

const finding = (over: Partial<Finding>): Finding => ({
  id: 'find-x', cif: '1', customerName: 'KH', clusterName: 'Cụm Tây Nguyên',
  branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng QLKH 1',
  errorCode: 'TD01.01', errorTitle: 'Lỗi', description: '', workflowStatus: 'PENDING',
  slaStatus: 'ON_TRACK', isOverdue: false, createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', version: 1, evidences: [], subItems: [],
  ...over,
} as Finding);

const user = (primaryRole: UserRole, over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1', username: 'u1', email: 'u1@bidv.com.vn', fullName: 'U1', portal: 'BRANCH',
  roles: [primaryRole], primaryRole, isActive: true,
  clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
  department: 'Phòng QLKH 1',
  scopes: [{
    scopeType: branchScopeTypeForRole(primaryRole),
    orgUnitCode: '635', clusterName: 'Cụm Tây Nguyên',
    branchName: 'Chi nhánh Nam Buôn Hồ', departmentName: 'Phòng QLKH 1',
  }],
  ...over,
} as UserProfile);

describe('phạm vi dữ liệu theo chi nhánh và phòng', () => {
  it('gives capture staff department scope and reviewers whole-branch scope', () => {
    expect(branchScopeTypeForRole('BRANCH_INPUT')).toBe('DEPARTMENT');
    expect(branchScopeTypeForRole('BRANCH_CONTROLLER')).toBe('BRANCH');
    expect(branchScopeTypeForRole('BRANCH_LEADER')).toBe('BRANCH');
  });

  it('never lets a branch account read another branch', () => {
    for (const role of ['BRANCH_INPUT', 'BRANCH_CONTROLLER', 'BRANCH_LEADER'] as const) {
      expect(hasFindingAccess(user(role), finding({ branchCode: '102', branchName: 'Chi nhánh Hà Nội' }))).toBe(false);
    }
  });

  it('hides another phòng from a cán bộ chi nhánh', () => {
    const officer = user('BRANCH_INPUT');
    expect(hasFindingAccess(officer, finding({ department: 'Phòng QLKH 1' }))).toBe(true);
    expect(hasFindingAccess(officer, finding({ department: 'Phòng QLKH 2' }))).toBe(false);
  });

  it('keeps every phòng visible to kiểm soát and lãnh đạo chi nhánh', () => {
    // A department-limited reviewer could not approve most of the branch queue.
    for (const role of ['BRANCH_CONTROLLER', 'BRANCH_LEADER'] as const) {
      expect(hasFindingAccess(user(role), finding({ department: 'Phòng QLKH 2' }))).toBe(true);
    }
  });

  it('shows a hồ sơ with no phòng to the whole branch', () => {
    // Otherwise an unassigned hồ sơ would be invisible to every officer at the branch.
    expect(hasFindingAccess(user('BRANCH_INPUT'), finding({ department: undefined }))).toBe(true);
    expect(hasFindingAccess(user('BRANCH_INPUT'), finding({ department: '' }))).toBe(true);
  });

  it('still refuses an unassigned hồ sơ belonging to another branch', () => {
    expect(hasFindingAccess(user('BRANCH_INPUT'), finding({ department: undefined, branchCode: '102' }))).toBe(false);
  });

  it('lets an ALL scope read everything and a disabled account read nothing', () => {
    const internal = user('INTERNAL_OFFICER', { portal: 'INTERNAL', scopes: [{ scopeType: 'ALL' }] });
    expect(hasFindingAccess(internal, finding({ branchCode: '999', department: 'Phòng lạ' }))).toBe(true);
    expect(hasFindingAccess({ ...internal, isActive: false }, finding({}))).toBe(false);
  });
});

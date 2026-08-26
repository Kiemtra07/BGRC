import { describe, expect, it } from 'vitest';
import {
  COPLUS_ROLE_CATALOG,
  COPLUS_ROLE_CODES,
  CreateUserSchema,
  capabilitiesForCoPlusRole,
  coplusRoleLabel,
  inferCoPlusRole,
} from '../../shared/contracts';

const BRANCH_CAPABILITIES = new Set(['BRANCH_INPUT', 'BRANCH_CONTROLLER']);
const INTERNAL_CAPABILITIES = new Set(['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER']);

describe('CoPlus role codes', () => {
  it('covers every published code exactly once and labels each one', () => {
    expect(COPLUS_ROLE_CATALOG.map(role => role.code).sort()).toEqual([...COPLUS_ROLE_CODES].sort());
    expect(COPLUS_ROLE_CATALOG.every(role => role.label.trim().length > 0)).toBe(true);
    expect(COPLUS_ROLE_CATALOG.every(role => role.capabilities.length > 0)).toBe(true);
    expect(coplusRoleLabel('CB1_KTGSTT')).toContain('tham gia đoàn');
    expect(coplusRoleLabel(undefined)).toBe('Chưa gán vai trò CoPlus');
  });

  it('never mixes branch and internal capabilities in one role', () => {
    // A user belongs to exactly one portal, and CreateUserSchema refuses accounts holding both
    // kinds of capability — so a role granting both could never be assigned to anybody.
    for (const role of COPLUS_ROLE_CATALOG) {
      const branch = role.capabilities.filter(capability => BRANCH_CAPABILITIES.has(capability));
      const internal = role.capabilities.filter(capability => INTERNAL_CAPABILITIES.has(capability));
      expect(`${role.code}: ${branch.length > 0 && internal.length > 0}`).toBe(`${role.code}: false`);
    }
  });

  it('accepts a user whose roles cover the CoPlus code and rejects one that does not', () => {
    const base = {
      email: 'lyltk1@bidv.com.vn',
      fullName: 'Lê Trần Khánh Ly',
      portal: 'BRANCH' as const,
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      department: 'Phòng Kiểm soát chi nhánh',
    };

    expect(CreateUserSchema.safeParse({
      ...base, roles: ['BRANCH_CONTROLLER'], primaryRole: 'BRANCH_CONTROLLER', coplusRole: 'CB_GSKT_TH',
    }).success).toBe(true);

    const mismatch = CreateUserSchema.safeParse({
      ...base, roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', coplusRole: 'CB_GSKT_TH',
    });
    expect(mismatch.success).toBe(false);
    expect(mismatch.success === false && mismatch.error.issues.some(issue => issue.message.includes('BRANCH_CONTROLLER'))).toBe(true);
  });

  it('infers a code for accounts recorded before CoPlus codes existed', () => {
    expect(capabilitiesForCoPlusRole('GD_KTGSTT')).toEqual(expect.arrayContaining(['INTERNAL_APPROVER', 'SUPERVISOR']));
    expect(inferCoPlusRole(['INTERNAL_APPROVER', 'SUPERVISOR'])).toBe('GD_KTGSTT');
    expect(inferCoPlusRole(['BRANCH_INPUT'])).toBe('CBHT_CN');
    expect(inferCoPlusRole([])).toBeUndefined();
  });
});

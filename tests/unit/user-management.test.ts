import { describe, expect, it } from 'vitest';
import { CreateUserSchema } from '../../shared/contracts';

describe('User management contracts', () => {
  it('allows a user to be created before organizational routing is known', () => {
    const result = CreateUserSchema.safeParse({
      email: 'branch.awaiting.assignment@bank.com.vn',
      fullName: 'Cán bộ chờ phân công',
      portal: 'BRANCH',
      roles: ['BRANCH_INPUT'],
      primaryRole: 'BRANCH_INPUT',
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it('allows partial branch routing at cluster or branch level', () => {
    const clusterOnly = CreateUserSchema.safeParse({
      email: 'branch.cluster-only@bank.com.vn',
      fullName: 'Cán bộ mới theo cụm',
      portal: 'BRANCH',
      roles: ['BRANCH_INPUT'],
      primaryRole: 'BRANCH_INPUT',
      clusterName: 'Cụm Tây Nguyên',
      isActive: true,
    });
    const branchOnly = CreateUserSchema.safeParse({
      email: 'branch.branch-only@bank.com.vn',
      fullName: 'Cán bộ mới theo chi nhánh',
      portal: 'BRANCH',
      roles: ['BRANCH_INPUT'],
      primaryRole: 'BRANCH_INPUT',
      branchCode: '635',
      isActive: true,
    });

    expect(clusterOnly.success).toBe(true);
    expect(branchOnly.success).toBe(true);
  });

  it('rejects a department assignment that cannot be tied to a branch', () => {
    const result = CreateUserSchema.safeParse({
      email: 'branch.department-only@bank.com.vn',
      fullName: 'Cán bộ thiếu chi nhánh',
      portal: 'BRANCH',
      roles: ['BRANCH_INPUT'],
      primaryRole: 'BRANCH_INPUT',
      department: 'Phòng QLKH 1',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });

  it('requires an internal team for operational internal users', () => {
    const result = CreateUserSchema.safeParse({
      email: 'member.audit@bank.com.vn',
      fullName: 'Nguyễn Thành Viên',
      portal: 'INTERNAL',
      roles: ['INTERNAL_OFFICER'],
      primaryRole: 'INTERNAL_OFFICER',
      teamRole: 'MEMBER',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });

  it('requires the internal approver to be the team lead', () => {
    const result = CreateUserSchema.safeParse({
      email: 'lead.audit@bank.com.vn',
      fullName: 'Trần Trưởng Nhóm',
      portal: 'INTERNAL',
      roles: ['INTERNAL_APPROVER'],
      primaryRole: 'INTERNAL_APPROVER',
      internalTeamId: 'org-team-credit-audit',
      teamRole: 'MEMBER',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });

  it('does not define any cluster approval role', () => {
    const result = CreateUserSchema.safeParse({
      email: 'cluster.approver@bank.com.vn',
      fullName: 'Người Duyệt Cụm',
      portal: 'BRANCH',
      roles: ['CLUSTER_APPROVER'],
      primaryRole: 'CLUSTER_APPROVER',
      clusterName: 'Cụm Tây Nguyên',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});

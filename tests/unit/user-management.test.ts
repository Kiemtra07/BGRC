import { describe, expect, it } from 'vitest';
import { CreateUserSchema } from '../../shared/contracts';

describe('User management contracts', () => {
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

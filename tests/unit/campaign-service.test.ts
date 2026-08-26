import { describe, expect, it } from 'vitest';
import { canAccessCampaign, validateCampaignTransition } from '../../server/src/modules/campaigns/campaign-service';
import { AuditCampaign, UserProfile } from '../../shared/contracts';

const user = (id: string, roles: UserProfile['roles'], branchCode?: string): UserProfile => ({
  id, username: id, email: `${id}@bank.com.vn`, fullName: id, portal: branchCode ? 'BRANCH' : 'INTERNAL',
  roles, primaryRole: roles[0], isActive: true, scopes: branchCode ? [{ scopeType: 'BRANCH', orgUnitCode: branchCode }] : [{ scopeType: 'ALL' }], branchCode,
});

const campaign: AuditCampaign = {
  id: 'campaign-1', code: 'CD-01', name: 'Kiểm tra tín dụng', decisionNo: '01/QĐ-KT',
  startDate: '2026-08-01', endDate: '2026-08-31', status: 'ACTIVE', leadUserId: 'lead',
  members: [
    { userId: 'lead', memberRole: 'LEAD', assignedBranchCodes: ['635', '428'] },
    { userId: 'officer', memberRole: 'MEMBER', assignedBranchCodes: ['635'] },
  ],
  branchCodes: ['635', '428'], reportChannelIds: ['chan-audit-bgs'], driveProvisionStatus: 'NOT_CONFIGURED',
  version: 1, createdByUserId: 'admin', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};

describe('campaign access and lifecycle', () => {
  it('allows admin, assigned members and scoped branches only', () => {
    expect(canAccessCampaign(user('admin', ['ADMIN']), campaign)).toBe(true);
    expect(canAccessCampaign(user('officer', ['INTERNAL_OFFICER']), campaign)).toBe(true);
    expect(canAccessCampaign(user('outsider', ['INTERNAL_OFFICER']), campaign)).toBe(false);
    expect(canAccessCampaign(user('branch', ['BRANCH_INPUT'], '635'), campaign)).toBe(true);
    expect(canAccessCampaign(user('branch-other', ['BRANCH_INPUT'], '102'), campaign)).toBe(false);
  });

  it('requires closing before archiving', () => {
    expect(() => validateCampaignTransition('ACTIVE', 'ARCHIVED')).toThrow('CAMPAIGN_MUST_BE_CLOSED');
    expect(() => validateCampaignTransition('CLOSED', 'ARCHIVED')).not.toThrow();
  });
});

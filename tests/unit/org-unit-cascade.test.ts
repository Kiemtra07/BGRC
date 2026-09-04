import { describe, expect, it } from 'vitest';
import { cascadeOrgUnitChange } from '../../server/src/modules/org-unit-cascade';
import type { AuditCampaign, Finding, OrgUnit, UserProfile } from '../../shared/contracts';

const units: OrgUnit[] = [
  { id: 'ho', code: 'HO', name: 'Hội sở', type: 'HEAD_OFFICE', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cluster-old', code: 'CUM-OLD', name: 'Cụm cũ', type: 'CLUSTER', parentId: 'ho', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'branch-old', code: 'CN-OLD', name: 'Chi nhánh cũ', type: 'BRANCH', parentId: 'cluster-old', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'dept-old', code: 'PGD-OLD', name: 'Phòng cũ', type: 'DEPARTMENT', parentId: 'branch-old', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cluster-new', code: 'CUM-NEW', name: 'Cụm mới', type: 'CLUSTER', parentId: 'ho', isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const user = { id: 'u-1', username: 'u1', email: 'u1@example.com', fullName: 'Người dùng', portal: 'BRANCH', roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', isActive: true, scopes: [{ scopeType: 'DEPARTMENT', orgUnitId: 'dept-old', orgUnitCode: 'CN-OLD', clusterName: 'Cụm cũ', branchName: 'Chi nhánh cũ', departmentName: 'Phòng cũ' }], orgUnitId: 'dept-old', branchCode: 'CN-OLD', branchName: 'Chi nhánh cũ', clusterName: 'Cụm cũ', department: 'Phòng cũ' } as UserProfile;
const finding = { id: 'f-1', campaignId: 'campaign-1', channelId: 'ch', channelCode: 'CH', channelName: 'Kênh', channelVersionId: 'v', workflowVersionId: 'w', slaPolicyVersionId: 's', cif: '1', customerName: 'Khách', clusterName: 'Cụm cũ', branchCode: 'CN-OLD', branchName: 'Chi nhánh cũ', department: 'Phòng cũ', errorCode: 'E1', errorTitle: 'Lỗi', description: 'Mô tả', quantity: 1, exposureAmount: 1, creditBalance: 1, workflowStatus: 'PENDING', slaStatus: 'ON_TRACK', version: 1, deadlineDate: '2026-12-01', isOverdue: false, evidenceCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' } as Finding;
const campaign = { id: 'campaign-1', code: 'CD', name: 'Chuyên đề', decisionNo: '1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE', leadUserId: 'u-1', members: [{ userId: 'u-1', memberRole: 'MEMBER', assignedBranchCodes: ['CN-OLD'] }], branchCodes: ['CN-OLD'], reportChannelIds: ['ch'], driveProvisionStatus: 'NOT_CONFIGURED', version: 1, createdByUserId: 'u-1', createdAt: '2026-01-01', updatedAt: '2026-01-01' } as AuditCampaign;

describe('organization unit reference cascade', () => {
  it('moves a branch code/name through users, scopes, findings, campaigns and workspace targets', () => {
    const accepted = [{ id: 'target', userId: 'u-1', targetType: 'BRANCH', clusterName: 'Cụm cũ', branchCode: 'CN-OLD', createdAt: '2026-01-01' }] as any[];
    cascadeOrgUnitChange(units[2], { ...units[2], code: 'CN-NEW', name: 'Chi nhánh mới', parentId: 'cluster-new' }, { orgUnits: units, users: [user], findings: [finding], campaigns: [campaign], acceptedTargets: accepted, watchTargets: [], now: '2026-09-04T00:00:00.000Z' });
    expect(user).toMatchObject({ branchCode: 'CN-NEW', branchName: 'Chi nhánh mới', clusterName: 'Cụm mới' });
    expect(user.scopes[0]).toMatchObject({ orgUnitCode: 'CN-NEW', branchName: 'Chi nhánh mới', clusterName: 'Cụm mới' });
    expect(finding).toMatchObject({ branchCode: 'CN-NEW', branchName: 'Chi nhánh mới', clusterName: 'Cụm mới' });
    expect(campaign.branchCodes).toEqual(['CN-NEW']);
    expect(campaign.members[0].assignedBranchCodes).toEqual(['CN-NEW']);
    expect(accepted[0]).toMatchObject({ branchCode: 'CN-NEW', clusterName: 'Cụm mới' });
  });

  it('renames a department without losing its assignment identity', () => {
    finding.branchCode = 'CN-OLD';
    finding.department = 'Phòng cũ';
    cascadeOrgUnitChange(units[3], { ...units[3], name: 'Phòng mới' }, { orgUnits: units, users: [user], findings: [finding], campaigns: [], acceptedTargets: [], watchTargets: [], now: '2026-09-04T00:00:00.000Z' });
    expect(user).toMatchObject({ orgUnitId: 'dept-old', department: 'Phòng mới' });
    expect(user.scopes[0].departmentName).toBe('Phòng mới');
    expect(finding.department).toBe('Phòng mới');
  });
});

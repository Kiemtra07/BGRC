import { AuditCampaign, AuditCampaignStatus, UserProfile } from '../../../../shared/contracts';

export function canAccessCampaign(user: UserProfile, campaign: AuditCampaign): boolean {
  if (!user.isActive || campaign.status === 'ARCHIVED') return false;
  if (user.roles.includes('ADMIN')) return true;
  if (campaign.members.some(member => member.userId === user.id)) return true;
  return Boolean(user.branchCode && campaign.branchCodes.includes(user.branchCode));
}

export function validateCampaignTransition(from: AuditCampaignStatus, to: AuditCampaignStatus): void {
  if (from === to) return;
  if (to === 'ARCHIVED' && from !== 'CLOSED') throw new Error('CAMPAIGN_MUST_BE_CLOSED');
  const allowed: Record<AuditCampaignStatus, AuditCampaignStatus[]> = {
    DRAFT: ['ACTIVE'], ACTIVE: ['CLOSED'], CLOSED: ['ARCHIVED', 'ACTIVE'], ARCHIVED: [],
  };
  if (!allowed[from].includes(to)) throw new Error('CAMPAIGN_TRANSITION_INVALID');
}

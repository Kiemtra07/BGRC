import type { AuditCampaign, Finding, OrgUnit, UserProfile, WorkspaceTargetCommandDTO } from '../../../shared/contracts';

export interface OrgUnitCascadeTarget extends WorkspaceTargetCommandDTO {
  id: string;
  userId: string;
  createdAt: string;
  isPriority?: boolean;
  prioritizedAt?: string;
}

export interface OrgUnitCascadeCollections {
  orgUnits: readonly OrgUnit[];
  users: UserProfile[];
  findings: Finding[];
  campaigns: AuditCampaign[];
  acceptedTargets: OrgUnitCascadeTarget[];
  watchTargets: OrgUnitCascadeTarget[];
  now: string;
}

function branchBelongsToCluster(orgUnits: readonly OrgUnit[], branchCode: string | undefined, clusterId: string): boolean {
  const branch = orgUnits.find(unit => unit.type === 'BRANCH' && unit.code === branchCode);
  return branch?.parentId === clusterId;
}

/** Cascade identifiers and display names so changing an org unit does not orphan live records. */
export function cascadeOrgUnitChange(current: OrgUnit, next: OrgUnit, collections: OrgUnitCascadeCollections): void {
  const { orgUnits, users, findings, campaigns, acceptedTargets, watchTargets, now } = collections;
  const nextClusterName = next.type === 'BRANCH' && next.parentId
    ? orgUnits.find(unit => unit.id === next.parentId)?.name
    : next.type === 'CLUSTER' ? next.name : undefined;
  const parentBranchCode = current.type === 'DEPARTMENT'
    ? orgUnits.find(unit => unit.id === current.parentId)?.code
    : undefined;

  for (const user of users) {
    if (current.type === 'INTERNAL_TEAM' && user.internalTeamId === current.id) {
      user.internalTeamName = next.name;
    }
    if (current.type === 'CLUSTER' && (user.clusterName === current.name || branchBelongsToCluster(orgUnits, user.branchCode, current.id))) {
      user.clusterName = next.name;
      user.scopes = user.scopes.map(scope => scope.clusterName === current.name ? { ...scope, clusterName: next.name } : scope);
    }
    if (current.type === 'BRANCH' && user.branchCode === current.code) {
      user.branchCode = next.code;
      user.branchName = next.name;
      if (nextClusterName) user.clusterName = nextClusterName;
      user.scopes = user.scopes.map(scope => scope.orgUnitCode === current.code
        ? { ...scope, orgUnitCode: next.code, branchName: next.name, clusterName: nextClusterName }
        : scope);
    }
    if (current.type === 'DEPARTMENT' && (user.orgUnitId === current.id || (user.branchCode === parentBranchCode && user.department === current.name))) {
      user.orgUnitId = next.id;
      user.department = next.name;
      user.scopes = user.scopes.map(scope => scope.orgUnitId === current.id || scope.departmentName === current.name
        ? { ...scope, orgUnitId: next.id, departmentName: next.name }
        : scope);
    }
  }

  for (const finding of findings) {
    let changed = false;
    if (current.type === 'CLUSTER' && (finding.clusterName === current.name || branchBelongsToCluster(orgUnits, finding.branchCode, current.id))) {
      finding.clusterName = next.name;
      changed = true;
    }
    if (current.type === 'BRANCH' && finding.branchCode === current.code) {
      finding.branchCode = next.code;
      finding.branchName = next.name;
      if (nextClusterName) finding.clusterName = nextClusterName;
      changed = true;
    }
    if (current.type === 'DEPARTMENT' && finding.branchCode === parentBranchCode && finding.department === current.name) {
      finding.department = next.name;
      changed = true;
    }
    if (changed) finding.updatedAt = now;
  }

  for (const campaign of campaigns) {
    if (current.type !== 'BRANCH' || !campaign.branchCodes.includes(current.code)) continue;
    campaign.branchCodes = campaign.branchCodes.map(code => code === current.code ? next.code : code);
    campaign.members = campaign.members.map(member => ({
      ...member,
      assignedBranchCodes: member.assignedBranchCodes.map(code => code === current.code ? next.code : code),
    }));
    campaign.version += 1;
    campaign.updatedAt = now;
  }

  for (const target of [...acceptedTargets, ...watchTargets]) {
    if (current.type === 'CLUSTER' && target.clusterName === current.name) target.clusterName = next.name;
    if (current.type === 'BRANCH' && target.branchCode === current.code) {
      target.branchCode = next.code;
      if (nextClusterName) target.clusterName = nextClusterName;
    }
  }
}

import type {
  ApprovalAssignmentStage,
  Finding,
  FindingApprovalRoute,
  UserProfile,
} from '../../../../shared/contracts';
import { hasFindingAccess } from '../../security/access-control';

export type ApprovalWorkflowType = 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER';

export interface ApprovalCandidates {
  branchControllers: UserProfile[];
  branchLeaders: UserProfile[];
  internalApprovers: UserProfile[];
}

/**
 * Resolve eligible approvers from the finding scope. Keeping this policy independent of Fastify
 * makes the same branch and role rules available to submission, reassignment, and direct tests.
 */
export function approvalCandidatesForFinding(
  finding: Pick<Finding, 'branchCode' | 'branchName' | 'clusterName' | 'department'>,
  users: ReadonlyArray<UserProfile>,
): ApprovalCandidates {
  const branchUsers = users.filter(user => user.isActive && user.branchCode === finding.branchCode);
  return {
    branchControllers: branchUsers.filter(user => user.roles.includes('BRANCH_CONTROLLER')),
    branchLeaders: branchUsers.filter(user => user.roles.includes('BRANCH_LEADER')),
    internalApprovers: users.filter(user =>
      user.isActive
      && (user.roles.includes('INTERNAL_APPROVER') || user.roles.includes('SUPERVISOR'))
      && hasFindingAccess(user, finding as Finding),
    ),
  };
}

/**
 * A submitter must not become the approver of their own finding. Delegation is
 * deliberately not inferred here: when no independent person is available,
 * the caller must stop the route and ask an administrator to assign one.
 */
export function selectIndependentApprover(
  submittingUserId: string,
  candidates: ReadonlyArray<{ id: string }>,
): string | undefined {
  return candidates.find(candidate => candidate.id !== submittingUserId)?.id;
}

/**
 * Return a fixed route only when every required branch approver is independent from the submitter.
 * The HTTP layer maps an unresolved route to its public problem response.
 */
export function resolveApprovalRoute(
  finding: Pick<Finding, 'branchCode' | 'branchName' | 'clusterName' | 'department' | 'isSpecialCase'>,
  workflowType: ApprovalWorkflowType,
  actor: Pick<UserProfile, 'id'>,
  users: ReadonlyArray<UserProfile>,
  assignedAt: string,
): FindingApprovalRoute | undefined {
  const candidates = approvalCandidatesForFinding(finding, users);
  const requiresBranchLeaderApproval = workflowType === 'THREE_TIER' || Boolean(finding.isSpecialCase);
  const branchControllerUserId = selectIndependentApprover(actor.id, candidates.branchControllers);
  const branchLeaderUserId = requiresBranchLeaderApproval
    ? selectIndependentApprover(actor.id, candidates.branchLeaders)
    : undefined;
  if (!branchControllerUserId || (requiresBranchLeaderApproval && !branchLeaderUserId)) return undefined;
  return {
    branchControllerUserId,
    branchLeaderUserId,
    internalApproverUserId: undefined,
    requiresBranchLeaderApproval,
    assignedByUserId: actor.id,
    assignedAt,
  };
}

export function reassignApprovalStage(
  route: FindingApprovalRoute,
  stage: ApprovalAssignmentStage,
  assignedUserId: string,
  record: { actorUserId: string; reason: string; assignedAt: string; validUntil?: string },
): FindingApprovalRoute {
  const fieldByStage = {
    BRANCH_CONTROLLER: 'branchControllerUserId',
    BRANCH_LEADER: 'branchLeaderUserId',
    INTERNAL_APPROVER: 'internalApproverUserId',
  } as const;
  const field = fieldByStage[stage];
  const previousUserId = route[field];
  return {
    ...route,
    [field]: assignedUserId,
    assignmentHistory: [
      ...(route.assignmentHistory ?? []),
      {
        stage,
        previousUserId,
        assignedUserId,
        assignedByUserId: record.actorUserId,
        reason: record.reason,
        assignedAt: record.assignedAt,
        validUntil: record.validUntil,
      },
    ],
  };
}

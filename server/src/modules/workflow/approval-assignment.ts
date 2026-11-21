import type {
  ApprovalAssignmentStage,
  Finding,
  FindingApprovalRoute,
  UserProfile,
  WorkflowStatus,
} from '../../../../shared/contracts';
import { hasFindingAccess } from '../../security/access-control';

export type ApprovalWorkflowType = 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER';

export interface ApprovalCandidates {
  branchControllers: UserProfile[];
  branchLeaders: UserProfile[];
  internalApprovers: UserProfile[];
}

/** Người duyệt đủ điều kiện theo phạm vi hồ sơ. Tách khỏi Fastify để nộp, giao lại và test dùng chung một quy tắc. */
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

/** Người nộp không được duyệt hồ sơ của mình. Không có người độc lập thì trả về `undefined`; người gọi dừng tuyến và nhờ quản trị viên chỉ định. */
export function selectIndependentApprover(
  submittingUserId: string,
  candidates: ReadonlyArray<{ id: string }>,
): string | undefined {
  return candidates.find(candidate => candidate.id !== submittingUserId)?.id;
}

const fieldByStage = {
  BRANCH_CONTROLLER: 'branchControllerUserId',
  BRANCH_LEADER: 'branchLeaderUserId',
  INTERNAL_APPROVER: 'internalApproverUserId',
} as const;

/** Bước phê duyệt đang chờ xử lý ứng với một trạng thái hồ sơ. */
export function approvalStageForStatus(status: WorkflowStatus): ApprovalAssignmentStage | undefined {
  switch (status) {
    case 'SUBMITTED_BRANCH': return 'BRANCH_CONTROLLER';
    case 'SUBMITTED_BRANCH_LEADER': return 'BRANCH_LEADER';
    case 'SUBMITTED_INTERNAL': return 'INTERNAL_APPROVER';
    default: return undefined;
  }
}

const stageOrder: readonly ApprovalAssignmentStage[] = ['BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER'];

export interface HeldApprovalStage {
  finding: Finding;
  stage: ApprovalAssignmentStage;
  /** `true` khi hồ sơ đang chờ chính bước này; `false` khi bước này còn ở phía sau. */
  isCurrentStage: boolean;
}

/**
 * Các bước duyệt, đang chờ hoặc còn ở phía sau, mà người dùng được ghim giữ trên những hồ sơ chưa
 * đóng. Hồ sơ đang ở chi nhánh khắc phục (`PENDING`, `REJECTED`) không tính: tuyến của chúng được
 * dựng lại khi nộp, và người không còn hợp lệ tự bị loại.
 */
export function approvalStagesHeldBy(findings: readonly Finding[], userId: string): HeldApprovalStage[] {
  const held: HeldApprovalStage[] = [];
  for (const finding of findings) {
    const current = approvalStageForStatus(finding.workflowStatus);
    const route = finding.approvalRoute;
    if (!current || !route) continue;
    const leaderApplies = route.requiresBranchLeaderApproval || Boolean(finding.isSpecialCase);
    for (const stage of stageOrder.slice(stageOrder.indexOf(current))) {
      if (stage === 'BRANCH_LEADER' && !leaderApplies) continue;
      if (route[fieldByStage[stage]] === userId) held.push({ finding, stage, isCurrentStage: stage === current });
    }
  }
  return held;
}

/**
 * Những người được chọn làm người nhận của một bước. Một người không được giữ hai bước của cùng một
 * tuyến, nên loại người đang chuyển, người nộp và những ai đã giữ các bước đứng trước.
 */
export function eligibleRecipientsForStage(
  finding: Pick<Finding, 'branchCode' | 'branchName' | 'clusterName' | 'department'>,
  stage: ApprovalAssignmentStage,
  actorUserId: string,
  route: FindingApprovalRoute | undefined,
  users: ReadonlyArray<UserProfile>,
): UserProfile[] {
  const candidates = approvalCandidatesForFinding(finding, users);
  const pool = stage === 'BRANCH_CONTROLLER'
    ? candidates.branchControllers
    : stage === 'BRANCH_LEADER' ? candidates.branchLeaders : candidates.internalApprovers;
  const taken = new Set<string>([actorUserId]);
  if (route?.assignedByUserId) taken.add(route.assignedByUserId);
  if (stage !== 'BRANCH_CONTROLLER' && route?.branchControllerUserId) taken.add(route.branchControllerUserId);
  if (stage === 'INTERNAL_APPROVER' && route?.branchLeaderUserId) taken.add(route.branchLeaderUserId);
  return pool.filter(user => !taken.has(user.id));
}

/** Người được ghim ở một bước của tuyến; `undefined` khi bước đó chưa chỉ định ai (Hội sở dùng hàng chờ chung). */
export function pinnedApproverForStage(route: FindingApprovalRoute | undefined, stage: ApprovalAssignmentStage): string | undefined {
  return route?.[fieldByStage[stage]];
}

/** Ghi người nhận vào đúng bước của tuyến, giữ nguyên người nộp và lịch sử giao lại. */
export function pinStageApprover(
  route: FindingApprovalRoute | undefined,
  stage: ApprovalAssignmentStage,
  userId: string,
  assignedAt: string,
): FindingApprovalRoute {
  const base: FindingApprovalRoute = route ?? {
    requiresBranchLeaderApproval: stage === 'BRANCH_LEADER',
    assignedAt,
  };
  return { ...base, [fieldByStage[stage]]: userId };
}

/** Các bước nhận hồ sơ của một tuyến theo loại luồng; bước Lãnh đạo chi nhánh có ở luồng ba cấp hoặc khi hồ sơ có dấu sao. */
export function routeStagesFor(workflowType: ApprovalWorkflowType, isSpecialCase: boolean): ApprovalAssignmentStage[] {
  if (workflowType === 'ONE_TIER') return ['INTERNAL_APPROVER'];
  return workflowType === 'THREE_TIER' || isSpecialCase
    ? ['BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER']
    : ['BRANCH_CONTROLLER', 'INTERNAL_APPROVER'];
}

const workflowTypeRank: Record<ApprovalWorkflowType, number> = { ONE_TIER: 1, TWO_TIER: 2, THREE_TIER: 3 };

export function strictestWorkflowType(left: ApprovalWorkflowType, right: ApprovalWorkflowType): ApprovalWorkflowType {
  return workflowTypeRank[right] > workflowTypeRank[left] ? right : left;
}

/**
 * Loại luồng hiệu lực khi nộp: loại báo cáo cấu hình là mức tối thiểu, bước kiểm soát người nộp chọn
 * thêm (Kiểm soát, Lãnh đạo chi nhánh) chỉ làm tuyến chặt hơn. Chọn Lãnh đạo kéo theo cả Kiểm soát.
 */
export function submitWorkflowType(
  configured: ApprovalWorkflowType,
  selections: Partial<Record<ApprovalAssignmentStage, string>>,
): ApprovalWorkflowType {
  const requested: ApprovalWorkflowType = selections.BRANCH_LEADER ? 'THREE_TIER' : selections.BRANCH_CONTROLLER ? 'TWO_TIER' : 'ONE_TIER';
  return strictestWorkflowType(configured, requested);
}

/** Bước kiểm soát có thể thêm vào tuyến đã cấu hình, theo thứ tự thêm. */
export function addableStagesFor(configured: ApprovalWorkflowType, isSpecialCase: boolean): ApprovalAssignmentStage[] {
  if (configured === 'ONE_TIER') return ['BRANCH_CONTROLLER', 'BRANCH_LEADER'];
  return configured === 'TWO_TIER' && !isSpecialCase ? ['BRANCH_LEADER'] : [];
}

export interface ApprovalRouteOptions {
  /** Người Kiểm soát chi nhánh do người nộp chọn; người gọi đã kiểm tra là hợp lệ. */
  controllerUserId?: string;
  /** Người Lãnh đạo chi nhánh do người nộp chọn; đã kiểm tra như trên. */
  leaderUserId?: string;
  /** Người phê duyệt Hội sở do người nộp chọn; để trống thì dùng hàng chờ chung. */
  internalApproverUserId?: string;
  /** Tuyến của lần nộp trước. Người đã chọn còn hợp lệ và lịch sử giao lại được giữ nguyên. */
  previous?: FindingApprovalRoute;
}

/** Chỉ trả về tuyến khi mọi người duyệt cấp chi nhánh đều độc lập với người nộp; tuyến không xác định được thì tầng HTTP báo lỗi. */
export function resolveApprovalRoute(
  finding: Pick<Finding, 'branchCode' | 'branchName' | 'clusterName' | 'department' | 'isSpecialCase'>,
  workflowType: ApprovalWorkflowType,
  actor: Pick<UserProfile, 'id'>,
  users: ReadonlyArray<UserProfile>,
  assignedAt: string,
  options: ApprovalRouteOptions = {},
): FindingApprovalRoute | undefined {
  const candidates = approvalCandidatesForFinding(finding, users);
  const requiresBranchLeaderApproval = workflowType === 'THREE_TIER' || Boolean(finding.isSpecialCase);
  const stillEligible = (pool: ReadonlyArray<{ id: string }>, userId?: string): string | undefined =>
    userId && userId !== actor.id && pool.some(candidate => candidate.id === userId) ? userId : undefined;

  // Người chọn rõ ràng được giữ nguyên; còn lại thử lần lượt để một tài khoản mang cả hai vai trò
  // không bị dồn vào cả bước Kiểm soát lẫn bước Lãnh đạo khi vẫn còn cách xếp tách biệt.
  const controllerChoices: string[] = options.controllerUserId
    ? [options.controllerUserId]
    : [...new Set([
      stillEligible(candidates.branchControllers, options.previous?.branchControllerUserId),
      ...candidates.branchControllers.filter(candidate => candidate.id !== actor.id).map(candidate => candidate.id),
    ].filter((id): id is string => Boolean(id)))];

  for (const branchControllerUserId of controllerChoices) {
    const leaderPool = candidates.branchLeaders.filter(candidate => candidate.id !== branchControllerUserId);
    const branchLeaderUserId = requiresBranchLeaderApproval
      ? options.leaderUserId ?? stillEligible(leaderPool, options.previous?.branchLeaderUserId) ?? selectIndependentApprover(actor.id, leaderPool)
      : undefined;
    if (requiresBranchLeaderApproval && !branchLeaderUserId) continue;
    const internalPool = candidates.internalApprovers.filter(candidate => candidate.id !== branchControllerUserId && candidate.id !== branchLeaderUserId);
    return {
      branchControllerUserId,
      branchLeaderUserId,
      internalApproverUserId: options.internalApproverUserId ?? stillEligible(internalPool, options.previous?.internalApproverUserId),
      requiresBranchLeaderApproval,
      assignedByUserId: actor.id,
      assignedAt,
      assignmentHistory: options.previous?.assignmentHistory,
    };
  }
  return undefined;
}

export function reassignApprovalStage(
  route: FindingApprovalRoute,
  stage: ApprovalAssignmentStage,
  assignedUserId: string,
  record: { actorUserId: string; reason: string; assignedAt: string; validUntil?: string },
): FindingApprovalRoute {
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

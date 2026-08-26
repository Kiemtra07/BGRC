import crypto from 'node:crypto';
import path from 'node:path';
import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { 
  UserProfile, 
  Finding, 
  ReportChannel, 
  OrgUnit, 
  ImportBatch, 
  EvidenceObject, 
  RevokeEvidenceSchema,
  canManageEvidenceAtBranch,
  WorkflowEvent,
  SlaExtensionRequest,
  DashboardSummary,
  BranchControlApproveCommandSchema,
  BranchControlRejectCommandSchema,
  BulkFindingImportSchema,
  CreateOrgUnitSchema,
  CreateUserSchema,
  InternalRejectCommandSchema,
  InternalWaiveCommandSchema,
  PaginationQuerySchema,
  SubmitBranchCommandSchema,
  WebFormFindingSchema,
  WebFormFindingDTO,
  ReportSummary,
  ReportDefinition,
  ReportFilterQuery,
  ReportFilterSchema,
  CreateReportDefinitionSchema,
  inferCoPlusRole,
  businessLineLabels,
  riskLevelLabels,
  REPORT_FIELD_CATALOG,
  REPORT_METRIC_CATALOG,
  REPORT_OPERATOR_CATALOG,
  ReportCatalog,
  ReportCatalogConfiguration,
  ReportFieldKey,
  ReportFilterRule,
  ReportMetricKey,
  ReportRunRequest,
  ReportRunRequestSchema,
  ReportRunResult,
  ReportExportRequestSchema,
  UpdateReportCatalogConfigurationSchema,
  AuditLogEntry,
  CreateFindingSubItemSchema,
  ReviewFindingSubItemsSchema,
  WorkspaceTarget,
  WorkspaceTargetCommandDTO,
  WorkspaceTargetCommandSchema,
  CreateReportChannelSchema,
  UpdateReportChannelSchema,
  ReportChannelVersion,
  LoginSchema,
  AuthSessionRecord,
  SetWorkspacePrioritySchema,
  AuditCampaign,
  CreateAuditCampaignSchema,
  UpdateAuditCampaignSchema,
} from '../../shared/contracts';
import { workflowService } from './modules/workflow/workflow-service';
import { EvidenceStorageStatus, googleDriveService } from './adapters/google-drive';
import { appsScriptDriveGateway } from './adapters/apps-script-drive';
import {
  createStateRepository,
  StateRepositoryStatus,
} from './repositories/state-repository';
import { DurableStateCoordinator } from './state/durable-state-coordinator';
import { threeWayMergeState } from './state/three-way-state-merge';
import { RuntimeRequestLock, shouldHydrateRuntimeStatePerRequest } from './state/runtime-request-lock';
import { addCalendarDays, runSlaEvaluation, slaWorker, toCalendarDateString } from './worker/sla-worker';
import { shouldStartEmbeddedSlaRuntime, startDailySlaRuntime } from './worker/sla-scheduler';
import { HttpProblem, normalizeProblem, sendProblem, workflowErrorToProblem } from './http/problem';
import { buildInlineContentDisposition } from './http/content-disposition';
import { FullReportExport, renderReportHtml, renderReportXlsx } from './report-export';
import {
  hasFindingAccess,
  requireAdmin,
  requireRoles,
  resolveLocalUser,
} from './security/access-control';
import { verifyPassword } from './security/password';
import { AuthSessionStore } from './security/session-store';
import { sortWatchTargets } from './modules/workspace/workspace-priority';
import { canAccessCampaign, validateCampaignTransition } from './modules/campaigns/campaign-service';

export const app: FastifyInstance = fastify({
  logger: process.env.NODE_ENV !== 'test',
});

// Register plugins
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.register(cors, { origin: allowedOrigins, credentials: true });
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max

const internalSlaPath = '/api/v1/internal/sla/run';
const publicPaths = new Set(['/api/v1/health', '/api/v1/ready', '/api/v1/auth/login', '/api/v1/auth/logout', internalSlaPath]);
const requestUsers = new WeakMap<FastifyRequest, UserProfile>();
let authSessionStore: AuthSessionStore;

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

app.addHook('preHandler', async (request) => {
  if (publicPaths.has(request.url.split('?')[0])) return;
  const allowTestUserHeader = process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_USER_HEADER !== 'false';
  const user = allowTestUserHeader && request.headers['x-user-id']
    ? resolveLocalUser(request.headers['x-user-id'], appUsers)
    : (() => {
      const session = authSessionStore.resolve(cookieValue(request, 'audit_bgs_session') ?? '');
      const sessionUser = session ? appUsers.find(item => item.id === session.userId && item.isActive) : undefined;
      if (!sessionUser) {
        throw new HttpProblem(401, 'AUTH_REQUIRED', 'Chưa xác thực', 'Vui lòng đăng nhập để tiếp tục.');
      }
      return sessionUser;
    })();
  requestUsers.set(request, user);
});

app.setErrorHandler((error, request, reply) => {
  const problem = normalizeProblem(error);
  if (problem.status >= 500) request.log.error(error);
  return sendProblem(reply, problem, request);
});

// ----------------------------------------------------
// STATE REPOSITORY (In-memory seeded state synced with schema)
// ----------------------------------------------------

let orgUnits: OrgUnit[] = [
  { id: 'org-ho', code: 'HO_AUDIT', name: 'Ban Kiểm Toán Nội Bộ & Hội Sở', type: 'HEAD_OFFICE', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-team-credit-audit', code: 'TEAM_CREDIT_AUDIT_01', name: 'Nhóm Kiểm toán Tín dụng 01', type: 'INTERNAL_TEAM', parentId: 'org-ho', leaderUserId: 'user-internal-supervisor', leaderName: 'Trần Lãnh Đạo (Giám Đốc Ban Kiểm Toán)', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-team-compliance', code: 'TEAM_COMPLIANCE_01', name: 'Nhóm Giám sát Tuân thủ 01', type: 'INTERNAL_TEAM', parentId: 'org-ho', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-cluster-tn', code: 'CUM_TAY_NGUYEN', name: 'Cụm Tây Nguyên', type: 'CLUSTER', parentId: 'org-ho', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-cluster-hcm', code: 'CUM_TPHCM', name: 'Cụm TP. Hồ Chí Minh', type: 'CLUSTER', parentId: 'org-ho', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-cluster-mb', code: 'CUM_MIEN_BAC', name: 'Cụm Miền Bắc', type: 'CLUSTER', parentId: 'org-ho', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-br-635', code: '635', name: 'Chi nhánh Nam Buôn Hồ', type: 'BRANCH', parentId: 'org-cluster-tn', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-br-428', code: '428', name: 'Chi nhánh Bình Tây Sài Gòn', type: 'BRANCH', parentId: 'org-cluster-hcm', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-br-102', code: '102', name: 'Chi nhánh Hà Nội', type: 'BRANCH', parentId: 'org-cluster-mb', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-dept-635-qlkh1', code: '635-QLKH1', name: 'Phòng QLKH 1', type: 'DEPARTMENT', parentId: 'org-br-635', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-dept-635-pgd1', code: '635-PGD-NBH1', name: 'PGD Nam Buôn Hồ 1', type: 'DEPARTMENT', parentId: 'org-br-635', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-dept-635-control', code: '635-KSCN', name: 'Phòng Kiểm soát chi nhánh', type: 'DEPARTMENT', parentId: 'org-br-635', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-dept-428-control', code: '428-KSCN', name: 'Phòng Kiểm soát chi nhánh', type: 'DEPARTMENT', parentId: 'org-br-428', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'org-dept-102-control', code: '102-KSCN', name: 'Phòng Kiểm soát chi nhánh', type: 'DEPARTMENT', parentId: 'org-br-102', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

/**
 * Demo directory. Names, usernames and role codes follow the CoPlus handbook so an account that
 * signs the Tiểu biên bản upstream is recognisably the same account that tracks its remediation
 * here. `roles` stays the capability set the workflow engine authorises against; `coplusRole` is
 * the code those capabilities are granted through.
 */
let appUsers: UserProfile[] = [
  {
    id: 'user-admin',
    username: 'admin.hethong',
    email: 'admin.hethong@bidv.com.vn',
    googleWorkspaceEmail: 'admin.hethong@bidv.com.vn',
    fullName: 'Quản trị hệ thống',
    portal: 'INTERNAL',
    roles: ['ADMIN'],
    primaryRole: 'ADMIN',
    coplusRole: 'ADMIN_HT',
    isActive: true,
    scopes: [{ scopeType: 'ALL' }],
  },
  {
    id: 'user-internal-supervisor',
    username: 'linhlbk',
    email: 'linhlbk@bidv.com.vn',
    googleWorkspaceEmail: 'linhlbk@bidv.com.vn',
    fullName: 'Lê Bá Khánh Linh',
    portal: 'INTERNAL',
    roles: ['SUPERVISOR', 'INTERNAL_APPROVER'],
    primaryRole: 'SUPERVISOR',
    coplusRole: 'GD_KTGSTT',
    orgUnitId: 'org-team-credit-audit',
    internalTeamId: 'org-team-credit-audit',
    internalTeamName: 'Nhóm Kiểm toán Tín dụng 01',
    teamRole: 'LEAD',
    isActive: true,
    scopes: [{ scopeType: 'ALL' }],
  },
  {
    id: 'user-internal-officer',
    username: 'bachtd',
    email: 'bachtd@bidv.com.vn',
    googleWorkspaceEmail: 'bachtd@bidv.com.vn',
    fullName: 'Trần Đức Bách',
    portal: 'INTERNAL',
    roles: ['INTERNAL_OFFICER'],
    primaryRole: 'INTERNAL_OFFICER',
    coplusRole: 'CB1_KTGSTT',
    orgUnitId: 'org-team-credit-audit',
    internalTeamId: 'org-team-credit-audit',
    internalTeamName: 'Nhóm Kiểm toán Tín dụng 01',
    teamRole: 'MEMBER',
    isActive: true,
    scopes: [{ scopeType: 'ALL' }],
  },
  {
    id: 'user-branch-controller-635',
    username: 'lyltk1',
    email: 'lyltk1@bidv.com.vn',
    googleWorkspaceEmail: 'lyltk1@bidv.com.vn',
    fullName: 'Lê Trần Khánh Ly',
    portal: 'BRANCH',
    roles: ['BRANCH_CONTROLLER'],
    primaryRole: 'BRANCH_CONTROLLER',
    coplusRole: 'CB_GSKT_TH',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng Kiểm soát chi nhánh',
    orgUnitId: 'org-dept-635-control',
    isActive: true,
    scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', departmentName: 'Phòng Kiểm soát chi nhánh' }],
  },
  {
    id: 'user-branch-635',
    username: 'cbht635',
    email: 'cbht635@bidv.com.vn',
    googleWorkspaceEmail: 'cbht635@bidv.com.vn',
    fullName: 'Cán bộ hỗ trợ Chi nhánh 635',
    portal: 'BRANCH',
    roles: ['BRANCH_INPUT'],
    primaryRole: 'BRANCH_INPUT',
    coplusRole: 'CBHT_CN',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng QLKH 1',
    orgUnitId: 'org-dept-635-qlkh1',
    isActive: true,
    scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', departmentName: 'Phòng QLKH 1' }],
  },
];

// Password hashes are salt$digest of the password alone, so renaming an account keeps its password.
const localCredentialDirectory = [
  { userId: 'user-admin', username: 'admin.hethong', passwordHash: 'scrypt$Iz-9-bO6hiTIOLX98U_7eA$EVcAruaxiY8MajQHWtmaspzx4cYKGqHQZ0FRYT3t8w2mRXhmv89aFfhTA6Y0FXTllT_AEz-5jPN4JLhg1xfORw' },
  { userId: 'user-internal-supervisor', username: 'linhlbk', passwordHash: 'scrypt$zAXoKo_uSEcAI8Dvpv8hRw$UJzSMH8-o7huRxrV6WFS_d_GMTCmGGbhk5HyIKGuMkZj7R5s__dIHpQyAGMyKWkbdTIwijGhdGYoUOTKzNc7QA' },
  { userId: 'user-internal-officer', username: 'bachtd', passwordHash: 'scrypt$lVdTI3PuwA54RehGTQZBxQ$IGT21IRWsvZrqmdrQ-zUJXRkaDq0YXAWN13QHvp_EcYWMcS4z6DHoTDTmJT0xT54dBLUR6Fl4C5gWOSvwTBKcw' },
  { userId: 'user-branch-635', username: 'cbht635', passwordHash: 'scrypt$UXll5zvffNMvKlxnna_zug$BtNbTsIRF1lwmfw_v6XMmUp6QlIUYNflrLcWv-za0kWtFhWN_U37jvUnqLWp_NY3jKC17qBD4Ww4cRlp5EhlrA' },
  { userId: 'user-branch-controller-635', username: 'lyltk1', passwordHash: 'scrypt$nvyImPhtUF9nPkzkyy23Mg$420xPsZvvCZdtmQphbG8SyekPNOhR4rR_BOk-LX5eLydqrAj6HnagKgple4hUgZ6IFBPMamSKwqcJj6l3Xx9xw' },
] as const;

/**
 * Snapshot of the demo directory as written in code, taken before persisted state is hydrated over
 * `appUsers`. The five demo personas are defined here, not by an administrator, so this stays the
 * source of truth for their identity and CoPlus role code across restarts.
 */
const seedUserDirectory: UserProfile[] = appUsers.map(user => structuredClone(user));

let auditCampaigns: AuditCampaign[] = [{
  id: 'campaign-regular-2026', code: 'TX-2026', name: 'Kiểm tra thường xuyên 2026',
  decisionNo: 'QĐ-KTNB-2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE',
  leadUserId: 'user-internal-supervisor',
  members: [
    { userId: 'user-internal-supervisor', memberRole: 'LEAD', assignedBranchCodes: ['635', '428', '102'] },
    { userId: 'user-internal-officer', memberRole: 'MEMBER', assignedBranchCodes: ['635', '428', '102'] },
  ],
  branchCodes: ['635', '428', '102'], reportChannelIds: ['chan-audit-bgs'], driveProvisionStatus: 'NOT_CONFIGURED',
  version: 1, createdByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}];

const defaultSlaConfig = () => ({
  defaultDays: 15,
  highRiskDays: 7,
  mediumRiskDays: 15,
  lowRiskDays: 30,
  escalationAfterDaysOverdue: 1,
  reminderDaysBefore: [3, 1],
});

/** Accepts a stored value only when it is a whole number at or above `minimum`. */
const wholeNumberAtLeast = (value: unknown, minimum: number): number | undefined =>
  Number.isInteger(value) && (value as number) >= minimum ? value as number : undefined;

function normalizedSlaConfig(config?: ReportChannel['slaConfig']) {
  const fallback = defaultSlaConfig();
  return {
    defaultDays: wholeNumberAtLeast(config?.defaultDays, 1) ?? fallback.defaultDays,
    highRiskDays: wholeNumberAtLeast(config?.highRiskDays, 1) ?? fallback.highRiskDays,
    mediumRiskDays: wholeNumberAtLeast(config?.mediumRiskDays, 1) ?? fallback.mediumRiskDays,
    lowRiskDays: wholeNumberAtLeast(config?.lowRiskDays, 1) ?? fallback.lowRiskDays,
    escalationAfterDaysOverdue: wholeNumberAtLeast(config?.escalationAfterDaysOverdue, 0) ?? fallback.escalationAfterDaysOverdue,
    reminderDaysBefore: Array.isArray(config?.reminderDaysBefore) && config.reminderDaysBefore.every(day => Number.isInteger(day) && day >= 0)
      ? config.reminderDaysBefore : fallback.reminderDaysBefore,
  };
}

function defaultSchemaConfig(channelCode = 'report_type'): NonNullable<ReportChannel['schemaConfig']> {
  return {
    tableName: channelCode.toLowerCase(),
    fields: [],
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    formTemplate: {
      name: 'Mẫu nhập báo cáo',
      source: 'MANUAL',
      presentationMode: 'CASE_REVIEW',
      allowEvidenceAttachments: true,
      blocks: [{ id: 'section_default', type: 'SECTION', title: 'Thông tin báo cáo', width: 'FULL' }],
    },
  };
}

function defaultWorkflowConfig(channelId = '', workflowType: 'ONE_TIER' | 'TWO_TIER' = 'TWO_TIER'): NonNullable<ReportChannel['workflowConfig']> {
  const branchStage = {
    stageId: 'branch-remediation',
    stageName: 'Chi nhánh khắc phục',
    statusCode: 'PENDING' as const,
    allowedRoles: ['BRANCH_INPUT' as const],
    availableButtons: [],
  };
  const branchControlStage = {
    stageId: 'branch-control',
    stageName: 'Kiểm soát chi nhánh',
    statusCode: 'SUBMITTED_BRANCH' as const,
    allowedRoles: ['BRANCH_CONTROLLER' as const],
    availableButtons: [],
  };
  const headOfficeStage = {
    stageId: 'head-office-approval',
    stageName: 'Phê duyệt HT',
    statusCode: 'SUBMITTED_INTERNAL' as const,
    allowedRoles: ['INTERNAL_APPROVER' as const, 'SUPERVISOR' as const],
    availableButtons: [],
  };
  return {
    id: `workflow-${channelId || 'draft'}`,
    channelId,
    workflowType,
    stages: workflowType === 'ONE_TIER'
      ? [branchStage, headOfficeStage]
      : [branchStage, branchControlStage, headOfficeStage],
  };
}

function defaultIntegrationConfig(): NonNullable<ReportChannel['integrationConfig']> {
  return {
    googleSheets: {
      enabled: false,
      sheetName: 'AuditBGS',
      syncMode: 'APPEND',
    },
    email: {
      enabled: false,
      sendOnSubmission: true,
      sendBeforeDeadline: true,
      sendWhenOverdue: true,
      sendTime: '08:00',
      recipientRoles: ['INTERNAL_APPROVER'],
      additionalRecipients: [],
      subjectTemplate: '[Audit BGS] {{reportName}} - {{status}}',
    },
  };
}

function normalizedReportChannel(channel: ReportChannel): ReportChannel {
  const configVersion = Number.isInteger(channel.configVersion) && channel.configVersion > 0 ? channel.configVersion : 1;
  const currentVersionId = channel.currentVersionId || `${channel.id}-v${configVersion}`;
  const workflowType = channel.workflowConfig?.workflowType === 'ONE_TIER' ? 'ONE_TIER' : 'TWO_TIER';
  return {
    ...channel,
    configVersion,
    currentVersionId,
    schemaConfig: channel.schemaConfig ?? defaultSchemaConfig(channel.code),
    workflowConfig: channel.workflowConfig
      ? { ...channel.workflowConfig, id: `${currentVersionId}-workflow`, channelId: channel.id, workflowType }
      : { ...defaultWorkflowConfig(channel.id, workflowType), id: `${currentVersionId}-workflow` },
    slaConfig: normalizedSlaConfig(channel.slaConfig),
    integrationConfig: channel.integrationConfig ?? defaultIntegrationConfig(),
  };
}

let reportChannels: ReportChannel[] = [
  {
    id: 'chan-audit-bgs',
    code: 'AUDIT_BGS',
    name: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
    description: 'Kênh báo cáo kiểm toán thường xuyên theo Quyết định định kỳ toàn quốc.',
    category: 'REGULAR_AUDIT',
    icon: 'ShieldAlert',
    badgeColor: 'blue',
    inputMethods: ['EXCEL_IMPORT', 'WEB_FORM'],
    issuingDepartment: 'Ban Kiểm toán Nội bộ',
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: 'chan-audit-bgs-v1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'chan-aml',
    code: 'COMPLIANCE_AML',
    name: 'Giám sát Tuân thủ & Phòng chống Rửa tiền (AML)',
    description: 'Theo dõi các sự vụ phát sinh từ hệ thống lọc giao dịch đáng ngờ.',
    category: 'COMPLIANCE_AML',
    icon: 'FileSpreadsheet',
    badgeColor: 'emerald',
    inputMethods: ['EXCEL_IMPORT', 'WEB_FORM'],
    issuingDepartment: 'Khối Giám sát & Tuân thủ',
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: 'chan-aml-v1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'chan-op-risk',
    code: 'OPERATIONAL_RISK',
    name: 'Báo cáo Rủi ro Vận hành & Sự vụ Chi nhánh',
    description: 'Kênh tiếp nhận các sự cố vận hành phát sinh đột xuất.',
    category: 'OPERATIONAL_RISK',
    icon: 'Flame',
    badgeColor: 'purple',
    inputMethods: ['WEB_FORM'],
    issuingDepartment: 'Khối Quản trị Rủi ro',
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: 'chan-oprisk-v1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let findings: Finding[] = [
  {
    id: 'find-001',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '10482910',
    customerName: 'Công ty TNHH Cà Phê Tây Nguyên Xanh',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng QLKH 1',
    decisionNo: 'QĐ-KTNB-2026/08',
    auditDate: '2026-08-15',
    inspectorName: 'Lê Cán Bộ Kiểm Tra',
    creditBalance: 14500,
    loanGroup: 'Nhóm 1',
    collateralValue: 22000,
    loanPurpose: 'Bổ sung vốn lưu động thu mua cà phê vụ mùa 2026',
    officerName: 'Phạm Cán Bộ QLKH',
    deptHeadName: 'Trần Trưởng Phòng',
    errorCode: 'TD01.01',
    inspectionTeamCode: '635.2026.1',
    sourceRecordCode: '635.TBBTD.2026.1',
    businessLine: 'TIN_DUNG',
    riskLevel: 'CAO',
    penaltyProposalCode: '1.1.2',
    referenceDocument: 'QĐ 1234/QĐ-BIDV về cấp tín dụng',
    errorGroup: 'TD01',
    errorTitle: 'Chưa thu thập đầy đủ chứng từ giải ngân mục đích sử dụng vốn',
    description: 'Khách hàng chưa cung cấp hóa đơn GTGT điện tử đợt giải ngân ngày 10/05/2026 trị giá 3.5 tỷ VNĐ theo cam kết hợp đồng tín dụng.',
    quantity: 1,
    exposureAmount: 3500,
    workflowStatus: 'PENDING',
    slaStatus: 'DUE_SOON',
    version: 1,
    deadlineDate: '2026-08-30',
    isOverdue: false,
    evidenceCount: 0,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
  },
  {
    id: 'find-002',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '10849201',
    customerName: 'Doanh nghiệp Tư nhân Vận tải Hoàng Long',
    clusterName: 'Cụm TP. Hồ Chí Minh',
    branchCode: '428',
    branchName: 'Chi nhánh Bình Tây Sài Gòn',
    department: 'Phòng QLKH 2',
    decisionNo: 'QĐ-KTNB-2026/08',
    auditDate: '2026-08-15',
    inspectorName: 'Lê Cán Bộ Kiểm Tra',
    creditBalance: 8200,
    loanGroup: 'Nhóm 1',
    collateralValue: 15000,
    loanPurpose: 'Mua xe đầu kéo vận tải container',
    officerName: 'Nguyễn Văn Minh',
    deptHeadName: 'Lê Quốc Bảo',
    errorCode: 'TD02.05',
    inspectionTeamCode: '428.2026.1',
    sourceRecordCode: '428.TBBTD.2026.1',
    businessLine: 'TIN_DUNG',
    riskLevel: 'TRUNG_BINH',
    penaltyProposalCode: '5.3.2',
    referenceDocument: 'QĐ 1234/QĐ-BIDV về hồ sơ pháp lý',
    errorGroup: 'TD02',
    errorTitle: 'Chưa hoàn tất đăng ký biến động giao dịch bảo đảm tài sản',
    description: 'Hồ sơ thế chấp quyền sử dụng đất số AB123456 chưa có dấu xác nhận của Văn phòng Đăng ký đất đai chi nhánh Quận 6.',
    quantity: 1,
    exposureAmount: 4200,
    workflowStatus: 'SUBMITTED_BRANCH',
    slaStatus: 'ON_TRACK',
    version: 2,
    deadlineDate: '2026-09-10',
    isOverdue: false,
    resolutionNotes: 'Chi nhánh đã nộp hồ sơ xin cấp sổ và bổ sung phiếu hẹn của VP Đăng ký đất đai.',
    evidenceCount: 1,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-20T10:30:00.000Z',
  },
  {
    id: 'find-003',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '10993821',
    customerName: 'Công ty CP May Xuất Khẩu Hà Nội',
    clusterName: 'Cụm Miền Bắc',
    branchCode: '102',
    branchName: 'Chi nhánh Hà Nội',
    department: 'Phòng QLKH 1',
    decisionNo: 'QĐ-KTNB-2026/07',
    auditDate: '2026-07-20',
    inspectorName: 'Vũ Kiểm Toán Viên',
    creditBalance: 25000,
    loanGroup: 'Nhóm 1',
    collateralValue: 40000,
    errorCode: 'TD03.02',
    inspectionTeamCode: '102.2026.1',
    sourceRecordCode: '102.TBBTD.2026.1',
    businessLine: 'TIN_DUNG',
    riskLevel: 'CAO',
    penaltyProposalCode: '7.4',
    referenceDocument: 'QĐ 5678/QĐ-BIDV về mục đích vay vốn',
    errorGroup: 'TD03',
    errorTitle: 'Biên bản kiểm tra thực địa sau vay vượt quá 90 ngày',
    description: 'Chưa thực hiện kiểm tra tình hình hoạt động kho xưởng định kỳ Quý 2/2026.',
    quantity: 1,
    exposureAmount: 6000,
    workflowStatus: 'SUBMITTED_INTERNAL',
    slaStatus: 'ON_TRACK',
    version: 3,
    deadlineDate: '2026-08-28',
    isOverdue: false,
    resolutionNotes: 'Cán bộ đã lập biên bản kiểm tra thực tế kho xưởng ngày 18/08/2026, đính kèm đầy đủ ảnh chụp và hóa đơn xuất nhập kho.',
    evidenceCount: 2,
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-08-22T14:15:00.000Z',
  },
  {
    id: 'find-004',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '10482910',
    customerName: 'Công ty TNHH Cà Phê Tây Nguyên Xanh',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng QLKH 1',
    decisionNo: 'QĐ-KTNB-2026/08',
    auditDate: '2026-08-15',
    inspectorName: 'Lê Cán Bộ Kiểm Tra',
    creditBalance: 14500,
    loanGroup: 'Nhóm 1',
    collateralValue: 22000,
    loanPurpose: 'Bổ sung vốn lưu động thu mua cà phê vụ mùa 2026',
    officerName: 'Phạm Cán Bộ QLKH',
    deptHeadName: 'Trần Trưởng Phòng',
    errorCode: 'TD05.05',
    inspectionTeamCode: '635.2026.1',
    sourceRecordCode: '635.TBBTD.2026.2',
    businessLine: 'PHI_TIN_DUNG',
    riskLevel: 'THAP',
    penaltyProposalCode: '9.1.4',
    referenceDocument: 'QĐ 5678/QĐ-BIDV về kiểm tra sau vay',
    errorGroup: 'TD05',
    errorTitle: 'Chưa rà soát đầy đủ điều kiện giải ngân',
    description: 'Hồ sơ giải ngân chưa có biên bản đối chiếu điều kiện cấp tín dụng theo danh mục kiểm tra bắt buộc.',
    quantity: 1,
    exposureAmount: 2100,
    workflowStatus: 'SUBMITTED_BRANCH',
    slaStatus: 'ON_TRACK',
    version: 2,
    deadlineDate: '2026-09-05',
    isOverdue: false,
    resolutionNotes: 'Chi nhánh đã bổ sung biên bản đối chiếu và gửi Kiểm soát chi nhánh xem xét.',
    evidenceCount: 0,
    createdAt: '2026-08-15T08:05:00.000Z',
    updatedAt: '2026-08-23T09:10:00.000Z',
  }
];

let workflowEvents: WorkflowEvent[] = [
  {
    id: 'evt-001',
    findingId: 'find-002',
    command: 'SUBMIT_BRANCH',
    fromStatus: 'PENDING',
    toStatus: 'SUBMITTED_BRANCH',
    actorUserId: 'user-branch-428',
    actorName: 'Nguyễn Văn Minh',
    actorRole: 'BRANCH_INPUT',
    notes: 'Chi nhánh đã nộp hồ sơ xin cấp sổ và bổ sung phiếu hẹn của VP Đăng ký đất đai.',
    createdAt: '2026-08-20T10:30:00.000Z',
  },
  {
    id: 'evt-002',
    findingId: 'find-003',
    command: 'SUBMIT_BRANCH',
    fromStatus: 'PENDING',
    toStatus: 'SUBMITTED_BRANCH',
    actorUserId: 'user-branch-102',
    actorName: 'Trần Văn Cán Bộ',
    actorRole: 'BRANCH_INPUT',
    notes: 'Đã hoàn thành kiểm tra kho xưởng thực tế.',
    createdAt: '2026-08-21T09:00:00.000Z',
  },
  {
    id: 'evt-003',
    findingId: 'find-003',
    command: 'BRANCH_CONTROL_APPROVE',
    fromStatus: 'SUBMITTED_BRANCH',
    toStatus: 'SUBMITTED_INTERNAL',
    actorUserId: 'user-branch-controller-102',
    actorName: 'Kiểm soát Chi nhánh Hà Nội',
    actorRole: 'BRANCH_CONTROLLER',
    notes: 'Kiểm soát chi nhánh đã thẩm tra hồ sơ đầy đủ, chuyển Khối Nội Bộ phê duyệt bỏ lỗi.',
    createdAt: '2026-08-22T14:15:00.000Z',
  }
];

let evidences: EvidenceObject[] = [
  {
    id: 'evi-001',
    findingId: 'find-002',
    fileName: 'Phieu_hen_dang_ky_bien_dong_dat_dai.pdf',
    fileSize: 1048576,
    mimeType: 'application/pdf',
    driveFileId: 'drive_mock_001',
    driveUrl: '/api/v1/evidence/drive_mock_001/content',
    sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'AVAILABLE',
    uploadedByUserId: 'user-branch-428',
    uploadedByName: 'Nguyễn Văn Minh',
    uploadedByRole: 'BRANCH_INPUT',
    versionNumber: 1,
    notes: 'Bản scan phiếu hẹn có dấu đỏ của cơ quan nhà nước.',
    createdAt: '2026-08-20T10:28:00.000Z',
    updatedAt: '2026-08-20T10:28:00.000Z',
  },
  {
    id: 'evi-002',
    findingId: 'find-003',
    fileName: 'Bien_ban_kiem_tra_kho_xuong_thuc_dia.pdf',
    fileSize: 2097152,
    mimeType: 'application/pdf',
    driveFileId: 'drive_mock_002',
    driveUrl: '/api/v1/evidence/drive_mock_002/content',
    sha256Checksum: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
    status: 'AVAILABLE',
    uploadedByUserId: 'user-branch-102',
    uploadedByName: 'Trần Văn Cán Bộ',
    uploadedByRole: 'BRANCH_INPUT',
    versionNumber: 1,
    notes: 'Biên bản kiểm tra có chữ ký đại diện doanh nghiệp và ảnh chụp tài sản.',
    createdAt: '2026-08-21T08:50:00.000Z',
    updatedAt: '2026-08-21T08:50:00.000Z',
  }
];

let importBatches: ImportBatch[] = [];
let slaExtensions: SlaExtensionRequest[] = [];
let reportDefinitions: ReportDefinition[] = [];

/** Tunable per deployment: raise it where the runtime allows a bigger response than Vercel's. */
const REPORT_EXPORT_MAX_ROWS = Math.max(1, Number(process.env.REPORT_EXPORT_MAX_ROWS) || 10_000);

const DEFAULT_REPORT_EXPORT_FIELDS = new Set<ReportFieldKey>([
  'dimension.campaign', 'dimension.campaign_decision', 'dimension.cif', 'dimension.customer', 'dimension.cluster', 'dimension.branch', 'dimension.department',
  'dimension.officer', 'dimension.error_code', 'dimension.workflow_status', 'measure.credit_balance', 'measure.exposure', 'date.deadline',
]);
const DEFAULT_REPORT_METRICS = new Set<ReportMetricKey>([
  'metric.customer_count', 'metric.finding_count', 'metric.exposure_sum',
]);

function createDefaultReportCatalogConfiguration(): ReportCatalogConfiguration {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    fields: REPORT_FIELD_CATALOG.map((field, index) => ({
      ...field,
      isActive: true,
      defaultExport: DEFAULT_REPORT_EXPORT_FIELDS.has(field.key),
      sortOrder: index,
    })),
    metrics: REPORT_METRIC_CATALOG.map((metric, index) => ({
      ...metric,
      isActive: DEFAULT_REPORT_METRICS.has(metric.key),
      sortOrder: index,
    })),
  };
}

let reportCatalogConfiguration = createDefaultReportCatalogConfiguration();

interface IdempotencyEntry {
  requestHash: string;
  response: Finding;
}

let idempotencyRecords: Record<string, IdempotencyEntry> = {};

interface FindingFollow {
  userId: string;
  findingId: string;
  createdAt: string;
}

let findingFollows: FindingFollow[] = [];

interface WorkspaceTargetRecord extends WorkspaceTargetCommandDTO {
  id: string;
  userId: string;
  createdAt: string;
  isPriority?: boolean;
  prioritizedAt?: string;
}

let workspaceAccepted: WorkspaceTargetRecord[] = [];
let workspaceWatchTargets: WorkspaceTargetRecord[] = [];
let reportChannelVersions: ReportChannelVersion[] = [];
let authSessions: AuthSessionRecord[] = [];

interface LocalAppState {
  orgUnits: OrgUnit[];
  appUsers: UserProfile[];
  reportChannels: ReportChannel[];
  reportChannelVersions: ReportChannelVersion[];
  findings: Finding[];
  workflowEvents: WorkflowEvent[];
  evidences: EvidenceObject[];
  importBatches: ImportBatch[];
  slaExtensions: SlaExtensionRequest[];
  reportDefinitions: ReportDefinition[];
  reportCatalogConfiguration: ReportCatalogConfiguration;
  idempotencyRecords: Record<string, IdempotencyEntry>;
  findingFollows: FindingFollow[];
  workspaceAccepted: WorkspaceTargetRecord[];
  workspaceWatchTargets: WorkspaceTargetRecord[];
  authSessions?: AuthSessionRecord[];
  auditCampaigns?: AuditCampaign[];
}

const stateRepository = createStateRepository<LocalAppState>({
  filePath: process.env.LOCAL_STATE_FILE ?? path.join(process.cwd(), 'data', 'local-state.json'),
  dataStoreMode: process.env.DATA_STORE_MODE,
  persistenceEnabled: process.env.NODE_ENV !== 'test',
  snapshotId: process.env.STATE_SNAPSHOT_ID
    ?? (process.env.NODE_ENV === 'test' ? `test-${process.pid}-${crypto.randomUUID().slice(0, 8)}` : undefined),
});

const hydratedState = await stateRepository.load({
  orgUnits, appUsers, reportChannels, reportChannelVersions, findings, workflowEvents, evidences,
  importBatches, slaExtensions, reportDefinitions, reportCatalogConfiguration, idempotencyRecords, findingFollows,
  workspaceAccepted, workspaceWatchTargets, authSessions, auditCampaigns,
});
orgUnits = hydratedState.orgUnits;
appUsers = hydratedState.appUsers;
reportChannels = hydratedState.reportChannels.map(normalizedReportChannel);
reportChannelVersions = hydratedState.reportChannelVersions ?? [];
if (!reportChannelVersions.length) {
  reportChannelVersions = reportChannels.map(channel => ({
    id: channel.currentVersionId!,
    channelId: channel.id,
    versionNumber: channel.configVersion,
    snapshot: structuredClone(channel),
    createdByUserId: 'system',
    createdAt: channel.updatedAt,
  }));
}
const channelSlaBackfilled = (() => {
  let changed = false;
  reportChannels = reportChannels.map(channel => {
    const slaConfig = normalizedSlaConfig(channel.slaConfig);
    if (JSON.stringify(channel.slaConfig) === JSON.stringify(slaConfig)) return channel;
    changed = true;
    return { ...channel, slaConfig };
  });
  return changed;
})();
findings = hydratedState.findings;
findings = findings.map(ensureFindingSubItems);
workflowEvents = hydratedState.workflowEvents;
evidences = hydratedState.evidences;
importBatches = hydratedState.importBatches;
slaExtensions = hydratedState.slaExtensions;
reportDefinitions = hydratedState.reportDefinitions;
reportCatalogConfiguration = hydratedState.reportCatalogConfiguration ?? createDefaultReportCatalogConfiguration();
idempotencyRecords = hydratedState.idempotencyRecords ?? {};
findingFollows = hydratedState.findingFollows ?? [];
workspaceAccepted = hydratedState.workspaceAccepted ?? [];
workspaceWatchTargets = hydratedState.workspaceWatchTargets ?? [];
authSessions = hydratedState.authSessions ?? [];
authSessionStore = new AuthSessionStore({ records: authSessions });
auditCampaigns = hydratedState.auditCampaigns?.length ? hydratedState.auditCampaigns : auditCampaigns;
/**
 * Backfill the CoPlus provenance that can be derived with certainty from data already on record:
 * the đoàn code from the campaign, and the business line from the sai sót code prefix (TD… is a
 * mã sai sót tín dụng). Risk grade, penalty and reference are judgements the đoàn kiểm tra makes,
 * so they stay blank rather than being invented here.
 *
 * Returns whether anything changed; the caller persists so the startup SLA pass, which reloads
 * findings from disk, does not discard the derived values.
 */
/**
 * Reconcile persisted accounts with the CoPlus directory. The demo personas take their identity
 * from code, so a renamed persona reaches an install that already has state; every other account
 * only gets its CoPlus code filled in, leaving administrator-entered details untouched.
 */
function backfillUserCoPlusIdentity(): boolean {
  let changed = false;
  const seedById = new Map(seedUserDirectory.map(user => [user.id, user]));
  appUsers = appUsers.map(user => {
    const seed = seedById.get(user.id);
    const next: UserProfile = seed
      ? { ...user, username: seed.username, fullName: seed.fullName, email: seed.email, googleWorkspaceEmail: seed.googleWorkspaceEmail, coplusRole: seed.coplusRole }
      : { ...user, coplusRole: user.coplusRole ?? inferCoPlusRole(user.roles) };
    if (JSON.stringify(next) === JSON.stringify(user)) return user;
    changed = true;
    return next;
  });
  return changed;
}

/**
 * Starter form templates for channels that were created without one. AML is an evidence-backed case
 * review; operational risk is a tabular log that a branch fills in and pushes through without
 * attachments — together they exercise both capture flows.
 */
const STARTER_FORM_TEMPLATES: Record<string, NonNullable<ReportChannel['schemaConfig']>> = {
  COMPLIANCE_AML: {
    tableName: 'compliance_aml',
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    fields: [
      { fieldKey: 'ma_giao_dich', label: 'Mã giao dịch', dataType: 'string', isRequired: true, excelHeaderAliases: ['Mã giao dịch'], displayOrder: 1, showInTableGrid: true },
      { fieldKey: 'loai_canh_bao', label: 'Loại cảnh báo', dataType: 'select', isRequired: true, excelHeaderAliases: ['Loại cảnh báo'], displayOrder: 2, showInTableGrid: true, dropdownOptions: [
        { label: 'Giao dịch đáng ngờ', value: 'giao_dich_dang_ngo' },
        { label: 'Vượt ngưỡng báo cáo', value: 'vuot_nguong_bao_cao' },
        { label: 'Trùng danh sách cấm vận', value: 'trung_danh_sach_cam_van' },
      ] },
      { fieldKey: 'ngay_canh_bao', label: 'Ngày cảnh báo', dataType: 'date', isRequired: false, excelHeaderAliases: ['Ngày cảnh báo'], displayOrder: 3, showInTableGrid: true },
      { fieldKey: 'gia_tri_giao_dich', label: 'Giá trị giao dịch (triệu đồng)', dataType: 'currency', isRequired: false, excelHeaderAliases: ['Giá trị giao dịch'], displayOrder: 4, showInTableGrid: true },
      { fieldKey: 'ket_luan_ra_soat', label: 'Kết luận rà soát', dataType: 'textarea', isRequired: false, excelHeaderAliases: ['Kết luận rà soát'], displayOrder: 5, showInTableGrid: false },
    ],
    formTemplate: {
      name: 'Mẫu rà soát cảnh báo AML', source: 'MANUAL', presentationMode: 'CASE_REVIEW', allowEvidenceAttachments: true,
      blocks: [
        { id: 'aml_section_1', type: 'SECTION', title: 'NỘI DUNG RÀ SOÁT', width: 'FULL' },
        { id: 'aml_sub_1', type: 'SUBSECTION', title: 'Thông tin cảnh báo', width: 'FULL' },
        { id: 'aml_f_1', type: 'FIELD', fieldKey: 'ma_giao_dich', width: 'THIRD' },
        { id: 'aml_f_2', type: 'FIELD', fieldKey: 'loai_canh_bao', width: 'THIRD' },
        { id: 'aml_f_3', type: 'FIELD', fieldKey: 'ngay_canh_bao', width: 'THIRD' },
        { id: 'aml_f_4', type: 'FIELD', fieldKey: 'gia_tri_giao_dich', width: 'THIRD' },
        { id: 'aml_sub_2', type: 'SUBSECTION', title: 'Kết luận', width: 'FULL' },
        { id: 'aml_f_5', type: 'FIELD', fieldKey: 'ket_luan_ra_soat', width: 'FULL' },
      ],
    },
  },
  OPERATIONAL_RISK: {
    tableName: 'operational_risk',
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    fields: [
      { fieldKey: 'su_kien_rui_ro', label: 'Sự kiện rủi ro', dataType: 'string', isRequired: true, excelHeaderAliases: ['Sự kiện rủi ro'], displayOrder: 1, showInTableGrid: true },
      { fieldKey: 'bo_phan_phat_sinh', label: 'Bộ phận phát sinh', dataType: 'string', isRequired: false, excelHeaderAliases: ['Bộ phận phát sinh'], displayOrder: 2, showInTableGrid: true },
      { fieldKey: 'ngay_phat_sinh', label: 'Ngày phát sinh', dataType: 'date', isRequired: false, excelHeaderAliases: ['Ngày phát sinh'], displayOrder: 3, showInTableGrid: true },
      { fieldKey: 'ton_that_uoc_tinh', label: 'Tổn thất ước tính (triệu đồng)', dataType: 'currency', isRequired: false, excelHeaderAliases: ['Tổn thất ước tính'], displayOrder: 4, showInTableGrid: true },
      { fieldKey: 'bien_phap_xu_ly', label: 'Biện pháp xử lý', dataType: 'string', isRequired: false, excelHeaderAliases: ['Biện pháp xử lý'], displayOrder: 5, showInTableGrid: true },
    ],
    formTemplate: {
      name: 'Bảng ghi nhận sự vụ rủi ro vận hành', source: 'MANUAL', presentationMode: 'EXCEL_GRID', allowEvidenceAttachments: false,
      blocks: [
        { id: 'opr_section_1', type: 'SECTION', title: 'SỰ VỤ RỦI RO VẬN HÀNH', width: 'FULL' },
        { id: 'opr_f_1', type: 'FIELD', fieldKey: 'su_kien_rui_ro', width: 'THIRD' },
        { id: 'opr_f_2', type: 'FIELD', fieldKey: 'bo_phan_phat_sinh', width: 'THIRD' },
        { id: 'opr_f_3', type: 'FIELD', fieldKey: 'ngay_phat_sinh', width: 'THIRD' },
        { id: 'opr_f_4', type: 'FIELD', fieldKey: 'ton_that_uoc_tinh', width: 'THIRD' },
        { id: 'opr_f_5', type: 'FIELD', fieldKey: 'bien_phap_xu_ly', width: 'THIRD' },
      ],
    },
  },
};

/** Only fills channels that carry no template at all; an administrator's own config is untouched. */
function backfillChannelFormTemplates(): boolean {
  let changed = false;
  reportChannels = reportChannels.map(channel => {
    const starter = STARTER_FORM_TEMPLATES[channel.code.toUpperCase()];
    const hasTemplate = (channel.schemaConfig?.formTemplate?.blocks.length ?? 0) > 0
      || (channel.schemaConfig?.fields.length ?? 0) > 0;
    if (!starter || hasTemplate) return channel;
    changed = true;
    return { ...channel, schemaConfig: structuredClone(starter) };
  });
  return changed;
}

function backfillFindingProvenance(): boolean {
  let changed = false;
  findings = findings.map(finding => {
    const campaignId = finding.campaignId ?? 'campaign-regular-2026';
    const inspectionTeamCode = finding.inspectionTeamCode
      ?? auditCampaigns.find(campaign => campaign.id === campaignId)?.code;
    const businessLine = finding.businessLine
      ?? (finding.errorCode.toUpperCase().startsWith('TD') ? 'TIN_DUNG' as const : undefined);
    if (campaignId === finding.campaignId
      && inspectionTeamCode === finding.inspectionTeamCode
      && businessLine === finding.businessLine) return finding;
    changed = true;
    return { ...finding, campaignId, inspectionTeamCode, businessLine };
  });
  return changed;
}

function currentLocalState(): LocalAppState {
  return {
    orgUnits, appUsers, reportChannels, reportChannelVersions, findings, workflowEvents, evidences,
    importBatches, slaExtensions, reportDefinitions, reportCatalogConfiguration, idempotencyRecords, findingFollows,
    workspaceAccepted, workspaceWatchTargets, authSessions, auditCampaigns,
  };
}

const durableState = new DurableStateCoordinator<LocalAppState>(currentLocalState());

function restoreDurableLocalState(restored: LocalAppState): void {
  orgUnits = restored.orgUnits;
  appUsers = restored.appUsers;
  reportChannels = restored.reportChannels;
  reportChannelVersions = restored.reportChannelVersions ?? [];
  findings = restored.findings.map(ensureFindingSubItems);
  workflowEvents = restored.workflowEvents;
  evidences = restored.evidences;
  importBatches = restored.importBatches;
  slaExtensions = restored.slaExtensions;
  reportDefinitions = restored.reportDefinitions;
  reportCatalogConfiguration = restored.reportCatalogConfiguration ?? createDefaultReportCatalogConfiguration();
  idempotencyRecords = restored.idempotencyRecords ?? {};
  findingFollows = restored.findingFollows ?? [];
  workspaceAccepted = restored.workspaceAccepted ?? [];
  workspaceWatchTargets = restored.workspaceWatchTargets ?? [];
  authSessions = restored.authSessions ?? [];
  authSessionStore = new AuthSessionStore({ records: authSessions });
  auditCampaigns = restored.auditCampaigns?.length ? restored.auditCampaigns : auditCampaigns;
}

const runtimeRequestLock = new RuntimeRequestLock();
const runtimeRequestReleases = new WeakMap<FastifyRequest, () => void>();

function releaseRuntimeRequest(request: FastifyRequest): void {
  const release = runtimeRequestReleases.get(request);
  runtimeRequestReleases.delete(request);
  release?.();
}

app.addHook('onRequest', async (request) => {
  if (!shouldHydrateRuntimeStatePerRequest(process.env, request.url)) return;
  const release = await runtimeRequestLock.acquire();
  runtimeRequestReleases.set(request, release);
  try {
    const latest = await stateRepository.load(currentLocalState());
    restoreDurableLocalState(latest);
    durableState.hydrate(latest);
  } catch (error) {
    releaseRuntimeRequest(request);
    throw error;
  }
});

app.addHook('onResponse', async (request) => {
  releaseRuntimeRequest(request);
});

app.addHook('onError', async (request) => {
  releaseRuntimeRequest(request);
});

async function persistLocalState(): Promise<void> {
  const base = durableState.snapshot();
  const snapshot = currentLocalState();
  const saved = await durableState.persistAsync(
    async () => stateRepository.update(snapshot, latest => threeWayMergeState(base, snapshot, latest)),
    restoreDurableLocalState,
  );
  restoreDurableLocalState(saved);
}

interface SlaRunResult {
  evaluatedCount: number;
  updatedCount: number;
  overdueCount: number;
  dueSoonCount: number;
}

async function evaluateCurrentSlaState(): Promise<SlaRunResult> {
  let result = { updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  const saved = await durableState.persistAsync(
    async () => stateRepository.update(currentLocalState(), latest => {
      result = runSlaEvaluation(latest.findings);
    }),
    restoreDurableLocalState,
  );
  restoreDurableLocalState(saved);
  return { evaluatedCount: saved.findings.length, ...result };
}

function synchronizeUserDirectoryModel(): boolean {
  const now = new Date().toISOString();
  let changed = false;
  const baselineTeams: OrgUnit[] = [
    {
      id: 'org-team-credit-audit',
      code: 'TEAM_CREDIT_AUDIT_01',
      name: 'Nhóm Kiểm toán Tín dụng 01',
      type: 'INTERNAL_TEAM',
      parentId: 'org-ho',
      leaderUserId: 'user-internal-supervisor',
      leaderName: 'Trần Lãnh Đạo (Giám Đốc Ban Kiểm Toán)',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'org-team-compliance',
      code: 'TEAM_COMPLIANCE_01',
      name: 'Nhóm Giám sát Tuân thủ 01',
      type: 'INTERNAL_TEAM',
      parentId: 'org-ho',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const team of baselineTeams) {
    if (!orgUnits.some(unit => unit.id === team.id || unit.code === team.code)) {
      orgUnits.push(team);
      changed = true;
    }
  }

  const creditTeam = orgUnits.find(unit => unit.id === 'org-team-credit-audit');
  for (const user of appUsers) {
    const credential = localCredentialDirectory.find(item => item.userId === user.id);
    if (credential && user.username !== credential.username) {
      user.username = credential.username;
      changed = true;
    }
    if (!user.googleWorkspaceEmail && user.email) {
      user.googleWorkspaceEmail = user.email;
      changed = true;
    }
    if (creditTeam && user.id === 'user-internal-supervisor' && !user.internalTeamId) {
      Object.assign(user, {
        orgUnitId: creditTeam.id,
        internalTeamId: creditTeam.id,
        internalTeamName: creditTeam.name,
        teamRole: 'LEAD' as const,
      });
      changed = true;
    }
    if (creditTeam && user.id === 'user-internal-officer' && !user.internalTeamId) {
      Object.assign(user, {
        orgUnitId: creditTeam.id,
        internalTeamId: creditTeam.id,
        internalTeamName: creditTeam.name,
        teamRole: 'MEMBER' as const,
      });
      changed = true;
    }
    if (user.portal === 'BRANCH' && user.branchCode) {
      const branch = orgUnits.find(unit => unit.type === 'BRANCH' && unit.code === user.branchCode);
      const cluster = branch ? orgUnits.find(unit => unit.type === 'CLUSTER' && unit.id === branch.parentId) : undefined;
      const department = branch
        ? orgUnits.find(unit => unit.type === 'DEPARTMENT' && unit.parentId === branch.id && unit.name === user.department)
        : undefined;
      if (branch && cluster && (user.branchName !== branch.name || user.clusterName !== cluster.name || (department && user.orgUnitId !== department.id))) {
        user.branchName = branch.name;
        user.clusterName = cluster.name;
        user.orgUnitId = department?.id ?? branch.id;
        user.scopes = [{
          scopeType: 'BRANCH',
          orgUnitId: branch.id,
          orgUnitCode: branch.code,
          clusterName: cluster.name,
          branchName: branch.name,
          departmentName: department?.name ?? user.department,
        }];
        changed = true;
      }
    }
  }
  return changed;
}

if ([
  channelSlaBackfilled,
  synchronizeUserDirectoryModel(),
  backfillUserCoPlusIdentity(),
  backfillChannelFormTemplates(),
  backfillFindingProvenance(),
].some(Boolean)) await persistLocalState();

if (shouldStartEmbeddedSlaRuntime()) {
  const stopSlaRuntime = startDailySlaRuntime(async () => { await evaluateCurrentSlaState(); });
  app.addHook('onClose', async () => {
    stopSlaRuntime();
  });
}

// ----------------------------------------------------
// AUTH HELPER (Data Scope Resolution P0-12)
// ----------------------------------------------------
function getCurrentUser(req: FastifyRequest): UserProfile {
  const user = requestUsers.get(req);
  if (!user) {
    throw new HttpProblem(401, 'AUTH_REQUIRED', 'Chưa xác thực', 'Không tìm thấy ngữ cảnh người dùng cho yêu cầu.');
  }
  return user;
}

function filterFindingsByScope(items: Finding[], user: UserProfile): Finding[] {
  return items.filter(finding => hasFindingAccess(user, finding));
}

function getScopedFindingOrThrow(id: string, user: UserProfile): Finding {
  const finding = findings.find(item => item.id === id);
  if (!finding || !hasFindingAccess(user, finding)) {
    throw new HttpProblem(404, 'FINDING_NOT_FOUND', 'Không tìm thấy hồ sơ', 'Hồ sơ không tồn tại hoặc nằm ngoài phạm vi dữ liệu được cấp.');
  }
  return finding;
}

function availableEvidencesForFinding(findingId: string): EvidenceObject[] {
  return evidences.filter(evidence => evidence.findingId === findingId && evidence.status === 'AVAILABLE');
}

function ensureFindingSubItems(finding: Finding): Finding {
  if (finding.subItems?.length) return finding;
  const contents = finding.id === 'find-003'
    ? [
      'Chưa thực hiện kiểm tra tình hình hoạt động kho xưởng định kỳ Quý 2/2026.',
      'Chưa lưu đầy đủ ảnh chụp hiện trạng hàng tồn kho tại thời điểm kiểm tra.',
      'Chưa đối chiếu số liệu nhập xuất kho với hóa đơn và sổ theo dõi của khách hàng.',
    ]
    : [finding.description];
  return {
    ...finding,
    subItems: contents.map((content, index) => ({
      id: `${finding.id}-item-${index + 1}`,
      findingId: finding.id,
      content,
      order: index + 1,
      status: 'OPEN' as const,
      createdAt: finding.createdAt,
      updatedAt: finding.updatedAt,
    })),
  };
}

function reportPresentationForFinding(finding: Finding) {
  const pinnedChannel = reportChannelVersions.find(version => version.id === finding.channelVersionId)?.snapshot;
  const currentChannel = reportChannels.find(channel => channel.id === finding.channelId);
  const template = (pinnedChannel ?? currentChannel)?.schemaConfig?.formTemplate;
  return {
    evidenceRequired: template?.allowEvidenceAttachments !== false,
    presentationMode: template?.presentationMode ?? 'CASE_REVIEW' as const,
  };
}

function withEvidenceProjection(finding: Finding): Finding {
  return { ...finding, ...reportPresentationForFinding(finding), evidenceCount: availableEvidencesForFinding(finding.id).length };
}

function isActionableForUser(finding: Finding, user: UserProfile): boolean {
  if (user.roles.includes('BRANCH_INPUT')) {
    return finding.workflowStatus === 'PENDING' || finding.workflowStatus === 'REJECTED';
  }
  if (user.roles.includes('BRANCH_CONTROLLER')) {
    return finding.workflowStatus === 'SUBMITTED_BRANCH';
  }
  if (user.roles.some(role => ['SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER'].includes(role))) {
    return finding.workflowStatus === 'SUBMITTED_INTERNAL';
  }
  return false;
}

function withWorkspaceProjection(finding: Finding, userId: string) {
  return {
    ...withEvidenceProjection(finding),
    isFollowing: findingFollows.some(item => item.userId === userId && item.findingId === finding.id),
  };
}

function workspaceTargetKey(target: WorkspaceTargetCommandDTO): string {
  if (target.targetType === 'CLUSTER') return `CLUSTER:${target.clusterName}`;
  if (target.targetType === 'BRANCH') return `BRANCH:${target.branchCode}`;
  return `CUSTOMER:${target.branchCode}:${target.cif}`;
}

function findingsForWorkspaceTarget(target: WorkspaceTargetCommandDTO, user: UserProfile): Finding[] {
  return filterFindingsByScope(findings, user).filter(finding => {
    if (target.targetType === 'CLUSTER') return finding.clusterName === target.clusterName;
    if (target.targetType === 'BRANCH') return finding.branchCode === target.branchCode;
    return finding.branchCode === target.branchCode && finding.cif === target.cif;
  });
}

function projectWorkspaceTarget(target: WorkspaceTargetRecord, user: UserProfile): WorkspaceTarget | null {
  const matches = findingsForWorkspaceTarget(target, user);
  const representative = matches[0];
  if (!representative) return null;
  const label = target.targetType === 'CLUSTER'
    ? representative.clusterName
    : target.targetType === 'BRANCH'
      ? `${representative.branchCode} · ${representative.branchName}`
      : representative.customerName;
  return {
    id: target.id,
    targetType: target.targetType,
    targetKey: workspaceTargetKey(target),
    label,
    clusterName: representative.clusterName,
    branchCode: target.targetType === 'CLUSTER' ? undefined : representative.branchCode,
    branchName: target.targetType === 'CLUSTER' ? undefined : representative.branchName,
    cif: target.targetType === 'CUSTOMER' ? representative.cif : undefined,
    customerName: target.targetType === 'CUSTOMER' ? representative.customerName : undefined,
    representativeFindingId: representative.id,
    channelId: representative.channelId,
    matchedFindingCount: matches.length,
    createdAt: target.createdAt,
    isPriority: Boolean(target.isPriority),
    prioritizedAt: target.prioritizedAt,
  };
}

async function addWorkspaceTarget(collection: WorkspaceTargetRecord[], dto: WorkspaceTargetCommandDTO, user: UserProfile): Promise<WorkspaceTarget> {
  const matches = findingsForWorkspaceTarget(dto, user);
  if (!matches.length) {
    throw new HttpProblem(404, 'WORKSPACE_TARGET_NOT_FOUND', 'Không tìm thấy phạm vi', 'Cụm, chi nhánh hoặc khách hàng không tồn tại trong phạm vi dữ liệu được cấp.');
  }
  const key = workspaceTargetKey(dto);
  let record = collection.find(item => item.userId === user.id && workspaceTargetKey(item) === key);
  if (!record) {
    record = { id: `workspace-${crypto.randomUUID()}`, userId: user.id, ...dto, createdAt: new Date().toISOString() };
    collection.push(record);
    await persistLocalState();
  }
  return projectWorkspaceTarget(record, user)!;
}

function requireAvailableEvidence(finding: Finding): void {
  if (!reportPresentationForFinding(finding).evidenceRequired) return;
  if (availableEvidencesForFinding(finding.id).length === 0) {
    throw new HttpProblem(
      422,
      'EVIDENCE_REQUIRED_FOR_WORKFLOW',
      'Chưa có bằng chứng khả dụng',
      'Phải tải lên ít nhất một bằng chứng hợp lệ trước khi gửi hoặc phê duyệt hồ sơ.',
    );
  }
}

function validateDynamicPayload(channel: ReportChannel, dto: WebFormFindingDTO): void {
  const payload = dto.customPayload ?? {};
  for (const field of channel.schemaConfig?.fields ?? []) {
    if (field.isSystemCoreField) continue;
    const value = payload[field.fieldKey];
    const missing = value === undefined || value === null || value === '';
    if (field.isRequired && missing) {
      throw new HttpProblem(422, 'DYNAMIC_FORM_INVALID', 'Form báo cáo chưa hợp lệ', `Trường “${field.label}” là bắt buộc.`);
    }
    if (missing) continue;
    if ((field.dataType === 'number' || field.dataType === 'currency') && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new HttpProblem(422, 'DYNAMIC_FORM_INVALID', 'Form báo cáo chưa hợp lệ', `Trường “${field.label}” phải là số.`);
    }
    if (field.dataType === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      throw new HttpProblem(422, 'DYNAMIC_FORM_INVALID', 'Form báo cáo chưa hợp lệ', `Trường “${field.label}” phải là ngày hợp lệ.`);
    }
    if (field.dataType === 'select' && !field.dropdownOptions?.some(option => option.value === value)) {
      throw new HttpProblem(422, 'DYNAMIC_FORM_INVALID', 'Form báo cáo chưa hợp lệ', `Giá trị của “${field.label}” không nằm trong danh sách cấu hình.`);
    }
  }
}

function createFindingFromDto(dto: WebFormFindingDTO, user: UserProfile, id = `find-${crypto.randomUUID()}`): Finding {
  const channel = reportChannels.find(item => item.id === dto.channelId && item.isActive);
  if (!channel) {
    throw new HttpProblem(422, 'CHANNEL_NOT_ACTIVE', 'Kênh báo cáo không hợp lệ', 'Kênh báo cáo không tồn tại hoặc đã ngừng hoạt động.');
  }
  const campaign = dto.campaignId ? auditCampaigns.find(item => item.id === dto.campaignId) : undefined;
  if (dto.campaignId && (!campaign || !canAccessCampaign(user, campaign))) {
    throw new HttpProblem(422, 'CAMPAIGN_NOT_AVAILABLE', 'Chuyên đề không hợp lệ', 'Chuyên đề không tồn tại hoặc tài khoản không được phân công.');
  }
  if (campaign && (!campaign.branchCodes.includes(dto.branchCode) || !campaign.reportChannelIds.includes(dto.channelId))) {
    throw new HttpProblem(422, 'CAMPAIGN_SCOPE_MISMATCH', 'Phạm vi chuyên đề không phù hợp', 'Chi nhánh hoặc loại báo cáo không thuộc chuyên đề đã chọn.');
  }
  validateDynamicPayload(channel, dto);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const deadlineDate = dto.deadlineDate ?? addCalendarDays(dto.auditDate ?? toCalendarDateString(nowDate), channel.slaConfig!.defaultDays);
  const newFinding: Finding = {
    id,
    campaignId: campaign?.id ?? 'campaign-regular-2026',
    channelId: channel.id,
    channelCode: channel.code,
    channelName: channel.name,
    channelVersionId: channel.currentVersionId!,
    workflowVersionId: `${channel.currentVersionId}-workflow`,
    slaPolicyVersionId: `${channel.currentVersionId}-sla`,
    cif: dto.cif,
    customerName: dto.customerName,
    clusterName: dto.clusterName,
    branchCode: dto.branchCode,
    branchName: dto.branchName,
    department: dto.department,
    decisionNo: dto.decisionNo,
    auditDate: dto.auditDate,
    inspectorName: dto.inspectorName || user.fullName,
    creditBalance: Number(dto.creditBalance) || 0,
    loanGroup: dto.loanGroup || 'Chưa xác định',
    collateralValue: dto.collateralValue ?? 0,
    loanPurpose: dto.loanPurpose,
    officerName: dto.officerName,
    deptHeadName: dto.deptHeadName,
    errorCode: dto.errorCode,
    errorGroup: dto.errorGroup || dto.errorCode.split('.')[0],
    errorTitle: dto.errorTitle,
    description: dto.description,
    quantity: dto.quantity ?? 1,
    exposureAmount: dto.exposureAmount,
    // Provenance from the CoPlus inspection record; the campaign code stands in for the đoàn when
    // a finding is captured directly here rather than lifted from a Tiểu biên bản.
    inspectionTeamCode: dto.inspectionTeamCode ?? campaign?.code,
    sourceRecordCode: dto.sourceRecordCode,
    businessLine: dto.businessLine,
    riskLevel: dto.riskLevel,
    penaltyProposalCode: dto.penaltyProposalCode,
    referenceDocument: dto.referenceDocument,
    dynamicPayload: dto.customPayload,
    workflowStatus: 'PENDING',
    slaStatus: 'ON_TRACK',
    version: 1,
    deadlineDate,
    isOverdue: false,
    evidenceCount: 0,
    subItems: [{
      id: `${id}-item-1`,
      findingId: id,
      content: dto.description,
      order: 1,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  };
  const evaluation = slaWorker.evaluateFindingSla(newFinding, nowDate);
  newFinding.slaStatus = evaluation.slaStatus;
  newFinding.isOverdue = evaluation.isOverdue;
  return newFinding;
}

async function ensureFindingDriveFolder(finding: Finding): Promise<void> {
  const campaign = auditCampaigns.find(item => item.id === finding.campaignId);
  if (!campaign || campaign.driveProvisionStatus !== 'READY') return;
  if (!campaign.driveRootFolderId) {
    throw new HttpProblem(503, 'CAMPAIGN_DRIVE_FOLDER_MISSING', 'Kho chuyên đề chưa sẵn sàng', 'Chuyên đề đang thiếu ID thư mục Google Drive.');
  }
  await appsScriptDriveGateway.execute('ENSURE_ERROR_FOLDER', {
    campaignId: campaign.id,
    campaignFolderId: campaign.driveRootFolderId,
    cif: finding.cif,
    customerName: finding.customerName,
    errorCode: finding.errorCode,
  });
}

function uniqueCustomerCount(items: Finding[]): number {
  return new Set(items.map(item => `${item.branchCode}:${item.cif}`)).size;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '').replace(/\r?\n/g, ' ');
  const normalized = typeof value === 'string' && /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${normalized.replace(/"/g, '""')}"`;
}

type ReportFieldValue = string | number | boolean;

const reportFieldAccessors: Record<ReportFieldKey, (finding: Finding) => ReportFieldValue> = {
  'dimension.channel': finding => finding.channelCode,
  'dimension.campaign': finding => finding.campaignId ?? '',
  'dimension.campaign_decision': finding => auditCampaigns.find(campaign => campaign.id === finding.campaignId)?.decisionNo ?? '',
  'dimension.cluster': finding => finding.clusterName,
  'dimension.branch': finding => finding.branchCode,
  'dimension.department': finding => finding.department || '',
  'dimension.cif': finding => finding.cif,
  'dimension.customer': finding => finding.customerName,
  'dimension.officer': finding => finding.officerName || '',
  'dimension.error_code': finding => finding.errorCode,
  'dimension.error_group': finding => finding.errorGroup ?? '',
  'dimension.workflow_status': finding => finding.workflowStatus,
  'dimension.sla_status': finding => finding.slaStatus,
  'dimension.inspection_team': finding => finding.inspectionTeamCode ?? '',
  'dimension.source_record': finding => finding.sourceRecordCode ?? '',
  'dimension.business_line': finding => finding.businessLine ?? '',
  'dimension.risk_level': finding => finding.riskLevel ?? '',
  'dimension.penalty_proposal': finding => finding.penaltyProposalCode ?? '',
  'date.audit': finding => finding.auditDate || finding.createdAt.slice(0, 10),
  'date.deadline': finding => finding.deadlineDate,
  'measure.credit_balance': finding => finding.creditBalance,
  'measure.collateral_value': finding => finding.collateralValue ?? 0,
  'measure.exposure': finding => finding.exposureAmount,
  'measure.quantity': finding => finding.quantity,
  'flag.overdue': finding => finding.isOverdue,
};

const workflowStatusLabels: Record<Finding['workflowStatus'], string> = {
  PENDING: 'Chờ chi nhánh khắc phục',
  SUBMITTED_BRANCH: 'Chờ Kiểm soát chi nhánh',
  SUBMITTED_INTERNAL: 'Chờ Khối Nội Bộ',
  REJECTED: 'Đã chuyển trả',
  WAIVED_RESOLVED: 'Đã đóng lỗi',
};

const slaStatusLabels: Record<Finding['slaStatus'], string> = {
  ON_TRACK: 'Trong hạn',
  DUE_SOON: 'Sắp đến hạn',
  OVERDUE: 'Quá hạn',
  // Was missing: a closed finding grouped or exported by SLA status rendered an empty label.
  CLOSED: 'Đã đóng',
};

function normalizedReportValue(value: ReportFieldValue): ReportFieldValue {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('vi-VN') : value;
}

function valuesEqual(left: ReportFieldValue, right: ReportFieldValue): boolean {
  return normalizedReportValue(left) === normalizedReportValue(right);
}

function matchesReportRule(finding: Finding, rule: ReportFilterRule): boolean {
  const actual = reportFieldAccessors[rule.key](finding);
  switch (rule.operator) {
    case 'op.eq': return rule.value !== undefined && valuesEqual(actual, rule.value);
    case 'op.neq': return rule.value !== undefined && !valuesEqual(actual, rule.value);
    case 'op.contains': return String(actual).toLocaleLowerCase('vi-VN').includes(String(rule.value).toLocaleLowerCase('vi-VN'));
    case 'op.in': return Boolean(rule.values?.some(value => valuesEqual(actual, value)));
    case 'op.gte': return rule.value !== undefined && actual >= rule.value;
    case 'op.lte': return rule.value !== undefined && actual <= rule.value;
    case 'op.between': return rule.from !== undefined && rule.to !== undefined && actual >= rule.from && actual <= rule.to;
    case 'op.is_true': return actual === true;
    case 'op.is_false': return actual === false;
  }
}

function applyCanonicalReportRules(items: Finding[], rules: ReportFilterRule[], match: ReportRunRequest['match']): Finding[] {
  if (rules.length === 0) return items;
  return items.filter(finding => match === 'ANY'
    ? rules.some(rule => matchesReportRule(finding, rule))
    : rules.every(rule => matchesReportRule(finding, rule)));
}

function customerRepresentatives(items: Finding[]): Finding[] {
  return [...new Map(items.map(item => [`${item.branchCode}:${item.cif}`, item])).values()];
}

function calculateReportMetric(items: Finding[], key: ReportMetricKey): number {
  const customers = customerRepresentatives(items);
  switch (key) {
    case 'metric.customer_count': return customers.length;
    case 'metric.finding_count': return items.length;
    case 'metric.exposure_sum': return items.reduce((sum, item) => sum + item.exposureAmount, 0);
    case 'metric.credit_balance_sum': return customers.reduce((sum, item) => sum + item.creditBalance, 0);
    case 'metric.collateral_value_sum': return customers.reduce((sum, item) => sum + (item.collateralValue ?? 0), 0);
    case 'metric.quantity_sum': return items.reduce((sum, item) => sum + item.quantity, 0);
    case 'metric.overdue_count': return items.filter(item => item.isOverdue).length;
    case 'metric.resolved_count': return items.filter(item => item.workflowStatus === 'WAIVED_RESOLVED').length;
    case 'metric.remediation_rate': return items.length
      ? Math.round((items.filter(item => item.workflowStatus === 'WAIVED_RESOLVED').length / items.length) * 1000) / 10
      : 0;
  }
}

function calculateMetricValues(items: Finding[], metrics: ReportMetricKey[]): Partial<Record<ReportMetricKey, number>> {
  return Object.fromEntries(metrics.map(key => [key, calculateReportMetric(items, key)]));
}

function reportValueLabel(key: ReportFieldKey, value: ReportFieldValue, finding: Finding): string {
  if (key === 'dimension.branch') return `${finding.branchCode} · ${finding.branchName}`;
  if (key === 'dimension.channel') return `${finding.channelCode} · ${finding.channelName}`;
  if (key === 'dimension.campaign') {
    const campaign = auditCampaigns.find(item => item.id === finding.campaignId);
    return campaign ? `${campaign.code} · ${campaign.name}` : 'Chưa gắn chuyên đề';
  }
  if (key === 'dimension.workflow_status') return workflowStatusLabels[finding.workflowStatus];
  if (key === 'dimension.sla_status') return slaStatusLabels[finding.slaStatus];
  if (key === 'dimension.business_line') return finding.businessLine ? businessLineLabels[finding.businessLine] : 'Chưa phân loại';
  if (key === 'dimension.risk_level') return finding.riskLevel ? riskLevelLabels[finding.riskLevel] : 'Chưa chấm';
  if (key === 'dimension.inspection_team') return finding.inspectionTeamCode || 'Chưa gắn đoàn';
  if (key === 'flag.overdue') return value ? 'Quá hạn' : 'Chưa quá hạn';
  return String(value || 'Chưa xác định');
}

function executeReportRun(items: Finding[], query: ReportRunRequest): ReportRunResult {
  const matched = applyCanonicalReportRules(items, query.rules, query.match);
  const groups = new Map<string, { label: string; items: Finding[] }>();
  for (const finding of matched) {
    const value = reportFieldAccessors[query.groupBy](finding);
    const key = String(value || 'UNASSIGNED');
    const current = groups.get(key) || { label: reportValueLabel(query.groupBy, value, finding), items: [] };
    current.items.push(finding);
    groups.set(key, current);
  }
  const sortKey = query.sort?.key || query.metrics[0];
  const direction = query.sort?.direction === 'asc' ? 1 : -1;
  const rows = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    metricValues: calculateMetricValues(group.items, query.metrics),
  })).sort((left, right) => {
    const delta = ((left.metricValues[sortKey] || 0) - (right.metricValues[sortKey] || 0)) * direction;
    return delta || left.label.localeCompare(right.label, 'vi-VN');
  }).slice(0, query.limit);

  return {
    generatedAt: new Date().toISOString(),
    query,
    matchedFindingCount: matched.length,
    metricValues: calculateMetricValues(matched, query.metrics),
    groups: rows,
  };
}

function normalizedReportCatalogConfiguration(): ReportCatalogConfiguration {
  const configuredFields = new Map(reportCatalogConfiguration.fields.map(field => [field.key, field]));
  const configuredMetrics = new Map(reportCatalogConfiguration.metrics.map(metric => [metric.key, metric]));
  return {
    ...reportCatalogConfiguration,
    fields: REPORT_FIELD_CATALOG.map((base, index) => {
      const configured = configuredFields.get(base.key);
      return {
        ...base,
        label: configured?.label || base.label,
        isActive: configured?.isActive ?? true,
        groupable: base.groupable && (configured?.groupable ?? base.groupable),
        exportable: base.exportable && (configured?.exportable ?? base.exportable),
        defaultExport: configured?.defaultExport ?? DEFAULT_REPORT_EXPORT_FIELDS.has(base.key),
        sortOrder: configured?.sortOrder ?? index,
      };
    }).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'vi-VN')),
    metrics: REPORT_METRIC_CATALOG.map((base, index) => {
      const configured = configuredMetrics.get(base.key);
      return {
        ...base,
        label: configured?.label || base.label,
        isActive: configured?.isActive ?? DEFAULT_REPORT_METRICS.has(base.key),
        sortOrder: configured?.sortOrder ?? index,
      };
    }).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'vi-VN')),
  };
}

function buildReportCatalog(items: Finding[]): ReportCatalog {
  const configuration = normalizedReportCatalogConfiguration();
  const fields = configuration.fields.filter(field => field.isActive).map(field => {
    if (field.valueType !== 'ENUM') return { ...field };
    const options = new Map<string, string>();
    for (const finding of items) {
      const value = reportFieldAccessors[field.key](finding);
      const key = String(value);
      options.set(key, reportValueLabel(field.key, value, finding));
    }
    return {
      ...field,
      options: [...options.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi-VN')),
    };
  });
  return {
    version: 'report-keys.v1',
    fields,
    operators: REPORT_OPERATOR_CATALOG,
    metrics: configuration.metrics.filter(metric => metric.isActive),
  };
}

function assertReportConfigurationAvailable(query: ReportRunRequest, columns?: ReportFieldKey[]): void {
  const configuration = normalizedReportCatalogConfiguration();
  const fields = new Map(configuration.fields.map(field => [field.key, field]));
  const metrics = new Map(configuration.metrics.map(metric => [metric.key, metric]));
  const unavailableRule = query.rules.find(rule => !fields.get(rule.key)?.isActive);
  if (unavailableRule) {
    throw new HttpProblem(422, 'REPORT_FIELD_DISABLED', 'Trường báo cáo đã tắt', 'Bộ lọc đang dùng một trường không còn được quản trị viên cho phép.');
  }
  const groupField = fields.get(query.groupBy);
  if (!groupField?.isActive || !groupField.groupable) {
    throw new HttpProblem(422, 'REPORT_GROUP_DISABLED', 'Cách xem không còn áp dụng', 'Trường phân nhóm không còn được quản trị viên cho phép.');
  }
  if (query.metrics.some(key => !metrics.get(key)?.isActive)) {
    throw new HttpProblem(422, 'REPORT_METRIC_DISABLED', 'Chỉ số báo cáo đã tắt', 'Báo cáo đang dùng một chỉ số không còn được quản trị viên cho phép.');
  }
  if (columns?.some(key => {
    const field = fields.get(key);
    return !field?.isActive || !field.exportable;
  })) {
    throw new HttpProblem(422, 'REPORT_EXPORT_FIELD_DISABLED', 'Cột xuất đã tắt', 'Báo cáo đang dùng một cột không còn được quản trị viên cho phép xuất.');
  }
}

function applyReportFilters(items: Finding[], filters: ReportFilterQuery): Finding[] {
  return items.filter(finding => {
    if (filters.branchCode && finding.branchCode !== filters.branchCode) return false;
    if (filters.department && finding.department !== filters.department) return false;
    if (filters.workflowStatus && finding.workflowStatus !== filters.workflowStatus) return false;
    if (filters.errorCode && !finding.errorCode.toLocaleLowerCase('vi-VN').includes(filters.errorCode.toLocaleLowerCase('vi-VN'))) return false;
    const findingDate = finding.auditDate || finding.createdAt.slice(0, 10);
    if (filters.dateFrom && findingDate < filters.dateFrom) return false;
    if (filters.dateTo && findingDate > filters.dateTo) return false;
    return true;
  });
}

function idempotencyContext(
  request: FastifyRequest,
  user: UserProfile,
  body: unknown,
): { cacheKey?: string; requestHash?: string; replay?: Finding } {
  const rawKey = request.headers['idempotency-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    throw new HttpProblem(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu Idempotency-Key', 'Mọi lệnh thay đổi trạng thái phải có Idempotency-Key để chống xử lý lặp.');
  }
  if (key.length > 255) {
    throw new HttpProblem(422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key không hợp lệ', 'Idempotency-Key không được dài quá 255 ký tự.');
  }

  const cacheKey = `${user.id}:${request.method}:${request.url}:${key}`;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const existing = idempotencyRecords[cacheKey];
  if (existing && existing.requestHash !== requestHash) {
    throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Xung đột Idempotency-Key', 'Idempotency-Key đã được dùng với nội dung yêu cầu khác.');
  }
  return {
    cacheKey,
    requestHash,
    replay: existing ? structuredClone(existing.response) : undefined,
  };
}

function rememberIdempotentResponse(
  context: { cacheKey?: string; requestHash?: string },
  response: Finding,
): void {
  if (context.cacheKey && context.requestHash) {
    idempotencyRecords[context.cacheKey] = {
      requestHash: context.requestHash,
      response: structuredClone(response),
    };
  }
}

// ----------------------------------------------------
// REST API ENDPOINTS (/api/v1/)
// ----------------------------------------------------

// Healthcheck
app.get('/api/v1/health', async () => ({ status: 'UP', timestamp: new Date().toISOString() }));
export function buildReadinessPayload(
  dataStore: StateRepositoryStatus,
  evidenceStorage: EvidenceStorageStatus,
) {
  const postgresUnavailable = dataStore.mode === 'postgres' && !dataStore.ready;
  const dataStoreMessage = dataStore.mode === 'postgres'
    ? postgresUnavailable
      ? `Postgres không sẵn sàng. ${dataStore.warning ?? 'Không thể xác nhận kết nối database.'}`
      : 'Postgres đã kết nối; state đang lưu bền vững ngoài filesystem serverless.'
    : dataStore.durable
      ? 'Local mode đang lưu trạng thái bền vững bằng JSON nguyên tử.'
      : 'Local mode đang chạy bằng bộ nhớ; dữ liệu sẽ mất khi tiến trình dừng.';
  const evidenceMessage = evidenceStorage.ready
    ? ''
    : evidenceStorage.mode === 'google-drive'
      ? ` Google Drive chưa sẵn sàng. ${evidenceStorage.warning ?? 'Adapter API v3 chưa được cài đặt.'} Hệ thống không fallback local.`
      : ` Chế độ lưu minh chứng không hợp lệ. ${evidenceStorage.warning ?? 'Cần cấu hình EVIDENCE_STORAGE_MODE hợp lệ.'} Hệ thống không fallback local.`;
  const ready = !postgresUnavailable && evidenceStorage.ready;
  const message = `${dataStoreMessage}${evidenceMessage} Chưa phải trạng thái production-ready.`;
  return {
    status: 'DEGRADED' as const,
    ready,
    checks: {
      dataStore,
      evidenceStorage,
      auth: { mode: 'local-credential-session', productionSafe: false },
    },
    message,
  };
}

app.get('/api/v1/ready', async () => buildReadinessPayload(
  await stateRepository.getStatus(),
  googleDriveService.getStorageStatus(),
));

function requireCronAuthorization(request: FastifyRequest): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new HttpProblem(503, 'CRON_NOT_CONFIGURED', 'Cron SLA chưa được cấu hình', 'Máy chủ chưa có CRON_SECRET.');
  }

  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const received = Buffer.from(request.headers.authorization ?? '', 'utf8');
  const authorized = expected.length === received.length && crypto.timingSafeEqual(expected, received);
  if (!authorized) {
    throw new HttpProblem(401, 'CRON_AUTH_REQUIRED', 'Không thể xác thực cron', 'Authorization Bearer không hợp lệ.');
  }
}

app.route({
  method: ['GET', 'POST'],
  url: internalSlaPath,
  handler: async (request) => {
    requireCronAuthorization(request);
    return { success: true, ...(await evaluateCurrentSlaState()) };
  },
});

// Auth: Me
app.post('/api/v1/auth/login', async (req: FastifyRequest<{ Body: unknown }>, reply) => {
  const credentials = LoginSchema.parse(req.body);
  const normalizedUsername = credentials.username.toLocaleLowerCase('vi-VN');
  const directoryEntry = localCredentialDirectory.find(item => item.username === normalizedUsername);
  const fallbackHash = localCredentialDirectory[0].passwordHash;
  const passwordValid = await verifyPassword(credentials.password, directoryEntry?.passwordHash ?? fallbackHash);
  const user = directoryEntry ? appUsers.find(item => item.id === directoryEntry.userId && item.isActive) : undefined;
  if (!passwordValid || !user) {
    throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Đăng nhập không thành công', 'Tài khoản hoặc mật khẩu không đúng.');
  }

  const session = authSessionStore.create(user.id);
  authSessions = authSessionStore.records();
  await persistLocalState();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header('set-cookie', `audit_bgs_session=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`);
  return { user, expiresAt: session.record.expiresAt };
});

app.post('/api/v1/auth/logout', async (req, reply) => {
  const token = cookieValue(req, 'audit_bgs_session');
  if (token) authSessionStore.revoke(token);
  authSessions = authSessionStore.records();
  await persistLocalState();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header('set-cookie', `audit_bgs_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  return reply.code(204).send();
});

app.get('/api/v1/me', async (req) => {
  const user = getCurrentUser(req);
  return { user };
});

app.get('/api/v1/campaigns', async (req) => {
  const user = getCurrentUser(req);
  return auditCampaigns.filter(campaign => canAccessCampaign(user, campaign));
});

app.post('/api/v1/admin/campaigns', async (req: FastifyRequest<{ Body: unknown }>, reply) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = CreateAuditCampaignSchema.parse(req.body);
  if (auditCampaigns.some(item => item.code.toLocaleLowerCase('vi-VN') === body.code.toLocaleLowerCase('vi-VN'))) {
    throw new HttpProblem(409, 'CAMPAIGN_CODE_EXISTS', 'Mã chuyên đề đã tồn tại', 'Hãy sử dụng mã chuyên đề khác.');
  }
  if (!appUsers.some(item => item.id === body.leadUserId && item.isActive)) throw new HttpProblem(422, 'CAMPAIGN_LEAD_INVALID', 'Trưởng đoàn không hợp lệ', 'Tài khoản trưởng đoàn không tồn tại hoặc đã bị khóa.');
  if (body.members.some(member => !appUsers.some(item => item.id === member.userId && item.isActive))) throw new HttpProblem(422, 'CAMPAIGN_MEMBER_INVALID', 'Thành viên không hợp lệ', 'Danh sách có tài khoản không tồn tại hoặc đã bị khóa.');
  if (body.reportChannelIds.some(id => !reportChannels.some(channel => channel.id === id && channel.isActive))) throw new HttpProblem(422, 'CAMPAIGN_CHANNEL_INVALID', 'Loại báo cáo không hợp lệ', 'Danh sách có loại báo cáo không hoạt động.');
  const now = new Date().toISOString();
  const campaign: AuditCampaign = {
    ...body, id: `campaign-${crypto.randomUUID()}`, status: 'DRAFT', driveProvisionStatus: 'NOT_CONFIGURED',
    version: 1, createdByUserId: user.id, createdAt: now, updatedAt: now,
  };
  auditCampaigns.push(campaign);
  await persistLocalState();
  return reply.code(201).send(campaign);
});

app.patch('/api/v1/admin/campaigns/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = UpdateAuditCampaignSchema.parse(req.body);
  const index = auditCampaigns.findIndex(item => item.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, 'CAMPAIGN_NOT_FOUND', 'Không tìm thấy chuyên đề', 'Chuyên đề không tồn tại.');
  const current = auditCampaigns[index];
  if (current.version !== body.expectedVersion) throw new HttpProblem(409, 'CAMPAIGN_VERSION_CONFLICT', 'Chuyên đề đã thay đổi', 'Hãy tải lại dữ liệu trước khi lưu.');
  if (body.status) {
    try { validateCampaignTransition(current.status, body.status); }
    catch { throw new HttpProblem(409, 'CAMPAIGN_TRANSITION_INVALID', 'Không thể đổi trạng thái', 'Chuyên đề phải đóng trước khi lưu trữ.'); }
  }
  const { expectedVersion: _expectedVersion, ...changes } = body;
  auditCampaigns[index] = { ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString() };
  await persistLocalState();
  return auditCampaigns[index];
});

app.post('/api/v1/admin/campaigns/:id/provision-drive', async (req: FastifyRequest<{ Params: { id: string } }>) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const index = auditCampaigns.findIndex(item => item.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, 'CAMPAIGN_NOT_FOUND', 'Không tìm thấy chuyên đề', 'Chuyên đề không tồn tại.');
  if (!appsScriptDriveGateway.isConfigured()) {
    throw new HttpProblem(503, 'DRIVE_NOT_CONFIGURED', 'Google Drive chưa được cấu hình', 'Quản trị viên cần khai báo URL Apps Script và khóa bí mật trước khi tạo kho dữ liệu.');
  }

  const campaign = auditCampaigns[index];
  const aclByEmail = new Map<string, 'READER' | 'WRITER'>();
  const grant = (candidate: UserProfile, access: 'READER' | 'WRITER') => {
    const email = (candidate.googleWorkspaceEmail ?? candidate.email).trim().toLowerCase();
    if (!email) return;
    const current = aclByEmail.get(email);
    if (current !== 'WRITER') aclByEmail.set(email, access);
  };
  for (const member of campaign.members) {
    const candidate = appUsers.find(item => item.id === member.userId && item.isActive);
    if (candidate) grant(candidate, 'WRITER');
  }
  for (const candidate of appUsers.filter(item => item.isActive && item.branchCode && campaign.branchCodes.includes(item.branchCode))) {
    grant(candidate, candidate.roles.includes('BRANCH_INPUT') ? 'WRITER' : 'READER');
  }
  for (const candidate of appUsers.filter(item => item.isActive && item.roles.includes('ADMIN'))) grant(candidate, 'WRITER');

  auditCampaigns[index] = {
    ...campaign,
    driveProvisionStatus: 'PROVISIONING',
    driveLastError: undefined,
    version: campaign.version + 1,
    updatedAt: new Date().toISOString(),
  };
  await persistLocalState();

  try {
    const provisioned = await appsScriptDriveGateway.execute<{ folderId: string; folderUrl: string }>('PROVISION_CAMPAIGN', {
      campaignId: campaign.id,
      campaignCode: campaign.code,
      campaignName: campaign.name,
      decisionNo: campaign.decisionNo,
    });
    if (!provisioned.data.folderId || !provisioned.data.folderUrl) {
      throw new HttpProblem(502, 'DRIVE_FOLDER_RESPONSE_INVALID', 'Không thể tạo kho Google Drive', 'Apps Script không trả về ID thư mục chuyên đề.');
    }
    await appsScriptDriveGateway.execute('SYNC_CAMPAIGN_ACL', {
      campaignId: campaign.id,
      campaignFolderId: provisioned.data.folderId,
      members: [...aclByEmail.entries()].map(([email, access]) => ({ email, access })),
    });
    auditCampaigns[index] = {
      ...auditCampaigns[index],
      driveRootFolderId: provisioned.data.folderId,
      driveRootUrl: provisioned.data.folderUrl,
      driveProvisionStatus: 'READY',
      driveLastError: undefined,
      version: auditCampaigns[index].version + 1,
      updatedAt: new Date().toISOString(),
    };
    await persistLocalState();
    return auditCampaigns[index];
  } catch (error) {
    auditCampaigns[index] = {
      ...auditCampaigns[index],
      driveProvisionStatus: 'FAILED',
      driveLastError: error instanceof Error ? error.message : 'Không thể tạo kho dữ liệu.',
      version: auditCampaigns[index].version + 1,
      updatedAt: new Date().toISOString(),
    };
    await persistLocalState();
    throw error;
  }
});

/**
 * Branches the caller may file a finding against. Anyone allowed to create a hồ sơ needs this —
 * not just admins — otherwise the branch picker on the capture form has nothing to offer.
 */
app.get('/api/v1/org-units/branches', async (req) => {
  const user = getCurrentUser(req);
  const seesEverything = user.scopes.some(scope => scope.scopeType === 'ALL');
  const scopedBranchCodes = new Set(user.scopes.flatMap(scope => scope.orgUnitCode ? [scope.orgUnitCode] : []));
  const scopedClusters = new Set(user.scopes.flatMap(scope => scope.clusterName ? [scope.clusterName] : []));
  return orgUnits
    .filter(unit => unit.type === 'BRANCH' && unit.isActive)
    .map(unit => ({ ...unit, parentName: orgUnits.find(candidate => candidate.id === unit.parentId)?.name }))
    .filter(unit => seesEverything
      || scopedBranchCodes.has(unit.code)
      || (unit.parentName ? scopedClusters.has(unit.parentName) : false)
      || unit.code === user.branchCode);
});

// Admin: Org Units
app.get('/api/v1/admin/org-units', async (req) => {
  requireAdmin(getCurrentUser(req));
  return orgUnits.map(unit => {
    const parent = orgUnits.find(candidate => candidate.id === unit.parentId);
    const leader = appUsers.find(candidate => candidate.id === unit.leaderUserId);
    return {
      ...unit,
      parentName: parent?.name,
      leaderName: leader?.fullName ?? unit.leaderName,
    };
  });
});
app.post('/api/v1/admin/org-units', async (req: FastifyRequest<{ Body: any }>) => {
  requireAdmin(getCurrentUser(req));
  const body = CreateOrgUnitSchema.parse(req.body);
  if (orgUnits.some(unit => unit.code.toLowerCase() === body.code.toLowerCase())) {
    throw new HttpProblem(409, 'ORG_UNIT_CODE_EXISTS', 'Mã đơn vị đã tồn tại', 'Vui lòng sử dụng một mã đơn vị khác.');
  }
  const expectedParentType = {
    INTERNAL_TEAM: 'HEAD_OFFICE',
    CLUSTER: 'HEAD_OFFICE',
    BRANCH: 'CLUSTER',
    DEPARTMENT: 'BRANCH',
  } as const;
  if (body.type !== 'HEAD_OFFICE') {
    const parent = orgUnits.find(unit => unit.id === body.parentId);
    const requiredType = expectedParentType[body.type];
    if (!parent || parent.type !== requiredType) {
      throw new HttpProblem(422, 'ORG_PARENT_INVALID', 'Đơn vị cha không hợp lệ', `${body.type} phải trực thuộc ${requiredType}.`);
    }
  }
  const newUnit: OrgUnit = {
    id: `org-${crypto.randomUUID()}`,
    code: body.code,
    name: body.name,
    type: body.type,
    parentId: body.parentId,
    leaderUserId: body.leaderUserId,
    isActive: body.isActive,
    metadata: body.metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  orgUnits.push(newUnit);
  await persistLocalState();
  return newUnit;
});

// Admin: Users
app.get('/api/v1/admin/users', async (req) => {
  requireAdmin(getCurrentUser(req));
  return appUsers.map(user => {
    const team = user.internalTeamId
      ? orgUnits.find(unit => unit.id === user.internalTeamId && unit.type === 'INTERNAL_TEAM')
      : undefined;
    const branch = user.branchCode
      ? orgUnits.find(unit => unit.code === user.branchCode && unit.type === 'BRANCH')
      : undefined;
    const cluster = branch
      ? orgUnits.find(unit => unit.id === branch.parentId && unit.type === 'CLUSTER')
      : undefined;
    return {
      ...user,
      internalTeamName: team?.name ?? user.internalTeamName,
      branchName: branch?.name ?? user.branchName,
      clusterName: cluster?.name ?? user.clusterName,
    };
  });
});
app.post('/api/v1/admin/users', async (req: FastifyRequest<{ Body: any }>) => {
  requireAdmin(getCurrentUser(req));
  const body = CreateUserSchema.parse(req.body);
  if (appUsers.some(user => user.email.toLowerCase() === body.email.toLowerCase())) {
    throw new HttpProblem(409, 'USER_EMAIL_EXISTS', 'Email đã được sử dụng', 'Đã tồn tại tài khoản với email này.');
  }

  const internalTeam = body.internalTeamId
    ? orgUnits.find(unit => unit.id === body.internalTeamId && unit.type === 'INTERNAL_TEAM' && unit.isActive)
    : undefined;
  if (body.internalTeamId && !internalTeam) {
    throw new HttpProblem(422, 'INTERNAL_TEAM_INVALID', 'Nhóm nội bộ không hợp lệ', 'Nhóm nội bộ không tồn tại hoặc đã ngừng hoạt động.');
  }
  if (body.teamRole === 'LEAD' && appUsers.some(user => (
    user.isActive && user.internalTeamId === body.internalTeamId && user.teamRole === 'LEAD'
  ))) {
    throw new HttpProblem(409, 'INTERNAL_TEAM_LEAD_EXISTS', 'Nhóm đã có trưởng nhóm', 'Mỗi nhóm chỉ có một Trưởng nhóm kiểm soát đang hoạt động.');
  }

  const branch = body.branchCode
    ? orgUnits.find(unit => unit.code === body.branchCode && unit.type === 'BRANCH' && unit.isActive)
    : undefined;
  const cluster = branch
    ? orgUnits.find(unit => unit.id === branch.parentId && unit.type === 'CLUSTER' && unit.isActive)
    : undefined;
  const department = branch && body.department
    ? orgUnits.find(unit => unit.parentId === branch.id && unit.type === 'DEPARTMENT' && unit.name === body.department && unit.isActive)
    : undefined;
  if (body.portal === 'BRANCH' && (!branch || !cluster || !department)) {
    throw new HttpProblem(422, 'BRANCH_ASSIGNMENT_INVALID', 'Phân công chi nhánh không hợp lệ', 'Chi nhánh hoặc Phòng/PGD không tồn tại trong Cụm địa bàn đã cấu hình.');
  }

  const scopes: UserProfile['scopes'] = ['BRANCH_INPUT', 'BRANCH_CONTROLLER'].includes(body.primaryRole)
      ? [{
          scopeType: 'BRANCH',
          orgUnitId: branch?.id,
          orgUnitCode: branch?.code,
          clusterName: cluster?.name,
          branchName: branch?.name,
          departmentName: department?.name,
        }]
      : ['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER'].includes(body.primaryRole)
        ? [{ scopeType: 'ALL' }]
        : [];
  const newUser: UserProfile = {
    id: `user-${crypto.randomUUID()}`,
    username: body.username || body.email.split('@')[0],
    email: body.email,
    fullName: body.fullName,
    phone: body.phone,
    portal: body.portal,
    roles: body.roles,
    primaryRole: body.primaryRole,
    // Every account carries a CoPlus code so the UI can name its role the way the handbook does;
    // fall back to the closest match when the caller did not state one.
    coplusRole: body.coplusRole ?? inferCoPlusRole(body.roles),
    orgUnitId: internalTeam?.id ?? department?.id,
    internalTeamId: internalTeam?.id,
    internalTeamName: internalTeam?.name,
    teamRole: body.teamRole,
    clusterName: cluster?.name,
    branchCode: branch?.code,
    branchName: branch?.name,
    department: department?.name,
    isActive: body.isActive,
    scopes,
  };
  appUsers.push(newUser);
  if (internalTeam && body.teamRole === 'LEAD') {
    internalTeam.leaderUserId = newUser.id;
    internalTeam.leaderName = newUser.fullName;
    internalTeam.updatedAt = new Date().toISOString();
  }
  await persistLocalState();
  return newUser;
});

// Admin: Channels
app.get('/api/v1/admin/channels', async (req) => {
  requireAdmin(getCurrentUser(req));
  return reportChannels;
});
app.get('/api/v1/channels/active', async () => reportChannels.filter(c => c.isActive));
app.post('/api/v1/admin/channels', async (req: FastifyRequest<{ Body: any }>) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const id = `chan-${crypto.randomUUID()}`;
  // Untrusted request body: defaults are applied to a plain record, then zod validates the result.
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const body = CreateReportChannelSchema.parse({
    ...payload,
    description: payload.description ?? '',
    category: payload.category ?? 'REGULAR_AUDIT',
    icon: payload.icon ?? 'FileSpreadsheet',
    badgeColor: payload.badgeColor ?? 'teal',
    inputMethods: payload.inputMethods ?? ['EXCEL_IMPORT', 'WEB_FORM'],
    issuingDepartment: payload.issuingDepartment ?? 'Ban Kiểm toán Nội bộ',
    isActive: payload.isActive ?? true,
    schemaConfig: payload.schemaConfig ?? defaultSchemaConfig(typeof payload.code === 'string' ? payload.code : undefined),
    workflowConfig: payload.workflowConfig ?? defaultWorkflowConfig(id),
    slaConfig: payload.slaConfig ?? defaultSlaConfig(),
    integrationConfig: payload.integrationConfig ?? defaultIntegrationConfig(),
  });
  if (reportChannels.some(channel => channel.code.toUpperCase() === body.code.toUpperCase())) {
    throw new HttpProblem(409, 'REPORT_TYPE_CODE_EXISTS', 'Mã loại báo cáo đã tồn tại', 'Hãy chọn mã loại báo cáo khác.');
  }
  const now = new Date().toISOString();
  const currentVersionId = `${id}-v1`;
  const newChan: ReportChannel = {
    ...body,
    id,
    code: body.code.toUpperCase(),
    configVersion: 1,
    currentVersionId,
    workflowConfig: { ...body.workflowConfig, id: `${currentVersionId}-workflow`, channelId: id },
    createdAt: now,
    updatedAt: now,
  };
  reportChannels.push(newChan);
  reportChannelVersions.push({
    id: currentVersionId,
    channelId: id,
    versionNumber: 1,
    snapshot: structuredClone(newChan),
    createdByUserId: user.id,
    createdAt: now,
  });
  await persistLocalState();
  return newChan;
});

app.patch('/api/v1/admin/channels/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const index = reportChannels.findIndex(channel => channel.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, 'REPORT_TYPE_NOT_FOUND', 'Không tìm thấy loại báo cáo', 'Loại báo cáo không tồn tại.');
  const body = UpdateReportChannelSchema.parse(req.body);
  if (body.code && reportChannels.some(channel => channel.id !== req.params.id && channel.code.toUpperCase() === body.code!.toUpperCase())) {
    throw new HttpProblem(409, 'REPORT_TYPE_CODE_EXISTS', 'Mã loại báo cáo đã tồn tại', 'Hãy chọn mã loại báo cáo khác.');
  }
  const current = reportChannels[index];
  const configVersion = current.configVersion + 1;
  const currentVersionId = `${current.id}-v${configVersion}`;
  const updated = normalizedReportChannel({
    ...current,
    ...body,
    code: (body.code ?? current.code).toUpperCase(),
    configVersion,
    currentVersionId,
    workflowConfig: body.workflowConfig
      ? { ...body.workflowConfig, id: `${currentVersionId}-workflow`, channelId: current.id }
      : { ...current.workflowConfig!, id: `${currentVersionId}-workflow`, channelId: current.id },
    updatedAt: new Date().toISOString(),
  });
  reportChannels[index] = updated;
  reportChannelVersions.push({
    id: currentVersionId,
    channelId: current.id,
    versionNumber: configVersion,
    snapshot: structuredClone(updated),
    createdByUserId: user.id,
    createdAt: updated.updatedAt,
  });
  await persistLocalState();
  return updated;
});

app.get('/api/v1/admin/channels/:id/versions', async (req: FastifyRequest<{ Params: { id: string } }>) => {
  requireAdmin(getCurrentUser(req));
  if (!reportChannels.some(channel => channel.id === req.params.id)) {
    throw new HttpProblem(404, 'REPORT_TYPE_NOT_FOUND', 'Không tìm thấy loại báo cáo', 'Loại báo cáo không tồn tại.');
  }
  return reportChannelVersions
    .filter(version => version.channelId === req.params.id)
    .sort((left, right) => right.versionNumber - left.versionNumber);
});

app.get('/api/v1/admin/channels/:id/integration-readiness', async (req: FastifyRequest<{ Params: { id: string } }>) => {
  requireAdmin(getCurrentUser(req));
  const channel = reportChannels.find(item => item.id === req.params.id);
  if (!channel) throw new HttpProblem(404, 'REPORT_TYPE_NOT_FOUND', 'Không tìm thấy loại báo cáo', 'Loại báo cáo không tồn tại.');
  const googleCredentialReady = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);
  return {
    googleSheets: {
      configured: !channel.integrationConfig?.googleSheets.enabled || googleCredentialReady,
      message: channel.integrationConfig?.googleSheets.enabled && !googleCredentialReady
        ? 'Thiếu GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS trên máy chủ.'
        : channel.integrationConfig?.googleSheets.enabled ? 'Máy chủ đã có thông tin xác thực Google.' : 'Đang tắt.',
    },
    email: {
      configured: !channel.integrationConfig?.email.enabled || smtpReady,
      message: channel.integrationConfig?.email.enabled && !smtpReady
        ? 'Thiếu SMTP_HOST, SMTP_USER, SMTP_PASSWORD hoặc EMAIL_FROM trên máy chủ.'
        : channel.integrationConfig?.email.enabled ? 'Máy chủ đã có cấu hình SMTP.' : 'Đang tắt.',
    },
  };
});

app.delete('/api/v1/admin/channels/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
  requireAdmin(getCurrentUser(req));
  const index = reportChannels.findIndex(channel => channel.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, 'REPORT_TYPE_NOT_FOUND', 'Không tìm thấy loại báo cáo', 'Loại báo cáo không tồn tại.');
  if (findings.some(finding => finding.channelId === req.params.id)) {
    throw new HttpProblem(409, 'REPORT_TYPE_IN_USE', 'Không thể xóa loại báo cáo đang có dữ liệu', 'Hãy chuyển loại báo cáo sang trạng thái tạm ngừng để giữ nguyên lịch sử hồ sơ.');
  }
  reportChannels.splice(index, 1);
  reportChannelVersions = reportChannelVersions.filter(version => version.channelId !== req.params.id);
  await persistLocalState();
  return reply.code(204).send();
});

// Admin: authoritative workflow audit trail from durable local state.
// Production still needs an append-only database sink before this can be called immutable.
app.get('/api/v1/admin/audit-events', async (req) => {
  requireAdmin(getCurrentUser(req));

  return workflowEvents
    .map<AuditLogEntry>((event) => {
      const finding = findings.find(item => item.id === event.findingId);
      return {
        id: event.id,
        timestamp: event.createdAt,
        eventType: event.command,
        actorName: event.actorName,
        actorRole: event.actorRole,
        targetEntity: finding ? `CIF ${finding.cif} (${finding.errorCode})` : `Hồ sơ ${event.findingId}`,
        details: event.rejectionReason || event.notes || `${event.fromStatus} → ${event.toStatus}`,
        findingId: event.findingId,
        cif: finding?.cif ?? '',
        errorCode: finding?.errorCode ?? '',
        branchCode: finding?.branchCode ?? '',
      };
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
});

app.get('/api/v1/workspace/my-work', async (req) => {
  const user = getCurrentUser(req);
  const scoped = filterFindingsByScope(findings, user);
  const actionable = scoped
    .filter(finding => isActionableForUser(finding, user))
    .map(finding => withWorkspaceProjection(finding, user.id))
    .sort((left, right) => left.deadlineDate.localeCompare(right.deadlineDate));
  const followingIds = new Set(
    findingFollows.filter(item => item.userId === user.id).map(item => item.findingId),
  );
  const following = scoped
    .filter(finding => followingIds.has(finding.id))
    .map(finding => withWorkspaceProjection(finding, user.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const accepted = workspaceAccepted
    .filter(target => target.userId === user.id)
    .map(target => projectWorkspaceTarget(target, user))
    .filter((target): target is WorkspaceTarget => Boolean(target))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const watchTargets = sortWatchTargets(workspaceWatchTargets
    .filter(target => target.userId === user.id)
    .map(target => projectWorkspaceTarget(target, user))
    .filter((target): target is WorkspaceTarget => Boolean(target)));
  return { actionable, following, accepted, watchTargets };
});

app.put('/api/v1/workspace/accepted', async (req: FastifyRequest<{ Body: unknown }>) => {
  const user = getCurrentUser(req);
  requireRoles(user, ['INTERNAL_OFFICER', 'SUPERVISOR', 'INTERNAL_APPROVER', 'BRANCH_INPUT', 'BRANCH_CONTROLLER']);
  const dto = WorkspaceTargetCommandSchema.parse(req.body);
  return addWorkspaceTarget(workspaceAccepted, dto, user);
});

app.delete('/api/v1/workspace/accepted/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
  const user = getCurrentUser(req);
  const exists = workspaceAccepted.some(target => target.id === req.params.id && target.userId === user.id);
  if (!exists) throw new HttpProblem(404, 'WORKSPACE_TARGET_NOT_FOUND', 'Không tìm thấy công việc', 'Công việc không tồn tại hoặc không thuộc người dùng hiện tại.');
  workspaceAccepted = workspaceAccepted.filter(target => target.id !== req.params.id || target.userId !== user.id);
  await persistLocalState();
  return reply.code(204).send();
});

app.put('/api/v1/workspace/watch-targets', async (req: FastifyRequest<{ Body: unknown }>) => {
  const user = getCurrentUser(req);
  requireRoles(user, ['INTERNAL_OFFICER', 'SUPERVISOR', 'INTERNAL_APPROVER', 'BRANCH_INPUT', 'BRANCH_CONTROLLER']);
  const dto = WorkspaceTargetCommandSchema.parse(req.body);
  return addWorkspaceTarget(workspaceWatchTargets, dto, user);
});

app.patch('/api/v1/workspace/watch-targets/:id/priority', async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>) => {
  const user = getCurrentUser(req);
  const body = SetWorkspacePrioritySchema.parse(req.body);
  const target = workspaceWatchTargets.find(item => item.id === req.params.id && item.userId === user.id);
  if (!target) throw new HttpProblem(404, 'WORKSPACE_TARGET_NOT_FOUND', 'Không tìm thấy theo dõi', 'Mục theo dõi không tồn tại hoặc không thuộc người dùng hiện tại.');
  target.isPriority = body.isPriority;
  target.prioritizedAt = body.isPriority ? new Date().toISOString() : undefined;
  await persistLocalState();
  return projectWorkspaceTarget(target, user)!;
});

app.delete('/api/v1/workspace/watch-targets/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
  const user = getCurrentUser(req);
  const exists = workspaceWatchTargets.some(target => target.id === req.params.id && target.userId === user.id);
  if (!exists) throw new HttpProblem(404, 'WORKSPACE_TARGET_NOT_FOUND', 'Không tìm thấy theo dõi', 'Mục theo dõi không tồn tại hoặc không thuộc người dùng hiện tại.');
  workspaceWatchTargets = workspaceWatchTargets.filter(target => target.id !== req.params.id || target.userId !== user.id);
  await persistLocalState();
  return reply.code(204).send();
});

app.put('/api/v1/findings/:id/follow', async (req: FastifyRequest<{ Params: { id: string } }>) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  if (!findingFollows.some(item => item.userId === user.id && item.findingId === finding.id)) {
    findingFollows.push({ userId: user.id, findingId: finding.id, createdAt: new Date().toISOString() });
    await persistLocalState();
  }
  return { findingId: finding.id, isFollowing: true };
});

app.delete('/api/v1/findings/:id/follow', async (req: FastifyRequest<{ Params: { id: string } }>) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  findingFollows = findingFollows.filter(item => item.userId !== user.id || item.findingId !== finding.id);
  await persistLocalState();
  return { findingId: finding.id, isFollowing: false };
});

// Findings: List with scope filter & search
app.get('/api/v1/findings', async (req: FastifyRequest<{ Querystring: any }>) => {
  const user = getCurrentUser(req);
  let result = filterFindingsByScope(findings, user);

  const { page, limit } = PaginationQuerySchema.parse(req.query);
  // Query strings are always strings or absent; read them as such instead of trusting `any`.
  const query = (req.query ?? {}) as Record<string, string | undefined>;
  const { channelId, campaignId, workflowStatus, slaStatus, search } = query;
  if (channelId) result = result.filter(f => f.channelId === channelId || f.channelCode === channelId);
  if (campaignId) result = result.filter(f => f.campaignId === campaignId);
  if (workflowStatus) result = result.filter(f => f.workflowStatus === workflowStatus);
  if (slaStatus) result = result.filter(f => f.slaStatus === slaStatus);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(f => f.cif.includes(s) || f.customerName.toLowerCase().includes(s) || f.errorCode.toLowerCase().includes(s) || f.branchName.toLowerCase().includes(s));
  }

  const total = result.length;
  const offset = (page - 1) * limit;
  const items = result.slice(offset, offset + limit).map(withEvidenceProjection);
  return {
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total,
  };
});

// Finding by ID
app.get('/api/v1/findings/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
  const user = getCurrentUser(req);
  const found = getScopedFindingOrThrow(req.params.id, user);
  
  const findingEvidences = availableEvidencesForFinding(found.id);
  const findingHistory = workflowEvents.filter(w => w.findingId === found.id);

  return {
    ...found,
    ...reportPresentationForFinding(found),
    evidenceCount: findingEvidences.length,
    evidences: findingEvidences,
    history: findingHistory,
  };
});

app.post('/api/v1/findings/:id/sub-items', async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
  const user = getCurrentUser(req);
  requireRoles(user, ['INTERNAL_OFFICER', 'SUPERVISOR']);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  if (finding.workflowStatus === 'WAIVED_RESOLVED') {
    throw new HttpProblem(409, 'FINDING_ALREADY_RESOLVED', 'Hồ sơ đã đóng', 'Không thể bổ sung ý sai sót vào hồ sơ đã đóng.');
  }
  const dto = CreateFindingSubItemSchema.parse(req.body);
  const now = new Date().toISOString();
  const subItems = finding.subItems ?? [];
  subItems.push({
    id: `sub-${crypto.randomUUID()}`,
    findingId: finding.id,
    content: dto.content,
    order: subItems.length + 1,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  });
  finding.subItems = subItems;
  finding.quantity = subItems.length;
  finding.version += 1;
  finding.updatedAt = now;
  await persistLocalState();
  return reply.code(201).send({
    ...finding,
    evidenceCount: availableEvidencesForFinding(finding.id).length,
    evidences: availableEvidencesForFinding(finding.id),
    history: workflowEvents.filter(event => event.findingId === finding.id),
  });
});

app.post('/api/v1/findings/:id/sub-items/review', async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const branchReview = user.roles.includes('BRANCH_CONTROLLER') && finding.workflowStatus === 'SUBMITTED_BRANCH';
  const internalReview = user.roles.some(role => ['SUPERVISOR', 'INTERNAL_APPROVER'].includes(role)) && finding.workflowStatus === 'SUBMITTED_INTERNAL';
  if (!branchReview && !internalReview) {
    throw new HttpProblem(409, 'SUB_ITEM_REVIEW_NOT_ALLOWED', 'Chưa đến bước đánh giá ý sai sót', 'Tài khoản hoặc trạng thái hồ sơ không phù hợp để đánh giá từng ý sai sót.');
  }
  const dto = ReviewFindingSubItemsSchema.parse(req.body);
  const subItems = finding.subItems ?? [];
  const decisionIds = new Set(dto.decisions.map(item => item.subItemId));
  if (decisionIds.size !== subItems.length || subItems.some(item => !decisionIds.has(item.id))) {
    throw new HttpProblem(422, 'SUB_ITEM_DECISIONS_INCOMPLETE', 'Chưa đánh giá đủ các ý sai sót', 'Phải chọn chấp nhận hoặc chuyển trả cho từng ý sai sót trong mã lỗi.');
  }
  if (dto.decisions.every(item => item.decision === 'ACCEPT')) requireAvailableEvidence(finding);
  const now = new Date().toISOString();
  const decisions = new Map(dto.decisions.map(item => [item.subItemId, item.decision]));
  finding.subItems = subItems.map(item => ({
    ...item,
    status: decisions.get(item.id) === 'ACCEPT' ? 'ACCEPTED' as const : 'RETURNED' as const,
    reviewerNote: dto.reviewNote,
    reviewedByUserId: user.id,
    reviewedByName: user.fullName,
    reviewedAt: now,
    updatedAt: now,
  }));
  finding.version += 1;
  finding.updatedAt = now;
  workflowEvents.push({
    id: `evt-${crypto.randomUUID()}`,
    findingId: finding.id,
    command: 'REVIEW_SUB_ITEMS',
    fromStatus: finding.workflowStatus,
    toStatus: finding.workflowStatus,
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.primaryRole,
    notes: dto.reviewNote,
    createdAt: now,
  });
  await persistLocalState();
  return {
    ...finding,
    evidenceCount: availableEvidencesForFinding(finding.id).length,
    evidences: availableEvidencesForFinding(finding.id),
    history: workflowEvents.filter(event => event.findingId === finding.id),
  };
});

app.get('/api/v1/customers/:cif/case', async (req: FastifyRequest<{ Params: { cif: string }; Querystring: { branchCode?: string } }>) => {
  const user = getCurrentUser(req);
  const accessibleFindings = filterFindingsByScope(findings, user)
    .filter(item => item.cif === req.params.cif)
  const branchCodes = new Set(accessibleFindings.map(item => item.branchCode));
  if (!req.query.branchCode && branchCodes.size > 1) {
    throw new HttpProblem(409, 'CUSTOMER_CASE_AMBIGUOUS', 'CIF tồn tại tại nhiều chi nhánh', 'Hãy truyền branchCode để xác định đúng hồ sơ khách hàng, tránh gộp sai dữ liệu giữa các chi nhánh.');
  }
  const customerFindings = accessibleFindings
    .filter(item => !req.query.branchCode || item.branchCode === req.query.branchCode)
    .map(item => ({
      ...item,
      ...reportPresentationForFinding(item),
      evidenceCount: availableEvidencesForFinding(item.id).length,
      evidences: availableEvidencesForFinding(item.id),
      history: workflowEvents.filter(event => event.findingId === item.id),
    }))
    .sort((a, b) => a.errorCode.localeCompare(b.errorCode));
  if (customerFindings.length === 0) {
    throw new HttpProblem(404, 'CUSTOMER_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ khách hàng', 'Khách hàng không tồn tại hoặc nằm ngoài phạm vi dữ liệu được cấp.');
  }
  const first = customerFindings[0];
  return {
    cif: first.cif,
    customerName: first.customerName,
    clusterName: first.clusterName,
    branchCode: first.branchCode,
    branchName: first.branchName,
    department: first.department,
    officerName: first.officerName,
    deptHeadName: first.deptHeadName,
    creditBalance: first.creditBalance,
    totalExposureAmount: customerFindings.reduce((sum, finding) => sum + finding.exposureAmount, 0),
    totalFindings: customerFindings.length,
    openFindings: customerFindings.filter(finding => finding.workflowStatus !== 'WAIVED_RESOLVED').length,
    findings: customerFindings,
  };
});

// Finding: Create via Web Form (Direct Ingestion)
app.post('/api/v1/findings', async (req: FastifyRequest<{ Body: any }>) => {
  const user = getCurrentUser(req);
  requireRoles(user, ['ADMIN', 'INTERNAL_OFFICER']);
  const b = WebFormFindingSchema.parse(req.body);
  const newFinding = createFindingFromDto(b, user, `find-${crypto.randomUUID()}`);
  await ensureFindingDriveFolder(newFinding);

  findings.unshift(newFinding);
  await persistLocalState();
  return newFinding;
});

app.post('/api/v1/imports/findings', async (req: FastifyRequest<{ Body: any }>, reply) => {
  const user = getCurrentUser(req);
  requireRoles(user, ['ADMIN', 'INTERNAL_OFFICER', 'SUPERVISOR']);
  const batch = BulkFindingImportSchema.parse(req.body);
  const imported: Finding[] = [];
  let duplicateCount = 0;
  const deduplicationKey = (row: WebFormFindingDTO) => [
    row.channelId,
    row.branchCode,
    row.cif,
    row.errorCode,
    row.decisionNo || '',
  ].join('\u001f');
  const seenKeys = new Set(findings.map(item => deduplicationKey(item)));
  for (const row of batch.rows) {
    const key = deduplicationKey(row);
    if (seenKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seenKeys.add(key);
    imported.push(createFindingFromDto(row, user));
  }
  const batchId = `batch-${crypto.randomUUID()}`;
  const channel = reportChannels.find(item => item.id === batch.rows[0].channelId)!;
  const now = new Date().toISOString();
  findings.unshift(...imported);
  importBatches.unshift({
    id: batchId,
    channelId: channel.id,
    channelName: channel.name,
    channelVersionId: channel.currentVersionId || 'v1',
    fileName: batch.sourceFileName,
    sourceType: 'API_BULK',
    totalRows: batch.rows.length,
    validRowsCount: imported.length,
    errorRowsCount: duplicateCount,
    status: 'COMMITTED',
    uploadedByUserId: user.id,
    uploadedByName: user.fullName,
    createdAt: now,
    committedAt: now,
    committedFindingsCount: imported.length,
  });
  await persistLocalState();
  return reply.code(201).send({
    batchId,
    sourceFileName: batch.sourceFileName,
    customerCount: uniqueCustomerCount(imported),
    findingCount: imported.length,
    duplicateCount,
    findings: imported,
  });
});

// ----------------------------------------------------
// WORKFLOW COMMAND ACTIONS (P0-01 to P0-09)
// ----------------------------------------------------

// 1. Submit Branch (Branch nộp hồ sơ)
app.post('/api/v1/findings/:id/actions/submit-branch', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = SubmitBranchCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;

  try {
    const pinnedVersion = reportChannelVersions.find(version => version.id === finding.channelVersionId);
    const workflowType = pinnedVersion?.snapshot.workflowConfig?.workflowType
      ?? reportChannels.find(channel => channel.id === finding.channelId)?.workflowConfig?.workflowType
      ?? 'TWO_TIER';
    const updated = workflowService.executeSubmitBranch(finding, dto, user, workflowType);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);

    workflowEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      findingId: finding.id,
      command: 'SUBMIT_BRANCH',
      fromStatus,
      toStatus: updated.workflowStatus,
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: dto.resolutionNotes,
      createdAt: new Date().toISOString(),
    });

    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});

// 2. Kiểm soát chi nhánh đồng ý xử lý lỗi
app.post('/api/v1/findings/:id/actions/branch-control-approve', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchControlApproveCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;

  try {
    const updated = workflowService.executeBranchControlApprove(finding, dto, user);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);

    workflowEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      findingId: finding.id,
      command: 'BRANCH_CONTROL_APPROVE',
      fromStatus,
      toStatus: 'SUBMITTED_INTERNAL',
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: dto.notes || 'Kiểm soát chi nhánh đồng ý hồ sơ khắc phục.',
      createdAt: new Date().toISOString(),
    });

    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});

// 3. Kiểm soát chi nhánh chuyển trả hồ sơ
app.post('/api/v1/findings/:id/actions/branch-control-reject', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchControlRejectCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;

  try {
    const updated = workflowService.executeBranchControlReject(finding, dto, user);
    Object.assign(finding, updated);

    workflowEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      findingId: finding.id,
      command: 'BRANCH_CONTROL_REJECT',
      fromStatus,
      toStatus: 'REJECTED',
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      rejectionReason: dto.reason,
      rejectedFromStage: 'BRANCH_CONTROL_REVIEW',
      createdAt: new Date().toISOString(),
    });

    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});

// 4. Internal Waive (Khối Nội Bộ Phê duyệt bỏ lỗi - Terminal state)
app.post('/api/v1/findings/:id/actions/internal-waive', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = InternalWaiveCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;

  try {
    const updated = workflowService.executeInternalWaive(finding, dto, user);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);

    workflowEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      findingId: finding.id,
      command: 'INTERNAL_WAIVE',
      fromStatus,
      toStatus: 'WAIVED_RESOLVED',
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: `Số công văn chấp thuận bỏ lỗi: ${dto.decisionNumber}. ${dto.notes || ''}`,
      createdAt: new Date().toISOString(),
    });

    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});

// 5. Internal Reject (Khối Nội Bộ Từ chối bỏ lỗi)
app.post('/api/v1/findings/:id/actions/internal-reject', async (req: FastifyRequest<{ Params: { id: string }; Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = InternalRejectCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;

  try {
    const updated = workflowService.executeInternalReject(finding, dto, user);
    Object.assign(finding, updated);

    workflowEvents.push({
      id: `evt-${crypto.randomUUID()}`,
      findingId: finding.id,
      command: 'INTERNAL_REJECT',
      fromStatus,
      toStatus: 'REJECTED',
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      rejectionReason: dto.reason,
      rejectedFromStage: 'INTERNAL_REVIEW',
      createdAt: new Date().toISOString(),
    });

    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});

// ----------------------------------------------------
// EVIDENCE & GOOGLE DRIVE API
// ----------------------------------------------------

app.post('/api/v1/findings/:id/evidence', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  requireRoles(user, ['BRANCH_INPUT']);
  if (!canManageEvidenceAtBranch(finding.workflowStatus)) {
    throw new HttpProblem(409, 'EVIDENCE_LOCKED_AFTER_SUBMISSION', 'Tài liệu đã khóa', 'Chỉ được thay đổi tài liệu khi hồ sơ đang ở bước chi nhánh xử lý.');
  }

  const data = await req.file();
  if (!data) {
    throw new HttpProblem(422, 'EVIDENCE_REQUIRED', 'Thiếu tệp minh chứng', 'Yêu cầu phải chứa một tệp multipart.');
  }

  const buffer = await data.toBuffer();
  const safeFileName = googleDriveService.validateUploadMetadata(data.filename, data.mimetype, buffer.length);
  await ensureFindingDriveFolder(finding);
  const folderPath = googleDriveService.generateFolderPath({
    campaignCode: auditCampaigns.find(campaign => campaign.id === finding.campaignId)?.code,
    channelCode: finding.channelCode,
    year: Number((finding.auditDate || finding.createdAt).slice(0, 4)) || new Date().getFullYear(),
    clusterName: finding.clusterName,
    branchCode: finding.branchCode,
    cif: finding.cif,
    customerName: finding.customerName,
    errorCode: finding.errorCode,
  });

  const uploadResult = await googleDriveService.uploadEvidenceFile({
    fileName: safeFileName,
    fileBuffer: buffer,
    mimeType: data.mimetype,
    folderPath,
    findingId: finding.id,
  });

  const newEvidence: EvidenceObject = {
    id: `evi-${crypto.randomUUID()}`,
    findingId: finding.id,
    fileName: safeFileName,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
    driveFileId: uploadResult.driveFileId,
    driveUrl: uploadResult.driveUrl,
    sha256Checksum: uploadResult.sha256Checksum,
    status: 'AVAILABLE',
    uploadedByUserId: user.id,
    uploadedByName: user.fullName,
    uploadedByRole: user.primaryRole,
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  evidences.push(newEvidence);
  finding.evidenceCount = availableEvidencesForFinding(finding.id).length;
  await persistLocalState();

  return newEvidence;
});

app.delete('/api/v1/findings/:findingId/evidence/:evidenceId', async (req: FastifyRequest<{
  Params: { findingId: string; evidenceId: string };
  Body: unknown;
}>, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.findingId, user);
  requireRoles(user, ['BRANCH_INPUT']);
  if (!canManageEvidenceAtBranch(finding.workflowStatus)) {
    throw new HttpProblem(409, 'EVIDENCE_LOCKED_AFTER_SUBMISSION', 'Tài liệu đã khóa', 'Chỉ được thay đổi tài liệu khi hồ sơ đang ở bước chi nhánh xử lý.');
  }

  const dto = RevokeEvidenceSchema.parse(req.body);
  const evidence = evidences.find(item => (
    item.id === req.params.evidenceId
    && item.findingId === finding.id
    && item.status === 'AVAILABLE'
  ));
  if (!evidence) {
    throw new HttpProblem(404, 'EVIDENCE_NOT_FOUND', 'Không tìm thấy tài liệu', 'Tài liệu không tồn tại hoặc đã được thu hồi.');
  }

  const revokedAt = new Date().toISOString();
  evidence.status = 'REVOKED';
  evidence.revokedAt = revokedAt;
  evidence.revokedReason = dto.reason;
  evidence.revokedByUserId = user.id;
  evidence.updatedAt = revokedAt;
  finding.evidenceCount = availableEvidencesForFinding(finding.id).length;
  finding.updatedAt = revokedAt;
  await persistLocalState();

  return reply.code(204).send();
});

// Evidence: Proxy stream content
app.get('/api/v1/evidence/:driveFileId/content', async (req: FastifyRequest<{ Params: { driveFileId: string } }>, reply) => {
  const user = getCurrentUser(req);
  const evidence = evidences.find(item => item.driveFileId === req.params.driveFileId && item.status === 'AVAILABLE');
  if (!evidence) {
    throw new HttpProblem(404, 'EVIDENCE_NOT_FOUND', 'Không tìm thấy minh chứng', 'Minh chứng không tồn tại hoặc đã bị thu hồi.');
  }
  getScopedFindingOrThrow(evidence.findingId, user);
  const result = await googleDriveService.getFileContentStream(req.params.driveFileId);
  if (!result) {
    throw new HttpProblem(404, 'EVIDENCE_CONTENT_NOT_FOUND', 'Không tìm thấy nội dung minh chứng', 'Metadata tồn tại nhưng nội dung tệp hiện không khả dụng.');
  }

  reply.header('Content-Disposition', buildInlineContentDisposition(result.fileName));
  reply.header('Content-Type', result.mimeType);
  return reply.send(result.stream);
});

// ----------------------------------------------------
// DASHBOARDS API
// ----------------------------------------------------

app.get('/api/v1/dashboards/summary', async (req) => {
  const user = getCurrentUser(req);
  const scoped = filterFindingsByScope(findings, user);

  const active = scoped.filter(f => f.workflowStatus !== 'WAIVED_RESOLVED');
  const resolved = scoped.filter(f => f.workflowStatus === 'WAIVED_RESOLVED');

  const totalExposure = scoped.reduce((acc, f) => acc + (f.exposureAmount || 0), 0);
  const resolvedExposure = resolved.reduce((acc, f) => acc + (f.exposureAmount || 0), 0);

  const summary: DashboardSummary = {
    totalFindings: scoped.length,
    activeFindings: active.length,
    pendingRemediation: scoped.filter(f => f.workflowStatus === 'PENDING').length,
    submittedBranch: scoped.filter(f => f.workflowStatus === 'SUBMITTED_BRANCH').length,
    submittedInternal: scoped.filter(f => f.workflowStatus === 'SUBMITTED_INTERNAL').length,
    rejected: scoped.filter(f => f.workflowStatus === 'REJECTED').length,
    waivedResolved: resolved.length,
    onTrackCount: scoped.filter(f => f.slaStatus === 'ON_TRACK').length,
    dueSoonCount: scoped.filter(f => f.slaStatus === 'DUE_SOON').length,
    overdueCount: scoped.filter(f => f.slaStatus === 'OVERDUE').length,
    totalExposureAmount: totalExposure,
    resolvedExposureAmount: resolvedExposure,
    remediationRatePercent: scoped.length ? Math.round((resolved.length / scoped.length) * 100) : 0,
  };

  return summary;
});

app.get('/api/v1/reports/definitions', async (req) => {
  const user = getCurrentUser(req);
  return user.roles.includes('ADMIN')
    ? reportDefinitions
    : reportDefinitions.filter(definition => definition.createdByUserId === user.id);
});

app.post('/api/v1/reports/definitions', async (req: FastifyRequest<{ Body: any }>, reply) => {
  const user = getCurrentUser(req);
  const body = CreateReportDefinitionSchema.parse(req.body);
  if (body.query) assertReportConfigurationAvailable(body.query, body.exportColumns);
  const now = new Date().toISOString();
  const definition: ReportDefinition = {
    id: `report-${crypto.randomUUID()}`,
    name: body.name,
    description: body.description,
    filters: body.filters,
    columns: body.columns,
    query: body.query,
    exportColumns: body.exportColumns,
    createdByUserId: user.id,
    createdByName: user.fullName,
    createdAt: now,
    updatedAt: now,
  };
  reportDefinitions.unshift(definition);
  await persistLocalState();
  return reply.code(201).send(definition);
});

app.get('/api/v1/admin/report-catalog', async (req) => {
  requireAdmin(getCurrentUser(req));
  return normalizedReportCatalogConfiguration();
});

app.put('/api/v1/admin/report-catalog', async (req: FastifyRequest<{ Body: any }>) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = UpdateReportCatalogConfigurationSchema.parse(req.body);
  if (body.expectedVersion !== reportCatalogConfiguration.version) {
    throw new HttpProblem(409, 'REPORT_CATALOG_VERSION_CONFLICT', 'Cấu hình đã thay đổi', 'Hãy tải lại cấu hình mới nhất trước khi lưu.');
  }
  const baseFields = new Map(REPORT_FIELD_CATALOG.map(field => [field.key, field]));
  const baseMetrics = new Map(REPORT_METRIC_CATALOG.map(metric => [metric.key, metric]));
  reportCatalogConfiguration = {
    version: reportCatalogConfiguration.version + 1,
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id,
    fields: body.fields.map(field => ({ ...baseFields.get(field.key)!, ...field })),
    metrics: body.metrics.map(metric => ({ ...baseMetrics.get(metric.key)!, ...metric })),
  };
  await persistLocalState();
  return normalizedReportCatalogConfiguration();
});

app.get('/api/v1/reports/catalog', async (req) => {
  const scoped = filterFindingsByScope(findings, getCurrentUser(req));
  return buildReportCatalog(scoped);
});

app.post('/api/v1/reports/runs', async (req: FastifyRequest<{ Body: any }>) => {
  const query = ReportRunRequestSchema.parse(req.body);
  assertReportConfigurationAvailable(query);
  const scoped = filterFindingsByScope(findings, getCurrentUser(req));
  return executeReportRun(scoped, query);
});

app.post('/api/v1/reports/exports', async (req: FastifyRequest<{ Body: any }>, reply) => {
  const request = ReportExportRequestSchema.parse(req.body);
  assertReportConfigurationAvailable(request.query, request.columns);
  const scoped = filterFindingsByScope(findings, getCurrentUser(req));
  const rows = applyCanonicalReportRules(scoped, request.query.rules, request.query.match);
  // A serverless response body is capped (~4.5MB on Vercel) and the function has a wall clock, so
  // an unbounded export fails opaquely in production. Refuse with a count the user can act on
  // rather than truncating: a silently short audit export is worse than no export.
  if (rows.length > REPORT_EXPORT_MAX_ROWS) {
    throw new HttpProblem(
      422,
      'REPORT_EXPORT_TOO_LARGE',
      'Báo cáo quá lớn để xuất',
      `Bộ lọc đang khớp ${rows.length.toLocaleString('vi-VN')} dòng, vượt mức ${REPORT_EXPORT_MAX_ROWS.toLocaleString('vi-VN')} dòng cho một lần xuất. Hãy thu hẹp điều kiện lọc (theo chi nhánh, đoàn kiểm tra hoặc khoảng thời gian) rồi xuất lại.`,
    );
  }
  const configuration = normalizedReportCatalogConfiguration();
  const configuredFields = configuration.fields;
  const configuredMetrics = configuration.metrics;
  const columns = request.columns.map(key => configuredFields.find(field => field.key === key)!);
  const dateStamp = new Date().toISOString().slice(0, 10);
  // ENUM/BOOLEAN keys hold raw codes; every export format shows the human label for them.
  const exportValue = (key: ReportFieldKey, finding: Finding): ReportFieldValue => {
    const field = configuredFields.find(item => item.key === key)!;
    const value = reportFieldAccessors[key](finding);
    return field.valueType === 'ENUM' || field.valueType === 'BOOLEAN' ? reportValueLabel(key, value, finding) : value;
  };

  if (request.format === 'csv') {
    const header = columns.map(column => csvCell(column.label)).join(',');
    const csvRows = rows.map(finding => request.columns.map(key => csvCell(exportValue(key, finding))).join(','));
    const csv = `\uFEFF${[header, ...csvRows].join('\r\n')}`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="audit-bgs-report-${dateStamp}.csv"`)
      .send(csv);
  }

  const run = executeReportRun(scoped, request.query);
  const catalogForLabels = buildReportCatalog(scoped);
  const metricLabel = (key: ReportMetricKey): string => {
    const metric = configuredMetrics.find(item => item.key === key)!;
    if (metric.unit === 'MILLION_VND') return `${metric.label} (triệu đồng)`;
    if (metric.unit === 'PERCENT') return `${metric.label} (%)`;
    return metric.label;
  };
  const ruleValue = (rule: ReportFilterRule): string => {
    if (rule.operator === 'op.is_true' || rule.operator === 'op.is_false') return '';
    if (rule.operator === 'op.between') return `${String(rule.from ?? '')} đến ${String(rule.to ?? '')}`;
    if (rule.operator === 'op.in') return (rule.values || []).join(', ');
    const field = catalogForLabels.fields.find(item => item.key === rule.key);
    return field?.options?.find(option => option.value === String(rule.value))?.label || String(rule.value ?? '');
  };
  const report: FullReportExport = {
    generatedAt: run.generatedAt,
    filters: request.query.rules.map(rule => {
      const field = configuredFields.find(item => item.key === rule.key)!;
      const operator = REPORT_OPERATOR_CATALOG.find(item => item.key === rule.operator)!;
      const value = ruleValue(rule);
      return `${field.label}: ${operator.label}${value ? ` ${value}` : ''}`;
    }),
    summary: [
      { label: 'Dòng dữ liệu phù hợp', value: run.matchedFindingCount },
      ...request.query.metrics.map(key => ({ label: metricLabel(key), value: run.metricValues[key] || 0 })),
    ],
    groupLabel: configuredFields.find(item => item.key === request.query.groupBy)!.label,
    groupColumns: [
      { label: configuredFields.find(item => item.key === request.query.groupBy)!.label, kind: 'text' },
      ...request.query.metrics.map(key => ({ label: metricLabel(key), kind: 'number' as const })),
    ],
    groupRows: run.groups.map(row => [row.label, ...request.query.metrics.map(key => row.metricValues[key] || 0)]),
    detailColumns: columns.map(column => ({
      label: column.label,
      kind: column.valueType === 'NUMBER' ? 'number' : column.valueType === 'DATE' ? 'date' : column.valueType === 'BOOLEAN' ? 'boolean' : 'text',
    })),
    detailRows: rows.map(finding => request.columns.map(key => exportValue(key, finding))),
  };

  if (request.format === 'html') {
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-disposition', `attachment; filename="audit-bgs-report-${dateStamp}.html"`)
      .send(renderReportHtml(report));
  }

  return reply
    .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('content-disposition', `attachment; filename="audit-bgs-report-${dateStamp}.xlsx"`)
    .send(await renderReportXlsx(report));
});

app.get('/api/v1/reports/summary', async (req: FastifyRequest<{ Querystring: any }>) => {
  const filters = ReportFilterSchema.parse(req.query);
  const scoped = applyReportFilters(filterFindingsByScope(findings, getCurrentUser(req)), filters);
  const breakdown = (keyOf: (finding: Finding) => string, labelOf: (finding: Finding) => string) => {
    const groups = new Map<string, Finding[]>();
    for (const finding of scoped) {
      const key = keyOf(finding);
      groups.set(key, [...(groups.get(key) || []), finding]);
    }
    return [...groups.entries()].map(([key, items]) => ({
      key,
      label: labelOf(items[0]),
      customerCount: uniqueCustomerCount(items),
      findingCount: items.length,
      exposureAmount: items.reduce((sum, item) => sum + item.exposureAmount, 0),
    })).sort((a, b) => b.findingCount - a.findingCount || a.label.localeCompare(b.label));
  };
  const summary: ReportSummary = {
    generatedAt: new Date().toISOString(),
    totalCustomers: uniqueCustomerCount(scoped),
    totalFindings: scoped.length,
    totalExposure: scoped.reduce((sum, finding) => sum + finding.exposureAmount, 0),
    byBranch: breakdown(finding => finding.branchCode, finding => `${finding.branchCode} · ${finding.branchName}`)
      .map(row => ({ ...row, branchCode: row.key })),
    byDepartment: breakdown(finding => `${finding.branchCode}:${finding.department || 'UNASSIGNED'}`, finding => finding.department || 'Chưa phân phòng')
      .map(row => ({ ...row, department: row.label })),
    byStatus: breakdown(finding => finding.workflowStatus, finding => workflowStatusLabels[finding.workflowStatus])
      .map(row => ({ ...row, workflowStatus: row.key })),
  };
  return summary;
});

app.get('/api/v1/reports/findings.csv', async (req: FastifyRequest<{ Querystring: any }>, reply) => {
  const filters = ReportFilterSchema.parse(req.query);
  const scoped = applyReportFilters(filterFindingsByScope(findings, getCurrentUser(req)), filters);
  const header = 'CIF,Tên khách hàng,Cụm,Chi nhánh,Phòng,Mã chi nhánh,Cán bộ,Mã lỗi,Tiêu đề lỗi,Chi tiết lỗi,Trạng thái,Dư nợ,Giá trị ảnh hưởng';
  const rows = scoped.map(item => [item.cif, item.customerName, item.clusterName, item.branchName, item.department, item.branchCode, item.officerName, item.errorCode, item.errorTitle, item.description, item.workflowStatus, item.creditBalance, item.exposureAmount]);
  const csv = `\uFEFF${header}\r\n${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="audit-bgs-findings-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(csv);
});

// Start listening if run directly
const PORT = Number(process.env.PORT) || 3001;
export function assertSafeRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const violations: string[] = [];
  if (env.AUTH_MODE !== 'oidc') violations.push('AUTH_MODE phải là oidc');
  if (env.SEED_DEMO_USERS === 'true') violations.push('SEED_DEMO_USERS không được bật ở production');
  if (!env.OIDC_ISSUER_URL || !env.OIDC_AUDIENCE) violations.push('thiếu OIDC_ISSUER_URL/OIDC_AUDIENCE');
  if (env.DATA_STORE_MODE !== 'postgres' || !env.DATABASE_URL) violations.push('DATA_STORE_MODE=postgres và DATABASE_URL là bắt buộc');
  if (!env.CRON_SECRET) violations.push('thiếu CRON_SECRET');
  if (env.EVIDENCE_STORAGE_MODE !== 'google-drive') violations.push('EVIDENCE_STORAGE_MODE phải là google-drive');
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_DRIVE_ROOT_FOLDER_ID) violations.push('thiếu cấu hình Google Drive');
  violations.push('Google Drive API v3 adapter production chưa hoàn tất');
  if (violations.length > 0) {
    throw new Error(`UNSAFE_PRODUCTION_CONFIGURATION: ${violations.join('; ')}`);
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  await app.ready();
  return app;
}

export async function startServer() {
  try {
    assertSafeRuntimeConfiguration();
    const instance = await buildApp();
    await instance.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Audit BGS Backend API Server running at http://localhost:${PORT}/api/v1/`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('app.ts')) {
  startServer();
}

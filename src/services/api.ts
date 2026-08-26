import {
  UserProfile, Finding, CustomerCase, ReportChannel, OrgUnit, DashboardSummary, ReportSummary,
  SubmitBranchCommandDTO, BranchControlApproveCommandDTO, BranchControlRejectCommandDTO,
  InternalWaiveCommandDTO, InternalRejectCommandDTO, WebFormFindingDTO, BulkFindingImportDTO,
  EvidenceObject, CreateReportDefinitionDTO, ReportDefinition, ReportFilterQuery,
  AuditLogEntry, MyWorkQueue, FindingFollowResult, CreateFindingSubItemDTO, ReviewFindingSubItemsDTO,
  WorkspaceTarget, WorkspaceTargetCommandDTO, CreateUserDTO,
  ReportCatalog, ReportRunRequest, ReportRunResult, ReportExportRequest,
  CreateReportChannelDTO, UpdateReportChannelDTO, ReportChannelVersion, ReportChannelIntegrationReadiness,
  ReportCatalogConfiguration, UpdateReportCatalogConfigurationDTO,
  LoginDTO, LoginResponse,
  AuditCampaign, CreateAuditCampaignDTO, UpdateAuditCampaignDTO,
} from '../../shared/contracts';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
const API_BASE = `${configuredApiBase || '/api'}/v1`;

/**
 * Firefox ignores a click on an anchor that is not in the document, and revoking the object URL in
 * the same tick can cancel the download before the browser has read the blob.
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiService {
  private readonly pendingCommandKeys = new Map<string, string>();

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const providedHeaders = options.headers as Record<string, string> || {};
    const headers = options.body === undefined || options.body === null
      ? providedHeaders
      : { 'Content-Type': 'application/json', ...providedHeaders };
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'same-origin',
      headers,
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(problem.detail || problem.title || problem.error || `HTTP ${res.status}`, res.status, problem.code);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  public login = (credentials: LoginDTO): Promise<LoginResponse> => this.request('/auth/login', {
    method: 'POST', body: JSON.stringify(credentials),
  });
  public logout = (): Promise<void> => this.request('/auth/logout', { method: 'POST' });
  public getMe = (): Promise<{ user: UserProfile }> => this.request('/me');
  public getCampaigns = (): Promise<AuditCampaign[]> => this.request('/campaigns');
  public createCampaign = (data: CreateAuditCampaignDTO): Promise<AuditCampaign> => this.request('/admin/campaigns', { method: 'POST', body: JSON.stringify(data) });
  public updateCampaign = (id: string, data: UpdateAuditCampaignDTO): Promise<AuditCampaign> => this.request(`/admin/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  public provisionCampaignDrive = (id: string): Promise<AuditCampaign> => this.request(`/admin/campaigns/${id}/provision-drive`, { method: 'POST' });
  public getOrgUnits = (): Promise<OrgUnit[]> => this.request('/admin/org-units');
  /** Branches inside the caller's data scope; available to every role that can create a hồ sơ. */
  public getScopedBranches = (): Promise<OrgUnit[]> => this.request('/org-units/branches');
  public getUsers = (): Promise<UserProfile[]> => this.request('/admin/users');
  public getChannels = (): Promise<ReportChannel[]> => this.request('/admin/channels');
  public getActiveChannels = (): Promise<ReportChannel[]> => this.request('/channels/active');
  public getAuditEvents = (): Promise<AuditLogEntry[]> => this.request('/admin/audit-events');
  public getDashboardSummary = (): Promise<DashboardSummary> => this.request('/dashboards/summary');
  private reportQuery(filters: ReportFilterQuery = {}): string {
    return new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ).toString();
  }

  public getReportSummary = (filters: ReportFilterQuery = {}): Promise<ReportSummary> => {
    const query = this.reportQuery(filters);
    return this.request(`/reports/summary${query ? `?${query}` : ''}`);
  };
  public getReportDefinitions = (): Promise<ReportDefinition[]> => this.request('/reports/definitions');
  public getReportCatalog = (): Promise<ReportCatalog> => this.request('/reports/catalog');
  public getReportCatalogConfiguration = (): Promise<ReportCatalogConfiguration> => this.request('/admin/report-catalog');
  public updateReportCatalogConfiguration = (data: UpdateReportCatalogConfigurationDTO): Promise<ReportCatalogConfiguration> => (
    this.request('/admin/report-catalog', { method: 'PUT', body: JSON.stringify(data) })
  );
  public runReport = (query: ReportRunRequest): Promise<ReportRunResult> => (
    this.request('/reports/runs', { method: 'POST', body: JSON.stringify(query) })
  );
  public createReportDefinition = (data: CreateReportDefinitionDTO): Promise<ReportDefinition> => (
    this.request('/reports/definitions', { method: 'POST', body: JSON.stringify(data) })
  );

  public createOrgUnit(data: Partial<OrgUnit>): Promise<OrgUnit> {
    return this.request('/admin/org-units', { method: 'POST', body: JSON.stringify(data) });
  }
  public createUser(data: CreateUserDTO): Promise<UserProfile> {
    return this.request('/admin/users', { method: 'POST', body: JSON.stringify(data) });
  }
  public createChannel(data: Partial<CreateReportChannelDTO>): Promise<ReportChannel> {
    return this.request('/admin/channels', { method: 'POST', body: JSON.stringify(data) });
  }
  public updateChannel(id: string, data: UpdateReportChannelDTO): Promise<ReportChannel> {
    return this.request(`/admin/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  public deleteChannel(id: string): Promise<void> {
    return this.request(`/admin/channels/${id}`, { method: 'DELETE', body: '{}' });
  }
  public getChannelVersions(id: string): Promise<ReportChannelVersion[]> {
    return this.request(`/admin/channels/${id}/versions`);
  }
  public getChannelIntegrationReadiness(id: string): Promise<ReportChannelIntegrationReadiness> {
    return this.request(`/admin/channels/${id}/integration-readiness`);
  }
  public getFindings(params: Record<string, string> = {}): Promise<{ items: Finding[]; total: number; page: number; limit: number; hasMore: boolean }> {
    return this.request(`/findings?${new URLSearchParams(params).toString()}`);
  }
  public getFindingById(id: string): Promise<Finding> { return this.request(`/findings/${id}`); }
  public getMyWork = (): Promise<MyWorkQueue> => this.request('/workspace/my-work');
  public followFinding = (id: string): Promise<FindingFollowResult> => this.request(`/findings/${id}/follow`, { method: 'PUT' });
  public unfollowFinding = (id: string): Promise<FindingFollowResult> => this.request(`/findings/${id}/follow`, { method: 'DELETE' });
  public acceptWork = (dto: WorkspaceTargetCommandDTO): Promise<WorkspaceTarget> => this.request('/workspace/accepted', { method: 'PUT', body: JSON.stringify(dto) });
  public releaseWork = (id: string): Promise<void> => this.request(`/workspace/accepted/${id}`, { method: 'DELETE' });
  public watchTarget = (dto: WorkspaceTargetCommandDTO): Promise<WorkspaceTarget> => this.request('/workspace/watch-targets', { method: 'PUT', body: JSON.stringify(dto) });
  public unwatchTarget = (id: string): Promise<void> => this.request(`/workspace/watch-targets/${id}`, { method: 'DELETE' });
  public setWatchPriority = (id: string, isPriority: boolean): Promise<WorkspaceTarget> => this.request(`/workspace/watch-targets/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ isPriority }) });
  public createFindingSubItem = (id: string, dto: CreateFindingSubItemDTO): Promise<Finding> => (
    this.request(`/findings/${id}/sub-items`, { method: 'POST', body: JSON.stringify(dto) })
  );
  public reviewFindingSubItems = (id: string, dto: ReviewFindingSubItemsDTO): Promise<Finding> => (
    this.request(`/findings/${id}/sub-items/review`, { method: 'POST', body: JSON.stringify(dto) })
  );
  public getCustomerCase(cif: string, branchCode?: string): Promise<CustomerCase> {
    const query = branchCode ? `?branchCode=${encodeURIComponent(branchCode)}` : '';
    return this.request(`/customers/${encodeURIComponent(cif)}/case${query}`);
  }
  public createFinding(data: WebFormFindingDTO): Promise<Finding> {
    return this.request('/findings', { method: 'POST', body: JSON.stringify(data) });
  }
  public importFindings(data: BulkFindingImportDTO): Promise<{ batchId: string; customerCount: number; findingCount: number; duplicateCount: number; findings: Finding[] }> {
    return this.request('/imports/findings', { method: 'POST', body: JSON.stringify(data) });
  }

  private async workflowCommand<T extends { expectedVersion: number }>(endpoint: string, dto: T): Promise<Finding> {
    const operationKey = `${endpoint}:${dto.expectedVersion}`;
    const idempotencyKey = this.pendingCommandKeys.get(operationKey) ?? crypto.randomUUID();
    this.pendingCommandKeys.set(operationKey, idempotencyKey);
    try {
      return await this.request(endpoint, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(dto),
      });
    } finally {
      this.pendingCommandKeys.delete(operationKey);
    }
  }

  public submitBranch(id: string, dto: SubmitBranchCommandDTO): Promise<Finding> {
    return this.workflowCommand(`/findings/${id}/actions/submit-branch`, dto);
  }
  public branchControlApprove(id: string, dto: BranchControlApproveCommandDTO): Promise<Finding> {
    return this.workflowCommand(`/findings/${id}/actions/branch-control-approve`, dto);
  }
  public branchControlReject(id: string, dto: BranchControlRejectCommandDTO): Promise<Finding> {
    return this.workflowCommand(`/findings/${id}/actions/branch-control-reject`, dto);
  }
  public internalWaive(id: string, dto: InternalWaiveCommandDTO): Promise<Finding> {
    return this.workflowCommand(`/findings/${id}/actions/internal-waive`, dto);
  }
  public internalReject(id: string, dto: InternalRejectCommandDTO): Promise<Finding> {
    return this.workflowCommand(`/findings/${id}/actions/internal-reject`, dto);
  }

  public async uploadEvidence(id: string, file: File): Promise<EvidenceObject> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/findings/${id}/evidence`, { method: 'POST', credentials: 'same-origin', body: formData });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(problem.detail || problem.title || `HTTP ${res.status}`);
    }
    return res.json();
  }
  public revokeEvidence(findingId: string, evidenceId: string, reason: string): Promise<void> {
    return this.request(`/findings/${findingId}/evidence/${evidenceId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }
  public async getEvidenceBlob(evidence: EvidenceObject): Promise<Blob> {
    const res = await fetch(evidence.driveUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Không thể tải bản xem trước của bằng chứng.');
    return res.blob();
  }
  public async getEvidenceBlobUrl(evidence: EvidenceObject): Promise<string> {
    return URL.createObjectURL(await this.getEvidenceBlob(evidence));
  }
  public async downloadFindingsCsv(filters: ReportFilterQuery = {}): Promise<void> {
    const query = this.reportQuery(filters);
    const res = await fetch(`${API_BASE}/reports/findings.csv${query ? `?${query}` : ''}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Không thể xuất báo cáo CSV.');
    saveBlob(await res.blob(), `audit-bgs-findings-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  private async downloadReport(request: Omit<ReportExportRequest, 'format'>, format: ReportExportRequest['format']): Promise<void> {
    const res = await fetch(`${API_BASE}/reports/exports`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, format }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ detail: 'Không thể xuất báo cáo.' }));
      throw new Error(problem.detail || problem.title || 'Không thể xuất báo cáo.');
    }
    saveBlob(await res.blob(), `audit-bgs-report-${new Date().toISOString().slice(0, 10)}.${format}`);
  }
  public async downloadReportCsv(request: Omit<ReportExportRequest, 'format'>): Promise<void> {
    return this.downloadReport(request, 'csv');
  }
  public async downloadReportHtml(request: Omit<ReportExportRequest, 'format'>): Promise<void> {
    return this.downloadReport(request, 'html');
  }
  public async downloadReportXlsx(request: Omit<ReportExportRequest, 'format'>): Promise<void> {
    return this.downloadReport(request, 'xlsx');
  }
}

export const api = new ApiService();

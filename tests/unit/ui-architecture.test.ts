import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('UI and business terminology architecture', () => {
  it('uses branch control terminology and does not expose cluster approval roles', () => {
    const activeSources = [
      'shared/contracts/common.ts',
      'shared/contracts/auth.ts',
      'shared/contracts/workflow.ts',
      'server/src/modules/workflow/workflow-service.ts',
      'src/App.tsx',
      'src/components/portal/FindingDetailPage.tsx',
      'src/components/admin/UserManager.tsx',
    ].map(read).join('\n');

    expect(activeSources).not.toMatch(/CLUSTER_APPROVER|CLUSTER_APPROVE|CLUSTER_REJECT/);
    expect(activeSources).not.toMatch(/Lãnh [Đđ]ạo Cụm|Chờ Cụm Duyệt/);
    expect(activeSources).toContain('BRANCH_CONTROLLER');
    expect(activeSources).toContain('Kiểm soát chi nhánh');
  });

  it('groups admin users by internal team and by cluster then branch for display only', () => {
    const manager = read('src/components/admin/UserManager.tsx');
    expect(manager).toContain('Khối nội bộ');
    expect(manager).toContain('Theo địa bàn');
    expect(manager).toContain('Phê duyệt HT');
    expect(manager).toContain('Kiểm soát chi nhánh');
    expect(manager).toContain('/templates/mau-nhap-nguoi-dung.xlsx');
    expect(manager).toContain('Tải mẫu Excel');
    expect(manager).toContain('Cụm chỉ dùng để nhóm địa bàn; quyền duyệt thuộc kiểm soát chi nhánh.');
    expect(manager).not.toContain('Duyệt đẩy');
    expect(manager).toContain("unit.type === 'INTERNAL_TEAM'");
    expect(manager).toContain("unit.type === 'CLUSTER'");
    expect(manager).not.toMatch(/Duyệt cấp cụm|Phê duyệt cụm|Trưởng cụm duyệt/);
  });

  it('uses in-app user profile and password dialogs instead of browser prompts', () => {
    const manager = read('src/components/admin/UserManager.tsx');
    expect(manager).toContain('UserProfileEditModal');
    expect(manager).toContain('UserPasswordModal');
    expect(manager).toContain('Gửi email reset');
    expect(manager).toContain('Mật khẩu ban đầu');
    expect(manager).not.toContain("window.prompt('Họ và tên mới'");
    expect(manager).toContain('onUserPasswordResetEmail');
  });

  it('uses the required brand navigation color and bundled Roboto font', () => {
    const html = read('index.html');
    expect(read('src/index.css')).toContain('--brand-primary: #006b68');
    expect(read('src/main.tsx')).toContain("@fontsource/roboto/400.css");
    expect(read('src/App.tsx')).toContain('bg-[#006b68]');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('provides customer-level mobile cards, evidence comparison, import and reports workspaces', () => {
    expect(read('src/App.tsx')).toContain('data-testid="customer-card"');
    expect(read('src/components/portal/FindingDetailPage.tsx')).toContain('Tài liệu và bằng chứng');
    expect(read('src/components/portal/FindingDetailPage.tsx')).toContain('Nội dung cần giải trình');
    expect(read('src/components/internal/FastDataIngestion.tsx')).toContain('api.importFindings');
    const ingestion = read('src/components/internal/FastDataIngestion.tsx');
    expect(ingestion).toContain('Nhập dữ liệu');
    expect(ingestion).toContain('Loại báo cáo');
    expect(ingestion).toContain('Chuyên đề');
    expect(ingestion).not.toContain("channelId: 'chan-audit-bgs'");
    expect(read('src/components/reports/ReportsWorkspace.tsx')).toContain('data-testid="reports-workspace"');
  });

  it('keeps file selection usable before the import target is complete', () => {
    const ingestion = read('src/components/internal/FastDataIngestion.tsx');
    expect(ingestion).not.toContain('disabled={!targetSelected}');
    expect(ingestion).toContain('Có thể chọn tệp trước');
    expect(ingestion).toContain('Cần chọn Chuyên đề trước khi lưu');
    expect(ingestion).toContain('Tạo chuyên đề từ tiểu biên bản');
    expect(ingestion).toContain('importCampaignDraft');
    expect(ingestion).toContain('onCampaignCreated');
  });

  it('loads expensive workspaces and admin catalog only when requested', () => {
    const appSource = read('src/App.tsx');
    expect(appSource).toContain("lazy(() => import('./components/internal/FastDataIngestion')");
    expect(appSource).not.toContain("import { FastDataIngestion } from './components/internal/FastDataIngestion'");
    expect(appSource).toContain("surface !== 'ADMIN'");
    expect(appSource).toContain('adminCatalogLoaded');
    expect(appSource).not.toContain('label="Nạp dữ liệu"');
  });

  it('lets authorized head-office roles configure campaigns and report types', () => {
    const appSource = read('src/App.tsx');
    const portal = read('src/components/admin/AdminPortal.tsx');
    const permissions = read('src/components/admin/ButtonPermissionMatrix.tsx');
    const serverSource = read('server/src/app.ts');

    expect(appSource).toContain('canConfigureCatalog');
    expect(appSource).toContain('label="Cấu hình"');
    expect(portal).toContain('isSystemAdmin');
    expect(portal).toContain("id: 'CAMPAIGNS'");
    expect(portal).toContain("id: 'CHANNELS'");
    expect(permissions).toContain("id: 'campaign-config'");
    expect(permissions).toContain("id: 'report-type-config'");
    expect(serverSource).toContain('requireCatalogManager');
  });

  it('keeps the case queue compact while reserving cluster for filtering context', () => {
    const appSource = read('src/App.tsx');

    expect(appSource).not.toContain('>Cụm địa bàn</th>');
    expect(appSource).not.toContain('>{customer.clusterName}</td>');
    expect(appSource).toContain('CaseStatusBadge');
    expect(appSource).toContain('slaStatusLabels');
    expect(appSource).toContain('findings.slice(0, 3)');
    expect(appSource).toContain('Tất cả mã lỗi:');
  });

  it('supports filtered and reusable report definitions', () => {
    const reports = read('src/components/reports/ReportsWorkspace.tsx');
    const reportCatalogManager = read('src/components/admin/ReportCatalogManager.tsx');
    const adminPortal = read('src/components/admin/AdminPortal.tsx');
    const apiSource = read('src/services/api.ts');
    expect(reports).toContain('Bộ lọc');
    expect(reports).toContain('Lưu mẫu');
    expect(reports).toContain('Mẫu báo cáo');
    expect(reports).toContain('Xem theo');
    expect(reports).toContain('data-testid="cognos-authoring-workspace"');
    expect(reports).toContain('data-testid="report-data-panel"');
    expect(reports).toContain('data-testid="report-canvas"');
    expect(reports).toContain('Hàng');
    expect(reports).toContain('Cột');
    expect(reports).toContain('Giá trị');
    expect(reports).not.toContain('Trường dữ liệu');
    expect(reports).not.toContain('Thiết lập báo cáo');
    expect(reports).toContain('Xuất HTML');
    expect(reports).toContain('Xuất Excel');
    expect(reports).toContain('ReportRunRequestSchema.safeParse');
    expect(adminPortal).toContain('Trường báo cáo');
    expect(reportCatalogManager).toContain('Tên hiển thị');
    expect(reportCatalogManager).toContain('Cột xuất mặc định');
    expect(reportCatalogManager).toContain('updateReportCatalogConfiguration');
    expect(apiSource).toContain('createReportDefinition');
    expect(apiSource).toContain('getReportDefinitions');
    expect(apiSource).toContain('getReportCatalog');
    expect(apiSource).toContain('getReportCatalogConfiguration');
    expect(apiSource).toContain('updateReportCatalogConfiguration');
    expect(apiSource).toContain('runReport');
    expect(apiSource).toContain('downloadReportCsv');
    expect(apiSource).toContain('downloadReportHtml');
    expect(apiSource).toContain('downloadReportXlsx');
  });

  it('keeps operational screens concise while making report filters configurable', () => {
    const detail = read('src/components/portal/FindingDetailPage.tsx');
    const reports = read('src/components/reports/ReportsWorkspace.tsx');
    const reportCatalog = read('src/components/admin/ReportCatalogManager.tsx');
    const auditTrail = read('src/components/admin/AuditTrailViewer.tsx');

    expect(detail).toContain('customerIsSpecialCase');
    expect(detail).toContain('items.some(item => item.isSpecialCase)');
    expect(detail).toContain('Đánh dấu khách hàng là trường hợp đặc biệt');
    expect(detail).not.toContain('<ActionPanel title="Dấu sao">');
    expect(detail).toContain("api.watchTarget(targetCommand('CUSTOMER'))");
    expect(detail).not.toContain('Tuyến duyệt lấy tự động theo cấu hình');
    expect(reports).toContain('filterable');
    expect(reports).toContain('Lọc dữ liệu');
    expect(reports).not.toContain('Chọn điều kiện cần xem, sau đó xuất Excel hoặc HTML khi cần.');
    expect(reportCatalog).toContain('Cho phép lọc');
    expect(auditTrail).not.toContain('Chỉ dữ liệu thử nghiệm ở local/test mới được xóa');
  });

  it('guards workflow commands with durable idempotency and evidence-aware controls', () => {
    const apiSource = read('src/services/api.ts');
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    const serverSource = read('server/src/app.ts');
    expect(apiSource).toContain('pendingCommandKeys');
    expect(apiSource).toContain('Idempotency-Key');
    expect(apiSource).toContain('crypto.randomUUID');
    expect(detailSource).not.toContain('Cần ít nhất một tài liệu hợp lệ');
    expect(serverSource).toContain('idempotencyRecords');
  });

  it('offers evidence replacement only while the branch can edit the finding', () => {
    const apiSource = read('src/services/api.ts');
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');

    expect(apiSource).toContain('revokeEvidence');
    expect(detailSource).toContain('canManageEvidenceAtBranch');
    expect(detailSource).toContain('Xóa để thay thế');
    expect(detailSource).not.toContain("finding.workflowStatus !== 'WAIVED_RESOLVED' && isBranchInput");
  });

  it('keeps configuration administrators out of business workflow decisions', () => {
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    const workflowService = read('server/src/modules/workflow/workflow-service.ts');
    expect(detailSource).not.toContain("['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER']");
    expect(detailSource).not.toContain("isBranchInput || currentUser.roles.includes('ADMIN')");
    expect(workflowService).not.toMatch(/roles\.includes\('ADMIN'\)/);
  });

  it('uses a full-page case view, edge sidebar controls and real PDF/Excel viewers', () => {
    const appSource = read('src/App.tsx');
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    const sidebarSource = read('src/components/portal/WorkspaceSidebar.tsx');
    const viewerSource = read('src/components/evidence/EvidenceViewer.tsx');
    expect(detailSource).toContain('data-testid="customer-case-page"');
    expect(detailSource).not.toContain('aria-modal="true"');
    expect(detailSource).toContain('aria-label="Thanh trượt mã lỗi"');
    expect(detailSource.indexOf('aria-label="Thanh trượt mã lỗi"')).toBeLessThan(detailSource.indexOf('</header>'));
    // Evidence left, finding content right — the split must survive on laptops too, so the pair
    // is pinned at both lg and xl. The content rail was widened 20% (320px -> 384px floor).
    expect(detailSource).toContain("lg:grid-cols-[minmax(0,1.75fr)_minmax(360px,1fr)]");
    expect(detailSource).toContain("xl:grid-cols-[minmax(0,2.33fr)_minmax(384px,1fr)]");
    expect(detailSource).toContain('onReview={reviewSubItems}');
    expect(detailSource).not.toContain('Cần ít nhất một tài liệu hợp lệ để đóng toàn bộ mã lỗi');
    expect(detailSource).toContain('Tiếp nhận công việc');
    expect(detailSource).toContain('Cụm địa bàn');
    expect(detailSource).toContain('Chi nhánh');
    expect(detailSource).toContain('Khách hàng');
    expect(appSource).toContain('lg:grid-cols-[300px_minmax(0,1fr)]');
    expect(appSource).toContain('Mở thanh bên');
    expect(sidebarSource).toContain('Thu gọn thanh bên');
    expect(sidebarSource).toContain('Mở rộng thanh bên');
    expect(sidebarSource).toContain('workQueue.accepted');
    expect(sidebarSource).toContain('workQueue.watchTargets');
    expect(viewerSource).toContain("import('pdfjs-dist')");
    expect(viewerSource).toContain("import('read-excel-file/browser')");
    expect(viewerSource).toContain('Vừa trang giấy');
    expect(viewerSource).toContain('Vừa chiều rộng');
    expect(viewerSource).toContain('Xoay trang');
  });

  it('uses collision-safe server identifiers and derives evidence folders from record dates', () => {
    const serverSource = read('server/src/app.ts');
    expect(serverSource).not.toMatch(/id: `(?:org|user|chan|find|evt|evi)-\$\{Date\.now\(\)\}`/);
    expect(serverSource).not.toContain('year: 2026');
    expect(serverSource).toContain('crypto.randomUUID()');
  });

  it('manages form, workflow, SLA and integrations by versioned report type', () => {
    const manager = read('src/components/admin/DynamicChannelManager.tsx');
    const editor = read('src/components/admin/report-types/ReportTypeEditor.tsx');
    const workflow = read('src/components/admin/report-types/WorkflowConfigEditor.tsx');
    const integration = read('src/components/admin/report-types/SlaIntegrationEditor.tsx');
    const adminPortal = read('src/components/admin/AdminPortal.tsx');
    expect(manager).toContain('Tạo loại báo cáo');
    expect(manager).toContain('onChannelUpdated');
    expect(manager).toContain('onChannelDeleted');
    expect(editor).toContain('Form, luồng, SLA và tích hợp');
    expect(editor).toContain('Lưu phiên bản mới');
    expect(workflow).toContain('ONE_TIER');
    expect(workflow).toContain('TWO_TIER');
    expect(workflow).toContain('THREE_TIER');
    expect(workflow).toContain('Kiểm soát chi nhánh');
    expect(workflow).toContain('Lãnh đạo chi nhánh');
    expect(workflow).toContain('Phê duyệt HT');
    expect(integration).toContain('Google Sheets');
    expect(integration).toContain('Tạo Google Sheet');
    expect(integration).toContain('Mở Google Sheet');
    expect(integration).toContain('readOnly');
    expect(integration).toContain('Email tự động');
    expect(adminPortal).not.toContain('<WorkflowBuilder');
    expect(adminPortal).not.toContain('<SlaEscalationConfig');
    expect(adminPortal).toContain("bg-[#006b68]");
    expect(adminPortal).not.toContain('bg-sky-600');
  });

  it('shows the configured approval route to the people working the finding', () => {
    const stepper = read('src/components/portal/ApprovalRouteStepper.tsx');
    const detail = read('src/components/portal/FindingDetailPage.tsx');
    const workflow = read('src/components/admin/report-types/WorkflowConfigEditor.tsx');
    const editor = read('src/components/admin/report-types/ReportTypeEditor.tsx');
    const formSchema = read('src/components/admin/report-types/FormSchemaEditor.tsx');
    const matrix = read('src/components/admin/ButtonPermissionMatrix.tsx');
    const apiSource = read('src/services/api.ts');

    // The route the branch sees is resolved by the server from the pinned version, never rebuilt
    // from a second hard-coded list of stages in the client.
    expect(stepper).toContain('data-testid="approval-route-stepper"');
    expect(stepper).toContain('getFindingApprovalRoute');
    expect(stepper).not.toContain('Kiểm soát chi nhánh');
    expect(stepper).not.toContain('route.steps.map');
    expect(stepper).toContain('Chưa phân công người duyệt');
    expect(apiSource).toContain('approval-route');
    expect(detail).toContain('<ApprovalRouteStepper');
    expect(detail).toContain('refreshToken={finding.version}');

    // Operational detail is collapsed by default; operators open it on demand.
    expect(detail).toContain('data-testid="finding-history"');
    expect(detail).not.toContain('Xem {older.length} mốc cũ hơn');
    expect(detail).toContain('Xem chi tiết các ý sai sót');
    expect(detail).not.toContain('Cần ít nhất một tài liệu hợp lệ trước khi chuyển bước.');
    expect(detail).not.toContain('<details open');

    // The admin diagram has to show the star branch, because the engine really does insert it.
    expect(workflow).toContain('data-testid="workflow-stage-conditional"');
    expect(workflow).toContain('Chỉ chèn vào tuyến khi hồ sơ được gắn dấu sao.');
    expect(workflow).toContain('Tên bước đặt ở đây là tên hiển thị trên tuyến duyệt của hồ sơ');

    // The version rule belongs with the button that applies it, not buried in one tab.
    expect(editor).toContain('Thay đổi chỉ áp dụng cho hồ sơ tạo sau khi lưu.');

    // A disabled block must say what unlocks it.
    expect(formSchema).toContain('Thêm ít nhất một trường ở mục “Trường dữ liệu của form” bên dưới trước.');

    // The branch-leader role exists in the routes, so the reference table must document it.
    expect(matrix).toContain("'branchLeader'");
    expect(matrix).toContain('Lãnh đạo CN');
    expect(matrix).toContain('branch-leader-review');
  });

  it('provides a block-based report form CMS with Excel template generation', () => {
    const editor = read('src/components/admin/report-types/FormSchemaEditor.tsx');
    const runtimeForm = read('src/components/ingestion/WebFormFindingModal.tsx');
    const layout = read('src/components/reports/ReportFormBlockLayout.tsx');
    expect(editor).toContain('Thư viện khối');
    expect(editor).toContain('Tạo từ Excel mẫu');
    expect(editor).toContain('Khung mẫu báo cáo');
    expect(editor).toContain('buildReportTemplateFromExcelRows');
    expect(layout).toContain("block.type === 'SECTION'");
    expect(editor).toContain('Xem trước người dùng');
    expect(editor).toContain('Dạng hồ sơ kiểm soát');
    expect(editor).toContain('Dạng bảng Excel');
    expect(editor).toContain('Cho phép đính kèm');

    // The admin preview and the capture form must render through one layout component, otherwise
    // "Xem trước người dùng" can drift from what a user actually sees.
    expect(runtimeForm).toContain('ReportFormBlockLayout');
    expect(editor).toContain('ReportFormBlockLayout');
  });

  it('never returns from the capture modal before its hooks have run', () => {
    const runtimeForm = read('src/components/ingestion/WebFormFindingModal.tsx');
    // The modal stays mounted while closed, so an early return above the useState calls changes the
    // hook count between renders and React throws when the modal is opened.
    expect(runtimeForm.indexOf('if (!isOpen) return null;')).toBeGreaterThan(runtimeForm.lastIndexOf('useState('));
  });

  it('keeps the finding error rail compact, scrollable and action-oriented', () => {
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    expect(detailSource).toContain('scrollbar-gutter:stable');
    expect(detailSource).toContain('sm:min-w-[220px]');
    expect(detailSource).toContain('aria-label="Ẩn hoặc hiện thông tin hồ sơ"');
    expect(detailSource).not.toContain('aria-label="Thông tin nhanh hồ sơ"');
  });

  it('loads the authoritative local audit trail instead of rendering hard-coded claims', () => {
    const viewer = read('src/components/admin/AuditTrailViewer.tsx');
    const apiSource = read('src/services/api.ts');
    expect(viewer).toContain('api.getAuditEvents');
    expect(viewer).not.toContain("id: 'log-1'");
    expect(viewer).not.toContain('100% Immutable');
    expect(apiSource).toContain('getAuditEvents');
  });

  it('offers filtered CSV download and confirmed clearing of test audit data', () => {
    const viewer = read('src/components/admin/AuditTrailViewer.tsx');
    const apiSource = read('src/services/api.ts');
    expect(viewer).toContain('Tải CSV');
    expect(viewer).toContain('window.confirm');
    expect(viewer).toContain('api.downloadAuditEventsCsv');
    expect(viewer).toContain('api.clearTestAuditEvents');
    expect(apiSource).toContain('downloadAuditEventsCsv');
    expect(apiSource).toContain('clearTestAuditEvents');
  });

  it('keeps the consolidated app and customer headers keyboard accessible', () => {
    const appSource = read('src/App.tsx');
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    expect(appSource).toContain('aria-label="Đăng xuất"');
    expect(appSource).not.toContain('aria-label="Chuyển người dùng"');
    expect(appSource).toContain('focus-visible:ring-white/70');
    expect(detailSource).toContain('focus-visible:ring-white/70');
  });

  it('shows the shared SLA labels, a deadline warning and the overdue dashboard KPI', () => {
    const copy = read('src/content/ui-copy.ts');
    const appSource = read('src/App.tsx');
    const detailSource = read('src/components/portal/FindingDetailPage.tsx');
    expect(copy).toContain('slaStatusLabels');
    expect(detailSource).toContain('slaStatusLabels');
    expect(detailSource).toContain('daysRemaining');
    expect(appSource).toContain('dashboard.overdueCount');
    expect(appSource).toContain('Quá hạn');
  });

  it('keeps deployment and operational documents aligned with the active workflow', () => {
    const operationalDocs = [
      'LUU_DO_VAN_HANH_CHI_TIET.md',
      'HUONG_DAN_VAN_HANH_CHI_TIET.md',
      'THIET_KE_ADMIN_PORTAL.md',
      'THIET_KE_DYNAMIC_CHANNEL_VA_WORKFLOW_ENGINE.md',
    ].map(read).join('\n');
    const deploymentGuide = read('HUONG_DAN_DEPLOY.md');

    expect(operationalDocs).not.toMatch(
      /CLUSTER_APPROVER|Lãnh đạo Cụm duyệt|Cụm thẩm tra|Phê duyệt Cụm/,
    );
    expect(operationalDocs).toContain('BRANCH_CONTROLLER');
    expect(operationalDocs).toContain('Chuyển phê duyệt HT');
    expect(operationalDocs).toContain('ONE_TIER');
    expect(operationalDocs).toContain('TWO_TIER');
    expect(deploymentGuide).toContain('Cloud SQL for PostgreSQL 16');
    expect(deploymentGuide).toContain('data/local-state.json');
    expect(deploymentGuide).toContain('chưa đủ điều kiện production');
  });

  it('ships no prototype demo surfaces or mock fixtures', () => {
    // The prototype user switcher and its MOCK_USERS fixture let anyone assume any role from the
    // header; production authenticates for real, so neither may come back.
    for (const removed of [
      'src/lib/mock-data.ts',
      'src/components/common/Header.tsx',
      'src/components/auth/LoginPortal.tsx',
      'src/components/common/CustomerDetailModal.tsx',
      'src/components/internal/ErrorCatalogModal.tsx',
      'src/components/admin/EmailSchedulerConfig.tsx',
    ]) {
      expect(fs.existsSync(path.join(root, removed))).toBe(false);
    }

    const sources = fs.readdirSync(path.join(root, 'src'), { recursive: true, encoding: 'utf8' })
      .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map(name => read(path.join('src', name)))
      .join('\n');
    expect(sources).not.toMatch(/MOCK_USERS|INITIAL_CUSTOMERS|Demo RBAC|Chuyển Nhanh Quyền/);

    // The mã sai sót catalog is business reference data, not a fixture — it stays, under a name
    // that says so.
    expect(read('src/lib/error-catalog.ts')).toContain('ERROR_CODE_CATALOG');
  });

  it('routes each report type to the capture screen its presentation mode calls for', () => {
    const app = read('src/App.tsx');
    const grid = read('src/components/reports/FindingGridWorkspace.tsx');

    // The tabular screen is selected by the channel's configured mode, not hard-coded per channel.
    expect(app).toContain("presentationMode === 'EXCEL_GRID'");
    expect(app).toContain('<FindingGridWorkspace');

    // A report type that requires evidence must not be completable from the grid: the file has to
    // be attached against the hồ sơ first, which is only possible on the case screen.
    expect(grid).toContain('finding.evidenceRequired !== false');
    expect(grid).toContain('Cần đính kèm tài liệu tại hồ sơ');
    expect(grid).toContain('không đẩy duyệt được từ bảng');

    // Bulk actions reuse the versioned single-finding commands so a partial failure is reportable.
    for (const command of ['api.submitBranch', 'api.branchControlApprove', 'api.branchControlReject', 'api.internalWaive', 'api.internalReject']) {
      expect(grid).toContain(command);
    }
    expect(grid).toContain('expectedVersion: finding.version');
  });
});

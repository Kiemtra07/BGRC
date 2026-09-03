import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, ChevronRight, FileUp, LayoutDashboard,
  Plus, Search, Settings, LogOut, Menu, TriangleAlert, Key as KeyIcon,
} from 'lucide-react';
import { AuditCampaign, DashboardSummary, Finding, LoginDTO, MyWorkQueue, OrgUnit, ReportChannel, UserProfile, WebFormFindingDTO, WorkspaceTarget, coplusRoleLabel } from '../shared/contracts';
import { ApiError, api } from './services/api';
import { FindingDetailPage } from './components/portal/FindingDetailPage';
import { WorkspaceSidebar } from './components/portal/WorkspaceSidebar';
import { WebFormFindingModal } from './components/ingestion/WebFormFindingModal';
import { FindingGridWorkspace } from './components/reports/FindingGridWorkspace';
import { UserProfile as LegacyUserProfile } from './types';
import { slaStatusLabels, userRoleLabels, workflowStatusLabels } from './content/ui-copy';
import { LoginPage } from './components/auth/LoginPage';
import { CodeChip, EmptyHint, SlaPill, WorkflowPill } from './components/common/StatusPill';
import { QueueSearchCriteria, QueueSearchPanel, criteriaToQuery, emptySearchCriteria } from './components/portal/QueueSearchPanel';
import { ScopeSummaryTabs, SummaryScope } from './components/portal/ScopeSummaryTabs';

const AdminPortal = lazy(() => import('./components/admin/AdminPortal').then(module => ({ default: module.AdminPortal })));
const FastDataIngestion = lazy(() => import('./components/internal/FastDataIngestion').then(module => ({ default: module.FastDataIngestion })));
const ReportsWorkspace = lazy(() => import('./components/reports/ReportsWorkspace').then(module => ({ default: module.ReportsWorkspace })));

type Surface = 'CASES' | 'IMPORT' | 'REPORTS' | 'ADMIN';
/** `OVERDUE` cuts across the workflow states: a hồ sơ can be late at any step. */
type Filter = 'ALL' | 'OVERDUE' | Finding['workflowStatus'];

/** One request's worth of hồ sơ. The queue appends pages so customer grouping stays intact. */
const FINDINGS_PAGE_SIZE = 100;

const isOverdue = (finding: Finding) => finding.isOverdue || finding.slaStatus === 'OVERDUE';
const matchesFilter = (finding: Finding, filter: Filter) =>
  filter === 'ALL' ? true : filter === 'OVERDUE' ? isOverdue(finding) : finding.workflowStatus === filter;

export const App: React.FC = () => {
  const [surface, setSurface] = useState<Surface>('CASES');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [channels, setChannels] = useState<ReportChannel[]>([]);
  const [campaigns, setCampaigns] = useState<AuditCampaign[]>([]);
  // `criteria` là điều kiện đã thực sự gửi xuống máy chủ; `draftCriteria` là thứ panel đang sửa.
  // Tách hai cái ra chính là điều làm cho nút "Tìm kiếm" có ý nghĩa — nếu không, mỗi lần chạm vào
  // một ô select là lại kéo dữ liệu một lần.
  const [criteria, setCriteria] = useState<QueueSearchCriteria>(() => emptySearchCriteria());
  const [draftCriteria, setDraftCriteria] = useState<QueueSearchCriteria>(() => emptySearchCriteria());
  const [hasSearched, setHasSearched] = useState(false);
  const [summaryScope, setSummaryScope] = useState<SummaryScope>('SCOPE');
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsTotal, setFindingsTotal] = useState(0);
  const [findingsPage, setFindingsPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Thẻ số toàn phạm vi của người dùng — không phụ thuộc điều kiện tìm kiếm. */
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  /** Thẻ số của riêng lần tìm kiếm hiện tại; `null` cho tới khi có lần tìm đầu tiên. */
  const [campaignDashboard, setCampaignDashboard] = useState<DashboardSummary | null>(null);
  const [selectedCase, setSelectedCase] = useState<Finding[] | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [workQueue, setWorkQueue] = useState<MyWorkQueue>({ actionable: [], following: [], accepted: [], watchTargets: [] });
  /**
   * Ba trạng thái tải, không phải một.
   *
   * Trước đây chỉ có một cờ `loading` dùng chung cho khởi động, cho đổi bộ lọc, cho vào trang quản
   * trị và cho cả đăng xuất — nên băng "Đang tải dữ liệu..." bật lên ở mọi thao tác, kể cả khi dữ
   * liệu cũ vẫn còn nguyên trên màn hình và hoàn toàn dùng được. Tách ra thì chỉ lần khởi động mới
   * chặn màn hình; những lần sau chỉ làm mờ nhẹ đúng phần đang chờ.
   */
  const [bootstrapping, setBootstrapping] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminCatalogLoaded, setAdminCatalogLoaded] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  /** Số thứ tự lần tìm gần nhất; kết quả đến muộn của lần cũ hơn sẽ bị bỏ qua. */
  const searchToken = React.useRef(0);
  /**
   * Kho giá trị đã từng thấy cho các trường phụ thuộc dữ liệu (mã lỗi, nhóm lỗi, phòng, cụm, cán bộ).
   *
   * Nếu lấy lựa chọn thẳng từ hồ sơ đang tải thì bộ lọc sẽ tự bóp nghẹt chính nó: lọc theo mã lỗi
   * TD01.01 xong, danh sách chỉ còn hồ sơ TD01.01, nên dropdown mã lỗi cũng chỉ còn đúng TD01.01 —
   * người dùng không thể đổi sang mã khác nếu không xoá điều kiện trước. Gom dồn các giá trị đã thấy
   * thì lựa chọn chỉ nở ra chứ không bao giờ co lại.
   */
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});

  const isAdmin = currentUser?.roles.includes('ADMIN') || false;
  const canConfigureCatalog = currentUser?.roles.some(role => ['ADMIN', 'INTERNAL_OFFICER', 'INTERNAL_APPROVER', 'SUPERVISOR'].includes(role)) || false;
  const canImport = currentUser?.roles.some(role => ['ADMIN', 'INTERNAL_OFFICER', 'INTERNAL_APPROVER', 'SUPERVISOR'].includes(role)) || false;

  const FACET_FIELDS = ['clusterName', 'department', 'errorCode', 'errorGroup', 'officerName'] as const;

  /** Gộp giá trị của lô hồ sơ vừa nhận vào kho lựa chọn, giữ nguyên những gì đã biết trước đó. */
  const rememberFacetValues = (items: Finding[]) => {
    setFacetValues(previous => {
      const merged: Record<string, string[]> = { ...previous };
      let changed = false;
      for (const field of FACET_FIELDS) {
        const seen = new Set(previous[field] ?? []);
        const before = seen.size;
        for (const item of items) {
          const value = item[field];
          if (value) seen.add(value);
        }
        if (seen.size !== before) {
          merged[field] = [...seen].sort((a, b) => a.localeCompare(b, 'vi'));
          changed = true;
        }
      }
      return changed ? merged : previous;
    });
  };

  /**
   * Chạy đúng một lần tìm kiếm: danh sách hồ sơ và thẻ số của chuyên đề đi cùng một bộ điều kiện,
   * nên hai con số không bao giờ lệch nhau.
   *
   * Điều kiện được lọc ngay dưới máy chủ, nên chỉ những hồ sơ khớp mới đi qua đường truyền — khác
   * hẳn cách cũ là kéo cả phạm vi dữ liệu về rồi mới lọc trên trình duyệt.
   */
  const runSearch = async (next: QueueSearchCriteria, options: { focusCampaignTab?: boolean } = {}) => {
    // Đánh số từng lần tìm. Tìm kiếm chạy được từ nhiều chỗ — nút Tìm kiếm, chọn kênh ở thanh bên,
    // mở một mục công việc, làm mới sau khi ghi — nên hai lần tìm hoàn toàn có thể chồng nhau. Không
    // có số thứ tự thì lần trả về sau cùng thắng, kể cả khi nó là lần tìm cũ hơn: màn hình hiện kết
    // quả của điều kiện này trong khi khung điều kiện lại ghi điều kiện khác.
    const token = ++searchToken.current;
    const query = criteriaToQuery(next);
    setQueueLoading(true);
    setSummaryLoading(true);
    // A page-2 request may still be in flight while the user starts a new search. Its result must
    // never append to the new result set, and its spinner must not outlive the search that replaced it.
    setLoadingMore(false);
    setLoadError(null);
    try {
      const [findingsResult, campaignSummary] = await Promise.all([
        api.getFindings({ ...query, page: '1', limit: String(FINDINGS_PAGE_SIZE) }),
        api.getDashboardSummary(query),
      ]);
      if (token !== searchToken.current) return;
      setFindings(findingsResult.items);
      setFindingsTotal(findingsResult.total);
      setFindingsPage(1);
      setCampaignDashboard(campaignSummary);
      setCriteria(next);
      setHasSearched(true);
      rememberFacetValues(findingsResult.items);
      // Chỉ lần tìm do người dùng chủ động mới kéo tab sang chuyên đề. Làm mới sau một thao tác ghi
      // thì giữ nguyên tab đang đọc — nhảy tab dưới chân người dùng là một cách đánh mất ngữ cảnh.
      if (options.focusCampaignTab) setSummaryScope('CAMPAIGN');
    } catch (reason) {
      if (token !== searchToken.current) return;
      setLoadError(reason instanceof Error ? reason.message : 'Không thể tải danh sách hồ sơ.');
    } finally {
      if (token === searchToken.current) {
        setQueueLoading(false);
        setSummaryLoading(false);
      }
    }
  };

  /**
   * Sau một thao tác ghi (tạo hồ sơ, nhập liệu, duyệt), làm mới đúng những gì đang hiển thị. Danh
   * sách chỉ được tải lại nếu người dùng đã thực sự tìm kiếm — nếu chưa, không có gì trên màn hình
   * để mà làm mới, và một request findings ở đây chỉ là lãng phí.
   */
  const refreshScopedData = async () => {
    const [dashboardResult, workResult] = await Promise.all([
      api.getDashboardSummary(),
      api.getMyWork(),
    ]);
    setDashboard(dashboardResult);
    setWorkQueue(workResult);
    // Không truyền `focusCampaignTab`: người dùng vừa ghi dữ liệu, không phải vừa bấm tìm kiếm, nên
    // tab họ đang đọc phải giữ nguyên.
    if (hasSearched) await runSearch(criteria);
  };

  /**
   * The server has always paginated; the client used to take the first page and say nothing, so
   * beyond one page of hồ sơ simply vanished. Pages are appended rather than replaced because the
   * queue groups findings by khách hàng — paging the group itself would split one customer's mã
   * lỗi across two pages.
   */
  const loadMoreFindings = async () => {
    const token = searchToken.current;
    try {
      setLoadingMore(true);
      const next = findingsPage + 1;
      const result = await api.getFindings({ ...criteriaToQuery(criteria), page: String(next), limit: String(FINDINGS_PAGE_SIZE) });
      if (token !== searchToken.current) return;
      setFindings(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...result.items.filter(item => !seen.has(item.id))];
      });
      setFindingsTotal(result.total);
      setFindingsPage(next);
      rememberFacetValues(result.items);
    } catch (reason) {
      if (token !== searchToken.current) return;
      setLoadError(reason instanceof Error ? reason.message : 'Không thể tải thêm hồ sơ.');
    } finally {
      if (token === searchToken.current) setLoadingMore(false);
    }
  };

  /**
   * Khởi động chỉ tải những thứ cần để dựng khung màn hình: danh tính, kênh, chuyên đề, danh sách
   * chi nhánh, thẻ số toàn phạm vi và hàng chờ công việc.
   *
   * Danh sách hồ sơ cố tình **không** nằm ở đây. Nó chờ người dùng chọn chuyên đề và bấm Tìm kiếm —
   * mở màn hình lên không còn kéo về cả phạm vi dữ liệu chỉ để rồi bị lọc bớt ngay sau đó.
   */
  /**
   * Nạp dữ liệu nền bằng một request tổng hợp. Các endpoint độc lập trước đây đã được gọi song
   * song, nhưng trên serverless mỗi request vẫn phải đi qua cùng một lượt hydrate state và một
   * lần khởi động function. Gộp chúng lại giảm năm lần chờ mạng/hydrate xuống còn một, trong khi
   * payload và quyền lọc vẫn do máy chủ quyết định.
   */
  const bootstrapData = async (): Promise<void> => {
    setBootstrapping(true);
    setLoadError(null);
    try {
      const bootstrap = await api.getBootstrap();
      setChannels(bootstrap.channels);
      setCampaigns(bootstrap.campaigns);
      setOrgUnits(bootstrap.branches);
      setDashboard(bootstrap.summary);
      setWorkQueue(bootstrap.work);
      // Chuyên đề mới nhất được điền sẵn vào form để lần tìm đầu tiên chỉ còn một cú bấm.
      if (bootstrap.campaigns.length) {
        setDraftCriteria(previous => previous.campaignId ? previous : { ...previous, campaignId: bootstrap.campaigns[0].id });
      }
    } catch (reason) {
      const message = reason instanceof ApiError && reason.code === 'STATE_MERGE_CONFLICT'
        ? 'Dữ liệu vừa được cập nhật ở phiên khác. Hãy tải lại trang rồi thử lại.'
        : reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.';
      setLoadError(message);
      // Bootstrap failure must not send an already authenticated user back to LoginPage. The
      // shell remains usable and exposes a retryable error instead.
    } finally {
      setBootstrapping(false);
    }
  };

  const load = async (): Promise<void> => {
    setBootstrapping(true);
    setLoadError(null);

    try {
      const me = await api.getMe();
      // `/me` is the auth gate. A missing/expired cookie must reveal LoginPage immediately; it
      // must not wait for the authenticated bootstrap request below.
      setCurrentUser(me.user);
      setAuthChecked(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể kiểm tra phiên đăng nhập.';
      setCurrentUser(null);
      setAuthChecked(true);
      setBootstrapping(false);
      if (reason instanceof ApiError && reason.status === 401) return;
      setLoadError(message);
      return;
    }

    // The shell can render as soon as identity is known. Keep the bootstrap promise out of this
    // function so the initial shell and the post-login button do not wait for dashboard data.
    void bootstrapData();
  };

  // Identity, channels, campaigns and the branch list do not depend on the workspace filters, so
  // they are fetched once. Re-running the whole bootstrap on every filter change cost a redundant
  // getMe + channels + campaigns round trip each time — wasteful anywhere, billed on serverless.
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (surface !== 'ADMIN' || !canConfigureCatalog || adminCatalogLoaded) return;
    let active = true;
    setQueueLoading(true);
    Promise.all([api.getUsers(), api.getOrgUnits(), api.getChannels()])
      .then(([userList, units, allChannels]) => {
        if (!active) return;
        setUsers(userList);
        setOrgUnits(units);
        setChannels(allChannels);
        setAdminCatalogLoaded(true);
      })
      .catch(reason => active && setLoadError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu cấu hình.'))
      .finally(() => { if (active) setQueueLoading(false); });
    return () => { active = false; };
  }, [surface, canConfigureCatalog, adminCatalogLoaded]);

  const login = async (credentials: LoginDTO) => {
    setLoadError(null);
    // The login response already contains the server-validated user. Repeating `/me` here only
    // adds another round trip before the shell can render.
    const response = await api.login(credentials);
    setCurrentUser(response.user);
    setAuthChecked(true);
    // Keep the button responsive after authentication; bootstrap progress is shown in the shell.
    void bootstrapData();
  };

  const logout = async () => {
    try {
      setBootstrapping(true);
      await api.logout();
      setCurrentUser(null);
      setAdminCatalogLoaded(false);
      setUsers([]);
      setFindings([]);
      setFindingsTotal(0);
      setDashboard(null);
      setCampaignDashboard(null);
      setHasSearched(false);
      setCriteria(emptySearchCriteria());
      setDraftCriteria(emptySearchCriteria());
      setSummaryScope('SCOPE');
      setWorkQueue({ actionable: [], following: [], accepted: [], watchTargets: [] });
      setSurface('CASES');
      setSelectedCase(null);
      setSelectedFindingId(undefined);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Không thể đăng xuất.');
    } finally {
      setBootstrapping(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.changePassword({ currentPassword: currentPassword || undefined, password: newPassword });
      setPasswordMessage('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      setCurrentPassword(''); setNewPassword('');
      setTimeout(() => { setPasswordModalOpen(false); setPasswordMessage(null); logout(); }, 1200);
    } catch (error) { setPasswordMessage(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.'); }
  };

  // Kênh đang xem đọc từ điều kiện đã áp dụng, không phải từ một state riêng: một nguồn sự thật thì
  // tiêu đề, thanh bên và tập dữ liệu không thể nói ba điều khác nhau.
  const activeChannel = channels.find(channel => channel.id === criteria.channelId);
  const gridMode = activeChannel?.schemaConfig?.formTemplate?.presentationMode === 'EXCEL_GRID';

  /** Chạy tìm kiếm với điều kiện vừa sửa trong panel. */
  const submitSearch = () => { void runSearch(draftCriteria, { focusCampaignTab: true }); };
  const resetSearch = () => {
    searchToken.current += 1;
    const cleared = emptySearchCriteria();
    setDraftCriteria(cleared);
    setCriteria(cleared);
    setFindings([]);
    setFindingsTotal(0);
    setCampaignDashboard(null);
    setHasSearched(false);
    setSummaryScope('SCOPE');
    setQueueLoading(false);
    setSummaryLoading(false);
    setLoadingMore(false);
  };
  /** Chọn kênh ở thanh bên là một thao tác có chủ đích, nên nó chạy lại tìm kiếm ngay. */
  const selectChannel = (channelId: string) => {
    const next = { ...draftCriteria, channelId };
    setDraftCriteria(next);
    setSidebarOpen(false);
    if (hasSearched) void runSearch(next, { focusCampaignTab: true });
  };

  /**
   * Điều kiện lọc nay chỉ còn một tầng duy nhất là khung tìm kiếm phía trên, chạy dưới máy chủ.
   * Dải chip trạng thái bên dưới là thứ duy nhất còn lọc trên trình duyệt, và nó chỉ đọc
   * `workflowStatus` — một phép chọn nhanh trên đúng tập vừa tải về, không phải một bộ lọc thứ hai.
   */
  const visibleFindings = useMemo(
    () => findings.filter(finding => matchesFilter(finding, filter)),
    [findings, filter],
  );

  const customerCases = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of findings) {
      if (!matchesFilter(finding, filter)) continue;
      const key = `${finding.branchCode}:${finding.cif}`;
      map.set(key, [...(map.get(key) || []), finding]);
    }
    // Late hồ sơ float to the top: the queue is worked in deadline order, not
    // alphabetical order, so the first screenful is the work that is actually due.
    return [...map.values()].sort((a, b) =>
      Number(b.some(isOverdue)) - Number(a.some(isOverdue))
      || b.length - a.length
      || a[0].customerName.localeCompare(b[0].customerName, 'vi'));
  }, [findings, filter]);

  /** Mỗi chip mang theo số của chính nó, nên dải chip vừa là bộ chọn vừa là bảng phân rã. */
  const filterCounts = useMemo(() => {
    const counts: Record<Filter, number> = {
      ALL: 0, OVERDUE: 0, PENDING: 0, SUBMITTED_BRANCH: 0,
      SUBMITTED_BRANCH_LEADER: 0, SUBMITTED_INTERNAL: 0, REJECTED: 0, WAIVED_RESOLVED: 0,
    };
    for (const finding of findings) {
      counts.ALL += 1;
      counts[finding.workflowStatus] += 1;
      if (isOverdue(finding)) counts.OVERDUE += 1;
    }
    return counts;
  }, [findings]);

  const updateFinding = (updated: Finding) => {
    setFindings(previous => previous.map(item => item.id === updated.id ? updated : item));
    setSelectedCase(previous => previous?.map(item => item.id === updated.id ? updated : item) || null);
    api.getDashboardSummary().then(setDashboard).catch(() => undefined);
    api.getMyWork().then(setWorkQueue).catch(() => undefined);
    // Duyệt một hồ sơ làm đổi cả hai thẻ số. Thiếu dòng này thì tab "Chuyên đề đang tìm" đứng im ở
    // con số trước khi duyệt cho tới lần tìm kiếm kế tiếp — và nó nằm ngay cạnh danh sách vừa đổi.
    if (hasSearched) {
      api.getDashboardSummary(criteriaToQuery(criteria)).then(setCampaignDashboard).catch(() => undefined);
    }
  };

  const openCase = (items: Finding[], findingId?: string) => {
    setSelectedCase(items);
    setSelectedFindingId(findingId || items[0]?.id);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const openWorkspaceTarget = async (target: WorkspaceTarget) => {
    if (target.targetType === 'CUSTOMER' && target.cif && target.branchCode) {
      try {
        // Mở một khách hàng cụ thể không cần cả danh sách: một request lấy đúng hồ sơ của khách đó.
        setQueueLoading(true);
        const customerCase = await api.getCustomerCase(target.cif, target.branchCode);
        openCase(customerCase.findings, target.representativeFindingId);
      } catch (reason) {
        setLoadError(reason instanceof Error ? reason.message : 'Không thể mở hồ sơ công việc.');
      } finally {
        setQueueLoading(false);
      }
    } else {
      setSelectedCase(null);
      setFilter('ALL');
      // Cả hai loại mục tiêu đều đi xuống máy chủ: chi nhánh khớp bằng mã, cụm khớp qua từ khoá
      // (máy chủ đối chiếu cả `clusterName`). Điều kiện hiện lên ngay trong khung tìm kiếm phía
      // trên, nên người dùng thấy được vì sao danh sách đang bị thu hẹp và sửa lại được.
      const next: QueueSearchCriteria = target.targetType === 'BRANCH' && target.branchCode
        ? { ...draftCriteria, branchCode: target.branchCode, search: '' }
        : { ...draftCriteria, search: target.clusterName ?? '' };
      setDraftCriteria(next);
      await runSearch(next, { focusCampaignTab: true });
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    setSidebarOpen(false);
  };

  const navigateTo = (nextSurface: Surface) => {
    setSurface(nextSurface);
    setSelectedCase(null);
    setSelectedFindingId(undefined);
  };

  const legacyUser: LegacyUserProfile | null = currentUser ? {
    id: currentUser.id,
    name: currentUser.fullName,
    email: currentUser.email,
    portal: currentUser.portal,
    role: currentUser.primaryRole as LegacyUserProfile['role'],
    clusterName: currentUser.clusterName,
    branchName: currentUser.branchName,
    branchCode: currentUser.branchCode,
    department: currentUser.department,
  } : null;

  if (!authChecked) {
    return <div role="status" className="grid min-h-screen place-items-center bg-canvas text-sm font-bold text-brand-600">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!currentUser) return <LoginPage onLogin={login} onForgotPassword={email => api.forgotPassword(email, `${window.location.origin}/reset-password`)} />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-slate-900">
      {/* The required brand navigation colour stays a literal here: this bar is the navigation. */}
      <header className="sticky top-0 z-40 bg-[#006b68] text-white shadow-lg shadow-teal-950/10">
        <div className="mx-auto flex min-w-0 max-w-[1480px] flex-wrap items-center gap-2 px-3 py-3 sm:px-6 lg:flex-nowrap lg:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-brand-600">AM</div>
            <div className="min-w-0"><h1 className="truncate text-sm font-black tracking-wide">AUDIT MONITORING</h1><p className="hidden text-[10px] text-teal-100 sm:block">Quản lý sai sót và hồ sơ khắc phục</p></div>
          </div>
          <nav className="order-3 flex min-w-0 w-full max-w-full gap-1 overflow-x-auto border-t border-white/10 pt-2 lg:order-none lg:w-auto lg:flex-1 lg:border-t-0 lg:pt-0" aria-label="Điều hướng chính">
            <NavButton active={surface === 'CASES'} onClick={() => navigateTo('CASES')} icon={<LayoutDashboard />} label="Hồ sơ khách hàng" />
            {canImport && <NavButton active={surface === 'IMPORT'} onClick={() => navigateTo('IMPORT')} icon={<FileUp />} label="Nhập dữ liệu" />}
            <NavButton active={surface === 'REPORTS'} onClick={() => navigateTo('REPORTS')} icon={<BarChart3 />} label="Báo cáo" />
            {canConfigureCatalog && <NavButton active={surface === 'ADMIN'} onClick={() => navigateTo('ADMIN')} icon={<Settings />} label="Cấu hình" />}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden text-right md:block"><div className="text-xs font-bold">{currentUser?.fullName}</div><div className="text-[10px] text-teal-100">{currentUser?.department || currentUser?.branchName || 'Hội sở'}</div></div>
            <div title={`${currentUser.coplusRole ?? ''} · ${userRoleLabels[currentUser.primaryRole]}`} className="hidden max-w-[220px] truncate rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-bold text-white sm:block">{currentUser.coplusRole ? `${currentUser.coplusRole} · ${coplusRoleLabel(currentUser.coplusRole)}` : userRoleLabels[currentUser.primaryRole]}</div>
            <button type="button" onClick={() => setPasswordModalOpen(true)} aria-label="Đổi mật khẩu" title="Đổi mật khẩu" className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20"><KeyIcon /></button>
            <button type="button" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất" className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      {passwordModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><form onSubmit={changePassword} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-base font-bold">Đổi mật khẩu</h2><button type="button" onClick={() => { setPasswordModalOpen(false); setPasswordMessage(null); }} aria-label="Đóng" className="text-slate-500">×</button></div><p className="text-xs text-slate-500">Mật khẩu mới tối thiểu 12 ký tự. Sau khi đổi, phiên hiện tại sẽ kết thúc để đăng nhập lại.</p>{passwordMessage && <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{passwordMessage}</div>}<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Mật khẩu hiện tại (bắt buộc ở local)" className="min-h-11 w-full rounded-xl border border-rule px-3 text-sm" /><input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Mật khẩu mới" className="min-h-11 w-full rounded-xl border border-rule px-3 text-sm" /><button type="submit" className="min-h-11 w-full rounded-xl bg-brand-500 text-sm font-bold text-white">Lưu mật khẩu</button></form></div>}

      <main className={surface === 'CASES' ? 'w-full' : 'mx-auto max-w-[1480px] space-y-5 px-3 py-4 sm:px-6 sm:py-6'}>
        {/* The case surface renders edge-to-edge, so these two banners carry their own gutter
            instead of sitting flush against the viewport. */}
        {/* Chỉ lần khởi động mới được chiếm chỗ bằng một băng thông báo. Những lần tải sau diễn ra
            ngay tại chỗ dữ liệu sắp thay đổi, nên màn hình không còn nhấp nháy sau mỗi thao tác. */}
        {bootstrapping && <div role="status" aria-live="polite" className={`flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-600 ${surface === 'CASES' ? 'mx-3 mt-3 sm:mx-6' : ''}`}>
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
          Đang tải dữ liệu...
        </div>}
        {loadError && <div role="alert" className={`flex items-start gap-2 rounded-xl border border-risk-border bg-risk-surface px-4 py-3 text-xs font-semibold text-risk ${surface === 'CASES' ? 'mx-3 mt-3 sm:mx-6' : ''}`}>
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">{loadError}</span>
        </div>}

        {surface === 'CASES' && selectedCase && currentUser && <FindingDetailPage findings={selectedCase} currentUser={currentUser} initialFindingId={selectedFindingId} workQueue={workQueue} onBack={() => { setSelectedCase(null); setSelectedFindingId(undefined); }} onFindingUpdated={updateFinding} onWorkspaceChanged={async () => setWorkQueue(await api.getMyWork())} />}

        <Suspense fallback={<WorkspaceLoading />}>
          {surface === 'ADMIN' && canConfigureCatalog && adminCatalogLoaded && <AdminPortal isSystemAdmin={isAdmin} orgUnits={orgUnits} users={users} channels={channels} campaigns={campaigns} onOrgUnitCreated={async unit => { const created = await api.createOrgUnit(unit); setOrgUnits(previous => [...previous, created]); }} onOrgUnitUpdated={async (id, unit) => { const updated = await api.updateOrgUnit(id, unit); setOrgUnits(previous => previous.map(item => item.id === id ? updated : item)); }} onOrgUnitDeleted={async id => { await api.deleteOrgUnit(id); setOrgUnits(previous => previous.filter(item => item.id !== id)); }} onOrgUnitsImported={async batch => { const result = await api.importOrgUnits(batch); setOrgUnits(previous => [...previous, ...result.created.map(row => row.unit)]); return result; }} onUserCreated={async user => { const created = await api.createUser(user); setUsers(previous => [...previous, created.user]); return created; }} onUsersImported={async batch => { const result = await api.importUsers(batch); setUsers(previous => [...previous, ...result.created.map(row => row.user)]); return result; }} onUserUpdated={async (id, data) => { const result = await api.updateUser(id, data); setUsers(previous => previous.map(item => item.id === id ? result.user : item)); return result.user; }} onUserDeleted={async id => { await api.deleteUser(id); setUsers(previous => previous.filter(item => item.id !== id)); }} onUserPasswordReset={async id => { const result = await api.resetUserPassword(id); return result; }} onAuthenticatorChange={async (id, data) => { const result = await api.updateUserAuthenticator(id, data); setUsers(previous => previous.map(item => item.id === id ? result.user : item)); return result; }} onChannelCreated={async channel => { const created = await api.createChannel(channel); setChannels(previous => [...previous, created]); }} onChannelUpdated={async (id, channel) => { const updated = await api.updateChannel(id, channel); setChannels(previous => previous.map(item => item.id === id ? updated : item)); }} onChannelDeleted={async id => { await api.deleteChannel(id); setChannels(previous => previous.filter(item => item.id !== id)); }} onCampaignCreated={async campaign => { const created = await api.createCampaign(campaign); setCampaigns(previous => [...previous, created]); }} onCampaignUpdated={async (id, campaign) => { const updated = await api.updateCampaign(id, campaign); setCampaigns(previous => previous.map(item => item.id === id ? updated : item)); }} onCampaignDeleted={async id => { await api.deleteCampaign(id); setCampaigns(previous => previous.filter(item => item.id !== id)); }} onCampaignImportDraft={file => api.importCampaignDraft(file)} onCampaignProvisionDrive={async id => { const updated = await api.provisionCampaignDrive(id); setCampaigns(previous => previous.map(item => item.id === id ? updated : item)); }} onBackToPortal={() => setSurface('CASES')} />}
          {surface === 'IMPORT' && canImport && legacyUser && <FastDataIngestion currentUser={legacyUser} channels={channels} campaigns={campaigns} onCampaignCreated={async campaign => { const created = await api.createCampaign(campaign); const active = await api.updateCampaign(created.id, { expectedVersion: created.version, status: 'ACTIVE' }); setCampaigns(previous => [...previous, active]); return active; }} onCommitNewCustomers={refreshScopedData} />}
          {surface === 'REPORTS' && <ReportsWorkspace />}
        </Suspense>

        {surface === 'CASES' && !selectedCase && <>
          <div className={`grid min-h-[calc(100dvh-116px)] items-start transition-[grid-template-columns] duration-200 lg:min-h-[calc(100dvh-64px)] ${sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[300px_minmax(0,1fr)]'}`}>
            {sidebarOpen && <button type="button" aria-label="Đóng thanh bên" onClick={() => setSidebarOpen(false)} className="fixed inset-x-0 bottom-0 top-[116px] z-20 bg-slate-950/35 lg:hidden" />}
            <div className={`fixed bottom-0 left-0 top-[116px] z-30 w-[min(300px,calc(100vw-32px))] overflow-y-auto transition-transform duration-200 lg:sticky lg:top-[64px] lg:z-10 lg:w-auto lg:translate-x-0 lg:overflow-visible ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <WorkspaceSidebar channels={channels.filter(channel => channel.isActive)} selectedChannelId={criteria.channelId} workQueue={workQueue} collapsed={sidebarCollapsed} onToggle={() => { if (window.innerWidth < 1024) setSidebarOpen(false); else setSidebarCollapsed(value => !value); }} onSelectChannel={selectChannel} onOpenTarget={openWorkspaceTarget} onTogglePriority={async target => { await api.setWatchPriority(target.id, !target.isPriority); setWorkQueue(await api.getMyWork()); }} />
            </div>
            <div className="min-w-0 space-y-5 px-3 py-4 sm:px-6 sm:py-6">
              {/* The queue had no heading: which kênh dữ liệu you were reading lived only in the
                  sidebar highlight, which is gone the moment the sidebar collapses. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
                {/* Title first, controls after: on a phone the heading answering "which kênh am I
                    in" must not sit below three buttons. */}
                <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 lg:basis-auto">
                  <button type="button" onClick={() => { setSidebarCollapsed(false); setSidebarOpen(true); }} aria-label="Mở thanh bên" title="Mở thanh bên" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rule bg-white text-brand-600 shadow-panel lg:hidden"><Menu className="h-4 w-4" /></button>
                  <div className="min-w-0">
                    <h1 className="truncate text-base font-black tracking-tight text-slate-900">{activeChannel?.name || 'Hồ sơ khách hàng'}</h1>
                    <p data-numeric className="mt-0.5 truncate text-[11px] text-slate-500">
                      {hasSearched
                        ? `${customerCases.length} khách hàng · ${visibleFindings.length} mã lỗi đang hiển thị${findings.length < findingsTotal ? ` · đã tải ${findings.length}/${findingsTotal}` : ''}`
                        : 'Chọn chuyên đề và điều kiện để bắt đầu'}
                    </p>
                  </div>
                </div>
                {canImport && <button onClick={() => setCreateOpen(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-raised transition-colors hover:bg-brand-600"><Plus className="h-4 w-4" />Tạo hồ sơ</button>}
              </div>

          {/* Hai phạm vi số liệu thay cho một dãy thẻ: "của tôi" và "của chuyên đề vừa tìm" là hai
              câu hỏi khác nhau, trước đây bị trộn vào cùng một hàng nên hàng đó có hai hệ quy chiếu. */}
          <ScopeSummaryTabs
            scope={summaryScope}
            onScopeChange={setSummaryScope}
            currentUser={currentUser}
            scopeSummary={dashboard}
            campaignSummary={campaignDashboard}
            loading={summaryLoading || bootstrapping}
          />

          <QueueSearchPanel
            criteria={draftCriteria}
            campaigns={campaigns}
            channels={channels.filter(channel => channel.isActive)}
            orgUnits={orgUnits}
            facetValues={facetValues}
            busy={queueLoading}
            onChange={setDraftCriteria}
            onSearch={submitSearch}
            onReset={resetSearch}
          />

          {/* Danh sách chỉ tồn tại sau lần tìm kiếm đầu tiên. Trước khi đó không có bảng rỗng, không
              có spinner, và quan trọng nhất là không có request nào được gửi đi. */}
          {!hasSearched ? <EmptyHint
            icon={Search}
            title="Chưa tải danh sách khách hàng"
            hint="Chọn chuyên đề rồi bấm “Tìm kiếm”."
          /> : <section className={`overflow-hidden rounded-2xl border border-rule bg-white shadow-panel transition-opacity ${queueLoading ? 'opacity-60' : ''}`}>
            {/* Chỉ còn dải chip trạng thái. Ô tìm và phễu lọc từng nằm ở đây đã bị gỡ: điều kiện lọc
                nay do khung tìm kiếm phía trên đảm nhiệm, và hai lớp lọc chồng nhau chỉ khiến người
                dùng phải nhớ mình đã thu hẹp danh sách ở chỗ nào. */}
            <div className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-rule bg-white px-3 py-2" role="group" aria-label="Lọc theo tình trạng">
              {([['ALL', 'Tất cả'], ['OVERDUE', 'Quá hạn'], ['PENDING', 'Chờ chi nhánh'], ['SUBMITTED_BRANCH', 'Chờ kiểm soát'], ['SUBMITTED_BRANCH_LEADER', 'Chờ lãnh đạo CN'], ['SUBMITTED_INTERNAL', 'Chờ phê duyệt HT'], ['REJECTED', 'Cần bổ sung'], ['WAIVED_RESOLVED', 'Đã đóng']] as const).map(([key, label]) => {
                const active = filter === key;
                const risky = key === 'OVERDUE' && filterCounts.OVERDUE > 0;
                return <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={active} className={`inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[10px] font-bold transition-colors ${active ? 'bg-brand-500 text-white' : risky ? 'bg-risk-surface text-risk hover:bg-risk-surface/70' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {label}
                  <span data-numeric className={`text-[10px] font-black tabular-nums ${active ? 'text-white/80' : risky ? 'text-risk' : 'text-slate-400'}`}>{filterCounts[key]}</span>
                </button>;
              })}
            </div>

            {/* A report type configured as "Dạng bảng Excel" is captured row by row instead of one
                hồ sơ at a time; every other type keeps the customer-grouped case list. */}
            {gridMode ? <div className="p-3 sm:p-4">
              <FindingGridWorkspace
                findings={visibleFindings}
                currentUser={currentUser}
                onOpenCase={finding => openCase(findings.filter(item => item.branchCode === finding.branchCode && item.cif === finding.cif), finding.id)}
                onChanged={refreshScopedData}
              />
            </div> : <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-rule bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Khách hàng / CIF</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Chi nhánh / phòng</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Mã lỗi</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Hạn xử lý &amp; tuyến duyệt</th>
                    <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Mở hồ sơ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">{customerCases.map(items => <CustomerRow key={`${items[0].branchCode}:${items[0].cif}`} findings={items} onOpen={() => openCase(items)} />)}</tbody>
              </table>
            </div>

            <div className="divide-y divide-rule md:hidden">
              {customerCases.map(items => {
                const customer = items[0];
                const late = items.some(isOverdue);
                return <button data-testid="customer-card" key={`${customer.branchCode}:${customer.cif}`} onClick={() => openCase(items)} className={`relative w-full p-3.5 text-left transition-colors active:bg-brand-50 ${late ? 'bg-risk-surface/40' : 'bg-white'}`}>
                  {late && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-risk-solid" />}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] font-bold text-brand-600">CIF {customer.cif}</div>
                      <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">{customer.customerName}</h3>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">CN {customer.branchCode} · {customer.department || 'Chưa phân phòng'}</p>
                  <ErrorCodeBadges findings={items} className="mt-2.5" />
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2.5">
                    <span data-numeric className="text-[10px] font-semibold text-slate-500">{items.length} mã lỗi</span>
                    <CaseStatusBadge findings={items} compact />
                  </div>
                </button>;
              })}
            </div>
            {/* Danh sách rỗng vì chip trạng thái là chuyện khác với danh sách rỗng vì điều kiện tìm
                kiếm, nên lời nhắn chỉ đúng chỗ đang giấu hàng đi. */}
            {!customerCases.length && <EmptyHint
              icon={Search}
              title={findings.length ? 'Không có hồ sơ ở tình trạng này' : 'Không có hồ sơ nào khớp điều kiện tìm kiếm'}
              hint={findings.length
                ? 'Chọn chip “Tất cả” để xem lại toàn bộ hồ sơ vừa tải.'
                : 'Mở khung tìm kiếm phía trên và bỏ bớt điều kiện.'}
            />}
            </>}

            {/* Says plainly that more exist rather than stopping at one page in silence. */}
            {findings.length < findingsTotal && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-slate-50/60 px-4 py-3">
              {/* Chip trạng thái chỉ chạy trên phần đã tải, nên khi mới tải một phần thì con số trên
                  chip là câu trả lời một phần. Nói thẳng ra thay vì để nó trông như kết quả đầy đủ. */}
              <span data-numeric className="text-[11px] font-semibold text-slate-600">
                Đã tải {findings.length} / {findingsTotal} mã lỗi
                {filter !== 'ALL' && <span className="text-warn"> · chip trạng thái chỉ áp dụng trên phần đã tải</span>}
              </span>
              <button type="button" onClick={() => void loadMoreFindings()} disabled={loadingMore} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-brand-200 bg-white px-3.5 text-xs font-bold text-brand-600 shadow-panel transition-colors hover:border-brand-500 disabled:opacity-50">
                {loadingMore && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />}
                {loadingMore ? 'Đang tải...' : `Tải thêm ${Math.min(FINDINGS_PAGE_SIZE, findingsTotal - findings.length)} mã lỗi`}
              </button>
            </div>}
          </section>}
            </div>
          </div>
        </>}
      </main>

      <WebFormFindingModal isOpen={createOpen} currentUser={currentUser ?? undefined} channels={channels.filter(channel => channel.isActive)} campaigns={campaigns} initialCampaignId={criteria.campaignId} orgUnits={orgUnits} onClose={() => setCreateOpen(false)} onSubmit={async (dto: WebFormFindingDTO | WebFormFindingDTO[]) => { const rows = Array.isArray(dto) ? dto : [dto]; for (const row of rows) await api.createFinding(row); await refreshScopedData(); setCreateOpen(false); }} />
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactElement; label: string }> = ({ active, onClick, icon, label }) => <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-white text-brand-600' : 'text-teal-50 hover:bg-white/10'}`}>{React.cloneElement(icon, { className: 'h-4 w-4' } as React.HTMLAttributes<HTMLElement>)}{label}</button>;
const WorkspaceLoading: React.FC = () => <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-bold text-brand-600">Đang mở chức năng...</div>;
const slaPriority: Record<Finding['slaStatus'], number> = { CLOSED: 0, ON_TRACK: 1, DUE_SOON: 2, OVERDUE: 3 };
const workflowPriority: Record<Finding['workflowStatus'], number> = {
  WAIVED_RESOLVED: 0, PENDING: 1, SUBMITTED_BRANCH: 2, SUBMITTED_INTERNAL: 3, SUBMITTED_BRANCH_LEADER: 4, REJECTED: 5,
};

const errorCodeTitle = (findings: Finding[]) => `Tất cả mã lỗi: ${findings.map(item => item.errorCode).join(', ')}`;

const ErrorCodeBadges: React.FC<{ findings: Finding[]; className?: string }> = ({ findings, className = '' }) => {
  const shown = findings.slice(0, 3);
  return <div className={`flex max-w-[220px] flex-wrap gap-1 ${className}`} title={errorCodeTitle(findings)}>
    {shown.map(item => <CodeChip key={item.id}>{item.errorCode}</CodeChip>)}
    {findings.length > shown.length && <span className="inline-flex items-center rounded border border-rule bg-slate-50 px-1.5 py-[2px] text-[10px] font-bold leading-4 text-slate-600">+{findings.length - shown.length}</span>}
  </div>;
};

const CaseStatusBadge: React.FC<{ findings: Finding[]; compact?: boolean }> = ({ findings, compact = false }) => {
  const highestSla = findings.reduce<Finding['slaStatus']>((current, finding) => {
    const candidate = finding.isOverdue ? 'OVERDUE' : finding.slaStatus;
    return slaPriority[candidate] > slaPriority[current] ? candidate : current;
  }, 'CLOSED');
  const highestWorkflow = findings.reduce<Finding['workflowStatus']>((current, finding) => workflowPriority[finding.workflowStatus] > workflowPriority[current] ? finding.workflowStatus : current, 'WAIVED_RESOLVED');
  // One shared vocabulary for both, so deadline and route position no longer compete on weight.
  return <div className={`flex min-w-0 items-center gap-2 ${compact ? 'justify-end' : 'flex-wrap'}`} aria-label={`Tình trạng: ${workflowStatusLabels[highestWorkflow]}. Hạn xử lý: ${slaStatusLabels[highestSla]}.`}>
    <SlaPill status={highestSla} />
    <WorkflowPill status={highestWorkflow} showRoute={!compact} className="max-w-[170px]" />
  </div>;
};

const CustomerRow: React.FC<{ findings: Finding[]; onOpen: () => void }> = ({ findings, onOpen }) => {
  const customer = findings[0];
  const late = findings.some(isOverdue);
  // The whole row is the target — the chevron button stays for keyboard and screen readers,
  // but nobody should have to aim at a 36px control to open a hồ sơ.
  return <tr onClick={onOpen} className={`group cursor-pointer transition-colors ${late ? 'bg-risk-surface/40 hover:bg-risk-surface' : 'hover:bg-brand-50/60'}`}>
    <td className="relative px-4 py-3">
      {late && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-risk-solid" />}
      <div className="font-bold text-slate-900">{customer.customerName}</div>
      <div className="mt-0.5 font-mono text-[10px] font-bold text-brand-600">CIF {customer.cif}</div>
    </td>
    <td className="px-4 py-3">
      <div className="font-semibold text-slate-700">{customer.branchCode} · {customer.branchName}</div>
      <div className="mt-0.5 truncate text-[10px] text-slate-500">{customer.department || 'Chưa phân phòng'} · {customer.officerName || 'Chưa phân công'}</div>
    </td>
    <td className="px-4 py-3"><ErrorCodeBadges findings={findings} /></td>
    <td className="px-4 py-3"><CaseStatusBadge findings={findings} /></td>
    <td className="px-4 py-3 text-right">
      <button type="button" onClick={onOpen} aria-label={`Mở hồ sơ ${customer.customerName}`} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors group-hover:border-brand-200 group-hover:bg-white group-hover:text-brand-600"><ChevronRight className="h-4 w-4" /></button>
    </td>
  </tr>;
};

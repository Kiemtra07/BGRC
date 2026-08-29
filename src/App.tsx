import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, ChevronRight, CircleCheck, ClipboardList, FileUp, LayoutDashboard, LucideIcon,
  Funnel, Plus, Search, Settings, LogOut, Menu, TriangleAlert, UserCheck, Users, X, Key as KeyIcon,
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
import { QueueFilterPanel, QueueFilters, countActiveFilters, emptyQueueFilters, matchesQueueFilters } from './components/portal/QueueFilterPanel';

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
  const [campaignId, setCampaignId] = useState('');
  const [channelId, setChannelId] = useState('chan-audit-bgs');
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsTotal, setFindingsTotal] = useState(0);
  const [findingsPage, setFindingsPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [selectedCase, setSelectedCase] = useState<Finding[] | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [workQueue, setWorkQueue] = useState<MyWorkQueue>({ actionable: [], following: [], accepted: [], watchTargets: [] });
  const [search, setSearch] = useState('');
  // `queueFilters` is what the list obeys; `draftFilters` is what the panel edits. Splitting them
  // is what makes "Tìm kiếm" mean something — otherwise every select would re-filter mid-thought.
  const [queueFilters, setQueueFilters] = useState<QueueFilters>(emptyQueueFilters);
  const [draftFilters, setDraftFilters] = useState<QueueFilters>(emptyQueueFilters);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const isAdmin = currentUser?.roles.includes('ADMIN') || false;
  const canConfigureCatalog = currentUser?.roles.some(role => ['ADMIN', 'INTERNAL_OFFICER', 'INTERNAL_APPROVER', 'SUPERVISOR'].includes(role)) || false;
  const canImport = currentUser?.roles.some(role => ['ADMIN', 'INTERNAL_OFFICER', 'INTERNAL_APPROVER', 'SUPERVISOR'].includes(role)) || false;

  const refreshScopedData = async () => {
    const [findingsResult, dashboardResult, workResult] = await Promise.all([
      api.getFindings({ channelId, ...(campaignId ? { campaignId } : {}), page: '1', limit: String(FINDINGS_PAGE_SIZE) }),
      api.getDashboardSummary(),
      api.getMyWork(),
    ]);
    setFindings(findingsResult.items);
    setFindingsTotal(findingsResult.total);
    setFindingsPage(1);
    setDashboard(dashboardResult);
    setWorkQueue(workResult);
  };

  /**
   * The server has always paginated; the client used to take the first page and say nothing, so
   * beyond one page of hồ sơ simply vanished. Pages are appended rather than replaced because the
   * queue groups findings by khách hàng — paging the group itself would split one customer's mã
   * lỗi across two pages.
   */
  const loadMoreFindings = async () => {
    try {
      setLoadingMore(true);
      const next = findingsPage + 1;
      const result = await api.getFindings({ channelId, ...(campaignId ? { campaignId } : {}), page: String(next), limit: String(FINDINGS_PAGE_SIZE) });
      setFindings(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...result.items.filter(item => !seen.has(item.id))];
      });
      setFindingsTotal(result.total);
      setFindingsPage(next);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Không thể tải thêm hồ sơ.');
    } finally {
      setLoadingMore(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const me = await api.getMe();
      setCurrentUser(me.user);
      // Every role that can create a hồ sơ needs the branch list; only admins get the full org tree.
      const [activeChannels, accessibleCampaigns, branches] = await Promise.all([
        api.getActiveChannels(), api.getCampaigns(), api.getScopedBranches(),
      ]);
      setChannels(activeChannels);
      setCampaigns(accessibleCampaigns);
      setOrgUnits(branches);
      if (!campaignId && accessibleCampaigns.length) setCampaignId(accessibleCampaigns[0].id);
      // Findings/dashboard/work-queue are loaded by the filter effect once currentUser is set.
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setCurrentUser(null);
      setLoadError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.');
    } finally {
      setAuthChecked(true);
      setLoading(false);
    }
  };

  // Identity, channels, campaigns and the branch list do not depend on the workspace filters, so
  // they are fetched once. Re-running the whole bootstrap on every filter change cost a redundant
  // getMe + channels + campaigns round trip each time — wasteful anywhere, billed on serverless.
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (surface !== 'ADMIN' || !canConfigureCatalog || adminCatalogLoaded) return;
    let active = true;
    setLoading(true);
    Promise.all([api.getUsers(), api.getOrgUnits(), api.getChannels()])
      .then(([userList, units, allChannels]) => {
        if (!active) return;
        setUsers(userList);
        setOrgUnits(units);
        setChannels(allChannels);
        setAdminCatalogLoaded(true);
      })
      .catch(reason => active && setLoadError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu cấu hình.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [surface, canConfigureCatalog, adminCatalogLoaded]);
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    setLoading(true);
    refreshScopedData()
      .catch(reason => active && setLoadError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [channelId, campaignId, currentUser?.id]);

  const login = async (credentials: LoginDTO) => {
    setLoadError(null);
    await api.login(credentials);
    await load();
  };

  const logout = async () => {
    try {
      setLoading(true);
      await api.logout();
      setCurrentUser(null);
      setAdminCatalogLoaded(false);
      setUsers([]);
      setFindings([]);
      setDashboard(null);
      setWorkQueue({ actionable: [], following: [], accepted: [], watchTargets: [] });
      setSurface('CASES');
      setSelectedCase(null);
      setSelectedFindingId(undefined);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Không thể đăng xuất.');
    } finally {
      setLoading(false);
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

  const activeChannel = channels.find(channel => channel.id === channelId);
  const gridMode = activeChannel?.schemaConfig?.formTemplate?.presentationMode === 'EXCEL_GRID';
  /** Overdue across everything this user can see, regardless of the kênh/chuyên đề filters. */
  const overdueAllScopes = dashboard ? dashboard.overdueCount : 0;

  /** Status chip + free-text search + the funnel panel, applied as one predicate everywhere. */
  const passesQueue = (finding: Finding) => {
    if (!matchesFilter(finding, filter)) return false;
    if (!matchesQueueFilters(finding, queueFilters)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [finding.cif, finding.customerName, finding.branchName, finding.branchCode, finding.department, finding.errorCode, finding.errorTitle, finding.officerName]
      .some(value => value?.toLowerCase().includes(query));
  };

  /** Same filter/search the case list applies, but kept flat for the tabular capture screen. */
  const visibleFindings = useMemo(
    () => findings.filter(passesQueue),
    [findings, filter, search, queueFilters],
  );

  const customerCases = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of findings) {
      if (!passesQueue(finding)) continue;
      const key = `${finding.branchCode}:${finding.cif}`;
      map.set(key, [...(map.get(key) || []), finding]);
    }
    // Late hồ sơ float to the top: the queue is worked in deadline order, not
    // alphabetical order, so the first screenful is the work that is actually due.
    return [...map.values()].sort((a, b) =>
      Number(b.some(isOverdue)) - Number(a.some(isOverdue))
      || b.length - a.length
      || a[0].customerName.localeCompare(b[0].customerName, 'vi'));
  }, [findings, filter, search, queueFilters]);

  const activeQueueFilters = countActiveFilters(queueFilters);
  const filtersDirty = JSON.stringify(draftFilters) !== JSON.stringify(queueFilters);
  /** Opening the funnel resumes from what is actually applied, not from a stale draft. */
  const toggleFilterPanel = () => {
    setFilterPanelOpen(open => {
      if (!open) setDraftFilters(queueFilters);
      return !open;
    });
  };
  const applyFilters = () => {
    setQueueFilters(draftFilters);
    setFilterPanelOpen(false);
  };
  const clearFilters = () => {
    setDraftFilters(emptyQueueFilters());
    setQueueFilters(emptyQueueFilters());
  };

  /**
   * Every filter chip carries its own count, so the tab strip doubles as the breakdown. The
   * counts are taken after the funnel and the search box but before the chip's own status, so
   * the strip describes the set it can actually select from instead of contradicting the list.
   */
  const filterCounts = useMemo(() => {
    const counts: Record<Filter, number> = {
      ALL: 0, OVERDUE: 0, PENDING: 0, SUBMITTED_BRANCH: 0,
      SUBMITTED_BRANCH_LEADER: 0, SUBMITTED_INTERNAL: 0, REJECTED: 0, WAIVED_RESOLVED: 0,
    };
    const query = search.trim().toLowerCase();
    for (const finding of findings) {
      if (!matchesQueueFilters(finding, queueFilters)) continue;
      if (query && ![finding.cif, finding.customerName, finding.branchName, finding.branchCode, finding.department, finding.errorCode, finding.errorTitle, finding.officerName]
        .some(value => value?.toLowerCase().includes(query))) continue;
      counts.ALL += 1;
      counts[finding.workflowStatus] += 1;
      if (isOverdue(finding)) counts.OVERDUE += 1;
    }
    return counts;
  }, [findings, search, queueFilters]);

  const updateFinding = (updated: Finding) => {
    setFindings(previous => previous.map(item => item.id === updated.id ? updated : item));
    setSelectedCase(previous => previous?.map(item => item.id === updated.id ? updated : item) || null);
    api.getDashboardSummary().then(setDashboard).catch(() => undefined);
    api.getMyWork().then(setWorkQueue).catch(() => undefined);
  };

  const openCase = (items: Finding[], findingId?: string) => {
    setSelectedCase(items);
    setSelectedFindingId(findingId || items[0]?.id);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const openWorkspaceTarget = async (target: WorkspaceTarget) => {
    if (target.targetType === 'CUSTOMER' && target.cif && target.branchCode) {
      try {
        setLoading(true);
        const customerCase = await api.getCustomerCase(target.cif, target.branchCode);
        if (target.channelId && target.channelId !== channelId) setChannelId(target.channelId);
        openCase(customerCase.findings, target.representativeFindingId);
      } catch (reason) {
        setLoadError(reason instanceof Error ? reason.message : 'Không thể mở hồ sơ công việc.');
      } finally {
        setLoading(false);
      }
    } else {
      setSelectedCase(null);
      setFilter('ALL');
      setSearch(target.targetType === 'CLUSTER' ? target.clusterName : target.branchName || target.branchCode || '');
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
        {loading && <div role="status" aria-live="polite" className={`flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-600 ${surface === 'CASES' ? 'mx-3 mt-3 sm:mx-6' : ''}`}>
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
              <WorkspaceSidebar channels={channels.filter(channel => channel.isActive)} selectedChannelId={channelId} workQueue={workQueue} collapsed={sidebarCollapsed} onToggle={() => { if (window.innerWidth < 1024) setSidebarOpen(false); else setSidebarCollapsed(value => !value); }} onSelectChannel={channel => { setChannelId(channel); setSidebarOpen(false); }} onOpenTarget={openWorkspaceTarget} onTogglePriority={async target => { await api.setWatchPriority(target.id, !target.isPriority); setWorkQueue(await api.getMyWork()); }} />
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
                    <p data-numeric className="mt-0.5 truncate text-[11px] text-slate-500">{customerCases.length} khách hàng · {visibleFindings.length} mã lỗi đang hiển thị{findings.length < findingsTotal ? ` · đã tải ${findings.length}/${findingsTotal}` : ''}</p>
                  </div>
                </div>
                <select aria-label="Lọc theo chuyên đề" value={campaignId} onChange={event => setCampaignId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-rule bg-white px-3 text-xs font-bold text-slate-700 shadow-panel lg:max-w-[280px] lg:flex-none"><option value="">Tất cả chuyên đề</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.code} · {campaign.name}</option>)}</select>
                {canImport && <button onClick={() => setCreateOpen(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-raised transition-colors hover:bg-brand-600"><Plus className="h-4 w-4" />Tạo hồ sơ</button>}
              </div>

          {/* One ledger strip rather than five floating cards: hairline separators carry the
              grouping, the overdue cell is the only one allowed to raise its voice, and each
              metric filters the queue below so the numbers are controls, not decoration.
              The counts come from the loaded hồ sơ, not from the dashboard summary: the summary
              is scoped by permission only, so its figures cover kênh and chuyên đề that this
              list is filtered out of — clicking one would have filtered to an empty table. The
              wider figure is kept as context on the overdue cell, where it earns its place. */}
          <section aria-label="Tổng quan hồ sơ đang hiển thị" className="overflow-hidden rounded-2xl border border-rule bg-rule shadow-panel">
            <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
              <OverdueKpi
                overdueCount={filterCounts.OVERDUE}
                scopeNote={overdueAllScopes > filterCounts.OVERDUE ? `${overdueAllScopes} trên toàn phạm vi bạn phụ trách` : undefined}
                active={filter === 'OVERDUE'}
                onSelect={() => setFilter(filter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
              />
              <Kpi icon={Users} label="Khách hàng hiển thị" value={customerCases.length} hint="theo bộ lọc đang chọn" />
              <Kpi icon={ClipboardList} label="Tổng mã lỗi" value={Math.max(findingsTotal, filterCounts.ALL)} hint={findings.length < findingsTotal ? `mới tải ${findings.length}` : activeChannel ? 'trong kênh đang xem' : undefined} active={filter === 'ALL'} onSelect={() => setFilter('ALL')} />
              <Kpi icon={UserCheck} label="Chờ kiểm soát" value={filterCounts.SUBMITTED_BRANCH} active={filter === 'SUBMITTED_BRANCH'} onSelect={() => setFilter(filter === 'SUBMITTED_BRANCH' ? 'ALL' : 'SUBMITTED_BRANCH')} />
              <Kpi icon={CircleCheck} tone="ok" className="col-span-2 lg:col-span-1" label="Đã đóng lỗi" value={filterCounts.WAIVED_RESOLVED} active={filter === 'WAIVED_RESOLVED'} onSelect={() => setFilter(filter === 'WAIVED_RESOLVED' ? 'ALL' : 'WAIVED_RESOLVED')} />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
            <div className="space-y-3 border-b border-rule bg-white p-3 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0 lg:p-4">
              {/* Each chip carries its own count, so the strip is both the filter and the breakdown. */}
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0" role="group" aria-label="Lọc theo tình trạng">
                {([['ALL', 'Tất cả'], ['OVERDUE', 'Quá hạn'], ['PENDING', 'Chờ chi nhánh'], ['SUBMITTED_BRANCH', 'Chờ kiểm soát'], ['SUBMITTED_BRANCH_LEADER', 'Chờ lãnh đạo CN'], ['SUBMITTED_INTERNAL', 'Chờ phê duyệt HT'], ['REJECTED', 'Cần bổ sung'], ['WAIVED_RESOLVED', 'Đã đóng']] as const).map(([key, label]) => {
                  const active = filter === key;
                  const risky = key === 'OVERDUE' && filterCounts.OVERDUE > 0;
                  return <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={active} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${active ? 'border-brand-500 bg-brand-500 text-white' : risky ? 'border-risk-border bg-risk-surface text-risk hover:border-risk' : 'border-transparent text-slate-600 hover:border-rule hover:bg-slate-50'}`}>
                    {label}
                    <span data-numeric className={`rounded px-1 text-[10px] font-black tabular-nums ${active ? 'bg-white/20 text-white' : risky ? 'bg-white text-risk' : 'bg-slate-100 text-slate-500'}`}>{filterCounts[key]}</span>
                  </button>;
                })}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Collapsed to an icon until wanted. A term already typed keeps the field open so
                    an active search can never hide behind a button. */}
                {searchOpen || search.trim() ? (
                  <label className="relative block flex-1 lg:flex-none">
                    <span className="sr-only">Tìm hồ sơ</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      autoFocus={searchOpen}
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Escape') { setSearch(''); setSearchOpen(false); } }}
                      placeholder="Tìm CIF, khách hàng, chi nhánh, mã lỗi..."
                      className="min-h-10 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-9 text-xs outline-none transition-colors focus:border-brand-500 lg:w-72"
                    />
                    <button type="button" aria-label="Đóng ô tìm kiếm" onClick={() => { setSearch(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </label>
                ) : (
                  <button type="button" onClick={() => setSearchOpen(true)} aria-label="Mở ô tìm kiếm" title="Tìm hồ sơ" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600">
                    <Search className="h-4 w-4" />
                  </button>
                )}
                {/* The funnel keeps twelve controls out of the way until they are wanted, and
                    carries the applied count so a narrowed queue is never mistaken for an empty one. */}
                <button
                  type="button"
                  onClick={toggleFilterPanel}
                  aria-expanded={filterPanelOpen}
                  aria-controls="queue-filter-panel"
                  title={filterPanelOpen ? 'Thu gọn bộ lọc' : 'Mở bộ lọc'}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors ${activeQueueFilters > 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : filterPanelOpen ? 'border-brand-300 bg-white text-brand-600' : 'border-slate-300 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600'}`}
                >
                  <Funnel className="h-4 w-4" />
                  <span className="hidden sm:inline">Bộ lọc</span>
                  {activeQueueFilters > 0 && <span data-numeric className="rounded bg-brand-500 px-1.5 text-[10px] font-black text-white">{activeQueueFilters}</span>}
                </button>
              </div>
            </div>

            <div id="queue-filter-panel">
              <QueueFilterPanel
                open={filterPanelOpen}
                filters={draftFilters}
                dirty={filtersDirty}
                findings={findings}
                onChange={setDraftFilters}
                onApply={applyFilters}
                onClear={clearFilters}
                onClose={() => setFilterPanelOpen(false)}
              />
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
            {/* An empty queue caused by a filter is a different problem from an empty queue, so
                the message names the filter that is hiding the rows. */}
            {!customerCases.length && <EmptyHint
              icon={activeQueueFilters > 0 ? Funnel : Search}
              title={activeQueueFilters > 0
                ? `Không có hồ sơ nào khớp ${activeQueueFilters} điều kiện lọc`
                : search.trim() ? 'Không tìm thấy hồ sơ nào khớp' : 'Không có hồ sơ ở tình trạng này'}
              hint={activeQueueFilters > 0
                ? 'Mở bộ lọc và bỏ bớt điều kiện, hoặc bấm “Xóa bộ lọc” để xem lại toàn bộ hồ sơ.'
                : search.trim() ? `Không có kết quả cho “${search.trim()}”. Thử bỏ bớt từ khoá hoặc chuyển sang tình trạng “Tất cả”.` : 'Chuyển sang một tình trạng khác, hoặc bỏ lọc chuyên đề để xem toàn bộ hồ sơ trong kênh này.'}
            />}
            </>}

            {/* Says plainly that more exist rather than stopping at one page in silence. */}
            {findings.length < findingsTotal && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-slate-50/60 px-4 py-3">
              {/* Filters run over what is loaded, so with a filter on, a partial load means a
                  partial answer. Say that instead of letting it look like a complete result. */}
              <span data-numeric className="text-[11px] font-semibold text-slate-600">
                Đã tải {findings.length} / {findingsTotal} mã lỗi trong phạm vi của bạn
                {(activeQueueFilters > 0 || search.trim()) && <span className="text-warn"> · bộ lọc chỉ áp dụng trên phần đã tải</span>}
              </span>
              <button type="button" onClick={() => void loadMoreFindings()} disabled={loadingMore} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-brand-200 bg-white px-3.5 text-xs font-bold text-brand-600 shadow-panel transition-colors hover:border-brand-500 disabled:opacity-50">
                {loadingMore && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />}
                {loadingMore ? 'Đang tải...' : `Tải thêm ${Math.min(FINDINGS_PAGE_SIZE, findingsTotal - findings.length)} mã lỗi`}
              </button>
            </div>}
          </section>
            </div>
          </div>
        </>}
      </main>

      <WebFormFindingModal isOpen={createOpen} currentUser={currentUser ?? undefined} channels={channels.filter(channel => channel.isActive)} campaigns={campaigns} initialCampaignId={campaignId} orgUnits={orgUnits} onClose={() => setCreateOpen(false)} onSubmit={async (dto: WebFormFindingDTO | WebFormFindingDTO[]) => { const rows = Array.isArray(dto) ? dto : [dto]; for (const row of rows) await api.createFinding(row); await refreshScopedData(); setCreateOpen(false); }} />
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactElement; label: string }> = ({ active, onClick, icon, label }) => <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-white text-brand-600' : 'text-teal-50 hover:bg-white/10'}`}>{React.cloneElement(icon, { className: 'h-4 w-4' } as React.HTMLAttributes<HTMLElement>)}{label}</button>;
const WorkspaceLoading: React.FC = () => <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-bold text-brand-600">Đang mở chức năng...</div>;
type KpiTone = 'brand' | 'risk' | 'ok';
const kpiSurface: Record<KpiTone, { on: string; off: string }> = {
  brand: { on: 'bg-brand-50', off: 'bg-white hover:bg-brand-50/70' },
  risk: { on: 'bg-risk-surface', off: 'bg-risk-surface hover:bg-risk-border/40' },
  ok: { on: 'bg-ok-surface', off: 'bg-white hover:bg-ok-surface/70' },
};
const kpiIconClass: Record<KpiTone, string> = { brand: 'text-brand-500', risk: 'text-risk', ok: 'text-ok' };
const kpiValueClass: Record<KpiTone, string> = { brand: 'text-slate-900', risk: 'text-risk', ok: 'text-slate-900' };
const kpiRuleClass: Record<KpiTone, string> = { brand: 'bg-brand-500', risk: 'bg-risk-solid', ok: 'bg-ok' };

/**
 * Compact by design: this strip is a glance, not the content. It stays two-up on a phone and
 * five-up on a desktop, and never takes more vertical space than one row of the table below it.
 */
const Kpi: React.FC<{ icon: LucideIcon; label: string; value: number; hint?: string; tone?: KpiTone; active?: boolean; onSelect?: () => void; className?: string }> = ({ icon: Icon, label, value, hint, tone = 'brand', active = false, onSelect, className = '' }) => {
  const body = <>
    <span className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${kpiIconClass[tone]}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-4 text-slate-600">{label}</span>
    </span>
    <span className="mt-1 flex min-w-0 items-baseline gap-1.5">
      <span data-numeric className={`shrink-0 text-xl font-black leading-none tracking-tight ${kpiValueClass[tone]}`}>{value}</span>
      {hint && <span className="hidden min-w-0 truncate text-[10px] leading-4 text-slate-500 sm:block">{hint}</span>}
    </span>
    <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[2px] transition-colors ${active ? kpiRuleClass[tone] : 'bg-transparent'}`} />
  </>;
  const shell = `relative flex flex-col justify-center px-3 py-2.5 text-left transition-colors ${kpiSurface[tone][active ? 'on' : 'off']} ${className}`;
  if (!onSelect) return <div className={shell}>{body}</div>;
  return <button type="button" onClick={onSelect} aria-pressed={active} className={`${shell} w-full`}>{body}</button>;
};

/** Turns red only when something is actually late; a permanently alarmed dashboard stops alarming. */
export const OverdueKpi: React.FC<{ overdueCount: number; scopeNote?: string; active?: boolean; onSelect?: () => void }> = ({ overdueCount, scopeNote, active, onSelect }) => (
  <Kpi
    icon={TriangleAlert}
    label="Quá hạn"
    value={overdueCount}
    tone={overdueCount > 0 ? 'risk' : 'brand'}
    hint={scopeNote || (overdueCount > 0 ? 'Ưu tiên xử lý trước' : 'Không có hồ sơ trễ hạn')}
    active={active}
    onSelect={onSelect}
  />
);

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

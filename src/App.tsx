import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Building2, ChevronRight, FileUp, LayoutDashboard, Plus, Search, Settings,
  LogOut, Menu, ShieldCheck, Users,
} from 'lucide-react';
import { AuditCampaign, DashboardSummary, Finding, LoginDTO, MyWorkQueue, OrgUnit, ReportChannel, UserProfile, WebFormFindingDTO, WorkspaceTarget, coplusRoleLabel } from '../shared/contracts';
import { ApiError, api } from './services/api';
import { AdminPortal } from './components/admin/AdminPortal';
import { FindingDetailPage } from './components/portal/FindingDetailPage';
import { WorkspaceSidebar } from './components/portal/WorkspaceSidebar';
import { WebFormFindingModal } from './components/ingestion/WebFormFindingModal';
import { FastDataIngestion } from './components/internal/FastDataIngestion';
import { ReportsWorkspace } from './components/reports/ReportsWorkspace';
import { FindingGridWorkspace } from './components/reports/FindingGridWorkspace';
import { UserProfile as LegacyUserProfile } from './types';
import { userRoleLabels, workflowStatusLabels } from './content/ui-copy';
import { LoginPage } from './components/auth/LoginPage';

type Surface = 'CASES' | 'IMPORT' | 'REPORTS' | 'ADMIN';
type Filter = 'ALL' | Finding['workflowStatus'];

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
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [selectedCase, setSelectedCase] = useState<Finding[] | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [workQueue, setWorkQueue] = useState<MyWorkQueue>({ actionable: [], following: [], accepted: [], watchTargets: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = currentUser?.roles.includes('ADMIN') || false;
  const canImport = currentUser?.roles.some(role => ['ADMIN', 'INTERNAL_OFFICER', 'SUPERVISOR'].includes(role)) || false;

  const refreshScopedData = async () => {
    const [findingsResult, dashboardResult, workResult] = await Promise.all([
      api.getFindings({ channelId, ...(campaignId ? { campaignId } : {}), limit: '100' }),
      api.getDashboardSummary(),
      api.getMyWork(),
    ]);
    setFindings(findingsResult.items);
    setDashboard(dashboardResult);
    setWorkQueue(workResult);
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
      if (me.user.roles.includes('ADMIN')) {
        const [userList, units, allChannels] = await Promise.all([api.getUsers(), api.getOrgUnits(), api.getChannels()]);
        setUsers(userList);
        setOrgUnits(units);
        setChannels(allChannels);
      }
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

  const activeChannel = channels.find(channel => channel.id === channelId);
  const gridMode = activeChannel?.schemaConfig?.formTemplate?.presentationMode === 'EXCEL_GRID';

  /** Same filter/search the case list applies, but kept flat for the tabular capture screen. */
  const visibleFindings = useMemo(() => findings.filter(finding => {
    if (filter !== 'ALL' && finding.workflowStatus !== filter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [finding.cif, finding.customerName, finding.branchName, finding.department, finding.errorCode, finding.errorTitle]
      .some(value => value?.toLowerCase().includes(query));
  }), [findings, filter, search]);

  const customerCases = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of findings) {
      if (filter !== 'ALL' && finding.workflowStatus !== filter) continue;
      const query = search.trim().toLowerCase();
      if (query && ![finding.cif, finding.customerName, finding.branchName, finding.department, finding.errorCode].some(value => value?.toLowerCase().includes(query))) continue;
      const key = `${finding.branchCode}:${finding.cif}`;
      map.set(key, [...(map.get(key) || []), finding]);
    }
    return [...map.values()].sort((a, b) => b.length - a.length || a[0].customerName.localeCompare(b[0].customerName));
  }, [findings, filter, search]);

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
    return <div role="status" className="grid min-h-screen place-items-center bg-[#f4f7f7] text-sm font-bold text-[#006b68]">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!currentUser) return <LoginPage onLogin={login} />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7f7] text-slate-900">
      <header className="sticky top-0 z-40 bg-[#006b68] text-white shadow-lg shadow-teal-950/10">
        <div className="mx-auto flex min-w-0 max-w-[1480px] flex-wrap items-center gap-2 px-3 py-3 sm:px-6 lg:flex-nowrap lg:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-[#006b68]">AB</div>
            <div className="min-w-0"><h1 className="truncate text-sm font-black tracking-wide">AUDIT BGS</h1><p className="hidden text-[10px] text-teal-100 sm:block">Quản lý sai sót và hồ sơ khắc phục</p></div>
          </div>
          <nav className="order-3 flex min-w-0 w-full max-w-full gap-1 overflow-x-auto border-t border-white/10 pt-2 lg:order-none lg:w-auto lg:flex-1 lg:border-t-0 lg:pt-0" aria-label="Điều hướng chính">
            <NavButton active={surface === 'CASES'} onClick={() => navigateTo('CASES')} icon={<LayoutDashboard />} label="Hồ sơ khách hàng" />
            {canImport && <NavButton active={surface === 'IMPORT'} onClick={() => navigateTo('IMPORT')} icon={<FileUp />} label="Nạp dữ liệu" />}
            <NavButton active={surface === 'REPORTS'} onClick={() => navigateTo('REPORTS')} icon={<BarChart3 />} label="Báo cáo" />
            {isAdmin && <NavButton active={surface === 'ADMIN'} onClick={() => navigateTo('ADMIN')} icon={<Settings />} label="Quản trị" />}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden text-right md:block"><div className="text-xs font-bold">{currentUser?.fullName}</div><div className="text-[10px] text-teal-100">{currentUser?.department || currentUser?.branchName || 'Hội sở'}</div></div>
            <div title={`${currentUser.coplusRole ?? ''} · ${userRoleLabels[currentUser.primaryRole]}`} className="hidden max-w-[220px] truncate rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-bold text-white sm:block">{currentUser.coplusRole ? `${currentUser.coplusRole} · ${coplusRoleLabel(currentUser.coplusRole)}` : userRoleLabels[currentUser.primaryRole]}</div>
            <button type="button" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất" className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className={surface === 'CASES' ? 'w-full' : 'mx-auto max-w-[1480px] space-y-5 px-3 py-4 sm:px-6 sm:py-6'}>
        {loading && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-bold text-[#006b68]">Đang tải dữ liệu...</div>}
        {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-800">{loadError}</div>}

        {surface === 'CASES' && selectedCase && currentUser && <FindingDetailPage findings={selectedCase} currentUser={currentUser} initialFindingId={selectedFindingId} workQueue={workQueue} onBack={() => { setSelectedCase(null); setSelectedFindingId(undefined); }} onFindingUpdated={updateFinding} onWorkspaceChanged={async () => setWorkQueue(await api.getMyWork())} />}

        {surface === 'ADMIN' && isAdmin && <AdminPortal orgUnits={orgUnits} users={users} channels={channels} campaigns={campaigns} onOrgUnitCreated={async unit => { const created = await api.createOrgUnit(unit); setOrgUnits(previous => [...previous, created]); }} onUserCreated={async user => { const created = await api.createUser(user); setUsers(previous => [...previous, created.user]); return created; }} onChannelCreated={async channel => { const created = await api.createChannel(channel); setChannels(previous => [...previous, created]); }} onChannelUpdated={async (id, channel) => { const updated = await api.updateChannel(id, channel); setChannels(previous => previous.map(item => item.id === id ? updated : item)); }} onChannelDeleted={async id => { await api.deleteChannel(id); setChannels(previous => previous.filter(item => item.id !== id)); }} onCampaignCreated={async campaign => { const created = await api.createCampaign(campaign); setCampaigns(previous => [...previous, created]); }} onCampaignProvisionDrive={async id => { const updated = await api.provisionCampaignDrive(id); setCampaigns(previous => previous.map(item => item.id === id ? updated : item)); }} onBackToPortal={() => setSurface('CASES')} />}
        {surface === 'IMPORT' && canImport && legacyUser && <FastDataIngestion currentUser={legacyUser} onCommitNewCustomers={refreshScopedData} />}
        {surface === 'REPORTS' && <ReportsWorkspace />}

        {surface === 'CASES' && !selectedCase && <>
          <div className={`grid min-h-[calc(100dvh-116px)] items-start transition-[grid-template-columns] duration-200 lg:min-h-[calc(100dvh-64px)] ${sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[300px_minmax(0,1fr)]'}`}>
            {sidebarOpen && <button type="button" aria-label="Đóng thanh bên" onClick={() => setSidebarOpen(false)} className="fixed inset-x-0 bottom-0 top-[116px] z-20 bg-slate-950/35 lg:hidden" />}
            <div className={`fixed bottom-0 left-0 top-[116px] z-30 w-[min(300px,calc(100vw-32px))] overflow-y-auto transition-transform duration-200 lg:sticky lg:top-[64px] lg:z-10 lg:w-auto lg:translate-x-0 lg:overflow-visible ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <WorkspaceSidebar channels={channels.filter(channel => channel.isActive)} selectedChannelId={channelId} workQueue={workQueue} collapsed={sidebarCollapsed} onToggle={() => { if (window.innerWidth < 1024) setSidebarOpen(false); else setSidebarCollapsed(value => !value); }} onSelectChannel={channel => { setChannelId(channel); setSidebarOpen(false); }} onOpenTarget={openWorkspaceTarget} onTogglePriority={async target => { await api.setWatchPriority(target.id, !target.isPriority); setWorkQueue(await api.getMyWork()); }} />
            </div>
            <div className="min-w-0 space-y-5 px-3 py-4 sm:px-6 sm:py-6">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setSidebarCollapsed(false); setSidebarOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#006b68] shadow-sm lg:hidden"><Menu className="h-4 w-4" />Mở thanh bên</button>
                <select aria-label="Lọc theo chuyên đề" value={campaignId} onChange={event => setCampaignId(event.target.value)} className="min-h-11 max-w-[280px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"><option value="">Tất cả chuyên đề</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.code} · {campaign.name}</option>)}</select>
                {canImport && <button onClick={() => setCreateOpen(true)} className="ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-2.5 text-xs font-bold text-white shadow-sm"><Plus className="h-4 w-4" />Tạo hồ sơ</button>}
              </div>

          {dashboard && <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={<Users />} label="Khách hàng hiển thị" value={customerCases.length} />
            <Kpi icon={<ShieldCheck />} label="Tổng mã lỗi" value={dashboard.totalFindings} />
            <Kpi icon={<Building2 />} label="Chờ kiểm soát" value={dashboard.submittedBranch} />
            <OverdueKpi overdueCount={dashboard.overdueCount} />
            <Kpi icon={<BarChart3 />} label="Đã đóng lỗi" value={dashboard.waivedResolved} />
          </section>}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-200 bg-slate-50 p-3 sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:p-4">
              <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {([['ALL', 'Tất cả'], ['PENDING', 'Chờ chi nhánh'], ['SUBMITTED_BRANCH', 'Chờ kiểm soát'], ['SUBMITTED_INTERNAL', 'Chờ phê duyệt HT'], ['REJECTED', 'Cần bổ sung'], ['WAIVED_RESOLVED', 'Đã đóng']] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold ${filter === key ? 'bg-[#006b68] text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
              </div>
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm CIF, khách hàng, mã lỗi..." className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#006b68] sm:w-72" /></div>
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
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Khách hàng / CIF</th><th className="px-5 py-3">Cụm địa bàn</th><th className="px-5 py-3">Chi nhánh / phòng</th><th className="px-5 py-3">Các mã lỗi</th><th className="px-5 py-3">Tình trạng</th><th className="px-5 py-3"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">{customerCases.map(items => <CustomerRow key={`${items[0].branchCode}:${items[0].cif}`} findings={items} onOpen={() => openCase(items)} />)}</tbody>
              </table>
            </div>

            <div className="space-y-3 bg-slate-50 p-3 md:hidden">
              {customerCases.map(items => {
                const customer = items[0];
                return <button data-testid="customer-card" key={`${customer.branchCode}:${customer.cif}`} onClick={() => openCase(items)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold text-[#006b68]">CIF {customer.cif}</div><h3 className="mt-1 text-sm font-bold text-slate-900">{customer.customerName}</h3></div><ChevronRight className="h-5 w-5 text-slate-400" /></div>
                  <p className="mt-2 text-[11px] text-slate-500">CN {customer.branchCode} · {customer.department || 'Chưa phân phòng'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{items.map(item => <span key={item.id} className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 font-mono text-[10px] font-black text-[#006b68]">{item.errorCode}</span>)}</div>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-600">{items.length} mã lỗi · {new Set(items.map(item => workflowStatusLabels[item.workflowStatus])).size} trạng thái</div>
                </button>;
              })}
            </div>
            {!customerCases.length && <div className="p-10 text-center text-sm text-slate-500">Không có hồ sơ phù hợp bộ lọc.</div>}
            </>}
          </section>
            </div>
          </div>
        </>}
      </main>

      <WebFormFindingModal isOpen={createOpen} channels={channels.filter(channel => channel.isActive)} campaigns={campaigns} initialCampaignId={campaignId} orgUnits={orgUnits} onClose={() => setCreateOpen(false)} onSubmit={async (dto: WebFormFindingDTO) => { await api.createFinding(dto); await refreshScopedData(); setCreateOpen(false); }} />
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactElement; label: string }> = ({ active, onClick, icon, label }) => <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-white text-[#006b68]' : 'text-teal-50 hover:bg-white/10'}`}>{React.cloneElement(icon, { className: 'h-4 w-4' } as React.HTMLAttributes<HTMLElement>)}{label}</button>;
const Kpi: React.FC<{ icon: React.ReactElement; label: string; value: number }> = ({ icon, label, value }) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#006b68]">{React.cloneElement(icon, { className: 'h-4 w-4' } as React.HTMLAttributes<HTMLElement>)}</div><div className="text-xl font-black text-slate-900 sm:text-2xl">{value}</div></div><div className="mt-3 text-[11px] font-bold text-slate-500">{label}</div></div>;
export const OverdueKpi: React.FC<{ overdueCount: number }> = ({ overdueCount }) => <Kpi icon={<BarChart3 />} label="Quá hạn" value={overdueCount} />;

const CustomerRow: React.FC<{ findings: Finding[]; onOpen: () => void }> = ({ findings, onOpen }) => {
  const customer = findings[0];
  return <tr onClick={onOpen} className="cursor-pointer hover:bg-teal-50/40"><td className="px-5 py-4"><div className="font-bold text-slate-900">{customer.customerName}</div><div className="mt-1 font-mono text-[10px] font-bold text-[#006b68]">CIF {customer.cif}</div></td><td className="px-5 py-4 text-slate-600">{customer.clusterName}</td><td className="px-5 py-4"><div className="font-semibold">{customer.branchCode} · {customer.branchName}</div><div className="mt-1 text-[10px] text-slate-500">{customer.department} · {customer.officerName}</div></td><td className="px-5 py-4"><div className="flex max-w-[280px] flex-wrap gap-1">{findings.map(item => <span key={item.id} className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 font-mono text-[10px] font-black text-[#006b68]">{item.errorCode}</span>)}</div></td><td className="px-5 py-4"><div className="space-y-1">{[...new Set(findings.map(item => item.workflowStatus))].map(status => <div key={status} className="text-[10px] font-semibold text-slate-600">{workflowStatusLabels[status]}</div>)}</div></td><td className="px-5 py-4 text-right"><button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-[#006b68]">Mở hồ sơ <ChevronRight className="h-4 w-4" /></button></td></tr>;
};

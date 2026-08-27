import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bookmark, FileBarChart, FileDown, FileSpreadsheet, FileText, Filter, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
  ReportCatalog, ReportDefinition, ReportFieldDefinition, ReportFieldKey, ReportFilterRule,
  ReportMetricDefinition, ReportMetricKey, ReportRunRequest, ReportRunRequestSchema, ReportRunResult, DashboardDefinition, UserRole,
} from '../../../shared/contracts';
import { api } from '../../services/api';

const ReportCrosstab = lazy(async () => {
  const module = await import('./ReportVisualizations');
  return { default: module.ReportCrosstab };
});

const ReportChart = lazy(async () => {
  const module = await import('./ReportVisualizations');
  return { default: module.ReportChart };
});

const CONTROL_CLASS = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#006b68] focus:ring-2 focus:ring-teal-100';
const FALLBACK_QUERY: ReportRunRequest = {
  rules: [], match: 'ALL', groupBy: 'dimension.branch',
  metrics: ['metric.customer_count', 'metric.finding_count', 'metric.exposure_sum'], limit: 25,
};
const SHAREABLE_ROLES: Array<{ key: UserRole; label: string }> = [
  { key: 'SUPERVISOR', label: 'Giám sát' }, { key: 'INTERNAL_APPROVER', label: 'Phê duyệt Hội sở' },
  { key: 'INTERNAL_OFFICER', label: 'Cán bộ Hội sở' }, { key: 'BRANCH_CONTROLLER', label: 'Kiểm soát CN' },
  { key: 'BRANCH_LEADER', label: 'Lãnh đạo CN' }, { key: 'BRANCH_INPUT', label: 'Cán bộ CN' }, { key: 'VIEWER', label: 'Người xem' },
];

export const ReportsWorkspace: React.FC = () => {
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDefinition[]>([]);
  const [draftQuery, setDraftQuery] = useState<ReportRunRequest>(FALLBACK_QUERY);
  const [activeQuery, setActiveQuery] = useState<ReportRunRequest>(FALLBACK_QUERY);
  const [selectedColumns, setSelectedColumns] = useState<ReportFieldKey[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportSharedRoles, setReportSharedRoles] = useState<UserRole[]>([]);
  const [copySourceId, setCopySourceId] = useState<string | undefined>();
  const [selectedDashboardId, setSelectedDashboardId] = useState('');
  const [showDashboardForm, setShowDashboardForm] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardReportIds, setDashboardReportIds] = useState<string[]>([]);
  const [dashboardSharedRoles, setDashboardSharedRoles] = useState<UserRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'html' | 'xlsx' | null>(null);
  const [presentation, setPresentation] = useState<'table' | 'pivot' | 'chart'>('table');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const activeQueryRef = useRef(activeQuery);
  const selectedColumnsRef = useRef(selectedColumns);
  activeQueryRef.current = activeQuery;
  selectedColumnsRef.current = selectedColumns;

  const fieldsByKey = useMemo(() => new Map(catalog?.fields.map(field => [field.key, field]) || []), [catalog]);
  const metricsByKey = useMemo(() => new Map(catalog?.metrics.map(metric => [metric.key, metric]) || []), [catalog]);
  const operatorsByKey = useMemo(() => new Map(catalog?.operators.map(operator => [operator.key, operator]) || []), [catalog]);
  const groupFields = useMemo(() => catalog?.fields.filter(field => field.groupable) || [], [catalog]);
  const activeMetrics = useMemo(() => catalog?.metrics || [], [catalog]);
  const filterFields = useMemo(() => catalog?.fields.filter(field => field.filterable !== false) || [], [catalog]);
  const filterableCatalog = useMemo(() => catalog ? { ...catalog, fields: filterFields } : null, [catalog, filterFields]);
  const selectedDashboard = useMemo(() => dashboards.find(item => item.id === selectedDashboardId), [dashboards, selectedDashboardId]);

  const loadCatalog = async () => {
    try {
      const loaded = await api.getReportCatalog();
      const query = normalizeQueryForCatalog(FALLBACK_QUERY, loaded);
      setCatalog(loaded);
      setDraftQuery(query);
      setActiveQuery(query);
      setSelectedColumns(defaultExportColumns(loaded));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu báo cáo.');
    }
  };

  const loadDefinitions = async () => {
    try { setDefinitions(await api.getReportDefinitions()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải mẫu báo cáo.'); }
  };
  const loadDashboards = async () => {
    try { setDashboards(await api.getDashboardDefinitions()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải dashboard.'); }
  };

  // Report runs are not cancellable server-side, so a slower earlier response must not overwrite a
  // newer one; only the most recently issued run is allowed to publish its result.
  const runSequence = useRef(0);
  const runReport = async (query: ReportRunRequest = activeQuery) => {
    const sequence = runSequence.current + 1;
    runSequence.current = sequence;
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.runReport(query);
      if (sequence !== runSequence.current) return;
      setResult(outcome);
    } catch (reason) {
      if (sequence !== runSequence.current) return;
      setError(reason instanceof Error ? reason.message : 'Không thể tạo báo cáo.');
    } finally {
      if (sequence === runSequence.current) setBusy(false);
    }
  };

  useEffect(() => { void loadCatalog(); void loadDefinitions(); void loadDashboards(); }, []);
  useEffect(() => { if (catalog) void runReport(activeQuery); }, [activeQuery, catalog]);

  const addRule = () => {
    const field = filterFields.find(item => item.key === 'dimension.branch') || filterFields[0];
    if (!field) return;
    setDraftQuery(current => ({ ...current, rules: [...current.rules, { key: field.key, operator: field.operators[0] }] }));
  };
  const replaceRule = (index: number, rule: ReportFilterRule) => setDraftQuery(current => ({ ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? rule : item) }));
  const removeRule = (index: number) => setDraftQuery(current => ({ ...current, rules: current.rules.filter((_, itemIndex) => itemIndex !== index) }));

  const applyFilters = () => {
    setError(null); setNotice(null);
    const parsed = ReportRunRequestSchema.safeParse(draftQuery);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Điều kiện lọc chưa hợp lệ.'); return; }
    setDraftQuery(parsed.data); setActiveQuery(parsed.data);
  };

  const resetFilters = () => {
    if (!catalog) return;
    const query = normalizeQueryForCatalog(FALLBACK_QUERY, catalog);
    setSelectedDefinitionId(''); setDraftQuery(query); setActiveQuery(query);
    setSelectedColumns(defaultExportColumns(catalog)); setNotice(null);
  };

  const selectDefinition = (id: string) => {
    setSelectedDefinitionId(id);
    if (!id || !catalog) { resetFilters(); return; }
    const definition = definitions.find(item => item.id === id);
    if (!definition) return;
    const query = normalizeQueryForCatalog(definition.query || legacyDefinitionToQuery(definition), catalog);
    const allowedColumns = new Set(catalog.fields.filter(field => field.exportable).map(field => field.key));
    const definitionColumns = (definition.exportColumns || []).filter(key => allowedColumns.has(key));
    setDraftQuery(query); setActiveQuery(query);
    setSelectedColumns(definitionColumns.length ? definitionColumns : defaultExportColumns(catalog));
    setNotice(`Đang xem mẫu “${definition.name}”.`);
  };

  const saveDefinition = async () => {
    const parsed = ReportRunRequestSchema.safeParse(draftQuery);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Điều kiện lọc chưa hợp lệ.'); return; }
    if (reportName.trim().length < 3) { setError('Tên mẫu cần ít nhất 3 ký tự.'); return; }
    try {
      setSaving(true); setError(null);
      const definition = await api.createReportDefinition({ name: reportName.trim(), filters: {}, columns: [], query: parsed.data, exportColumns: selectedColumns, visibility: reportSharedRoles.length ? 'ROLE_SHARED' : 'PRIVATE', sharedWithRoles: reportSharedRoles, sourceReportDefinitionId: copySourceId });
      setDefinitions(current => [definition, ...current.filter(item => item.id !== definition.id)]);
      setSelectedDefinitionId(definition.id); setReportName(''); setReportSharedRoles([]); setCopySourceId(undefined); setShowSaveForm(false);
      setNotice(`Đã lưu mẫu “${definition.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu mẫu báo cáo.'); }
    finally { setSaving(false); }
  };

  const prepareCopy = () => {
    const definition = definitions.find(item => item.id === selectedDefinitionId);
    if (!definition) return;
    setReportName(`Bản sao ${definition.name}`); setReportSharedRoles([]); setCopySourceId(definition.id); setShowSaveForm(true);
    setNotice(`Đang tạo bản sao từ “${definition.name}”.`);
  };

  const createDashboard = async () => {
    if (dashboardName.trim().length < 3) { setError('Tên dashboard cần ít nhất 3 ký tự.'); return; }
    if (!dashboardReportIds.length) { setError('Chọn ít nhất một báo cáo cho dashboard.'); return; }
    try {
      setSaving(true); setError(null);
      const dashboard = await api.createDashboardDefinition({ name: dashboardName.trim(), reportDefinitionIds: dashboardReportIds, visibility: dashboardSharedRoles.length ? 'ROLE_SHARED' : 'PRIVATE', sharedWithRoles: dashboardSharedRoles });
      setDashboards(current => [dashboard, ...current.filter(item => item.id !== dashboard.id)]);
      setSelectedDashboardId(dashboard.id); setDashboardName(''); setDashboardReportIds([]); setDashboardSharedRoles([]); setShowDashboardForm(false);
      setNotice(`Đã lưu dashboard “${dashboard.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu dashboard.'); }
    finally { setSaving(false); }
  };

  const exportReport = async (format: 'csv' | 'html' | 'xlsx') => {
    const columns = selectedColumnsRef.current;
    if (!columns.length) { setError('Quản trị viên chưa chọn cột xuất mặc định.'); return; }
    try {
      setExporting(format); setError(null);
      const request = { query: activeQueryRef.current, columns };
      setNotice(`Đang gửi yêu cầu xuất ${format.toUpperCase()}...`);
      if (format === 'html') await api.downloadReportHtml(request);
      else if (format === 'xlsx') await api.downloadReportXlsx(request);
      else await api.downloadReportCsv(request);
      setNotice(`Đã tạo báo cáo ${format.toUpperCase()}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể xuất báo cáo.'); }
    finally { setExporting(null); }
  };

  return <section className="space-y-5" data-testid="reports-workspace">
    <div className="rounded-2xl bg-[#006b68] p-5 text-white sm:flex sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl"><FileBarChart className="h-5 w-5" />Báo cáo</h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
        <button type="button" onClick={() => void runReport()} disabled={!catalog || busy} className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20 disabled:opacity-50" aria-label="Làm mới báo cáo"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
        <button
          type="button"
          disabled={exporting === 'xlsx'}
          onClick={() => { exportReport('xlsx'); }}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#006b68] hover:bg-teal-50 disabled:opacity-60"
        >
          {exporting === 'xlsx' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Xuất Excel
        </button>
        <button type="button" disabled={exporting === 'csv'} onClick={() => { exportReport('csv'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60">{exporting === 'csv' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Xuất CSV</button>
        <button type="button" disabled={exporting === 'html'} onClick={() => { exportReport('html'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60">{exporting === 'html' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Xuất HTML</button>
      </div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-[#006b68]">{notice}</div>}

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,.7fr)_minmax(180px,.7fr)_auto] lg:items-end">
        <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Mẫu báo cáo</span><select aria-label="Mẫu báo cáo" value={selectedDefinitionId} onChange={event => selectDefinition(event.target.value)} className={CONTROL_CLASS}><option value="">Báo cáo tổng hợp</option>{definitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
        <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Xem theo</span><select aria-label="Xem theo" value={draftQuery.groupBy} onChange={event => setDraftQuery(current => ({ ...current, groupBy: event.target.value as ReportFieldKey, pivotBy: current.pivotBy === event.target.value ? undefined : current.pivotBy }))} className={CONTROL_CLASS}>{groupFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Cột bảng chéo</span><select aria-label="Cột bảng chéo" value={draftQuery.pivotBy || ''} onChange={event => setDraftQuery(current => ({ ...current, pivotBy: event.target.value ? event.target.value as ReportFieldKey : undefined }))} className={CONTROL_CLASS}><option value="">Không dùng</option>{groupFields.filter(field => field.key !== draftQuery.groupBy).map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setCopySourceId(undefined); setShowSaveForm(current => !current); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><Bookmark className="h-4 w-4" />Lưu cách xem</button>{selectedDefinitionId && <button type="button" onClick={prepareCopy} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Sao chép</button>}</div>
      </div>

      <fieldset className="mt-3 border-t border-slate-100 pt-3"><legend className="text-xs font-bold text-slate-600">Chỉ số</legend><div className="mt-2 flex flex-wrap gap-2">{activeMetrics.map(metric => <button key={metric.key} type="button" aria-pressed={draftQuery.metrics.includes(metric.key)} onClick={() => setDraftQuery(current => ({ ...current, metrics: current.metrics.includes(metric.key) ? (current.metrics.length > 1 ? current.metrics.filter(key => key !== metric.key) : current.metrics) : [...current.metrics, metric.key] }))} className={`min-h-9 rounded-lg border px-3 text-[11px] font-bold ${draftQuery.metrics.includes(metric.key) ? 'border-[#006b68] bg-teal-50 text-[#006b68]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{metric.label}</button>)}</div></fieldset>

      {showSaveForm && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="report-name">Tên mẫu báo cáo</label><input id="report-name" value={reportName} onChange={event => setReportName(event.target.value)} className={`${CONTROL_CLASS} flex-1`} placeholder="Tên mẫu, ví dụ: Tồn đọng Chi nhánh 635" /><button type="button" disabled={saving} onClick={() => void saveDefinition()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#005a57] disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Đang lưu' : 'Lưu mẫu'}</button></div><RoleSharePicker selectedRoles={reportSharedRoles} onChange={setReportSharedRoles} /></div>}

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end"><label className="flex-1 space-y-1.5 text-xs font-bold text-slate-600"><span>Dashboard</span><select aria-label="Dashboard" value={selectedDashboardId} onChange={event => setSelectedDashboardId(event.target.value)} className={CONTROL_CLASS}><option value="">Chưa chọn</option>{dashboards.map(dashboard => <option key={dashboard.id} value={dashboard.id}>{dashboard.name}</option>)}</select></label><button type="button" onClick={() => setShowDashboardForm(current => !current)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Tạo dashboard</button></div>
      {showDashboardForm && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="dashboard-name">Tên dashboard</label><input id="dashboard-name" value={dashboardName} onChange={event => setDashboardName(event.target.value)} className={`${CONTROL_CLASS} flex-1`} placeholder="Tên dashboard" /><button type="button" disabled={saving} onClick={() => void createDashboard()} className="min-h-11 rounded-xl bg-[#006b68] px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Đang lưu' : 'Lưu dashboard'}</button></div><fieldset><legend className="text-xs font-bold text-slate-600">Báo cáo hiển thị</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{definitions.map(definition => <label key={definition.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={dashboardReportIds.includes(definition.id)} onChange={() => setDashboardReportIds(current => current.includes(definition.id) ? current.filter(id => id !== definition.id) : [...current, definition.id])} />{definition.name}</label>)}</div></fieldset><RoleSharePicker selectedRoles={dashboardSharedRoles} onChange={setDashboardSharedRoles} /></div>}

      <div className="my-4 border-t border-slate-100" />
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Filter className="h-4 w-4 text-[#006b68]" />Lọc dữ liệu <span className="font-medium text-slate-400">{draftQuery.rules.length}</span></div><button type="button" onClick={addRule} disabled={!filterFields.length} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#006b68] px-3 py-2 text-xs font-bold text-[#006b68] hover:bg-teal-50 disabled:opacity-50"><Plus className="h-4 w-4" />Thêm điều kiện</button></div>

      {draftQuery.rules.length === 0 ? <button type="button" onClick={addRule} disabled={!filterFields.length} className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-left text-xs text-slate-500 hover:border-teal-300 hover:bg-teal-50/50 disabled:opacity-50"><span>Chọn trường lọc: chi nhánh, cán bộ QLKH, trạng thái...</span><span className="shrink-0 font-bold text-[#006b68]">Thêm lọc</span></button> : <div className="mt-3 space-y-3">
        {draftQuery.rules.length > 1 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span>Điều kiện:</span><select aria-label="Cách ghép điều kiện" value={draftQuery.match} onChange={event => setDraftQuery(current => ({ ...current, match: event.target.value as ReportRunRequest['match'] }))} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"><option value="ALL">Đồng thời thỏa tất cả</option><option value="ANY">Thỏa ít nhất một điều kiện</option></select></label>}
        {draftQuery.rules.map((rule, index) => <FilterRuleEditor key={`${index}-${rule.key}`} index={index} rule={rule} field={fieldsByKey.get(rule.key)} catalog={filterableCatalog} onChange={next => replaceRule(index, next)} onRemove={() => removeRule(index)} />)}
      </div>}

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-[11px] text-slate-500">{draftQuery.rules.length === 0 ? 'Không áp dụng bộ lọc' : `${draftQuery.rules.length} điều kiện đang chọn`}</span><div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" onClick={resetFilters} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Xóa lọc</button><button type="button" onClick={applyFilters} className="min-h-10 rounded-xl bg-[#006b68] px-4 py-2 text-xs font-bold text-white hover:bg-[#005a57]">Xem báo cáo</button></div></div>
    </div>

    {activeQuery.rules.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Bộ lọc đang áp dụng">{activeQuery.rules.map((rule, index) => <span key={`${rule.key}-${index}`} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-[#006b68]">{describeRule(rule, fieldsByKey.get(rule.key), operatorsByKey.get(rule.operator)?.label)}</span>)}</div>}
    {selectedDashboard && <ReportDashboard dashboard={selectedDashboard} definitions={definitions} metricsByKey={metricsByKey} />}
    {result && <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Kết quả truy vấn</h3>
        <span className="rounded-full bg-[#006b68] px-2.5 py-1 text-[11px] font-bold text-white">{result.matchedFindingCount.toLocaleString('vi-VN')} dòng</span>
      </div>
      {/* CoPlus warns when the on-screen result is a truncated preview of the exportable data. */}
      {result.groups.length >= activeQuery.limit && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
        Màn hình chỉ hiển thị {activeQuery.limit} nhóm đầu tiên. Bấm “Xuất Excel” để tải toàn bộ dữ liệu chi tiết.
      </p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{activeQuery.metrics.map(metricKey => <MetricCard key={metricKey} metric={metricsByKey.get(metricKey)} value={result.metricValues[metricKey] || 0} />)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2"><div className="flex gap-1" role="tablist" aria-label="Kiểu hiển thị báo cáo"><button type="button" role="tab" aria-selected={presentation === 'table'} onClick={() => setPresentation('table')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${presentation === 'table' ? 'bg-[#006b68] text-white' : 'text-slate-600'}`}>Bảng</button><button type="button" role="tab" aria-selected={presentation === 'pivot'} disabled={!result.pivot} onClick={() => setPresentation('pivot')} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-40 ${presentation === 'pivot' ? 'bg-[#006b68] text-white' : 'text-slate-600'}`}>Bảng chéo</button><button type="button" role="tab" aria-selected={presentation === 'chart'} onClick={() => setPresentation('chart')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${presentation === 'chart' ? 'bg-[#006b68] text-white' : 'text-slate-600'}`}>Biểu đồ</button></div>{presentation === 'chart' && <label className="flex items-center gap-2 px-2 text-xs font-bold text-slate-600"><span>Loại biểu đồ</span><select aria-label="Loại biểu đồ" value={chartType} onChange={event => setChartType(event.target.value as 'bar' | 'line' | 'pie')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="bar">Cột</option><option value="line">Đường</option><option value="pie">Tròn</option></select></label>}</div>
      {presentation === 'pivot' && result.pivot ? <Suspense fallback={<ReportPresentationLoading />}><ReportCrosstab pivot={result.pivot} metric={metricsByKey.get(result.pivot.metric)} /></Suspense> : presentation === 'chart' ? <Suspense fallback={<ReportPresentationLoading />}><ReportChart result={result} metricKey={activeQuery.metrics[0]} metric={metricsByKey.get(activeQuery.metrics[0])} type={chartType} /></Suspense> : <ReportBreakdown result={result} metrics={activeQuery.metrics} metricsByKey={metricsByKey} groupLabel={fieldsByKey.get(activeQuery.groupBy)?.label || 'Nhóm'} />}
    </>}
  </section>;
};

const ReportPresentationLoading = () => <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-medium text-slate-500">Đang tải phần trình bày báo cáo…</div>;

const RoleSharePicker: React.FC<{ selectedRoles: UserRole[]; onChange: (roles: UserRole[]) => void }> = ({ selectedRoles, onChange }) => <fieldset>
  <legend className="text-xs font-bold text-slate-600">Chia sẻ theo vai trò</legend>
  <div className="mt-2 flex flex-wrap gap-2">{SHAREABLE_ROLES.map(role => <label key={role.key} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={selectedRoles.includes(role.key)} onChange={() => onChange(selectedRoles.includes(role.key) ? selectedRoles.filter(key => key !== role.key) : [...selectedRoles, role.key])} />{role.label}</label>)}</div>
</fieldset>;

const ReportDashboard: React.FC<{ dashboard: DashboardDefinition; definitions: ReportDefinition[]; metricsByKey: Map<ReportMetricKey, ReportMetricDefinition> }> = ({ dashboard, definitions, metricsByKey }) => {
  const widgets = useMemo(() => dashboard.reportDefinitionIds.map(id => definitions.find(definition => definition.id === id)).filter((definition): definition is ReportDefinition => Boolean(definition?.query)), [dashboard, definitions]);
  const [results, setResults] = useState<Record<string, ReportRunResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all(widgets.map(async definition => [definition.id, await api.runReport(definition.query!)] as const))
      .then(entries => { if (active) setResults(Object.fromEntries(entries)); })
      .catch(() => { if (active) setResults({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [widgets]);

  return <section data-testid="report-dashboard" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{dashboard.name}</h3><span className="text-[11px] font-semibold text-slate-500">{widgets.length} báo cáo</span></div>
    {loading ? <p className="text-sm text-slate-500">Đang cập nhật dashboard…</p> : <div className="grid gap-3 lg:grid-cols-2">{widgets.map(definition => {
      const outcome = results[definition.id]; const metricKey = definition.query?.metrics[0]; const value = metricKey && outcome ? outcome.metricValues[metricKey] || 0 : 0;
      return <article key={definition.id} className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="text-sm font-bold text-slate-900">{definition.name}</h4><p className="mt-3 text-2xl font-black text-[#006b68]">{typeof value === 'number' ? value.toLocaleString('vi-VN') : '—'}</p><p className="mt-1 text-xs font-medium text-slate-500">{metricKey ? metricsByKey.get(metricKey)?.label || 'Chỉ số' : 'Chưa có chỉ số'}</p></article>;
    })}</div>}
  </section>;
};

const FilterRuleEditor: React.FC<{ index: number; rule: ReportFilterRule; field?: ReportFieldDefinition; catalog: ReportCatalog | null; onChange: (rule: ReportFilterRule) => void; onRemove: () => void }> = ({ index, rule, field, catalog, onChange, onRemove }) => {
  const changeField = (key: ReportFieldKey) => { const nextField = catalog?.fields.find(item => item.key === key); onChange({ key, operator: nextField?.operators[0] || 'op.eq' }); };
  const changeOperator = (operator: ReportFilterRule['operator']) => onChange({ key: rule.key, operator });
  return <div data-testid="report-filter-rule" className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.8fr)_minmax(0,1.2fr)_44px] lg:items-end">
    <label className="space-y-1 text-[11px] font-bold text-slate-600"><span>Nội dung cần lọc</span><select aria-label={`Nội dung lọc ${index + 1}`} value={rule.key} onChange={event => changeField(event.target.value as ReportFieldKey)} className={CONTROL_CLASS}>{catalog?.fields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <label className="space-y-1 text-[11px] font-bold text-slate-600"><span>Điều kiện</span><select aria-label={`Điều kiện lọc ${index + 1}`} value={rule.operator} onChange={event => changeOperator(event.target.value as ReportFilterRule['operator'])} className={CONTROL_CLASS}>{field?.operators.map(key => <option key={key} value={key}>{catalog?.operators.find(item => item.key === key)?.label || key}</option>)}</select></label>
    <div className="space-y-1 text-[11px] font-bold text-slate-600"><span>Giá trị</span><RuleValueEditor rule={rule} field={field} onChange={onChange} /></div>
    <button type="button" onClick={onRemove} className="flex h-11 w-full items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50" aria-label={`Xóa điều kiện ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
  </div></div>;
};

const RuleValueEditor: React.FC<{ rule: ReportFilterRule; field?: ReportFieldDefinition; onChange: (rule: ReportFilterRule) => void }> = ({ rule, field, onChange }) => {
  if (rule.operator === 'op.is_true' || rule.operator === 'op.is_false') return <div className={`${CONTROL_CLASS} flex items-center text-xs text-slate-500`}>Không cần nhập giá trị</div>;
  const inputType = field?.valueType === 'NUMBER' ? 'number' : field?.valueType === 'DATE' ? 'date' : 'text';
  const coerce = (value: string): string | number | undefined => value === '' ? undefined : field?.valueType === 'NUMBER' ? Number(value) : value;
  if (rule.operator === 'op.between') return <div className="grid grid-cols-2 gap-2"><input aria-label="Giá trị từ" type={inputType} value={String(rule.from ?? '')} onChange={event => onChange({ ...rule, from: coerce(event.target.value) as string | number | undefined })} className={CONTROL_CLASS} placeholder="Từ" /><input aria-label="Giá trị đến" type={inputType} value={String(rule.to ?? '')} onChange={event => onChange({ ...rule, to: coerce(event.target.value) as string | number | undefined })} className={CONTROL_CLASS} placeholder="Đến" /></div>;
  if (rule.operator === 'op.in') return <input aria-label="Danh sách giá trị" value={(rule.values || []).join(', ')} onChange={event => onChange({ ...rule, values: event.target.value.split(',').map(value => value.trim()).filter(Boolean).map(value => field?.valueType === 'NUMBER' ? Number(value) : value) })} className={CONTROL_CLASS} placeholder="Các giá trị, cách nhau bằng dấu phẩy" />;
  if (field?.valueType === 'ENUM' && field.options?.length) return <select aria-label="Giá trị lọc" value={String(rule.value ?? '')} onChange={event => onChange({ ...rule, value: event.target.value || undefined })} className={CONTROL_CLASS}><option value="">Chọn giá trị</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  return <input aria-label="Giá trị lọc" type={inputType} value={String(rule.value ?? '')} onChange={event => onChange({ ...rule, value: coerce(event.target.value) })} className={CONTROL_CLASS} placeholder="Nhập giá trị" />;
};

const MetricCard: React.FC<{ metric?: ReportMetricDefinition; value: number }> = ({ metric, value }) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#006b68]"><BarChart3 className="h-4 w-4" /></div><div className="text-xs font-bold text-slate-500">{metric?.label || 'Chỉ số'}</div><div className="mt-1 text-2xl font-black text-slate-900">{formatMetric(value, metric)}</div></div>;

const ReportBreakdown: React.FC<{ result: ReportRunResult; metrics: ReportMetricKey[]; metricsByKey: Map<ReportMetricKey, ReportMetricDefinition>; groupLabel: string }> = ({ result, metrics, metricsByKey, groupLabel }) => <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">Kết quả theo {groupLabel}</h3><span className="text-[10px] font-bold text-slate-500">{result.matchedFindingCount} mã lỗi phù hợp</span></div>
  <div className="divide-y divide-slate-100 md:hidden">{result.groups.map(row => <div key={row.key} className="p-4"><div className="mb-3 text-xs font-bold text-slate-900">{row.label}</div><div className="grid grid-cols-2 gap-2">{metrics.map(key => <div key={key} className="rounded-lg bg-slate-50 p-2"><div className="text-[9px] font-bold uppercase text-slate-500">{metricsByKey.get(key)?.label}</div><div className="mt-1 text-xs font-black text-[#006b68]">{formatMetric(row.metricValues[key] || 0, metricsByKey.get(key))}</div></div>)}</div></div>)}</div>
  <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{groupLabel}</th>{metrics.map(key => <th key={key} className="px-4 py-3 text-right">{metricsByKey.get(key)?.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.groups.map(row => <tr key={row.key}><td className="px-4 py-3 font-semibold text-slate-800">{row.label}</td>{metrics.map(key => <td key={key} className="px-4 py-3 text-right font-bold text-[#006b68]">{formatMetric(row.metricValues[key] || 0, metricsByKey.get(key))}</td>)}</tr>)}</tbody></table></div>
  {result.groups.length === 0 && <p className="p-5 text-xs text-slate-500">Không có dữ liệu phù hợp với bộ lọc.</p>}
</div>;

const formatMetric = (value: number, metric?: ReportMetricDefinition): string => metric?.unit === 'PERCENT' ? `${value.toLocaleString('vi-VN')}%` : metric?.unit === 'MILLION_VND' ? `${value.toLocaleString('vi-VN')} triệu` : value.toLocaleString('vi-VN');
const describeRule = (rule: ReportFilterRule, field?: ReportFieldDefinition, operatorLabel?: string): string => {
  const value = rule.operator === 'op.between' ? `${String(rule.from ?? '...')} đến ${String(rule.to ?? '...')}` : rule.operator === 'op.in' ? (rule.values || []).join(', ') : rule.operator === 'op.is_true' || rule.operator === 'op.is_false' ? '' : String(rule.value ?? '');
  return `${field?.label || 'Nội dung'} ${operatorLabel || 'phù hợp'}${value ? ` ${value}` : ''}`;
};
const defaultExportColumns = (catalog: ReportCatalog): ReportFieldKey[] => {
  const configured = catalog.fields.filter(field => field.exportable && field.defaultExport).map(field => field.key);
  return configured.length ? configured : catalog.fields.filter(field => field.exportable).slice(0, 10).map(field => field.key);
};
const normalizeQueryForCatalog = (query: ReportRunRequest, catalog: ReportCatalog): ReportRunRequest => {
  const fields = new Map(catalog.fields.map(field => [field.key, field]));
  const allowedMetrics = new Set(catalog.metrics.map(metric => metric.key));
  const metrics = query.metrics.filter(key => allowedMetrics.has(key));
  const fallbackGroup = catalog.fields.find(field => field.key === 'dimension.branch' && field.groupable) || catalog.fields.find(field => field.groupable);
  const requestedGroup = fields.get(query.groupBy);
  const groupBy = requestedGroup?.groupable ? requestedGroup.key : fallbackGroup?.key || 'dimension.branch';
  const nextMetrics = metrics.length ? metrics : catalog.metrics.map(metric => metric.key);
  const requestedPivot = query.pivotBy && fields.get(query.pivotBy)?.groupable && query.pivotBy !== groupBy ? query.pivotBy : undefined;
  return { ...query, rules: query.rules.filter(rule => fields.get(rule.key)?.filterable !== false), groupBy, pivotBy: requestedPivot, metrics: nextMetrics, sort: query.sort && nextMetrics.includes(query.sort.key) ? query.sort : undefined };
};
const legacyDefinitionToQuery = (definition: ReportDefinition): ReportRunRequest => {
  const rules: ReportFilterRule[] = []; const filters = definition.filters || {};
  if (filters.branchCode) rules.push({ key: 'dimension.branch', operator: 'op.eq', value: filters.branchCode });
  if (filters.department) rules.push({ key: 'dimension.department', operator: 'op.eq', value: filters.department });
  if (filters.workflowStatus) rules.push({ key: 'dimension.workflow_status', operator: 'op.eq', value: filters.workflowStatus });
  if (filters.errorCode) rules.push({ key: 'dimension.error_code', operator: 'op.eq', value: filters.errorCode });
  if (filters.dateFrom || filters.dateTo) rules.push({ key: 'date.audit', operator: 'op.between', from: filters.dateFrom || '1900-01-01', to: filters.dateTo || '2999-12-31' });
  return { ...FALLBACK_QUERY, rules };
};

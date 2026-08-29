import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bookmark, Columns3, FileBarChart, FileDown, FileSpreadsheet, FileText, Filter, Plus, RefreshCw, Rows3, Save, Search, Sigma, Sparkles, Trash2, X } from 'lucide-react';
import {
  ReportCatalog, ReportDefinition, ReportDrillResult, ReportFieldDefinition, ReportFieldKey, ReportFilterRule,
  ReportMetricDefinition, ReportMetricKey, ReportPreset, ReportRunRequest, ReportRunRequestSchema, ReportRunResult,
  DashboardDefinition, REPORT_PRESETS, UserRole,
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

const CONTROL_CLASS = 'min-h-11 w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-teal-100';
const ZONE_SELECT_CLASS = 'min-h-9 w-full rounded-lg border border-rule bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-brand-500';
/** The builder re-runs itself; this is the quiet window after the last edit before it does. */
const AUTO_RUN_DELAY_MS = 450;
const DRILL_PAGE_SIZE = 25;
const FALLBACK_QUERY: ReportRunRequest = {
  rules: [], match: 'ALL', groupBy: 'dimension.branch',
  metrics: ['metric.customer_count', 'metric.finding_count', 'metric.exposure_sum'], limit: 25,
};
const SHAREABLE_ROLES: Array<{ key: UserRole; label: string }> = [
  { key: 'SUPERVISOR', label: 'Giám sát' }, { key: 'INTERNAL_APPROVER', label: 'Phê duyệt Hội sở' },
  { key: 'INTERNAL_OFFICER', label: 'Cán bộ Hội sở' }, { key: 'BRANCH_CONTROLLER', label: 'Kiểm soát CN' },
  { key: 'BRANCH_LEADER', label: 'Lãnh đạo CN' }, { key: 'BRANCH_INPUT', label: 'Cán bộ CN' }, { key: 'VIEWER', label: 'Người xem' },
];

type Presentation = 'table' | 'pivot' | 'chart';
type ChartType = 'bar' | 'line' | 'pie';
type ZoneName = 'rows' | 'columns' | 'values' | 'filters';
type DragPayload = { kind: 'field'; key: ReportFieldKey } | { kind: 'metric'; key: ReportMetricKey };
type DrillTarget = { rowKey?: string; columnKey?: string; page: number };

export const ReportsWorkspace: React.FC = () => {
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDefinition[]>([]);
  // One query drives the whole screen: every control writes here and the run is issued automatically,
  // so there is no hidden "edited but not applied" state for the user to reason about.
  const [query, setQuery] = useState<ReportRunRequest>(FALLBACK_QUERY);
  const [selectedColumns, setSelectedColumns] = useState<ReportFieldKey[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [openRuleIndex, setOpenRuleIndex] = useState<number | null>(null);
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
  const [invalidQueryHint, setInvalidQueryHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'html' | 'xlsx' | null>(null);
  const [presentation, setPresentation] = useState<Presentation>('table');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [dataSearch, setDataSearch] = useState('');
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);
  const [drillResult, setDrillResult] = useState<ReportDrillResult | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const queryRef = useRef(query);
  const selectedColumnsRef = useRef(selectedColumns);
  queryRef.current = query;
  selectedColumnsRef.current = selectedColumns;

  const fieldsByKey = useMemo(() => new Map(catalog?.fields.map(field => [field.key, field]) || []), [catalog]);
  const metricsByKey = useMemo(() => new Map(catalog?.metrics.map(metric => [metric.key, metric]) || []), [catalog]);
  const operatorsByKey = useMemo(() => new Map(catalog?.operators.map(operator => [operator.key, operator]) || []), [catalog]);
  const groupFields = useMemo(() => catalog?.fields.filter(field => field.groupable) || [], [catalog]);
  const activeMetrics = useMemo(() => catalog?.metrics || [], [catalog]);
  const filterFields = useMemo(() => catalog?.fields.filter(field => field.filterable !== false) || [], [catalog]);
  const exportableFields = useMemo(() => catalog?.fields.filter(field => field.exportable) || [], [catalog]);
  const filterableCatalog = useMemo(() => catalog ? { ...catalog, fields: filterFields } : null, [catalog, filterFields]);
  const availablePresets = useMemo(() => catalog ? REPORT_PRESETS.filter(item => presetIsUsable(item, catalog)) : [], [catalog]);
  const normalizedDataSearch = dataSearch.trim().toLocaleLowerCase('vi-VN');
  const visibleGroupFields = useMemo(() => groupFields.filter(field => !normalizedDataSearch || `${field.label} ${field.key}`.toLocaleLowerCase('vi-VN').includes(normalizedDataSearch)), [groupFields, normalizedDataSearch]);
  const visibleMetrics = useMemo(() => activeMetrics.filter(metric => !normalizedDataSearch || `${metric.label} ${metric.key}`.toLocaleLowerCase('vi-VN').includes(normalizedDataSearch)), [activeMetrics, normalizedDataSearch]);
  const selectedDashboard = useMemo(() => dashboards.find(item => item.id === selectedDashboardId), [dashboards, selectedDashboardId]);

  const loadCatalog = async () => {
    try {
      const loaded = await api.getReportCatalog();
      setCatalog(loaded);
      setQuery(normalizeQueryForCatalog(FALLBACK_QUERY, loaded));
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
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải bảng điều khiển.'); }
  };

  // Report runs are not cancellable server-side, so a slower earlier response must not overwrite a
  // newer one; only the most recently issued run is allowed to publish its result.
  const runSequence = useRef(0);
  const runReport = async (candidate: ReportRunRequest = queryRef.current) => {
    const sequence = runSequence.current + 1;
    runSequence.current = sequence;
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.runReport(candidate);
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

  // Auto-run replaces the old "edit here, then press apply down there" gap. A half-typed filter parks
  // the run behind a hint instead of firing an invalid request.
  useEffect(() => {
    if (!catalog) return;
    const parsed = ReportRunRequestSchema.safeParse(query);
    if (!parsed.success) { setInvalidQueryHint(parsed.error.issues[0]?.message || 'Điều kiện lọc chưa hợp lệ.'); return; }
    setInvalidQueryHint(null);
    const timer = setTimeout(() => { void runReport(parsed.data); }, AUTO_RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, catalog]);

  // A crosstab needs a column field; dropping that field must not strand the user on an empty tab.
  useEffect(() => { if (presentation === 'pivot' && !query.pivotBy) setPresentation('table'); }, [presentation, query.pivotBy]);

  useEffect(() => {
    if (!drillTarget) { setDrillResult(null); return; }
    const parsed = ReportRunRequestSchema.safeParse(queryRef.current);
    if (!parsed.success) return;
    let active = true;
    setDrillLoading(true);
    void api.drillReport({ query: parsed.data, rowKey: drillTarget.rowKey, columnKey: drillTarget.columnKey, page: drillTarget.page, pageSize: DRILL_PAGE_SIZE })
      .then(outcome => { if (active) setDrillResult(outcome); })
      .catch(reason => { if (active) { setDrillResult(null); setError(reason instanceof Error ? reason.message : 'Không thể xem chi tiết hồ sơ.'); } })
      .finally(() => { if (active) setDrillLoading(false); });
    return () => { active = false; };
  }, [drillTarget]);

  useEffect(() => {
    if (!drillTarget) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrillTarget(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drillTarget]);

  const setGroupBy = (key: ReportFieldKey) => setQuery(current => ({ ...current, groupBy: key, pivotBy: current.pivotBy === key ? undefined : current.pivotBy }));
  const setPivotBy = (key?: ReportFieldKey) => setQuery(current => ({ ...current, pivotBy: key && key !== current.groupBy ? key : undefined }));
  const addMetric = (key: ReportMetricKey) => setQuery(current => current.metrics.includes(key) ? current : ({ ...current, metrics: [...current.metrics, key] }));
  const removeMetric = (key: ReportMetricKey) => setQuery(current => current.metrics.length > 1
    ? { ...current, metrics: current.metrics.filter(item => item !== key), sort: current.sort?.key === key ? undefined : current.sort }
    : current);

  const addRule = (key?: ReportFieldKey) => {
    const field = filterFields.find(item => item.key === key) || filterFields.find(item => item.key === 'dimension.branch') || filterFields[0];
    if (!field) return;
    setOpenRuleIndex(queryRef.current.rules.length);
    setQuery(current => ({ ...current, rules: [...current.rules, { key: field.key, operator: field.operators[0] }] }));
  };
  const replaceRule = (index: number, rule: ReportFilterRule) => setQuery(current => ({ ...current, rules: current.rules.map((item, itemIndex) => itemIndex === index ? rule : item) }));
  const removeRule = (index: number) => {
    setOpenRuleIndex(null);
    setQuery(current => ({ ...current, rules: current.rules.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const toggleSort = (key: ReportMetricKey) => setQuery(current => ({
    ...current,
    sort: current.sort?.key === key && current.sort.direction === 'desc' ? { key, direction: 'asc' } : { key, direction: 'desc' },
  }));

  /** The zone a field lands in decides what it means; the catalogue on the left never holds state. */
  const dropInto = (zone: ZoneName, payload: DragPayload) => {
    if (payload.kind === 'metric') { if (zone === 'values') addMetric(payload.key); return; }
    if (zone === 'rows') setGroupBy(payload.key);
    else if (zone === 'columns') setPivotBy(payload.key);
    else if (zone === 'filters') addRule(payload.key);
  };

  /**
   * The no-drag path. A click always means "xem theo trường này" so the outcome is predictable;
   * a field already used as a row or column becomes a filter instead of silently doing nothing.
   */
  const quickAddField = (key: ReportFieldKey) => {
    if (query.groupBy === key || query.pivotBy === key) { addRule(key); return; }
    setGroupBy(key);
  };

  const resetBuilder = () => {
    if (!catalog) return;
    setSelectedTemplateId('');
    setQuery(normalizeQueryForCatalog(FALLBACK_QUERY, catalog));
    setSelectedColumns(defaultExportColumns(catalog));
    setPresentation('table');
    setOpenRuleIndex(null);
    setNotice(null);
  };

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setOpenRuleIndex(null);
    if (!id || !catalog) { resetBuilder(); return; }
    const preset = REPORT_PRESETS.find(item => item.id === id);
    if (preset) {
      setQuery(normalizeQueryForCatalog(preset.query, catalog));
      setSelectedColumns(defaultExportColumns(catalog));
      setPresentation(preset.presentation);
      if (preset.chartType) setChartType(preset.chartType);
      setNotice(`Đang xem mẫu dựng sẵn “${preset.name}”.`);
      return;
    }
    const definition = definitions.find(item => item.id === id);
    if (!definition) return;
    const allowedColumns = new Set(catalog.fields.filter(field => field.exportable).map(field => field.key));
    const definitionColumns = (definition.exportColumns || []).filter(key => allowedColumns.has(key));
    setQuery(normalizeQueryForCatalog(definition.query || legacyDefinitionToQuery(definition), catalog));
    setSelectedColumns(definitionColumns.length ? definitionColumns : defaultExportColumns(catalog));
    setNotice(`Đang xem mẫu “${definition.name}”.`);
  };

  const saveDefinition = async () => {
    const parsed = ReportRunRequestSchema.safeParse(query);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Điều kiện lọc chưa hợp lệ.'); return; }
    if (reportName.trim().length < 3) { setError('Tên mẫu cần ít nhất 3 ký tự.'); return; }
    if (!selectedColumns.length) { setError('Chọn ít nhất một cột trong “Cột xuất” trước khi lưu mẫu.'); return; }
    try {
      setSaving(true); setError(null);
      const definition = await api.createReportDefinition({ name: reportName.trim(), filters: {}, columns: [], query: parsed.data, exportColumns: selectedColumns, visibility: reportSharedRoles.length ? 'ROLE_SHARED' : 'PRIVATE', sharedWithRoles: reportSharedRoles, sourceReportDefinitionId: copySourceId });
      setDefinitions(current => [definition, ...current.filter(item => item.id !== definition.id)]);
      setSelectedTemplateId(definition.id); setReportName(''); setReportSharedRoles([]); setCopySourceId(undefined); setShowSaveForm(false);
      setNotice(`Đã lưu mẫu “${definition.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu mẫu báo cáo.'); }
    finally { setSaving(false); }
  };

  const prepareCopy = () => {
    const preset = REPORT_PRESETS.find(item => item.id === selectedTemplateId);
    const definition = definitions.find(item => item.id === selectedTemplateId);
    const sourceName = preset?.name || definition?.name;
    if (!sourceName) return;
    setReportName(`Bản sao ${sourceName}`); setReportSharedRoles([]); setCopySourceId(definition?.id); setShowSaveForm(true);
    setNotice(`Đang tạo bản sao từ “${sourceName}”.`);
  };

  const createDashboard = async () => {
    if (dashboardName.trim().length < 3) { setError('Tên bảng điều khiển cần ít nhất 3 ký tự.'); return; }
    if (!dashboardReportIds.length) { setError('Chọn ít nhất một báo cáo cho bảng điều khiển.'); return; }
    try {
      setSaving(true); setError(null);
      const dashboard = await api.createDashboardDefinition({ name: dashboardName.trim(), reportDefinitionIds: dashboardReportIds, visibility: dashboardSharedRoles.length ? 'ROLE_SHARED' : 'PRIVATE', sharedWithRoles: dashboardSharedRoles });
      setDashboards(current => [dashboard, ...current.filter(item => item.id !== dashboard.id)]);
      setSelectedDashboardId(dashboard.id); setDashboardName(''); setDashboardReportIds([]); setDashboardSharedRoles([]); setShowDashboardForm(false);
      setNotice(`Đã lưu bảng điều khiển “${dashboard.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu bảng điều khiển.'); }
    finally { setSaving(false); }
  };

  const exportReport = async (format: 'csv' | 'html' | 'xlsx') => {
    const columns = selectedColumnsRef.current;
    if (!columns.length) { setError('Chọn ít nhất một cột trong “Cột xuất” trước khi tải báo cáo.'); return; }
    try {
      setExporting(format); setError(null);
      const request = { query: queryRef.current, columns };
      setNotice(`Đang gửi yêu cầu xuất ${format.toUpperCase()}...`);
      if (format === 'html') await api.downloadReportHtml(request);
      else if (format === 'xlsx') await api.downloadReportXlsx(request);
      else await api.downloadReportCsv(request);
      setNotice(`Đã tạo báo cáo ${format.toUpperCase()}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể xuất báo cáo.'); }
    finally { setExporting(null); }
  };

  const groupLabel = fieldsByKey.get(query.groupBy)?.label || 'Nhóm';

  return <section className="space-y-5" data-testid="reports-workspace">
    {/* Page header on the canvas rather than a coloured slab: the three export buttons carried
        equal weight before, so nothing said which one people actually reach for. */}
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900"><FileBarChart className="h-5 w-5 text-brand-500" />Báo cáo</h2>
        <p className="mt-0.5 text-xs text-slate-500">Chọn mẫu, đổi chiều xem, rồi xuất khi cần.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void runReport()} disabled={!catalog || busy} className="grid h-10 w-10 place-items-center rounded-xl border border-rule bg-white text-slate-500 shadow-panel transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-50" aria-label="Làm mới báo cáo"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
        <button
          type="button"
          disabled={exporting === 'xlsx'}
          onClick={() => { exportReport('xlsx'); }}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-bold text-white shadow-raised transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {exporting === 'xlsx' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Xuất Excel
        </button>
        <button type="button" disabled={exporting === 'csv'} onClick={() => { exportReport('csv'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rule bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-panel transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-60">{exporting === 'csv' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Xuất CSV</button>
        <button type="button" disabled={exporting === 'html'} onClick={() => { exportReport('html'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rule bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-panel transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-60">{exporting === 'html' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Xuất HTML</button>
      </div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-semibold text-brand-600">{notice}</div>}

    <div data-testid="cognos-authoring-workspace" className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside data-testid="report-data-panel" className="border-b border-rule bg-slate-50 lg:border-b-0 lg:border-r">
        <details className="group" open>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-slate-800 lg:cursor-default"><span>Danh mục dữ liệu</span><span className="text-[10px] font-medium text-slate-400 lg:hidden">Mở/đóng</span></summary>
          <div className="border-t border-rule p-3">
            <p className="mb-3 rounded-lg bg-white px-2.5 py-2 text-[10px] font-medium leading-relaxed text-slate-500">Kéo một mục sang vùng Hàng, Cột, Giá trị hoặc Bộ lọc ở bên phải. Bấm nhanh vào một chiều là xem theo chiều đó.</p>
            <label className="relative block"><span className="sr-only">Tìm trường hoặc chỉ số</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={dataSearch} onChange={event => setDataSearch(event.target.value)} className="min-h-10 w-full rounded-lg border border-rule bg-white pl-9 pr-3 text-xs outline-none focus:border-brand-500" placeholder="Tìm dữ liệu" /></label>
            <div className="mt-4 space-y-4">
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-black text-slate-500"><Sparkles className="h-3.5 w-3.5" />Mẫu dựng sẵn</h3>
                <div data-testid="report-preset-list" className="space-y-1">{availablePresets.map(preset => <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyTemplate(preset.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left ${selectedTemplateId === preset.id ? 'bg-brand-100 text-brand-600' : 'text-slate-700 hover:bg-white'}`}
                ><span className="block text-xs font-bold">{preset.name}</span><span className="mt-0.5 block text-[10px] font-medium leading-relaxed text-slate-500">{preset.description}</span></button>)}</div>
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-black text-slate-500"><Columns3 className="h-3.5 w-3.5" />Chiều phân tích</h3>
                <div className="max-h-52 space-y-1 overflow-y-auto">{visibleGroupFields.map(field => <button
                  key={field.key}
                  type="button"
                  draggable
                  onDragStart={event => startDrag(event, { kind: 'field', key: field.key })}
                  onClick={() => quickAddField(field.key)}
                  className="w-full cursor-grab rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-white active:cursor-grabbing"
                ><span className="block text-xs font-bold">{field.label}</span><span className="block text-[9px] font-medium text-slate-400">{fieldCategoryLabel(field)}</span></button>)}</div>
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-black text-slate-500"><Sigma className="h-3.5 w-3.5" />Chỉ số</h3>
                <div className="max-h-52 space-y-1 overflow-y-auto">{visibleMetrics.map(metric => {
                  const used = query.metrics.includes(metric.key);
                  return <button
                    key={metric.key}
                    type="button"
                    draggable={!used}
                    onDragStart={event => startDrag(event, { kind: 'metric', key: metric.key })}
                    onClick={() => addMetric(metric.key)}
                    disabled={used}
                    className={`w-full rounded-lg px-2.5 py-2 text-left ${used ? 'cursor-default text-slate-400' : 'cursor-grab text-slate-700 hover:bg-white active:cursor-grabbing'}`}
                  ><span className="block text-xs font-bold">{metric.label}</span><span className="block text-[9px] font-medium text-slate-400">{used ? 'Đang dùng' : metricUnitLabel(metric)}</span></button>;
                })}</div>
              </section>
            </div>
          </div>
        </details>
      </aside>

      <div data-testid="report-canvas" className="min-w-0 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Mẫu báo cáo</span><select aria-label="Mẫu báo cáo" value={selectedTemplateId} onChange={event => applyTemplate(event.target.value)} className={CONTROL_CLASS}>
            <option value="">Báo cáo tổng hợp</option>
            {availablePresets.length > 0 && <optgroup label="Mẫu dựng sẵn">{availablePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</optgroup>}
            {definitions.length > 0 && <optgroup label="Mẫu của tôi">{definitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</optgroup>}
          </select></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setCopySourceId(undefined); setShowSaveForm(current => !current); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rule px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><Bookmark className="h-4 w-4" />Lưu cách xem</button>
            {selectedTemplateId && <button type="button" onClick={prepareCopy} className="min-h-11 rounded-xl border border-rule px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Sao chép</button>}
            <button type="button" onClick={resetBuilder} className="min-h-11 rounded-xl border border-rule px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Làm lại</button>
          </div>
        </div>

        <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-rule bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
          <DropZone zone="rows" icon={<Rows3 className="h-3.5 w-3.5" />} title="Hàng" onDrop={dropInto}>
            <select aria-label="Xem theo" value={query.groupBy} onChange={event => setGroupBy(event.target.value as ReportFieldKey)} className={ZONE_SELECT_CLASS}>{groupFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select>
          </DropZone>
          <DropZone zone="columns" icon={<Columns3 className="h-3.5 w-3.5" />} title="Cột" onDrop={dropInto}>
            <select aria-label="Cột bảng chéo" value={query.pivotBy || ''} onChange={event => setPivotBy(event.target.value ? event.target.value as ReportFieldKey : undefined)} className={ZONE_SELECT_CLASS}><option value="">Không dùng</option>{groupFields.filter(field => field.key !== query.groupBy).map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select>
          </DropZone>
          <DropZone zone="values" icon={<Sigma className="h-3.5 w-3.5" />} title="Giá trị" onDrop={dropInto}>
            <div className="flex flex-wrap gap-1">{query.metrics.map(key => <span key={key} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 py-1 pl-2 pr-1 text-[11px] font-bold text-brand-600">
              {metricsByKey.get(key)?.label || 'Chỉ số'}
              <button type="button" onClick={() => removeMetric(key)} disabled={query.metrics.length < 2} className="rounded p-0.5 hover:bg-brand-100 disabled:opacity-30" aria-label={`Bỏ chỉ số ${metricsByKey.get(key)?.label || ''}`}><X className="h-3 w-3" /></button>
            </span>)}</div>
          </DropZone>
          <DropZone zone="filters" icon={<Filter className="h-3.5 w-3.5" />} title="Bộ lọc" onDrop={dropInto}>
            <div className="flex flex-wrap gap-1">
              {query.rules.map((rule, index) => <button key={`${rule.key}-${index}`} type="button" onClick={() => setOpenRuleIndex(current => current === index ? null : index)} className={`rounded-lg px-2 py-1 text-[11px] font-bold ${openRuleIndex === index ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{describeRule(rule, fieldsByKey.get(rule.key), operatorsByKey.get(rule.operator)?.label)}</button>)}
              <button type="button" onClick={() => addRule()} disabled={!filterFields.length} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[11px] font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50"><Plus className="h-3 w-3" />Thêm điều kiện</button>
            </div>
          </DropZone>
        </div>

        {query.rules.length > 0 && <div className="mt-3 space-y-3" data-testid="report-filter-editor">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><Filter className="h-3.5 w-3.5 text-brand-600" />Lọc dữ liệu<span className="font-medium text-slate-400">{query.rules.length}</span></span>
            {query.rules.length > 1 && <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><span>Điều kiện:</span><select aria-label="Cách ghép điều kiện" value={query.match} onChange={event => setQuery(current => ({ ...current, match: event.target.value as ReportRunRequest['match'] }))} className="min-h-9 rounded-lg border border-rule bg-white px-2 text-xs font-bold text-slate-700"><option value="ALL">Đồng thời thỏa tất cả</option><option value="ANY">Thỏa ít nhất một điều kiện</option></select></label>}
          </div>
          {query.rules.map((rule, index) => openRuleIndex === index && <FilterRuleEditor key={`${index}-${rule.key}`} index={index} rule={rule} field={fieldsByKey.get(rule.key)} catalog={filterableCatalog} onChange={next => replaceRule(index, next)} onRemove={() => removeRule(index)} />)}
        </div>}

        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
          <ExportColumnPicker fields={exportableFields} selected={selectedColumns} onChange={setSelectedColumns} />
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Bảng điều khiển</span><select aria-label="Bảng điều khiển" value={selectedDashboardId} onChange={event => setSelectedDashboardId(event.target.value)} className={CONTROL_CLASS}><option value="">Chưa chọn</option>{dashboards.map(dashboard => <option key={dashboard.id} value={dashboard.id}>{dashboard.name}</option>)}</select></label>
          <button type="button" onClick={() => setShowDashboardForm(current => !current)} className="min-h-11 rounded-xl border border-rule px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Tạo bảng điều khiển</button>
          <button type="button" onClick={() => void runReport()} className="min-h-11 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white hover:bg-brand-600">Xem báo cáo</button>
        </div>

        {invalidQueryHint && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">{invalidQueryHint} — báo cáo sẽ tự chạy lại khi điều kiện hợp lệ.</p>}

        {showSaveForm && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="report-name">Tên mẫu báo cáo</label><input id="report-name" value={reportName} onChange={event => setReportName(event.target.value)} className={`${CONTROL_CLASS} flex-1`} placeholder="Tên mẫu, ví dụ: Tồn đọng Chi nhánh 635" /><button type="button" disabled={saving} onClick={() => void saveDefinition()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Đang lưu' : 'Lưu mẫu'}</button></div><RoleSharePicker selectedRoles={reportSharedRoles} onChange={setReportSharedRoles} /></div>}
        {showDashboardForm && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3"><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="dashboard-name">Tên bảng điều khiển</label><input id="dashboard-name" value={dashboardName} onChange={event => setDashboardName(event.target.value)} className={`${CONTROL_CLASS} flex-1`} placeholder="Tên bảng điều khiển" /><button type="button" disabled={saving} onClick={() => void createDashboard()} className="min-h-11 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Đang lưu' : 'Lưu bảng điều khiển'}</button></div><fieldset><legend className="text-xs font-bold text-slate-600">Báo cáo hiển thị</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{definitions.map(definition => <label key={definition.id} className="flex items-center gap-2 rounded-lg border border-rule bg-white p-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={dashboardReportIds.includes(definition.id)} onChange={() => setDashboardReportIds(current => current.includes(definition.id) ? current.filter(id => id !== definition.id) : [...current, definition.id])} />{definition.name}</label>)}</div></fieldset><RoleSharePicker selectedRoles={dashboardSharedRoles} onChange={setDashboardSharedRoles} /></div>}
      </div>
    </div>

    {selectedDashboard && <ReportDashboard dashboard={selectedDashboard} definitions={definitions} metricsByKey={metricsByKey} />}
    {result && <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-black text-slate-800">Kết quả truy vấn</h3>
        <span className="rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-bold text-white">{result.matchedFindingCount.toLocaleString('vi-VN')} dòng</span>
        {busy && <span role="status" className="text-[11px] font-semibold text-slate-500">Đang cập nhật…</span>}
      </div>
      {/* CoPlus warns when the on-screen result is a truncated preview of the exportable data. */}
      {result.groups.length >= query.limit && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
        Màn hình chỉ hiển thị {query.limit} nhóm đầu tiên. Bấm “Xuất Excel” để tải toàn bộ dữ liệu chi tiết.
      </p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{query.metrics.map(metricKey => <MetricCard key={metricKey} metric={metricsByKey.get(metricKey)} value={result.metricValues[metricKey] || 0} onDrill={() => setDrillTarget({ page: 1 })} />)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-white p-2"><div className="flex gap-1" role="tablist" aria-label="Kiểu hiển thị báo cáo"><button type="button" role="tab" aria-selected={presentation === 'table'} onClick={() => setPresentation('table')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${presentation === 'table' ? 'bg-brand-500 text-white' : 'text-slate-600'}`}>Bảng</button><button type="button" role="tab" aria-selected={presentation === 'pivot'} disabled={!result.pivot} onClick={() => setPresentation('pivot')} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-40 ${presentation === 'pivot' ? 'bg-brand-500 text-white' : 'text-slate-600'}`}>Bảng chéo</button><button type="button" role="tab" aria-selected={presentation === 'chart'} onClick={() => setPresentation('chart')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${presentation === 'chart' ? 'bg-brand-500 text-white' : 'text-slate-600'}`}>Biểu đồ</button></div>{presentation === 'chart' && <label className="flex items-center gap-2 px-2 text-xs font-bold text-slate-600"><span>Loại biểu đồ</span><select aria-label="Loại biểu đồ" value={chartType} onChange={event => setChartType(event.target.value as ChartType)} className="min-h-9 rounded-lg border border-rule bg-white px-2 text-xs"><option value="bar">Cột</option><option value="line">Đường</option><option value="pie">Tròn</option></select></label>}</div>
      {presentation === 'pivot' && result.pivot
        ? <Suspense fallback={<ReportPresentationLoading />}><ReportCrosstab pivot={result.pivot} metric={metricsByKey.get(result.pivot.metric)} onDrill={(rowKey, columnKey) => setDrillTarget({ rowKey, columnKey, page: 1 })} /></Suspense>
        : presentation === 'chart'
          ? <Suspense fallback={<ReportPresentationLoading />}><ReportChart result={result} metricKey={query.metrics[0]} metric={metricsByKey.get(query.metrics[0])} type={chartType} /></Suspense>
          : <ReportBreakdown result={result} metrics={query.metrics} metricsByKey={metricsByKey} groupLabel={groupLabel} sort={query.sort} onSort={toggleSort} onDrill={rowKey => setDrillTarget({ rowKey, page: 1 })} />}
    </>}

    {drillTarget && <DrillPanel
      groupLabel={groupLabel}
      loading={drillLoading}
      result={drillResult}
      onClose={() => setDrillTarget(null)}
      onPage={page => setDrillTarget(current => current && { ...current, page })}
    />}
  </section>;
};

const startDrag = (event: React.DragEvent, payload: DragPayload) => {
  event.dataTransfer.setData('application/x-report-item', JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'copy';
};

const readDrag = (event: React.DragEvent): DragPayload | null => {
  try {
    const raw = event.dataTransfer.getData('application/x-report-item');
    return raw ? JSON.parse(raw) as DragPayload : null;
  } catch { return null; }
};

const DropZone: React.FC<{
  zone: ZoneName;
  title: string;
  icon: React.ReactNode;
  onDrop: (zone: ZoneName, payload: DragPayload) => void;
  children: React.ReactNode;
}> = ({ zone, title, icon, onDrop, children }) => {
  const [over, setOver] = useState(false);
  return <div
    data-testid={`report-zone-${zone}`}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={event => { event.preventDefault(); setOver(false); const payload = readDrag(event); if (payload) onDrop(zone, payload); }}
    className={`p-3 transition ${over ? 'bg-brand-50 ring-2 ring-inset ring-brand-500' : 'bg-white'}`}
  >
    <span className="mb-2 flex items-center gap-2 text-[10px] font-black text-slate-500">{icon}{title}</span>
    {children}
  </div>;
};

const ExportColumnPicker: React.FC<{ fields: ReportFieldDefinition[]; selected: ReportFieldKey[]; onChange: (keys: ReportFieldKey[]) => void }> = ({ fields, selected, onChange }) => {
  // Keeping the picked set in catalogue order means the exported workbook column order matches what
  // the user sees here, whatever order they tick the boxes in.
  const toggle = (key: ReportFieldKey) => onChange(
    selected.includes(key)
      ? selected.filter(item => item !== key)
      : fields.filter(field => selected.includes(field.key) || field.key === key).map(field => field.key),
  );
  return <details className="relative text-xs font-bold text-slate-600">
    <summary className={`${CONTROL_CLASS} flex cursor-pointer list-none items-center justify-between`}><span>Cột xuất</span><span className="text-[11px] font-bold text-brand-600">{selected.length} cột</span></summary>
    <div className="absolute z-20 mt-1 max-h-64 w-full min-w-[14rem] overflow-y-auto rounded-xl border border-rule bg-white p-2 shadow-lg">
      {fields.map(field => <label key={field.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
        <input type="checkbox" checked={selected.includes(field.key)} onChange={() => toggle(field.key)} />
        {field.label}
      </label>)}
      {fields.length === 0 && <p className="p-2 text-[11px] font-medium text-slate-500">Quản trị viên chưa bật cột nào cho việc xuất dữ liệu.</p>}
    </div>
  </details>;
};

const ReportPresentationLoading = () => <div className="rounded-xl border border-rule bg-white p-6 text-sm font-medium text-slate-500">Đang tải phần trình bày báo cáo…</div>;

const RoleSharePicker: React.FC<{ selectedRoles: UserRole[]; onChange: (roles: UserRole[]) => void }> = ({ selectedRoles, onChange }) => <fieldset>
  <legend className="text-xs font-bold text-slate-600">Chia sẻ theo vai trò</legend>
  <div className="mt-2 flex flex-wrap gap-2">{SHAREABLE_ROLES.map(role => <label key={role.key} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-rule bg-white px-2 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={selectedRoles.includes(role.key)} onChange={() => onChange(selectedRoles.includes(role.key) ? selectedRoles.filter(key => key !== role.key) : [...selectedRoles, role.key])} />{role.label}</label>)}</div>
</fieldset>;

const DrillPanel: React.FC<{ groupLabel: string; loading: boolean; result: ReportDrillResult | null; onClose: () => void; onPage: (page: number) => void }> = ({ groupLabel, loading, result, onClose, onPage }) => {
  const lastPage = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Hồ sơ chi tiết" data-testid="report-drill-panel" onClick={onClose}>
    <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">Hồ sơ chi tiết</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {result?.rowLabel ? `${groupLabel}: ${result.rowLabel}` : 'Toàn bộ kết quả đang lọc'}
            {result?.columnLabel ? ` · ${result.columnLabel}` : ''}
            {result ? ` · ${result.total.toLocaleString('vi-VN')} dòng` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-rule p-2 text-slate-500 hover:bg-slate-50" aria-label="Đóng hồ sơ chi tiết"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && <p className="p-5 text-xs font-semibold text-slate-500">Đang tải hồ sơ…</p>}
        {!loading && result && result.rows.length === 0 && <p className="p-5 text-xs text-slate-500">Không có hồ sơ nào trong ô này.</p>}
        {!loading && result && result.rows.length > 0 && <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold text-slate-500"><tr>
            <th className="px-3 py-2">Khách hàng</th><th className="px-3 py-2">Chi nhánh</th><th className="px-3 py-2">Mã lỗi</th>
            <th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Hạn xử lý</th><th className="px-3 py-2 text-right">Giá trị ảnh hưởng</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{result.rows.map(row => <tr key={row.findingId}>
            <td className="px-3 py-2"><span className="block font-semibold text-slate-800">{row.customerName}</span><span className="block text-[10px] text-slate-500">CIF {row.cif}{row.officerName ? ` · ${row.officerName}` : ''}</span></td>
            <td className="px-3 py-2 text-slate-700">{row.branchCode} · {row.branchName}{row.department ? <span className="block text-[10px] text-slate-500">{row.department}</span> : null}</td>
            <td className="px-3 py-2"><span className="block font-semibold text-slate-800">{row.errorCode}</span><span className="block max-w-[16rem] truncate text-[10px] text-slate-500">{row.errorTitle}</span></td>
            <td className="px-3 py-2 text-slate-700">{row.workflowStatusLabel}<span className="block text-[10px] text-slate-500">{row.slaStatusLabel}</span></td>
            <td className="px-3 py-2 text-slate-700">{row.deadlineDate}</td>
            <td className="px-3 py-2 text-right font-bold text-brand-600">{row.exposureAmount.toLocaleString('vi-VN')} triệu</td>
          </tr>)}</tbody>
        </table>}
      </div>
      {result && result.total > result.pageSize && <div className="flex items-center justify-between gap-2 border-t border-rule px-4 py-3 text-xs font-bold text-slate-600">
        <button type="button" disabled={result.page <= 1} onClick={() => onPage(result.page - 1)} className="min-h-9 rounded-lg border border-rule px-3 disabled:opacity-40">Trước</button>
        <span>Trang {result.page}/{lastPage}</span>
        <button type="button" disabled={result.page >= lastPage} onClick={() => onPage(result.page + 1)} className="min-h-9 rounded-lg border border-rule px-3 disabled:opacity-40">Sau</button>
      </div>}
    </div>
  </div>;
};

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

  return <section data-testid="report-dashboard" className="rounded-2xl border border-rule bg-slate-50 p-4 shadow-panel sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{dashboard.name}</h3><span className="text-[11px] font-semibold text-slate-500">{widgets.length} báo cáo</span></div>
    {loading ? <p className="text-sm text-slate-500">Đang cập nhật bảng điều khiển…</p> : <div className="grid gap-3 lg:grid-cols-2">{widgets.map(definition => {
      const outcome = results[definition.id];
      const metricKey = definition.query?.metrics[0];
      const metric = metricKey ? metricsByKey.get(metricKey) : undefined;
      const value = metricKey && outcome ? outcome.metricValues[metricKey] || 0 : 0;
      return <article key={definition.id} className="rounded-xl border border-rule bg-white p-4">
        <h4 className="text-sm font-bold text-slate-900">{definition.name}</h4>
        <p className="mt-3 text-2xl font-black text-brand-600">{outcome ? formatMetric(value, metric) : '—'}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{metric?.label || 'Chưa có chỉ số'}</p>
        {/* A single number hides which groups drive it, so each widget also lists its leading rows. */}
        {outcome && outcome.groups.length > 0 && <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">{outcome.groups.slice(0, 4).map(row => <li key={row.key} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate font-semibold text-slate-600">{row.label}</span>
          <span className="shrink-0 font-bold text-slate-800">{formatMetric(metricKey ? row.metricValues[metricKey] || 0 : 0, metric)}</span>
        </li>)}</ul>}
      </article>;
    })}</div>}
  </section>;
};

const FilterRuleEditor: React.FC<{ index: number; rule: ReportFilterRule; field?: ReportFieldDefinition; catalog: ReportCatalog | null; onChange: (rule: ReportFilterRule) => void; onRemove: () => void }> = ({ index, rule, field, catalog, onChange, onRemove }) => {
  const changeField = (key: ReportFieldKey) => { const nextField = catalog?.fields.find(item => item.key === key); onChange({ key, operator: nextField?.operators[0] || 'op.eq' }); };
  const changeOperator = (operator: ReportFilterRule['operator']) => onChange({ key: rule.key, operator });
  return <div data-testid="report-filter-rule" className="rounded-xl border border-rule bg-slate-50 p-3"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.8fr)_minmax(0,1.2fr)_44px] lg:items-end">
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

const MetricCard: React.FC<{ metric?: ReportMetricDefinition; value: number; onDrill: () => void }> = ({ metric, value, onDrill }) => <button type="button" onClick={onDrill} className="rounded-2xl border border-rule bg-white p-4 text-left shadow-panel transition hover:border-brand-500 hover:shadow-md">
  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><BarChart3 className="h-4 w-4" /></div>
  <div className="text-xs font-bold text-slate-500">{metric?.label || 'Chỉ số'}</div>
  <div className="mt-1 text-2xl font-black text-slate-900">{formatMetric(value, metric)}</div>
  <div className="mt-1 text-[10px] font-semibold text-brand-600">Bấm để xem hồ sơ</div>
</button>;

const ReportBreakdown: React.FC<{
  result: ReportRunResult;
  metrics: ReportMetricKey[];
  metricsByKey: Map<ReportMetricKey, ReportMetricDefinition>;
  groupLabel: string;
  sort?: ReportRunRequest['sort'];
  onSort: (key: ReportMetricKey) => void;
  onDrill: (rowKey: string) => void;
}> = ({ result, metrics, metricsByKey, groupLabel, sort, onSort, onDrill }) => <div className="min-w-0 overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3"><h3 className="text-sm font-bold text-slate-900">Kết quả theo {groupLabel}</h3><span className="text-[10px] font-bold text-slate-500">{result.matchedFindingCount} mã lỗi phù hợp</span></div>
  <div className="divide-y divide-slate-100 md:hidden">{result.groups.map(row => <button key={row.key} type="button" onClick={() => onDrill(row.key)} className="w-full p-4 text-left"><div className="mb-3 text-xs font-bold text-slate-900">{row.label}</div><div className="grid grid-cols-2 gap-2">{metrics.map(key => <div key={key} className="rounded-lg bg-slate-50 p-2"><div className="text-[9px] font-bold text-slate-500">{metricsByKey.get(key)?.label}</div><div className="mt-1 text-xs font-black text-brand-600">{formatMetric(row.metricValues[key] || 0, metricsByKey.get(key))}</div></div>)}</div></button>)}</div>
  <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-xs">
    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500"><tr>
      <th className="px-4 py-3">{groupLabel}</th>
      {metrics.map(key => <th key={key} className="px-4 py-3 text-right"><button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 font-bold hover:text-brand-600" aria-label={`Sắp xếp theo ${metricsByKey.get(key)?.label || 'chỉ số'}`}>{metricsByKey.get(key)?.label}<span aria-hidden className="text-[9px] text-brand-600">{sort?.key === key ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>)}
    </tr></thead>
    <tbody className="divide-y divide-slate-100">{result.groups.map(row => <tr key={row.key} className="hover:bg-slate-50">
      <td className="px-4 py-3 font-semibold text-slate-800">{row.label}</td>
      {metrics.map(key => <td key={key} className="px-4 py-3 text-right"><button type="button" onClick={() => onDrill(row.key)} className="font-bold text-brand-600 underline-offset-2 hover:underline">{formatMetric(row.metricValues[key] || 0, metricsByKey.get(key))}</button></td>)}
    </tr>)}</tbody>
  </table></div>
  {result.groups.length === 0 && <p className="p-5 text-xs text-slate-500">Không có dữ liệu phù hợp với bộ lọc.</p>}
</div>;

const fieldCategoryLabel = (field: ReportFieldDefinition): string => field.category === 'DATE' ? 'Ngày tháng' : field.category === 'FLAG' ? 'Đánh dấu' : field.category === 'MEASURE' ? 'Số liệu' : 'Phân loại';
const metricUnitLabel = (metric: ReportMetricDefinition): string => metric.unit === 'MILLION_VND' ? 'Triệu đồng' : metric.unit === 'PERCENT' ? 'Phần trăm' : 'Số lượng';
const formatMetric = (value: number, metric?: ReportMetricDefinition): string => metric?.unit === 'PERCENT' ? `${value.toLocaleString('vi-VN')}%` : metric?.unit === 'MILLION_VND' ? `${value.toLocaleString('vi-VN')} triệu` : value.toLocaleString('vi-VN');
const describeRule = (rule: ReportFilterRule, field?: ReportFieldDefinition, operatorLabel?: string): string => {
  const value = rule.operator === 'op.between' ? `${String(rule.from ?? '...')} đến ${String(rule.to ?? '...')}` : rule.operator === 'op.in' ? (rule.values || []).join(', ') : rule.operator === 'op.is_true' || rule.operator === 'op.is_false' ? '' : String(rule.value ?? '');
  return `${field?.label || 'Nội dung'} ${operatorLabel || 'phù hợp'}${value ? ` ${value}` : ''}`;
};
const defaultExportColumns = (catalog: ReportCatalog): ReportFieldKey[] => {
  const configured = catalog.fields.filter(field => field.exportable && field.defaultExport).map(field => field.key);
  return configured.length ? configured : catalog.fields.filter(field => field.exportable).slice(0, 10).map(field => field.key);
};
/** A preset is only offered when every field and metric it needs is still switched on by the admin. */
const presetIsUsable = (preset: ReportPreset, catalog: ReportCatalog): boolean => {
  const groupable = new Set(catalog.fields.filter(field => field.groupable).map(field => field.key));
  const filterable = new Set(catalog.fields.filter(field => field.filterable !== false).map(field => field.key));
  const metrics = new Set(catalog.metrics.map(metric => metric.key));
  if (!groupable.has(preset.query.groupBy)) return false;
  if (preset.query.pivotBy && !groupable.has(preset.query.pivotBy)) return false;
  if (!preset.query.metrics.every(key => metrics.has(key))) return false;
  return preset.query.rules.every(rule => filterable.has(rule.key));
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

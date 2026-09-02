import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Database, RefreshCw, Save, Search } from 'lucide-react';
import {
  REPORT_FIELD_CATALOG,
  ReportCatalogConfiguration,
  ReportCatalogFieldConfiguration,
  ReportCatalogMetricConfiguration,
  UpdateReportCatalogConfigurationSchema,
} from '../../../shared/contracts';
import { api } from '../../services/api';

const INPUT_CLASS = 'min-h-10 w-full rounded-lg border border-rule bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-teal-100';

export const ReportCatalogManager: React.FC = () => {
  const [configuration, setConfiguration] = useState<ReportCatalogConfiguration | null>(null);
  const [view, setView] = useState<'FIELDS' | 'METRICS'>('FIELDS');
  const [layout, setLayout] = useState<'CARD' | 'LIST'>('LIST');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = async () => {
    try {
      setBusy(true);
      setError(null);
      const result = await api.getReportCatalogConfiguration();
      if (!mountedRef.current) return;
      setConfiguration(result);
    } catch (reason) {
      if (!mountedRef.current) return;
      setError(reason instanceof Error ? reason.message : 'Không thể tải cấu hình trường báo cáo.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { void load(); }, []);

  const fields = useMemo(
    () => [...(configuration?.fields || [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [configuration],
  );
  const metrics = useMemo(
    () => [...(configuration?.metrics || [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [configuration],
  );

  // Reorder acts on the position in the full sorted list, so the original index travels with
  // each row and survives filtering.
  const matches = (label: string, isActive: boolean) => {
    if (activeFilter !== 'ALL' && isActive !== (activeFilter === 'ON')) return false;
    const query = search.trim().toLocaleLowerCase('vi');
    return !query || label.toLocaleLowerCase('vi').includes(query);
  };
  const visibleFields = fields
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matches(item.label, item.isActive));
  const visibleMetrics = metrics
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matches(item.label, item.isActive));

  const updateField = (key: ReportCatalogFieldConfiguration['key'], patch: Partial<ReportCatalogFieldConfiguration>) => {
    setConfiguration(current => current ? {
      ...current,
      fields: current.fields.map(field => field.key === key ? { ...field, ...patch } : field),
    } : current);
  };

  const updateMetric = (key: ReportCatalogMetricConfiguration['key'], patch: Partial<ReportCatalogMetricConfiguration>) => {
    setConfiguration(current => current ? {
      ...current,
      metrics: current.metrics.map(metric => metric.key === key ? { ...metric, ...patch } : metric),
    } : current);
  };

  const move = (kind: 'fields' | 'metrics', index: number, direction: -1 | 1) => {
    setConfiguration(current => {
      if (!current) return current;
      const ordered = [...current[kind]].sort((left, right) => left.sortOrder - right.sortOrder);
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return current;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return { ...current, [kind]: ordered.map((item, sortOrder) => ({ ...item, sortOrder })) };
    });
  };

  const save = async () => {
    if (!configuration) return;
    const parsed = UpdateReportCatalogConfigurationSchema.safeParse({
      expectedVersion: configuration.version,
      fields: configuration.fields,
      metrics: configuration.metrics,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Cấu hình chưa hợp lệ.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      setConfiguration(await api.updateReportCatalogConfiguration(parsed.data));
      setNotice('Đã cập nhật trường dữ liệu dùng trên màn Báo cáo.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu cấu hình trường báo cáo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="report-catalog-manager">
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-panel sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Database className="h-5 w-5 text-brand-600" />Trường báo cáo</h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} disabled={busy || saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rule px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Tải lại</button>
            <button type="button" onClick={() => void save()} disabled={!configuration || busy || saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Đang lưu' : 'Lưu thay đổi'}</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Nội dung cấu hình báo cáo">
            <TabButton active={view === 'FIELDS'} onClick={() => setView('FIELDS')} label={`Trường dữ liệu (${fields.length})`} />
            <TabButton active={view === 'METRICS'} onClick={() => setView('METRICS')} label={`Chỉ số (${metrics.length})`} />
          </div>
          {/* 25 full-width configuration cards is a scroll, not a screen. The list shows every
              field's flags at once; the cards stay for editing one in detail. */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Kiểu hiển thị trường báo cáo">
            <TabButton active={layout === 'CARD'} onClick={() => setLayout('CARD')} label="Thẻ" />
            <TabButton active={layout === 'LIST'} onClick={() => setLayout('LIST')} label="Danh sách" />
          </div>
          <label className="relative block min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Tìm trường hoặc chỉ số</span>
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên hiển thị..." className="min-h-10 w-full rounded-xl border border-rule bg-white pl-10 pr-4 text-xs font-medium outline-none focus:border-brand-500" />
          </label>
          <select aria-label="Lọc theo trạng thái hiển thị" value={activeFilter} onChange={event => setActiveFilter(event.target.value)} className="min-h-9 rounded-lg border border-rule bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500">
            <option value="ALL">Mọi trạng thái</option>
            <option value="ON">Đang hiển thị</option>
            <option value="OFF">Đang ẩn</option>
          </select>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-semibold text-brand-600">{notice}</div>}

      {busy && !configuration ? (
        <div className="rounded-2xl border border-rule bg-white p-8 text-center text-xs text-slate-500">Đang tải cấu hình...</div>
      ) : layout === 'LIST' ? (
        <CatalogTable
          rows={view === 'FIELDS'
            ? visibleFields.map(({ item, index }) => ({
              key: item.key, label: item.label, isActive: item.isActive, index,
              flags: [
                ['Hiển thị', item.isActive],
                ['Cho phép lọc', item.filterable],
                ['Cho phép nhóm', item.groupable],
                ['Cho phép xuất', item.exportable],
                ['Cột xuất mặc định', item.defaultExport],
              ],
            }))
            : visibleMetrics.map(({ item, index }) => ({
              key: item.key, label: item.label, isActive: item.isActive, index,
              flags: [['Hiển thị', item.isActive]],
            }))}
          total={view === 'FIELDS' ? fields.length : metrics.length}
          onToggle={(key, flag, value) => view === 'FIELDS'
            ? updateField(key as ReportCatalogFieldConfiguration['key'], { [flagField[flag]]: value } as Partial<ReportCatalogFieldConfiguration>)
            : updateMetric(key as ReportCatalogMetricConfiguration['key'], { isActive: value })}
          onMove={(index, direction) => move(view === 'FIELDS' ? 'fields' : 'metrics', index, direction)}
        />
      ) : view === 'FIELDS' ? (
        <div className="space-y-3">
          {visibleFields.map(({ item, index }) => (
            <FieldConfigurationRow key={item.key} field={item} index={index} total={fields.length} onChange={patch => updateField(item.key, patch)} onMove={direction => move('fields', index, direction)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleMetrics.map(({ item, index }) => (
            <MetricConfigurationRow key={item.key} metric={item} index={index} total={metrics.length} onChange={patch => updateMetric(item.key, patch)} onMove={direction => move('metrics', index, direction)} />
          ))}
        </div>
      )}
    </section>
  );
};

const TabButton: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold ${active ? 'bg-white text-brand-600 shadow-panel' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
);

/** Visible flag label -> the configuration property it writes. */
const flagField: Record<string, keyof ReportCatalogFieldConfiguration> = {
  'Hiển thị': 'isActive',
  'Cho phép lọc': 'filterable',
  'Cho phép nhóm': 'groupable',
  'Cho phép xuất': 'exportable',
  'Cột xuất mặc định': 'defaultExport',
};

type CatalogRow = { key: string; label: string; isActive: boolean; index: number; flags: Array<[string, boolean]> };

const CatalogTable: React.FC<{
  rows: CatalogRow[];
  total: number;
  onToggle: (key: string, flag: string, value: boolean) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ rows, total, onToggle, onMove }) => {
  if (!rows.length) return <div className="rounded-2xl border border-rule bg-white p-10 text-center text-sm font-semibold text-slate-600 shadow-panel">Không có mục nào khớp bộ lọc.</div>;
  const flagNames = rows[0].flags.map(([name]) => name);
  return (
    <section aria-label="Danh sách trường báo cáo" className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-xs">
          <thead className="border-b border-rule bg-slate-50/80 text-[11px] font-semibold text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Tên hiển thị</th>
              {flagNames.map(name => <th key={name} scope="col" className="px-3 py-2.5 text-center font-semibold">{name}</th>)}
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Thứ tự</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(row => (
              <tr key={row.key} className={`transition-colors hover:bg-brand-50/50 ${row.isActive ? '' : 'opacity-60'}`}>
                <td className="px-4 py-2.5">
                  <div className="font-bold text-slate-900">{row.label}</div>
                  <div className="font-mono text-[10px] text-slate-400">{row.key}</div>
                </td>
                {row.flags.map(([name, value]) => (
                  <td key={name} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={value}
                      onChange={event => onToggle(row.key, name, event.target.checked)}
                      aria-label={`${name} — ${row.label}`}
                    />
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button type="button" disabled={row.index === 0} onClick={() => onMove(row.index, -1)} aria-label={`Đưa ${row.label} lên trên`} className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-slate-500 hover:border-brand-300 hover:text-brand-600 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={row.index === total - 1} onClick={() => onMove(row.index, 1)} aria-label={`Đưa ${row.label} xuống dưới`} className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-slate-500 hover:border-brand-300 hover:text-brand-600 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const FieldConfigurationRow: React.FC<{
  field: ReportCatalogFieldConfiguration;
  index: number;
  total: number;
  onChange: (patch: Partial<ReportCatalogFieldConfiguration>) => void;
  onMove: (direction: -1 | 1) => void;
}> = ({ field, index, total, onChange, onMove }) => {
  const base = REPORT_FIELD_CATALOG.find(item => item.key === field.key)!;
  return <article className={`rounded-2xl border bg-white p-4 shadow-panel ${field.isActive ? 'border-rule' : 'border-rule opacity-70'}`}>
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.4fr)_minmax(120px,.6fr)_minmax(0,1.5fr)_88px] xl:items-center">
      <label className="space-y-1.5 text-[11px] font-bold text-slate-600">
        <span>Tên hiển thị</span>
        <input value={field.label} onChange={event => onChange({ label: event.target.value })} className={INPUT_CLASS} aria-label={`Tên hiển thị ${field.label}`} />
      </label>
      <div>
        <div className="text-[11px] font-bold text-slate-500">Kiểu dữ liệu</div>
        <div className="mt-1.5 inline-flex min-h-10 items-center rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700">{valueTypeLabel(field.valueType)}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5">
        <CheckControl label="Hiển thị" checked={field.isActive} onChange={checked => onChange({ isActive: checked, filterable: checked ? field.filterable : false, defaultExport: checked ? field.defaultExport : false })} />
        <CheckControl label="Cho phép lọc" checked={field.filterable} disabled={!field.isActive} onChange={checked => onChange({ filterable: checked })} />
        <CheckControl label="Cho phép nhóm" checked={field.groupable} disabled={!base.groupable} onChange={checked => onChange({ groupable: checked })} />
        <CheckControl label="Cho phép xuất" checked={field.exportable} disabled={!base.exportable} onChange={checked => onChange({ exportable: checked, defaultExport: checked ? field.defaultExport : false })} />
        <CheckControl label="Cột xuất mặc định" checked={field.defaultExport} disabled={!field.isActive || !field.exportable} onChange={checked => onChange({ defaultExport: checked })} />
      </div>
      <OrderButtons index={index} total={total} onMove={onMove} />
    </div>
  </article>;
};

const MetricConfigurationRow: React.FC<{
  metric: ReportCatalogMetricConfiguration;
  index: number;
  total: number;
  onChange: (patch: Partial<ReportCatalogMetricConfiguration>) => void;
  onMove: (direction: -1 | 1) => void;
}> = ({ metric, index, total, onChange, onMove }) => (
  <article className={`rounded-2xl border bg-white p-4 shadow-panel ${metric.isActive ? 'border-rule' : 'border-rule opacity-70'}`}>
    <div className="grid gap-4 sm:grid-cols-[minmax(220px,1fr)_160px_88px] sm:items-end">
      <label className="space-y-1.5 text-[11px] font-bold text-slate-600">
        <span>Tên hiển thị</span>
        <input value={metric.label} onChange={event => onChange({ label: event.target.value })} className={INPUT_CLASS} aria-label={`Tên hiển thị ${metric.label}`} />
      </label>
      <CheckControl label="Hiển thị trên báo cáo" checked={metric.isActive} onChange={checked => onChange({ isActive: checked })} />
      <OrderButtons index={index} total={total} onMove={onMove} />
    </div>
  </article>
);

const CheckControl: React.FC<{ label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <label className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold ${checked ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-rule bg-white text-slate-500'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
    <input type="checkbox" className="h-4 w-4 accent-[#006b68]" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const OrderButtons: React.FC<{ index: number; total: number; onMove: (direction: -1 | 1) => void }> = ({ index, total, onMove }) => (
  <div className="flex gap-2" aria-label="Sắp xếp thứ tự">
    <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Đưa lên" className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
    <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Đưa xuống" className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
  </div>
);

const valueTypeLabel = (type: ReportCatalogFieldConfiguration['valueType']): string => ({
  TEXT: 'Văn bản',
  ENUM: 'Danh sách',
  DATE: 'Ngày',
  NUMBER: 'Số',
  BOOLEAN: 'Có / Không',
}[type]);

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Database, RefreshCw, Save } from 'lucide-react';
import {
  REPORT_FIELD_CATALOG,
  ReportCatalogConfiguration,
  ReportCatalogFieldConfiguration,
  ReportCatalogMetricConfiguration,
  UpdateReportCatalogConfigurationSchema,
} from '../../../shared/contracts';
import { api } from '../../services/api';

const INPUT_CLASS = 'min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#006b68] focus:ring-2 focus:ring-teal-100';

export const ReportCatalogManager: React.FC = () => {
  const [configuration, setConfiguration] = useState<ReportCatalogConfiguration | null>(null);
  const [view, setView] = useState<'FIELDS' | 'METRICS'>('FIELDS');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      setBusy(true);
      setError(null);
      setConfiguration(await api.getReportCatalogConfiguration());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải cấu hình trường báo cáo.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const fields = useMemo(
    () => [...(configuration?.fields || [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [configuration],
  );
  const metrics = useMemo(
    () => [...(configuration?.metrics || [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [configuration],
  );

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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Database className="h-5 w-5 text-[#006b68]" />Trường báo cáo</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Đổi tên hiển thị, chọn nội dung được dùng và sắp xếp thứ tự trên màn Báo cáo.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} disabled={busy || saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Tải lại</button>
            <button type="button" onClick={() => void save()} disabled={!configuration || busy || saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006b68] px-4 py-2 text-xs font-bold text-white hover:bg-[#005a57] disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Đang lưu' : 'Lưu thay đổi'}</button>
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Nội dung cấu hình báo cáo">
          <TabButton active={view === 'FIELDS'} onClick={() => setView('FIELDS')} label={`Trường dữ liệu (${fields.length})`} />
          <TabButton active={view === 'METRICS'} onClick={() => setView('METRICS')} label={`Chỉ số (${metrics.length})`} />
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-[#006b68]">{notice}</div>}

      {busy && !configuration ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">Đang tải cấu hình...</div>
      ) : view === 'FIELDS' ? (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <FieldConfigurationRow key={field.key} field={field} index={index} total={fields.length} onChange={patch => updateField(field.key, patch)} onMove={direction => move('fields', index, direction)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {metrics.map((metric, index) => (
            <MetricConfigurationRow key={metric.key} metric={metric} index={index} total={metrics.length} onChange={patch => updateMetric(metric.key, patch)} onMove={direction => move('metrics', index, direction)} />
          ))}
        </div>
      )}
    </section>
  );
};

const TabButton: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold ${active ? 'bg-white text-[#006b68] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
);

const FieldConfigurationRow: React.FC<{
  field: ReportCatalogFieldConfiguration;
  index: number;
  total: number;
  onChange: (patch: Partial<ReportCatalogFieldConfiguration>) => void;
  onMove: (direction: -1 | 1) => void;
}> = ({ field, index, total, onChange, onMove }) => {
  const base = REPORT_FIELD_CATALOG.find(item => item.key === field.key)!;
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${field.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.4fr)_minmax(120px,.6fr)_minmax(0,1.5fr)_88px] xl:items-center">
      <label className="space-y-1.5 text-[11px] font-bold text-slate-600">
        <span>Tên hiển thị</span>
        <input value={field.label} onChange={event => onChange({ label: event.target.value })} className={INPUT_CLASS} aria-label={`Tên hiển thị ${field.label}`} />
      </label>
      <div>
        <div className="text-[11px] font-bold text-slate-500">Kiểu dữ liệu</div>
        <div className="mt-1.5 inline-flex min-h-10 items-center rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700">{valueTypeLabel(field.valueType)}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
        <CheckControl label="Hiển thị" checked={field.isActive} onChange={checked => onChange({ isActive: checked, defaultExport: checked ? field.defaultExport : false })} />
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
  <article className={`rounded-2xl border bg-white p-4 shadow-sm ${metric.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
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
  <label className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold ${checked ? 'border-teal-200 bg-teal-50 text-[#006b68]' : 'border-slate-200 bg-white text-slate-500'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
    <input type="checkbox" className="h-4 w-4 accent-[#006b68]" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const OrderButtons: React.FC<{ index: number; total: number; onMove: (direction: -1 | 1) => void }> = ({ index, total, onMove }) => (
  <div className="flex gap-2" aria-label="Sắp xếp thứ tự">
    <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Đưa lên" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
    <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Đưa xuống" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
  </div>
);

const valueTypeLabel = (type: ReportCatalogFieldConfiguration['valueType']): string => ({
  TEXT: 'Văn bản',
  ENUM: 'Danh sách',
  DATE: 'Ngày',
  NUMBER: 'Số',
  BOOLEAN: 'Có / Không',
}[type]);

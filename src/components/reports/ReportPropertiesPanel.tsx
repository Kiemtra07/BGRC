import React from 'react';
import { PanelRightClose, RotateCcw, Sliders } from 'lucide-react';
import {
  ReportMetricDefinition, ReportMetricFormat, ReportMetricKey,
  ReportPresentationOptions, formatReportMetricValue,
} from '../../../shared/contracts';

/**
 * Panel Thuộc tính: đổi cách con số hiện ra, không đổi con số.
 *
 * Đây là mảnh cuối còn thiếu so với một công cụ báo cáo tự phục vụ. Trước đó người dùng dựng được
 * truy vấn nhưng không đặt được tên cột theo ngôn ngữ của mình, không chỉnh được số lẻ, và không
 * đánh dấu được ngưỡng cần chú ý — ba việc mà một báo cáo kiểm toán gần như luôn cần.
 *
 * Mọi thuộc tính ở đây áp đồng thời cho màn hình và cho tệp xuất. Nếu chỉ áp cho màn hình thì lại
 * rơi đúng vào lỗi "tệp không giống cái đang nhìn".
 */

const HIGHLIGHT_TONES: ReadonlyArray<{ value: 'risk' | 'warn' | 'ok'; label: string; swatch: string }> = [
  { value: 'risk', label: 'Đỏ — cần xử lý', swatch: 'bg-risk-surface text-risk' },
  { value: 'warn', label: 'Vàng — theo dõi', swatch: 'bg-amber-50 text-amber-800' },
  { value: 'ok', label: 'Xanh — đạt', swatch: 'bg-ok-surface text-ok' },
];

const OPERATORS: ReadonlyArray<{ value: 'gt' | 'gte' | 'lt' | 'lte'; label: string }> = [
  { value: 'gt', label: 'lớn hơn' },
  { value: 'gte', label: 'từ' },
  { value: 'lt', label: 'nhỏ hơn' },
  { value: 'lte', label: 'tối đa' },
];

const inputClass = 'min-h-9 w-full rounded-lg border border-rule bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-brand-500';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    {children}
  </label>
);

interface ReportPropertiesPanelProps {
  presentation: ReportPresentationOptions;
  /** Chỉ số đang có trong vùng Giá trị — panel chỉ chỉnh những gì báo cáo thực sự dùng. */
  metrics: ReportMetricKey[];
  metricsByKey: Map<ReportMetricKey, ReportMetricDefinition | undefined>;
  /** Tên mặc định của trường ở vùng Hàng, hiện làm gợi ý khi chưa đặt tên riêng. */
  defaultRowLabel: string;
  onChange: (presentation: ReportPresentationOptions) => void;
  onClose: () => void;
}

export const ReportPropertiesPanel: React.FC<ReportPropertiesPanelProps> = ({
  presentation, metrics, metricsByKey, defaultRowLabel, onChange, onClose,
}) => {
  const [selected, setSelected] = React.useState<ReportMetricKey | 'REPORT'>('REPORT');

  // Bỏ một chỉ số khỏi vùng Giá trị trong khi đang chỉnh nó thì panel phải quay về mục báo cáo,
  // chứ không đứng lại trên một đối tượng không còn tồn tại.
  React.useEffect(() => {
    if (selected !== 'REPORT' && !metrics.includes(selected)) setSelected('REPORT');
  }, [metrics, selected]);

  const format = selected === 'REPORT' ? undefined : presentation.metrics?.[selected];

  const setMetricFormat = (patch: Partial<ReportMetricFormat> | null) => {
    if (selected === 'REPORT') return;
    const next = { ...(presentation.metrics ?? {}) };
    if (patch === null) delete next[selected];
    else {
      const merged = { ...(next[selected] ?? {}), ...patch };
      // Trường rỗng bị loại hẳn thay vì lưu chuỗi rỗng, để "chưa đặt" và "đặt thành rỗng" không lẫn.
      for (const key of Object.keys(merged) as Array<keyof ReportMetricFormat>) {
        const value = merged[key];
        if (value === '' || value === undefined) delete merged[key];
      }
      next[selected] = merged;
    }
    onChange({ ...presentation, metrics: next });
  };

  const metricLabel = (key: ReportMetricKey) =>
    presentation.metrics?.[key]?.label || metricsByKey.get(key)?.label || key;

  const highlight = format?.highlight;
  const sample = 1234.5;

  return (
    <aside data-testid="report-properties-panel" className="border-t border-rule bg-slate-50 lg:border-l lg:border-t-0">
      <div className="flex min-h-12 items-center justify-between gap-2 px-3">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Sliders className="h-3.5 w-3.5 text-brand-500" />Thuộc tính</span>
        <button type="button" onClick={onClose} aria-label="Thu gọn thuộc tính" title="Thu gọn thuộc tính" className="hidden h-7 w-7 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700 lg:grid"><PanelRightClose className="h-4 w-4" /></button>
      </div>

      <div className="space-y-3 border-t border-rule p-3">
        <Row label="Đang chỉnh">
          <select aria-label="Thành phần đang chỉnh" value={selected} onChange={event => setSelected(event.target.value as ReportMetricKey | 'REPORT')} className={inputClass}>
            <option value="REPORT">Báo cáo (tiêu đề, cột hàng)</option>
            {metrics.map(key => <option key={key} value={key}>Chỉ số: {metricLabel(key)}</option>)}
          </select>
        </Row>

        {selected === 'REPORT' ? (
          <>
            <Row label="Tiêu đề báo cáo">
              <input
                value={presentation.title ?? ''}
                onChange={event => onChange({ ...presentation, title: event.target.value || undefined })}
                placeholder="Báo cáo Audit BGS"
                className={inputClass}
              />
            </Row>
            <Row label="Tên cột hàng">
              <input
                value={presentation.rowLabel ?? ''}
                onChange={event => onChange({ ...presentation, rowLabel: event.target.value || undefined })}
                placeholder={defaultRowLabel}
                className={inputClass}
              />
            </Row>
            <p className="rounded-lg bg-white px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
              Tiêu đề và tên cột đi cùng tệp khi xuất, nên bản tải về trùng với bản đang xem.
            </p>
          </>
        ) : (
          <>
            <Row label="Tên cột">
              <input
                value={format?.label ?? ''}
                onChange={event => setMetricFormat({ label: event.target.value })}
                placeholder={metricsByKey.get(selected)?.label || 'Tên chỉ số'}
                className={inputClass}
              />
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <Row label="Số lẻ">
                <select aria-label="Số chữ số thập phân" value={format?.decimals ?? ''} onChange={event => setMetricFormat({ decimals: event.target.value === '' ? undefined : Number(event.target.value) })} className={inputClass}>
                  <option value="">Mặc định</option>
                  {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </Row>
              <Row label="Hậu tố">
                <input value={format?.suffix ?? ''} onChange={event => setMetricFormat({ suffix: event.target.value })} placeholder="hồ sơ, %, ..." className={inputClass} />
              </Row>
            </div>

            <fieldset className="rounded-lg border border-rule bg-white p-2.5">
              <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Tô màu theo ngưỡng</legend>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(highlight)}
                  onChange={event => setMetricFormat({ highlight: event.target.checked ? { operator: 'gte', value: 0, tone: 'risk' } : undefined })}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                Bật tô màu
              </label>
              {highlight && <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select aria-label="Phép so sánh" value={highlight.operator} onChange={event => setMetricFormat({ highlight: { ...highlight, operator: event.target.value as typeof highlight.operator } })} className={inputClass}>
                    {OPERATORS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <input
                    type="number"
                    aria-label="Ngưỡng"
                    value={highlight.value}
                    onChange={event => setMetricFormat({ highlight: { ...highlight, value: Number(event.target.value) || 0 } })}
                    className={inputClass}
                  />
                </div>
                <select aria-label="Màu tô" value={highlight.tone} onChange={event => setMetricFormat({ highlight: { ...highlight, tone: event.target.value as typeof highlight.tone } })} className={inputClass}>
                  {HIGHLIGHT_TONES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>}
            </fieldset>

            {/* Xem trước ngay tại chỗ: đặt số lẻ và hậu tố mà phải chạy lại báo cáo mới biết ra sao
                thì mỗi lần thử là một vòng chờ. */}
            <div className="rounded-lg bg-white px-2.5 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Xem trước</span>
              <span data-numeric className={`mt-1 inline-block rounded px-1.5 text-sm font-black tabular-nums ${HIGHLIGHT_TONES.find(tone => tone.value === highlight?.tone)?.swatch ?? 'text-slate-900'}`}>
                {formatReportMetricValue(sample, format)}
              </span>
            </div>

            <button type="button" onClick={() => setMetricFormat(null)} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rule bg-white text-[11px] font-bold text-slate-600 transition-colors hover:border-slate-400">
              <RotateCcw className="h-3 w-3" />Về mặc định
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

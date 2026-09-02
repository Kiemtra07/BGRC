import React from 'react';
import { Check, Columns3, Filter, Rows3, Sigma } from 'lucide-react';
import { ReportFieldDefinition, ReportFieldKey, ReportMetricDefinition, ReportMetricKey } from '../../../shared/contracts';

/**
 * Chọn một chiều rồi nói rõ nó đi đâu.
 *
 * Bản cũ để một cú bấm mang nghĩa ngầm: bấm vào chiều nào thì chiều đó lặng lẽ thành trường Hàng, và
 * nếu nó đang là Hàng hoặc Cột rồi thì lại lặng lẽ thành điều kiện lọc. Người dùng không có cách nào
 * biết vừa đưa cái gì vào đâu — cùng một thao tác cho ra ba kết quả khác nhau tuỳ trạng thái trước
 * đó. Ở đây mỗi chiều mở ra đúng ba lựa chọn, và chỗ nó đang nằm được đánh dấu sẵn.
 */
export type FieldZone = 'rows' | 'columns' | 'filters';

const ZONES: ReadonlyArray<{ zone: FieldZone; label: string; icon: React.ReactNode }> = [
  { zone: 'rows', label: 'Hàng', icon: <Rows3 className="h-3 w-3" /> },
  { zone: 'columns', label: 'Cột', icon: <Columns3 className="h-3 w-3" /> },
  { zone: 'filters', label: 'Bộ lọc', icon: <Filter className="h-3 w-3" /> },
];

const PLACEMENT_CLASS: Record<FieldZone, string> = {
  rows: 'border-brand-500 bg-brand-50 text-brand-700',
  columns: 'border-indigo-400 bg-indigo-50 text-indigo-700',
  filters: 'border-amber-400 bg-amber-50 text-amber-800',
};

const PLACEMENT_LABEL: Record<FieldZone, string> = { rows: 'Hàng', columns: 'Cột', filters: 'Lọc' };

interface FieldChipProps {
  field: ReportFieldDefinition;
  /** Vùng mà chiều này đang nằm, nếu có — hiện ngay trên chip. */
  placement?: FieldZone;
  /** Vùng mặc định khi người dùng chọn bằng chuột/bàn phím thay vì kéo thả. */
  defaultZone: FieldZone;
  onAssign: (zone: FieldZone) => void;
  onDragStart: (event: React.DragEvent) => void;
}

const FieldChip: React.FC<FieldChipProps> = ({ field, placement, defaultZone = 'columns', onAssign, onDragStart }) => (
  <button
    type="button"
    draggable
    onDragStart={onDragStart}
    onClick={() => onAssign(defaultZone)}
    aria-label={`${field.label}: thêm vào ${PLACEMENT_LABEL[defaultZone]}`}
    title={`${field.label} — bấm để thêm vào ${PLACEMENT_LABEL[defaultZone]}, hoặc kéo vào vùng bên dưới`}
    className={`inline-flex min-h-8 max-w-full cursor-grab items-center gap-1.5 rounded-lg border px-2.5 text-left text-[11px] font-bold leading-tight transition-colors active:cursor-grabbing ${placement ? PLACEMENT_CLASS[placement] : 'border-rule bg-white text-slate-700 hover:border-brand-300 hover:text-brand-600'}`}
  >
    <span className="max-w-[18rem] whitespace-normal break-words">{field.label}</span>
    {placement && <span className="shrink-0 rounded bg-white/70 px-1 text-[9px] font-black">{PLACEMENT_LABEL[placement]}</span>}
  </button>
);

interface ReportFieldChipsProps {
  fields: ReportFieldDefinition[];
  metrics: ReportMetricDefinition[];
  groupBy: ReportFieldKey;
  pivotBy?: ReportFieldKey;
  filterKeys: ReportFieldKey[];
  activeMetricKeys: ReportMetricKey[];
  /** Nơi cú bấm mặc định đưa chiều vào; mặc định là Cột theo cách làm của Cognos. */
  clickZone: FieldZone;
  onClickZoneChange: (zone: FieldZone) => void;
  onAssignField: (key: ReportFieldKey, zone: FieldZone) => void;
  onToggleMetric: (key: ReportMetricKey) => void;
  onDragStartField: (event: React.DragEvent, key: ReportFieldKey) => void;
  onDragStartMetric: (event: React.DragEvent, key: ReportMetricKey) => void;
}

/**
 * Dải chọn chiều và chỉ số, đặt ngay trên bốn vùng Hàng/Cột/Giá trị/Bộ lọc.
 *
 * Nằm cùng chỗ với các vùng là điều làm nó đọc được: thao tác chọn và nơi kết quả rơi vào cùng nằm
 * trong một tầm mắt, thay vì chọn ở thanh bên trái rồi phải nhìn sang chỗ khác mới biết đã xảy ra gì.
 */
export const ReportFieldChips: React.FC<ReportFieldChipsProps> = ({
  fields, metrics, groupBy, pivotBy, filterKeys, activeMetricKeys,
  clickZone, onClickZoneChange,
  onAssignField, onToggleMetric, onDragStartField, onDragStartMetric,
}) => {
  const placementOf = (key: ReportFieldKey): FieldZone | undefined =>
    key === groupBy ? 'rows' : key === pivotBy ? 'columns' : filterKeys.includes(key) ? 'filters' : undefined;

  return (
    <div className="space-y-2.5 rounded-xl border border-rule bg-slate-50 p-3">
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
          <Columns3 className="h-3 w-3" />Chiều phân tích
          <span className="font-semibold normal-case tracking-normal text-slate-400">— kéo vào vùng bên dưới hoặc bấm để thêm</span>
        </h3>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white/70 px-2 py-1.5 text-[10px] font-bold text-slate-500">
          <span className="mr-0.5">Bấm để thêm vào:</span>
          {ZONES.map(item => (
            <button
              key={item.zone}
              type="button"
              aria-pressed={clickZone === item.zone}
              onClick={() => onClickZoneChange(item.zone)}
              className={`inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] font-black transition-colors ${clickZone === item.zone ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
          <span className="text-slate-400">Cột là mặc định</span>
        </div>
        <div className="relative flex max-h-48 min-h-12 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
          {fields.map(field => (
            <FieldChip
              key={field.key}
              field={field}
              placement={placementOf(field.key)}
              defaultZone={clickZone}
              onAssign={zone => onAssignField(field.key, zone)}
              onDragStart={event => onDragStartField(event, field.key)}
            />
          ))}
          {!fields.length && <span className="text-[11px] text-slate-500">Không có chiều nào khớp từ khoá.</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
          <Sigma className="h-3 w-3" />Chỉ số
          <span className="font-semibold normal-case tracking-normal text-slate-400">— bấm để thêm hoặc bỏ khỏi vùng Giá trị</span>
        </h3>
        <div className="flex max-h-36 min-h-10 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
          {metrics.map(metric => {
            const used = activeMetricKeys.includes(metric.key);
            return (
              <button
                key={metric.key}
                type="button"
                draggable={!used}
                onDragStart={event => onDragStartMetric(event, metric.key)}
                onClick={() => onToggleMetric(metric.key)}
                aria-pressed={used}
                title={used ? `Bỏ ${metric.label} khỏi vùng Giá trị` : `Thêm ${metric.label} vào vùng Giá trị`}
                className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${used ? 'border-brand-500 bg-brand-50 text-brand-700' : 'cursor-grab border-rule bg-white text-slate-700 hover:border-brand-300 hover:text-brand-600 active:cursor-grabbing'}`}
              >
                {metric.label}
                {used && <Check className="h-3 w-3" aria-hidden />}
              </button>
            );
          })}
          {!metrics.length && <span className="text-[11px] text-slate-500">Không có chỉ số nào khớp từ khoá.</span>}
        </div>
      </div>
    </div>
  );
};

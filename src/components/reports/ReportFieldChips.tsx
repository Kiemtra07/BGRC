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
  { zone: 'rows', label: 'Nhóm theo', icon: <Rows3 className="h-3 w-3" /> },
  { zone: 'columns', label: 'Chia cột theo', icon: <Columns3 className="h-3 w-3" /> },
  { zone: 'filters', label: 'Bộ lọc', icon: <Filter className="h-3 w-3" /> },
];

const PLACEMENT_CLASS: Record<FieldZone, string> = {
  rows: 'border-brand-500 bg-brand-50 text-brand-700',
  columns: 'border-indigo-400 bg-indigo-50 text-indigo-700',
  filters: 'border-amber-400 bg-amber-50 text-amber-800',
};

const PLACEMENT_LABEL: Record<FieldZone, string> = { rows: 'Nhóm theo', columns: 'Chia cột', filters: 'Lọc' };

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
    title={`${field.label}: bấm để thêm vào ${PLACEMENT_LABEL[defaultZone]}, hoặc kéo vào vùng bên dưới`}
    className={`inline-flex min-h-8 max-w-full cursor-grab items-center gap-1.5 rounded-lg border px-2.5 text-left text-xs font-bold leading-tight transition-colors active:cursor-grabbing ${placement ? PLACEMENT_CLASS[placement] : 'border-rule bg-white text-slate-700 hover:border-brand-300 hover:text-brand-600'}`}
  >
    <span className="max-w-[18rem] whitespace-normal break-words">{field.label}</span>
    {placement && <span className="shrink-0 rounded bg-white/70 px-1 text-xs font-black">{PLACEMENT_LABEL[placement]}</span>}
  </button>
);

interface ReportFieldChipsProps {
  fields: ReportFieldDefinition[];
  metrics: ReportMetricDefinition[];
  groupBy: ReportFieldKey;
  pivotBy?: ReportFieldKey;
  filterKeys: ReportFieldKey[];
  activeMetricKeys: ReportMetricKey[];
  /** Nơi cú bấm mặc định đưa chiều vào. */
  clickZone: FieldZone;
  /** Ẩn vùng "Chia cột theo" khi người dùng chưa mở phần Nâng cao. */
  showColumnsZone?: boolean;
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
/** Nhóm trường theo việc người dùng định làm, để không phải đọc một dãy hai mươi trường liền nhau. */
const FIELD_GROUPS: ReadonlyArray<{ title: string; keys: readonly string[] }> = [
  { title: 'Đơn vị', keys: ['dimension.cluster', 'dimension.branch', 'dimension.department'] },
  { title: 'Khách hàng', keys: ['dimension.cif', 'dimension.customer', 'dimension.officer'] },
  { title: 'Lỗi', keys: ['dimension.error_code', 'dimension.error_group', 'dimension.business_line', 'dimension.risk_level', 'dimension.penalty_proposal'] },
  { title: 'Tiến độ và hạn', keys: ['dimension.workflow_status', 'dimension.sla_status', 'date.deadline', 'flag.overdue'] },
  { title: 'Nguồn kiểm tra', keys: ['dimension.channel', 'dimension.campaign', 'dimension.campaign_decision', 'dimension.inspection_team', 'dimension.source_record', 'date.audit'] },
];

export const ReportFieldChips: React.FC<ReportFieldChipsProps> = ({
  fields, metrics, groupBy, pivotBy, filterKeys, activeMetricKeys,
  clickZone, onClickZoneChange, showColumnsZone = true,
  onAssignField, onToggleMetric, onDragStartField, onDragStartMetric,
}) => {
  const placementOf = (key: ReportFieldKey): FieldZone | undefined =>
    key === groupBy ? 'rows' : key === pivotBy ? 'columns' : filterKeys.includes(key) ? 'filters' : undefined;

  const grouped = new Set<string>();
  const fieldGroups = FIELD_GROUPS.map(group => {
    const members = fields.filter(field => group.keys.includes(field.key));
    members.forEach(field => grouped.add(field.key));
    return { title: group.title, fields: members };
  }).filter(group => group.fields.length > 0);
  const others = fields.filter(field => !grouped.has(field.key));
  if (others.length > 0) fieldGroups.push({ title: 'Khác', fields: others });

  return (
    <div className="space-y-2.5 rounded-xl border border-rule bg-slate-50 p-3">
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
          <Columns3 className="h-3 w-3" />Trường để nhóm và lọc
          <span className="font-semibold normal-case tracking-normal text-slate-400">(kéo vào vùng bên dưới hoặc bấm để thêm)</span>
        </h3>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white/70 px-2 py-1.5 text-xs font-bold text-slate-500">
          <span className="mr-0.5">Bấm một trường sẽ đưa vào:</span>
          {ZONES.filter(item => showColumnsZone || item.zone !== 'columns').map(item => (
            <button
              key={item.zone}
              type="button"
              aria-pressed={clickZone === item.zone}
              onClick={() => onClickZoneChange(item.zone)}
              className={`inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-black transition-colors ${clickZone === item.zone ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {fieldGroups.map((group, index) => (
            <details key={group.title} open={index === 0 || group.fields.some(field => placementOf(field.key))} className="rounded-lg border border-rule bg-white">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-slate-700">
                <span>{group.title}</span>
                <span className="text-xs font-semibold text-slate-400">{group.fields.length} trường</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 border-t border-rule p-2">
                {group.fields.map(field => (
                  <FieldChip
                    key={field.key}
                    field={field}
                    placement={placementOf(field.key)}
                    defaultZone={clickZone}
                    onAssign={zone => onAssignField(field.key, zone)}
                    onDragStart={event => onDragStartField(event, field.key)}
                  />
                ))}
              </div>
            </details>
          ))}
          {!fields.length && <span className="text-xs text-slate-500">Quản trị viên chưa bật trường nào để nhóm.</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
          <Sigma className="h-3 w-3" />Số cần đo
          <span className="font-semibold normal-case tracking-normal text-slate-400">(bấm để thêm hoặc bỏ khỏi vùng Đo bằng)</span>
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
                title={used ? `Bỏ ${metric.label} khỏi vùng Đo bằng` : `Thêm ${metric.label} vào vùng Đo bằng`}
                className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold transition-colors ${used ? 'border-brand-500 bg-brand-50 text-brand-700' : 'cursor-grab border-rule bg-white text-slate-700 hover:border-brand-300 hover:text-brand-600 active:cursor-grabbing'}`}
              >
                {metric.label}
                {used && <Check className="h-3 w-3" aria-hidden />}
              </button>
            );
          })}
          {!metrics.length && <span className="text-xs text-slate-500">Không có chỉ số nào khớp từ khoá.</span>}
        </div>
      </div>
    </div>
  );
};

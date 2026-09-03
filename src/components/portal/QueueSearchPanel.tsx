import React from 'react';
import { Search, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  AuditCampaign, BUSINESS_LINES, Finding, OrgUnit, RISK_LEVELS, ReportChannel,
  businessLineLabels, riskLevelLabels,
} from '../../../shared/contracts';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';

/**
 * Điều kiện được gửi thẳng xuống máy chủ, không phải bộ lọc chạy trên trình duyệt.
 *
 * Đây là điểm khác nhau quan trọng: bộ lọc phễu trong danh sách chỉ lọc lại phần đã tải về, còn
 * những trường ở đây quyết định hồ sơ nào được tải về ngay từ đầu. Nhờ vậy một chuyên đề vài chục
 * hồ sơ chỉ kéo đúng vài chục hồ sơ, thay vì kéo cả phạm vi dữ liệu rồi mới giấu bớt đi.
 */
export interface QueueSearchCriteria {
  campaignId: string;
  channelId: string;
  branchCode: string;
  department: string;
  clusterName: string;
  workflowStatus: string;
  slaStatus: string;
  errorCode: string;
  errorGroup: string;
  officerName: string;
  riskLevel: string;
  businessLine: string;
  /** Ba trường sau đi xuống máy chủ dưới dạng chuỗi: `'true'` hoặc `'YES'`/`'NO'`. */
  unresolvedOnly: string;
  specialOnly: string;
  hasEvidence: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const emptySearchCriteria = (channelId = ''): QueueSearchCriteria => ({
  campaignId: '', channelId, branchCode: '', department: '', clusterName: '',
  workflowStatus: '', slaStatus: '', errorCode: '', errorGroup: '', officerName: '',
  riskLevel: '', businessLine: '', unresolvedOnly: '', specialOnly: '', hasEvidence: '',
  dateFrom: '', dateTo: '', search: '',
});

/** Chỉ những trường thực sự có giá trị mới thành query string, để URL phản ánh đúng điều kiện. */
export const criteriaToQuery = (criteria: QueueSearchCriteria): Record<string, string> =>
  Object.fromEntries(
    Object.entries(criteria).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())),
  );

export const countCriteria = (criteria: QueueSearchCriteria): number =>
  Object.values(criteria).filter(value => Boolean(value?.trim())).length;

/** Những trường nằm sau nút Bộ lọc; chuyên đề và từ khoá luôn hiện nên không tính vào đây. */
const ADVANCED_KEYS: ReadonlyArray<keyof QueueSearchCriteria> = [
  'channelId', 'branchCode', 'department', 'clusterName', 'workflowStatus', 'slaStatus',
  'errorCode', 'errorGroup', 'officerName', 'riskLevel', 'businessLine',
  'unresolvedOnly', 'specialOnly', 'hasEvidence', 'dateFrom', 'dateTo',
];

const WORKFLOW_OPTIONS: SelectOption[] = [
  { value: 'PENDING', label: 'Chờ chi nhánh xử lý' },
  { value: 'SUBMITTED_BRANCH', label: 'Chờ kiểm soát chi nhánh' },
  { value: 'SUBMITTED_BRANCH_LEADER', label: 'Chờ lãnh đạo chi nhánh' },
  { value: 'SUBMITTED_INTERNAL', label: 'Chờ phê duyệt Hội sở' },
  { value: 'REJECTED', label: 'Cần bổ sung' },
  { value: 'WAIVED_RESOLVED', label: 'Đã đóng lỗi' },
];

const SLA_OPTIONS: SelectOption[] = [
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'DUE_SOON', label: 'Sắp đến hạn' },
  { value: 'ON_TRACK', label: 'Trong hạn' },
];

const RISK_OPTIONS: SelectOption[] = RISK_LEVELS.map(level => ({ value: level, label: riskLevelLabels[level] }));
const BUSINESS_OPTIONS: SelectOption[] = BUSINESS_LINES.map(line => ({ value: line, label: businessLineLabels[line] }));
const EVIDENCE_OPTIONS: SelectOption[] = [
  { value: 'YES', label: 'Đã có minh chứng' },
  { value: 'NO', label: 'Chưa có minh chứng' },
];

const dateClass = 'min-h-10 w-full rounded-lg border border-rule bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-brand-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    {children}
  </label>
);

/** Ô tick cho hai điều kiện chỉ có bật/tắt, không đáng chiếm cả một dropdown. */
const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-rule text-slate-600 hover:border-slate-400'}`}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-3.5 w-3.5 accent-brand-500" />
    {label}
  </label>
);

/**
 * Lựa chọn cho những trường mà chỉ dữ liệu mới biết có gì: mã lỗi, nhóm lỗi, phòng, cụm, cán bộ.
 *
 * Giá trị đến từ kho gom dồn ở `App`, không phải từ hồ sơ đang hiển thị. Lấy thẳng từ hồ sơ đang
 * hiển thị thì bộ lọc tự bóp nghẹt chính nó — lọc theo một mã lỗi xong là dropdown chỉ còn đúng mã
 * đó. Giá trị đang chọn luôn được giữ trong danh sách, kể cả khi kho chưa kịp có nó.
 */
const facetOptions = (values: string[] | undefined, selected: string): SelectOption[] => {
  const all = new Set(values ?? []);
  if (selected) all.add(selected);
  return [...all].sort((a, b) => a.localeCompare(b, 'vi')).map(value => ({ value, label: value }));
};

interface QueueSearchPanelProps {
  criteria: QueueSearchCriteria;
  campaigns: AuditCampaign[];
  channels: ReportChannel[];
  orgUnits: OrgUnit[];
  /** Kho giá trị đã thấy cho các trường phụ thuộc dữ liệu, khoá theo tên trường của `Finding`. */
  facetValues: Record<string, string[]>;
  busy: boolean;
  onChange: (criteria: QueueSearchCriteria) => void;
  onSearch: () => void;
  onReset: () => void;
}

export const QueueSearchPanel: React.FC<QueueSearchPanelProps> = ({
  criteria, campaigns, channels, orgUnits, facetValues, busy, onChange, onSearch, onReset,
}) => {
  // Mọi trường nâng cao nằm sau một nút gạt. Hàng luôn hiện chỉ giữ ba thứ trả lời được câu hỏi
  // thường gặp nhất — chuyên đề nào, tìm chữ gì — nên mở màn hình lên là bấm tìm được ngay.
  const [expanded, setExpanded] = React.useState(false);

  const set = <K extends keyof QueueSearchCriteria>(key: K, value: QueueSearchCriteria[K]) =>
    onChange({ ...criteria, [key]: value });

  const campaignOptions: SelectOption[] = campaigns.map(campaign => ({
    value: campaign.id, label: `${campaign.code} · ${campaign.name}`,
  }));
  const showChannelFilter = channels.length > 1;
  const channelOptions: SelectOption[] = channels.map(channel => ({ value: channel.id, label: channel.name }));
  const branchOptions: SelectOption[] = orgUnits
    .filter(unit => unit.type === 'BRANCH' && unit.isActive)
    .map(unit => ({ value: unit.code, label: unit.code, detail: unit.name }));

  const dataOptions = React.useMemo(() => ({
    cluster: facetOptions(facetValues.clusterName, criteria.clusterName),
    department: facetOptions(facetValues.department, criteria.department),
    errorCode: facetOptions(facetValues.errorCode, criteria.errorCode),
    errorGroup: facetOptions(facetValues.errorGroup, criteria.errorGroup),
    officer: facetOptions(facetValues.officerName, criteria.officerName),
  }), [facetValues, criteria.clusterName, criteria.department, criteria.errorCode, criteria.errorGroup, criteria.officerName]);

  const advancedCount = ADVANCED_KEYS.filter(key => (key !== 'channelId' || showChannelFilter) && Boolean(criteria[key]?.trim())).length;
  const anyCriteria = countCriteria(criteria) > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // Bấm Tìm kiếm là lúc các trường nâng cao hết việc: trả lại chỗ cho kết quả vừa xin về, thay vì
    // để chúng đẩy chính danh sách xuống dưới màn hình đầu tiên. Điều kiện đã chọn không mất — số
    // trên nút Bộ lọc nói còn mấy điều kiện đang áp dụng, mở lại là thấy nguyên vẹn.
    setExpanded(false);
    onSearch();
  };

  return (
    <form onSubmit={submit} aria-label="Điều kiện tải danh sách hồ sơ" className="rounded-2xl border border-rule bg-white p-3 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <SearchableSelect
            value={criteria.campaignId}
            options={campaignOptions}
            emptyLabel="Tất cả chuyên đề"
            ariaLabel="Chuyên đề"
            onChange={value => set('campaignId', value)}
          />
        </div>
        <label className="relative min-w-0 flex-1 basis-full sm:basis-52">
          <span className="sr-only">Từ khoá</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
          {/* Không có `autoComplete="off"` thì trình duyệt coi ô trống này là ô đăng nhập và tự
              điền email của người dùng vào, khiến lần tìm đầu tiên chạy với một từ khoá không ai gõ
              và trả về 0 kết quả một cách khó hiểu. */}
          <input
            name="queue-keyword"
            autoComplete="off"
            value={criteria.search}
            onChange={event => set('search', event.target.value)}
            placeholder="CIF, khách hàng, mã lỗi..."
            className="min-h-10 w-full rounded-lg border border-rule bg-white pl-8 pr-2.5 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-brand-500"
          />
        </label>

        <button
          type="button"
          onClick={() => setExpanded(open => !open)}
          aria-expanded={expanded}
          aria-controls="queue-search-advanced"
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors ${advancedCount > 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : expanded ? 'border-brand-300 text-brand-600' : 'border-rule text-slate-600 hover:border-slate-400'}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Bộ lọc</span>
          {advancedCount > 0 && <span data-numeric className="rounded bg-brand-500 px-1 text-[10px] font-black text-white">{advancedCount}</span>}
        </button>
        {anyCriteria && (
          <button type="button" onClick={onReset} title="Xoá điều kiện" aria-label="Xoá điều kiện" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-rule text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="submit" disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
          {busy
            ? <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            : <Search className="h-3.5 w-3.5" />}
          Tìm kiếm
        </button>
      </div>

      {expanded && (
        <div id="queue-search-advanced" className="mt-3 space-y-3 border-t border-rule pt-3">
          {/* Ba nhóm, mỗi nhóm trả lời một câu hỏi: ở đâu, tình trạng nào, lỗi gì. Mười sáu ô xếp
              thành một khối liền mạch thì không ai đọc nổi. */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {showChannelFilter && <Field label="Kênh dữ liệu">
              <SearchableSelect value={criteria.channelId} options={channelOptions} emptyLabel="Tất cả kênh" ariaLabel="Kênh dữ liệu" onChange={value => set('channelId', value)} />
            </Field>}
            <Field label="Cụm">
              <SearchableSelect value={criteria.clusterName} options={dataOptions.cluster} emptyLabel="Tất cả cụm" ariaLabel="Cụm" onChange={value => set('clusterName', value)} />
            </Field>
            <Field label="Chi nhánh">
              <SearchableSelect value={criteria.branchCode} options={branchOptions} emptyLabel="Toàn bộ chi nhánh" ariaLabel="Chi nhánh" onChange={value => set('branchCode', value)} />
            </Field>
            <Field label="Phòng">
              <SearchableSelect value={criteria.department} options={dataOptions.department} emptyLabel="Tất cả phòng" ariaLabel="Phòng" onChange={value => set('department', value)} />
            </Field>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tình trạng xử lý">
              <SearchableSelect value={criteria.workflowStatus} options={WORKFLOW_OPTIONS} emptyLabel="Mọi tình trạng" ariaLabel="Tình trạng xử lý" onChange={value => set('workflowStatus', value)} />
            </Field>
            <Field label="Hạn xử lý">
              <SearchableSelect value={criteria.slaStatus} options={SLA_OPTIONS} emptyLabel="Mọi mức hạn" ariaLabel="Hạn xử lý" onChange={value => set('slaStatus', value)} />
            </Field>
            <Field label="Ngày kiểm tra từ">
              <input type="date" value={criteria.dateFrom} max={criteria.dateTo || undefined} onChange={event => set('dateFrom', event.target.value)} className={dateClass} />
            </Field>
            <Field label="Đến ngày">
              <input type="date" value={criteria.dateTo} min={criteria.dateFrom || undefined} onChange={event => set('dateTo', event.target.value)} className={dateClass} />
            </Field>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mã lỗi">
              <SearchableSelect value={criteria.errorCode} options={dataOptions.errorCode} emptyLabel="Tất cả mã lỗi" ariaLabel="Mã lỗi" onChange={value => set('errorCode', value)} />
            </Field>
            <Field label="Nhóm lỗi">
              <SearchableSelect value={criteria.errorGroup} options={dataOptions.errorGroup} emptyLabel="Tất cả nhóm lỗi" ariaLabel="Nhóm lỗi" onChange={value => set('errorGroup', value)} />
            </Field>
            <Field label="Cán bộ QLKH">
              <SearchableSelect value={criteria.officerName} options={dataOptions.officer} emptyLabel="Tất cả cán bộ" ariaLabel="Cán bộ QLKH" onChange={value => set('officerName', value)} />
            </Field>
            <Field label="Mức rủi ro">
              <SearchableSelect value={criteria.riskLevel} options={RISK_OPTIONS} emptyLabel="Mọi mức rủi ro" ariaLabel="Mức rủi ro" onChange={value => set('riskLevel', value)} />
            </Field>
          </div>

          <div className="grid items-end gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mảng nghiệp vụ">
              <SearchableSelect value={criteria.businessLine} options={BUSINESS_OPTIONS} emptyLabel="Mọi mảng" ariaLabel="Mảng nghiệp vụ" onChange={value => set('businessLine', value)} />
            </Field>
            <Field label="Minh chứng">
              <SearchableSelect value={criteria.hasEvidence} options={EVIDENCE_OPTIONS} emptyLabel="Không xét minh chứng" ariaLabel="Minh chứng" onChange={value => set('hasEvidence', value)} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Toggle label="Chỉ hồ sơ chưa xử lý" checked={criteria.unresolvedOnly === 'true'} onChange={checked => set('unresolvedOnly', checked ? 'true' : '')} />
              <Toggle label="Chỉ trường hợp đặc biệt" checked={criteria.specialOnly === 'true'} onChange={checked => set('specialOnly', checked ? 'true' : '')} />
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

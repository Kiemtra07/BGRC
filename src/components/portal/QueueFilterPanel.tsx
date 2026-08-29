import React from 'react';
import { Funnel, Search, X } from 'lucide-react';
import { Finding, RISK_LEVELS, BUSINESS_LINES, businessLineLabels, riskLevelLabels } from '../../../shared/contracts';
import { slaStatusLabels } from '../../content/ui-copy';

/**
 * Every filter the hồ sơ queue supports, in one place.
 *
 * The panel is collapsed behind a funnel by default: an operator opens the queue to work, not to
 * configure it, and eleven permanently-visible controls would push the actual list below the fold.
 * The funnel carries a count so a narrowed queue can never be mistaken for an empty one.
 */
export interface QueueFilters {
  branchCode: string;
  department: string;
  clusterName: string;
  errorCode: string;
  errorGroup: string;
  officerName: string;
  sla: string;
  riskLevel: string;
  businessLine: string;
  unresolvedOnly: boolean;
  specialOnly: boolean;
  hasEvidence: string;
  auditFrom: string;
  auditTo: string;
}

export const emptyQueueFilters = (): QueueFilters => ({
  branchCode: 'ALL', department: 'ALL', clusterName: 'ALL', errorCode: 'ALL', errorGroup: 'ALL',
  officerName: 'ALL', sla: 'ALL', riskLevel: 'ALL', businessLine: 'ALL',
  unresolvedOnly: false, specialOnly: false, hasEvidence: 'ALL', auditFrom: '', auditTo: '',
});

export const countActiveFilters = (filters: QueueFilters): number =>
  Object.entries(filters).filter(([, value]) => value !== 'ALL' && value !== false && value !== '').length;

/** A hồ sơ is "chưa xử lý" until Hội sở closes it. */
const isUnresolved = (finding: Finding) => finding.workflowStatus !== 'WAIVED_RESOLVED';

export const matchesQueueFilters = (finding: Finding, filters: QueueFilters): boolean => {
  if (filters.branchCode !== 'ALL' && finding.branchCode !== filters.branchCode) return false;
  if (filters.department !== 'ALL' && (finding.department || '') !== filters.department) return false;
  if (filters.clusterName !== 'ALL' && finding.clusterName !== filters.clusterName) return false;
  if (filters.errorCode !== 'ALL' && finding.errorCode !== filters.errorCode) return false;
  if (filters.errorGroup !== 'ALL' && (finding.errorGroup || '') !== filters.errorGroup) return false;
  if (filters.officerName !== 'ALL' && (finding.officerName || '') !== filters.officerName) return false;
  if (filters.sla !== 'ALL') {
    const effective = finding.isOverdue ? 'OVERDUE' : finding.slaStatus;
    if (effective !== filters.sla) return false;
  }
  if (filters.riskLevel !== 'ALL' && finding.riskLevel !== filters.riskLevel) return false;
  if (filters.businessLine !== 'ALL' && finding.businessLine !== filters.businessLine) return false;
  if (filters.unresolvedOnly && !isUnresolved(finding)) return false;
  if (filters.specialOnly && !finding.isSpecialCase) return false;
  if (filters.hasEvidence !== 'ALL') {
    const attached = (finding.evidences?.length ?? 0) > 0;
    if (attached !== (filters.hasEvidence === 'YES')) return false;
  }
  // Ngày kiểm tra may be absent on hand-created hồ sơ; fall back to the day it was raised so a
  // date range never silently drops records that do have a meaningful date.
  const day = finding.auditDate || finding.createdAt.slice(0, 10);
  if (filters.auditFrom && day < filters.auditFrom) return false;
  if (filters.auditTo && day > filters.auditTo) return false;
  return true;
};

const selectClass = 'min-h-9 w-full rounded-lg border border-rule bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500';

/** Options come from the loaded hồ sơ, so the panel never offers a filter that matches nothing. */
const optionsOf = (findings: Finding[], pick: (finding: Finding) => string | undefined): string[] =>
  [...new Set(findings.map(pick).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'vi'));

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
    {children}
  </label>
);

interface Props {
  open: boolean;
  /** The draft being edited. Nothing reaches the queue until `onApply`. */
  filters: QueueFilters;
  dirty: boolean;
  findings: Finding[];
  onChange: (filters: QueueFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export const QueueFilterPanel: React.FC<Props> = ({ open, filters, dirty, findings, onChange, onApply, onClear, onClose }) => {
  if (!open) return null;
  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) => onChange({ ...filters, [key]: value });
  const branches = [...new Map(findings.map(f => [f.branchCode, `${f.branchCode} · ${f.branchName}`])).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  const active = countActiveFilters(filters);

  return (
    // Enter anywhere in the panel applies, which is what a form full of selects should do.
    <form
      data-testid="queue-filter-panel"
      onSubmit={event => { event.preventDefault(); onApply(); }}
      className="border-b border-rule bg-slate-50/70 p-3 sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <Funnel className="h-3.5 w-3.5" />Bộ lọc hồ sơ{active > 0 && <span data-numeric className="rounded bg-brand-500 px-1.5 text-[10px] font-black text-white">{active}</span>}
        </span>
        <div className="flex items-center gap-2">
          {active > 0 && <button type="button" onClick={onClear} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rule bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:border-risk-border hover:text-risk"><X className="h-3.5 w-3.5" />Xóa bộ lọc</button>}
          <button type="button" onClick={onClose} className="inline-flex min-h-8 items-center rounded-lg border border-rule bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:border-slate-400">Thu gọn</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Field label="Chi nhánh">
          <select className={selectClass} value={filters.branchCode} onChange={e => set('branchCode', e.target.value)}>
            <option value="ALL">Mọi chi nhánh</option>
            {branches.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>

        <Field label="Phòng / PGD">
          <select className={selectClass} value={filters.department} onChange={e => set('department', e.target.value)}>
            <option value="ALL">Mọi phòng</option>
            {optionsOf(findings, f => f.department).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>

        <Field label="Cụm địa bàn">
          <select className={selectClass} value={filters.clusterName} onChange={e => set('clusterName', e.target.value)}>
            <option value="ALL">Mọi cụm</option>
            {optionsOf(findings, f => f.clusterName).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>

        <Field label="Mã lỗi">
          <select className={selectClass} value={filters.errorCode} onChange={e => set('errorCode', e.target.value)}>
            <option value="ALL">Mọi mã lỗi</option>
            {optionsOf(findings, f => f.errorCode).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>

        <Field label="Nhóm lỗi">
          <select className={selectClass} value={filters.errorGroup} onChange={e => set('errorGroup', e.target.value)}>
            <option value="ALL">Mọi nhóm lỗi</option>
            {optionsOf(findings, f => f.errorGroup).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>

        <Field label="Cán bộ QLKH">
          <select className={selectClass} value={filters.officerName} onChange={e => set('officerName', e.target.value)}>
            <option value="ALL">Mọi cán bộ</option>
            {optionsOf(findings, f => f.officerName).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>

        <Field label="Hạn xử lý">
          <select className={selectClass} value={filters.sla} onChange={e => set('sla', e.target.value)}>
            <option value="ALL">Mọi hạn xử lý</option>
            {(['OVERDUE', 'DUE_SOON', 'ON_TRACK', 'CLOSED'] as const).map(value => <option key={value} value={value}>{slaStatusLabels[value]}</option>)}
          </select>
        </Field>

        <Field label="Mức độ rủi ro">
          <select className={selectClass} value={filters.riskLevel} onChange={e => set('riskLevel', e.target.value)}>
            <option value="ALL">Mọi mức độ</option>
            {RISK_LEVELS.map(value => <option key={value} value={value}>{riskLevelLabels[value]}</option>)}
          </select>
        </Field>

        <Field label="Loại nghiệp vụ">
          <select className={selectClass} value={filters.businessLine} onChange={e => set('businessLine', e.target.value)}>
            <option value="ALL">Mọi nghiệp vụ</option>
            {BUSINESS_LINES.map(value => <option key={value} value={value}>{businessLineLabels[value]}</option>)}
          </select>
        </Field>

        <Field label="Tài liệu đính kèm">
          <select className={selectClass} value={filters.hasEvidence} onChange={e => set('hasEvidence', e.target.value)}>
            <option value="ALL">Không xét</option>
            <option value="YES">Đã có tài liệu</option>
            <option value="NO">Chưa có tài liệu</option>
          </select>
        </Field>

        <Field label="Ngày kiểm tra từ">
          <input type="date" className={selectClass} value={filters.auditFrom} onChange={e => set('auditFrom', e.target.value)} />
        </Field>

        <Field label="Đến ngày">
          <input type="date" className={selectClass} value={filters.auditTo} onChange={e => set('auditTo', e.target.value)} />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${filters.unresolvedOnly ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-rule bg-white text-slate-600 hover:border-brand-300'}`}>
          <input type="checkbox" className="accent-brand-500" checked={filters.unresolvedOnly} onChange={e => set('unresolvedOnly', e.target.checked)} />
          Chỉ lỗi chưa xử lý
        </label>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${filters.specialOnly ? 'border-warn-border bg-warn-surface text-warn' : 'border-rule bg-white text-slate-600 hover:border-brand-300'}`}>
          <input type="checkbox" className="accent-brand-500" checked={filters.specialOnly} onChange={e => set('specialOnly', e.target.checked)} />
          Chỉ trường hợp đặc biệt
        </label>

        {/* Nothing is applied until this is pressed, so an unapplied edit has to be visible —
            otherwise the panel would look like it had already filtered the list behind it. */}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] font-semibold text-warn">Có thay đổi chưa áp dụng</span>}
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white shadow-raised transition-colors hover:bg-brand-600"
          >
            <Search className="h-4 w-4" />Tìm kiếm
          </button>
        </div>
      </div>
    </form>
  );
};

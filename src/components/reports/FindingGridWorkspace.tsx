import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Paperclip, Send, Undo2 } from 'lucide-react';
import { Finding, RiskLevel, UserProfile, riskLevelLabels } from '../../../shared/contracts';
import { api } from '../../services/api';
import { workflowStatusLabels } from '../../content/ui-copy';

interface Props {
  findings: Finding[];
  currentUser: UserProfile;
  onOpenCase: (finding: Finding) => void;
  onChanged: () => void | Promise<void>;
}

type BulkAction = 'SUBMIT' | 'BRANCH_APPROVE' | 'BRANCH_REJECT' | 'INTERNAL_WAIVE' | 'INTERNAL_REJECT';

interface BulkOutcome {
  succeeded: number;
  failures: Array<{ label: string; reason: string }>;
}

const riskTone: Record<RiskLevel, string> = {
  CAO: 'bg-red-50 text-red-800 ring-red-200',
  TRUNG_BINH: 'bg-amber-50 text-amber-800 ring-amber-200',
  THAP: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const DRAFT_STORAGE_KEY = 'auditbgs.grid-drafts.v1';

/** Notes typed but not yet submitted. Kept locally so a refresh does not discard typed work. */
const loadDrafts = (): Record<string, string> => {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch { return {}; }
};

/**
 * Tabular capture screen for report types configured as "Dạng bảng Excel". A branch officer types
 * the giải trình straight into the row and pushes selected rows through the approval chain without
 * opening each hồ sơ — the case-review screen stays for report types that require evidence.
 */
export const FindingGridWorkspace: React.FC<Props> = ({ findings, currentUser, onOpenCase, onChanged }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>(loadDrafts);
  const [running, setRunning] = useState<BulkAction | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [reason, setReason] = useState('');
  const [decisionNumber, setDecisionNumber] = useState('');

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts)); } catch { /* quota or private mode */ }
  }, [drafts]);

  const isBranchInput = currentUser.roles.includes('BRANCH_INPUT');
  const isBranchController = currentUser.roles.includes('BRANCH_CONTROLLER');
  const isInternalApprover = currentUser.roles.some(role => ['INTERNAL_APPROVER', 'SUPERVISOR'].includes(role));

  const noteFor = (finding: Finding) => drafts[finding.id] ?? finding.resolutionNotes ?? '';

  /**
   * A finding whose report type requires evidence cannot be completed from the grid: the file has
   * to be attached against the hồ sơ first. Those rows stay read-only here by design.
   */
  const needsCaseScreen = (finding: Finding) => finding.evidenceRequired !== false;

  const actionableIn = (statuses: Finding['workflowStatus'][], allowed: boolean) =>
    findings.filter(finding => allowed && statuses.includes(finding.workflowStatus));

  const submittable = actionableIn(['PENDING', 'REJECTED'], isBranchInput).filter(finding => !needsCaseScreen(finding));
  const branchReviewable = actionableIn(['SUBMITTED_BRANCH'], isBranchController);
  const internalReviewable = actionableIn(['SUBMITTED_INTERNAL'], isInternalApprover);

  const eligibleFor = (action: BulkAction): Finding[] => {
    const pool = action === 'SUBMIT' ? submittable
      : action === 'BRANCH_APPROVE' || action === 'BRANCH_REJECT' ? branchReviewable
        : internalReviewable;
    return pool.filter(finding => selected.has(finding.id));
  };

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectableIds = useMemo(
    () => new Set([...submittable, ...branchReviewable, ...internalReviewable].map(finding => finding.id)),
    [findings, currentUser],
  );
  const allSelected = selectableIds.size > 0 && [...selectableIds].every(id => selected.has(id));

  const runBulk = async (action: BulkAction) => {
    const targets = eligibleFor(action);
    if (!targets.length) return;
    setRunning(action);
    setOutcome(null);
    const failures: BulkOutcome['failures'] = [];
    let succeeded = 0;

    // Each row goes through the same versioned, idempotent single-finding command the case screen
    // uses, so a partial failure leaves every other row correctly applied and individually reported.
    for (const finding of targets) {
      const label = `${finding.cif} · ${finding.errorCode}`;
      try {
        if (action === 'SUBMIT') {
          await api.submitBranch(finding.id, { expectedVersion: finding.version, resolutionNotes: noteFor(finding).trim() });
        } else if (action === 'BRANCH_APPROVE') {
          await api.branchControlApprove(finding.id, { expectedVersion: finding.version });
        } else if (action === 'BRANCH_REJECT') {
          await api.branchControlReject(finding.id, { expectedVersion: finding.version, reason: reason.trim() });
        } else if (action === 'INTERNAL_WAIVE') {
          await api.internalWaive(finding.id, { expectedVersion: finding.version, decisionNumber: decisionNumber.trim() });
        } else {
          await api.internalReject(finding.id, { expectedVersion: finding.version, reason: reason.trim() });
        }
        succeeded += 1;
        if (action === 'SUBMIT') setDrafts(current => { const next = { ...current }; delete next[finding.id]; return next; });
      } catch (error) {
        failures.push({ label, reason: error instanceof Error ? error.message : 'Không rõ nguyên nhân.' });
      }
    }

    setSelected(new Set());
    setRunning(null);
    setOutcome({ succeeded, failures });
    await onChanged();
  };

  const submitBlocked = eligibleFor('SUBMIT').some(finding => noteFor(finding).trim().length < 5);
  const evidenceBoundCount = findings.filter(finding => needsCaseScreen(finding) && ['PENDING', 'REJECTED'].includes(finding.workflowStatus)).length;

  return <section className="space-y-3" data-testid="finding-grid-workspace">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <h3 className="text-sm font-black text-slate-900">Nhập liệu dạng bảng</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">Nhập giải trình thẳng vào ô, chọn dòng rồi đẩy duyệt theo cấp. {selected.size > 0 && <strong className="text-[#006b68]">Đang chọn {selected.size} dòng.</strong>}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {isBranchInput && <button type="button" disabled={!eligibleFor('SUBMIT').length || submitBlocked || running !== null} onClick={() => void runBulk('SUBMIT')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006b68] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">{running === 'SUBMIT' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Đẩy duyệt ({eligibleFor('SUBMIT').length})</button>}
        {isBranchController && <>
          <button type="button" disabled={!eligibleFor('BRANCH_APPROVE').length || running !== null} onClick={() => void runBulk('BRANCH_APPROVE')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006b68] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">{running === 'BRANCH_APPROVE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyệt ({eligibleFor('BRANCH_APPROVE').length})</button>
          <button type="button" disabled={!eligibleFor('BRANCH_REJECT').length || reason.trim().length < 5 || running !== null} onClick={() => void runBulk('BRANCH_REJECT')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 disabled:opacity-40"><Undo2 className="h-4 w-4" />Chuyển trả</button>
        </>}
        {isInternalApprover && <>
          <button type="button" disabled={!eligibleFor('INTERNAL_WAIVE').length || decisionNumber.trim().length < 2 || running !== null} onClick={() => void runBulk('INTERNAL_WAIVE')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#006b68] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40">{running === 'INTERNAL_WAIVE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Đóng lỗi ({eligibleFor('INTERNAL_WAIVE').length})</button>
          <button type="button" disabled={!eligibleFor('INTERNAL_REJECT').length || reason.trim().length < 5 || running !== null} onClick={() => void runBulk('INTERNAL_REJECT')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 disabled:opacity-40"><Undo2 className="h-4 w-4" />Từ chối</button>
        </>}
      </div>
    </div>

    {(isBranchController || isInternalApprover) && <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[11px] font-bold text-slate-600">Lý do chuyển trả / từ chối<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Tối thiểu 5 ký tự" className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-xs" /></label>
      {isInternalApprover && <label className="text-[11px] font-bold text-slate-600">Số quyết định bỏ lỗi<input value={decisionNumber} onChange={event => setDecisionNumber(event.target.value)} placeholder="Ví dụ: 1234/QĐ-BIDV" className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs" /></label>}
    </div>}

    {evidenceBoundCount > 0 && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
      <Paperclip className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{evidenceBoundCount} hồ sơ yêu cầu tài liệu đính kèm nên không đẩy duyệt được từ bảng. Mở từng hồ sơ để tải minh chứng rồi mới duyệt.</span>
    </p>}

    {outcome && <div role="status" className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${outcome.failures.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-teal-200 bg-teal-50 text-[#006b68]'}`}>
      <p className="flex items-center gap-2">{outcome.failures.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Đã xử lý {outcome.succeeded} dòng{outcome.failures.length ? `, ${outcome.failures.length} dòng lỗi:` : '.'}</p>
      {outcome.failures.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 font-normal">{outcome.failures.map(item => <li key={item.label}><strong>{item.label}</strong> — {item.reason}</li>)}</ul>}
    </div>}

    <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Chọn tất cả dòng thao tác được" className="h-4 w-4 accent-[#006b68]" checked={allSelected} disabled={selectableIds.size === 0} onChange={event => setSelected(event.target.checked ? new Set(selectableIds) : new Set())} /></th>
            <th className="px-3 py-2">CIF / Khách hàng</th>
            <th className="px-3 py-2">Mã lỗi</th>
            <th className="px-3 py-2">Tên tồn tại, sai sót</th>
            <th className="px-3 py-2">Rủi ro</th>
            <th className="px-3 py-2">Trạng thái</th>
            <th className="px-3 py-2">Hạn</th>
            <th className="min-w-[280px] px-3 py-2">Giải trình khắc phục</th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {findings.map(finding => {
            const locked = needsCaseScreen(finding);
            const editable = isBranchInput && !locked && ['PENDING', 'REJECTED'].includes(finding.workflowStatus);
            const note = noteFor(finding);
            const unsent = editable && note.trim() !== (finding.resolutionNotes ?? '').trim();
            return <tr key={finding.id} className={selected.has(finding.id) ? 'bg-teal-50/50' : undefined}>
              <td className="px-3 py-2 align-top"><input type="checkbox" aria-label={`Chọn ${finding.cif} ${finding.errorCode}`} className="mt-1 h-4 w-4 accent-[#006b68]" checked={selected.has(finding.id)} disabled={!selectableIds.has(finding.id)} onChange={() => toggle(finding.id)} /></td>
              <td className="px-3 py-2 align-top"><div className="font-bold text-slate-900">{finding.customerName}</div><div className="mt-0.5 font-mono text-[10px] font-bold text-[#006b68]">CIF {finding.cif}</div></td>
              <td className="px-3 py-2 align-top font-mono text-[11px] font-black text-[#006b68]">{finding.errorCode}</td>
              <td className="max-w-[260px] px-3 py-2 align-top text-slate-700">{finding.errorTitle}</td>
              <td className="px-3 py-2 align-top">{finding.riskLevel ? <span className={`rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${riskTone[finding.riskLevel]}`}>{riskLevelLabels[finding.riskLevel]}</span> : <span className="text-[10px] text-slate-400">Chưa chấm</span>}</td>
              <td className="px-3 py-2 align-top text-[11px] font-semibold text-slate-600">{workflowStatusLabels[finding.workflowStatus]}</td>
              <td className="px-3 py-2 align-top text-[11px] text-slate-600">{new Date(`${finding.deadlineDate}T00:00:00`).toLocaleDateString('vi-VN')}</td>
              <td className="px-3 py-2 align-top">
                {editable
                  ? <><textarea rows={2} value={note} onChange={event => setDrafts(current => ({ ...current, [finding.id]: event.target.value }))} placeholder="Nhập giải trình, tối thiểu 5 ký tự..." className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]" aria-label={`Giải trình ${finding.cif} ${finding.errorCode}`} />{unsent && <span className="mt-0.5 block text-[10px] font-bold text-amber-700">Chưa gửi</span>}</>
                  : <span className="block text-[11px] text-slate-500">{locked ? 'Cần đính kèm tài liệu tại hồ sơ' : note || '—'}</span>}
              </td>
              <td className="px-3 py-2 align-top"><button type="button" aria-label={`Mở hồ sơ ${finding.cif}`} onClick={() => onOpenCase(finding)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#006b68]"><ChevronRight className="h-4 w-4" /></button></td>
            </tr>;
          })}
        </tbody>
      </table>
      {findings.length === 0 && <p className="p-10 text-center text-xs text-slate-500">Không có hồ sơ phù hợp bộ lọc.</p>}
    </div>
  </section>;
};

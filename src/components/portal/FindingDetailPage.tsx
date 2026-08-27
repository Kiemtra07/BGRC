import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, ChevronDown, Eye, FileImage, FileSpreadsheet,
  FileText, ListChecks, Loader2, PanelRightClose, PanelRightOpen, Paperclip, Plus,
  RefreshCw, ShieldCheck, Star, Trash2, UploadCloud, XCircle,
} from 'lucide-react';
import { RiskLevel, businessLineLabels, canManageEvidenceAtBranch, EvidenceObject, Finding, MyWorkQueue, riskLevelLabels, UserProfile, WorkspaceTargetCommandDTO, WorkspaceTargetType } from '../../../shared/contracts';
import { api } from '../../services/api';
import { slaStatusLabels, workflowActionLabels, workflowEventLabels, workflowStatusLabels } from '../../content/ui-copy';
import { EvidenceViewer } from '../evidence/EvidenceViewer';

interface Props {
  findings: Finding[];
  currentUser: UserProfile;
  initialFindingId?: string;
  workQueue: MyWorkQueue;
  onBack: () => void;
  onFindingUpdated: (finding: Finding) => void;
  onWorkspaceChanged: () => void | Promise<void>;
}

const statusMeta: Record<Finding['workflowStatus'], { label: string; tone: string }> = {
  PENDING: { label: workflowStatusLabels.PENDING, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  SUBMITTED_BRANCH: { label: workflowStatusLabels.SUBMITTED_BRANCH, tone: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  SUBMITTED_BRANCH_LEADER: { label: workflowStatusLabels.SUBMITTED_BRANCH_LEADER, tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  SUBMITTED_INTERNAL: { label: workflowStatusLabels.SUBMITTED_INTERNAL, tone: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  REJECTED: { label: workflowStatusLabels.REJECTED, tone: 'border-red-200 bg-red-50 text-red-800' },
  WAIVED_RESOLVED: { label: workflowStatusLabels.WAIVED_RESOLVED, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};

const slaTone: Record<Finding['slaStatus'], string> = {
  ON_TRACK: 'border-teal-200 bg-teal-50 text-teal-800',
  DUE_SOON: 'border-amber-200 bg-amber-50 text-amber-800',
  OVERDUE: 'border-red-200 bg-red-50 text-red-800',
  CLOSED: 'border-slate-200 bg-slate-100 text-slate-700',
};

const riskTone: Record<RiskLevel, string> = {
  CAO: 'border-red-200 bg-red-50 text-red-800',
  TRUNG_BINH: 'border-amber-200 bg-amber-50 text-amber-800',
  THAP: 'border-slate-200 bg-slate-100 text-slate-700',
};

const calendarDaysRemaining = (deadlineDate: string): number => {
  const [year, month, day] = deadlineDate.split('-').map(Number);
  const deadline = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

export const FindingDetailPage: React.FC<Props> = ({
  findings,
  currentUser,
  initialFindingId,
  workQueue,
  onBack,
  onFindingUpdated,
  onWorkspaceChanged,
}) => {
  const [items, setItems] = useState(findings);
  const [selectedId, setSelectedId] = useState(initialFindingId || findings[0]?.id || '');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceObject | null>(null);
  const [pendingEvidenceRemovalId, setPendingEvidenceRemovalId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [decisionNumber, setDecisionNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingFinding, setLoadingFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchMenuOpen, setWatchMenuOpen] = useState(false);
  const [infoVisible, setInfoVisible] = useState(true);
  const [acceptedSubItemIds, setAcceptedSubItemIds] = useState<Set<string>>(new Set());
  const [newSubItem, setNewSubItem] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  const finding = useMemo(() => items.find(item => item.id === selectedId) || items[0], [items, selectedId]);
  const isBranchInput = currentUser.roles.includes('BRANCH_INPUT');
  const isBranchController = currentUser.roles.includes('BRANCH_CONTROLLER');
  const isBranchLeader = currentUser.roles.includes('BRANCH_LEADER');
  const isInternalReviewer = currentUser.roles.some(role => ['SUPERVISOR', 'INTERNAL_APPROVER'].includes(role));
  const canManageWorkspace = currentUser.roles.some(role => ['INTERNAL_OFFICER', 'SUPERVISOR', 'INTERNAL_APPROVER', 'BRANCH_INPUT', 'BRANCH_CONTROLLER', 'BRANCH_LEADER'].includes(role));
  const canFlagSpecialCase = currentUser.roles.some(role => ['ADMIN', 'SUPERVISOR', 'INTERNAL_OFFICER', 'INTERNAL_APPROVER', 'BRANCH_INPUT'].includes(role));
  const canAddSubItems = currentUser.roles.some(role => ['INTERNAL_OFFICER', 'SUPERVISOR'].includes(role));
  const canReviewSubItems = (finding?.workflowStatus === 'SUBMITTED_BRANCH' && isBranchController)
    || (finding?.workflowStatus === 'SUBMITTED_BRANCH_LEADER' && isBranchLeader)
    || (finding?.workflowStatus === 'SUBMITTED_INTERNAL' && isInternalReviewer);
  const evidenceRequired = finding?.evidenceRequired !== false;
  const canManageEvidence = Boolean(finding && evidenceRequired && isBranchInput && canManageEvidenceAtBranch(finding.workflowStatus));
  const hasAvailableEvidence = !evidenceRequired || (finding?.evidences?.some(evidence => evidence.status === 'AVAILABLE') ?? false);
  const subItems = finding?.subItems || [];
  const allSubItemsAccepted = subItems.length > 0 && subItems.every(item => item.status === 'ACCEPTED');
  const acceptedTarget = workQueue.accepted.find(target => target.targetType === 'CUSTOMER' && target.branchCode === finding?.branchCode && target.cif === finding?.cif);

  useEffect(() => { setItems(findings); }, [findings]);
  useEffect(() => {
    setAcceptedSubItemIds(new Set((finding?.subItems || []).filter(item => item.status === 'ACCEPTED').map(item => item.id)));
    setReviewNote('');
    setNewSubItem('');
    setPendingEvidenceRemovalId(null);
  }, [finding?.id, finding?.subItems]);

  useEffect(() => {
    if (!finding) return;
    let active = true;
    setLoadingFinding(true);
    setError(null);
    api.getFindingById(finding.id).then(full => {
      if (!active) return;
      setItems(previous => previous.map(item => item.id === full.id ? full : item));
      setSelectedEvidence(previous => full.evidences?.find(item => item.id === previous?.id) || full.evidences?.[0] || null);
      setResolutionNotes(full.resolutionNotes || '');
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : 'Không thể tải chi tiết hồ sơ.'))
      .finally(() => active && setLoadingFinding(false));
    return () => { active = false; };
  }, [finding?.id]);

  if (!finding) return null;

  const daysRemaining = calendarDaysRemaining(finding.deadlineDate);
  const deadlineNotice = finding.slaStatus === 'CLOSED'
    ? 'Hồ sơ đã đóng.'
    : daysRemaining < 0 ? `Quá hạn ${Math.abs(daysRemaining)} ngày.`
      : daysRemaining === 0 ? 'Đến hạn hôm nay.'
        : `Còn ${daysRemaining} ngày xử lý.`;

  const commit = async (action: () => Promise<Finding>) => {
    try {
      setBusy(true);
      setError(null);
      const updated = await action();
      const full = await api.getFindingById(updated.id);
      setItems(previous => previous.map(item => item.id === full.id ? full : item));
      onFindingUpdated(full);
      setRejectReason('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể thực hiện thao tác.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSpecialCase = async (isSpecialCase: boolean) => {
    try {
      setBusy(true);
      setError(null);
      const updated = await api.setSpecialCase(finding.id, { isSpecialCase });
      setItems(previous => previous.map(item => item.id === updated.id ? updated : item));
      onFindingUpdated(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật dấu sao trường hợp đặc biệt.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setError(null);
      await api.uploadEvidence(finding.id, file);
      const full = await api.getFindingById(finding.id);
      setItems(previous => previous.map(item => item.id === full.id ? full : item));
      setSelectedEvidence(full.evidences?.at(-1) || null);
      onFindingUpdated(full);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải bằng chứng.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleRevokeEvidence = async () => {
    if (!selectedEvidence || !canManageEvidence) return;
    try {
      setBusy(true);
      setError(null);
      await api.revokeEvidence(finding.id, selectedEvidence.id, 'Thu hồi để tải tài liệu thay thế.');
      const full = await api.getFindingById(finding.id);
      setItems(previous => previous.map(item => item.id === full.id ? full : item));
      setSelectedEvidence(full.evidences?.[0] || null);
      setPendingEvidenceRemovalId(null);
      onFindingUpdated(full);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa tài liệu.');
    } finally {
      setBusy(false);
    }
  };

  const targetCommand = (targetType: WorkspaceTargetType): WorkspaceTargetCommandDTO => ({
    targetType,
    ...(targetType === 'CLUSTER' ? { clusterName: finding.clusterName } : {}),
    ...(targetType === 'BRANCH' ? { branchCode: finding.branchCode } : {}),
    ...(targetType === 'CUSTOMER' ? { branchCode: finding.branchCode, cif: finding.cif } : {}),
  });

  const matchingWatchTarget = (targetType: WorkspaceTargetType) => workQueue.watchTargets.find(target => {
    if (target.targetType !== targetType) return false;
    if (targetType === 'CLUSTER') return target.clusterName === finding.clusterName;
    if (targetType === 'BRANCH') return target.branchCode === finding.branchCode;
    return target.branchCode === finding.branchCode && target.cif === finding.cif;
  });
  const priorityWatchTarget = matchingWatchTarget('CUSTOMER');

  const toggleAcceptedWork = async () => {
    try {
      setBusy(true);
      if (acceptedTarget) await api.releaseWork(acceptedTarget.id);
      else await api.acceptWork(targetCommand('CUSTOMER'));
      await onWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật công việc đang làm.');
    } finally {
      setBusy(false);
    }
  };

  const toggleWatchTarget = async (targetType: WorkspaceTargetType) => {
    try {
      setBusy(true);
      const existing = matchingWatchTarget(targetType);
      if (existing) await api.unwatchTarget(existing.id);
      else await api.watchTarget(targetCommand(targetType));
      setWatchMenuOpen(false);
      await onWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật phạm vi theo dõi.');
    } finally {
      setBusy(false);
    }
  };

  const togglePriorityMonitoring = async () => {
    try {
      setBusy(true);
      const target = priorityWatchTarget ?? await api.watchTarget(targetCommand('CUSTOMER'));
      await api.setWatchPriority(target.id, !target.isPriority);
      await onWorkspaceChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật ưu tiên giám sát.');
    } finally {
      setBusy(false);
    }
  };

  const addSubItem = async () => {
    if (newSubItem.trim().length < 5) return;
    await commit(() => api.createFindingSubItem(finding.id, { content: newSubItem.trim() }));
    setNewSubItem('');
  };

  const reviewSubItems = async () => {
    if (!subItems.length || reviewNote.trim().length < 5) return;
    await commit(() => api.reviewFindingSubItems(finding.id, {
      decisions: subItems.map(item => ({
        subItemId: item.id,
        decision: acceptedSubItemIds.has(item.id) ? 'ACCEPT' : 'RETURN',
      })),
      reviewNote: reviewNote.trim(),
    }));
  };

  return (
    <article className="min-h-[calc(100dvh-116px)] bg-[#f4f7f7] lg:min-h-[calc(100dvh-64px)]" data-testid="customer-case-page" aria-label={`Hồ sơ khách hàng ${finding.customerName}`}>
      <header className="bg-[#006b68] px-3 py-4 text-white sm:px-6 lg:py-5">
        <div className="mx-auto max-w-[1600px]">
          <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.65fr)_minmax(0,1.65fr)] lg:items-center">
            <div className="flex min-w-0 gap-3">
              <button onClick={onBack} aria-label="Quay lại danh sách hồ sơ" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold sm:text-[11px]">
                  <span className="rounded-md bg-white/12 px-2 py-1 font-mono">CIF {finding.cif}</span>
                  <span className="rounded-md bg-white/12 px-2 py-1">{items.length} mã lỗi</span>
                  <span className="rounded-md bg-white/12 px-2 py-1">CN {finding.branchCode}</span>
                </div>
                <h1 className="flex min-w-0 items-center gap-2 text-sm font-black sm:text-lg"><span className="truncate">{finding.customerName}</span>{finding.isSpecialCase && <span title="Trường hợp đặc biệt" aria-label="Trường hợp đặc biệt" className="inline-flex shrink-0 text-amber-300"><Star className="h-4 w-4 fill-current" /></span>}</h1>
                <p className="mt-1 truncate text-[11px] text-teal-50 sm:text-xs">{finding.branchName} · {finding.department || 'Chưa phân phòng'}</p>
              </div>
            </div>
            <div className="min-w-0 border-t border-white/15 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0" aria-labelledby="finding-tabs-title">
              <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 id="finding-tabs-title" className="text-[10px] font-black uppercase tracking-wider text-teal-50">Các mã lỗi của khách hàng</h2>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black text-white">{items.length}</span>
                </div>
              </div>
              <div className="flex min-w-0 items-stretch gap-2">
                <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1 [scrollbar-color:rgba(255,255,255,.45)_transparent] [scrollbar-gutter:stable]" role="tablist" aria-label="Thanh trượt mã lỗi">
                  {items.map(item => {
                    const active = item.id === finding.id;
                    return <button key={item.id} role="tab" aria-selected={active} onClick={() => setSelectedId(item.id)} className={`min-h-14 min-w-[190px] snap-start rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:min-w-[220px] ${active ? 'border-white bg-white text-slate-900 shadow-lg' : 'border-white/25 bg-white/10 text-white hover:bg-white/20'}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`font-mono text-xs font-black ${active ? 'text-[#006b68]' : 'text-white'}`}>{item.errorCode}</span>
                        <span aria-label={`Trạng thái SLA: ${slaStatusLabels[item.slaStatus]}`} className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${active ? slaTone[item.slaStatus] : 'border-white/20 bg-white/10 text-white'}`}>{slaStatusLabels[item.slaStatus]}</span>
                      </span>
                      <span className={`mt-1 block truncate text-[11px] font-semibold ${active ? 'text-slate-700' : 'text-teal-50'}`}>{item.errorTitle}</span>
                    </button>;
                  })}
                </div>
                <div className="flex shrink-0 items-stretch gap-2">
                  {canManageWorkspace && <>
                  <button onClick={toggleAcceptedWork} disabled={busy} aria-pressed={Boolean(acceptedTarget)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 ${acceptedTarget ? 'border-white bg-white text-[#006b68]' : 'border-white/20 bg-white/10 text-white hover:bg-white/20'}`}>
                    {acceptedTarget ? <CheckCircle2 className="h-4 w-4" /> : <BriefcaseBusiness className="h-4 w-4" />}
                    <span className="hidden xl:inline">{acceptedTarget ? 'Đã tiếp nhận' : 'Tiếp nhận công việc'}</span>
                  </button>
                  <button type="button" onClick={togglePriorityMonitoring} disabled={busy} aria-label={priorityWatchTarget?.isPriority ? 'Bỏ ưu tiên giám sát' : 'Ưu tiên giám sát'} aria-pressed={Boolean(priorityWatchTarget?.isPriority)} title={priorityWatchTarget?.isPriority ? 'Bỏ ưu tiên giám sát' : 'Ưu tiên giám sát'} className={`grid min-h-11 w-11 place-items-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 ${priorityWatchTarget?.isPriority ? 'border-amber-300 bg-amber-300 text-amber-950' : 'border-white/20 bg-white/10 text-white hover:bg-white/20'}`}><Star className={`h-4 w-4 ${priorityWatchTarget?.isPriority ? 'fill-current' : ''}`} /></button>
                  <div className="relative">
                    <button onClick={() => setWatchMenuOpen(value => !value)} disabled={busy} aria-expanded={watchMenuOpen} aria-haspopup="menu" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"><Eye className="h-4 w-4" /><span className="hidden sm:inline">Theo dõi</span><ChevronDown className="h-3.5 w-3.5" /></button>
                    {watchMenuOpen && <div role="menu" className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-2xl">
                      <WatchOption label="Cụm địa bàn" value={finding.clusterName} active={Boolean(matchingWatchTarget('CLUSTER'))} onClick={() => toggleWatchTarget('CLUSTER')} />
                      <WatchOption label="Chi nhánh" value={finding.branchName} active={Boolean(matchingWatchTarget('BRANCH'))} onClick={() => toggleWatchTarget('BRANCH')} />
                      <WatchOption label="Khách hàng" value={finding.customerName} active={Boolean(matchingWatchTarget('CUSTOMER'))} onClick={() => toggleWatchTarget('CUSTOMER')} />
                    </div>}
                  </div>
                  </>}
                  <button type="button" onClick={() => setInfoVisible(value => !value)} aria-expanded={infoVisible} aria-label="Ẩn hoặc hiện thông tin hồ sơ" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                    {infoVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-3 px-3 py-3 sm:px-6 sm:py-4">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</div>}

        <div className={`grid items-stretch gap-3 ${infoVisible && evidenceRequired ? 'xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]' : 'xl:grid-cols-1'}`}>
          {evidenceRequired && <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:h-[calc(100dvh-250px)] xl:min-h-[680px]" aria-labelledby="evidence-title">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-3 sm:px-4">
              <h2 id="evidence-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><Paperclip className="h-4 w-4 text-[#006b68]" />Tài liệu và bằng chứng</h2>
              {canManageEvidence && <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedEvidence && <button type="button" onClick={() => setPendingEvidenceRemovalId(selectedEvidence.id)} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />Xóa để thay thế
                </button>}
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-[#006b68] px-3 py-2 text-xs font-bold text-white hover:bg-[#005b59]">
                  <UploadCloud className="h-4 w-4" />Tải lên
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={handleUpload} disabled={busy} />
                </label>
              </div>}
            </div>
            {finding.evidences?.length ? <>
              <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2">
                {finding.evidences.map(evidence => <button key={evidence.id} onClick={() => setSelectedEvidence(evidence)} className={`flex min-h-11 min-w-[220px] items-center gap-2 rounded-xl border p-2 text-left text-[11px] ${selectedEvidence?.id === evidence.id ? 'border-[#006b68] bg-teal-50 ring-1 ring-[#006b68]/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <EvidenceIcon evidence={evidence} />
                  <span className="min-w-0"><span className="block truncate font-bold text-slate-800">{evidence.fileName}</span><span className="mt-0.5 block text-[9px] text-slate-500">{formatBytes(evidence.fileSize)}</span></span>
                </button>)}
              </div>
              {pendingEvidenceRemovalId === selectedEvidence?.id && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <span className="min-w-0 truncate font-semibold">Xóa “{selectedEvidence.fileName}” khỏi hồ sơ?</span>
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setPendingEvidenceRemovalId(null)} disabled={busy} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 font-bold text-slate-700 disabled:opacity-50">Giữ lại</button>
                  <button type="button" onClick={handleRevokeEvidence} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-700 px-3 font-bold text-white disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Xóa
                  </button>
                </span>
              </div>}
              <div className="min-h-0 flex-1 bg-slate-100">{selectedEvidence && <EvidenceViewer evidence={selectedEvidence} />}</div>
            </> : <div className="flex min-h-[480px] flex-1 flex-col items-center justify-center p-8 text-center text-xs text-slate-500"><Paperclip className="mb-3 h-8 w-8 text-slate-300" />Chưa có bằng chứng cho mã lỗi này.</div>}
          </section>}

          {infoVisible && <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:h-[calc(100dvh-310px)] xl:min-h-[680px] xl:overflow-y-auto" aria-labelledby="finding-detail-title">
            {loadingFinding && <div className="flex items-center gap-2 text-xs font-semibold text-[#006b68]" role="status"><Loader2 className="h-4 w-4 animate-spin" />Đang cập nhật chi tiết mã lỗi...</div>}
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#006b68] px-2.5 py-1 font-mono text-xs font-black text-white">{finding.errorCode}</span>
                <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${statusMeta[finding.workflowStatus].tone}`}>{statusMeta[finding.workflowStatus].label}</span>
                <span aria-label={`Trạng thái SLA: ${slaStatusLabels[finding.slaStatus]}`} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${slaTone[finding.slaStatus]}`}>{slaStatusLabels[finding.slaStatus]}</span>
                {/* Risk grade the đoàn kiểm tra assigned in CoPlus; it drives how urgently a branch
                    must act, so it sits with the status badges rather than in a collapsed panel. */}
                {finding.riskLevel && <span aria-label={`Mức độ rủi ro: ${riskLevelLabels[finding.riskLevel]}`} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${riskTone[finding.riskLevel]}`}>Rủi ro {riskLevelLabels[finding.riskLevel].toLowerCase()}</span>}
              </div>
              <h2 id="finding-detail-title" className="text-sm font-black text-slate-900">Nội dung cần giải trình</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{finding.errorTitle}</p>
              <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{finding.description}</p>
              <div className={`mt-2 rounded-xl border p-3 text-xs font-bold ${slaTone[finding.slaStatus]}`}>Hạn xử lý {new Date(`${finding.deadlineDate}T00:00:00`).toLocaleDateString('vi-VN')} · {deadlineNotice}</div>
            </div>

            <SubItemReview
              finding={finding}
              acceptedIds={acceptedSubItemIds}
              canReview={canReviewSubItems}
              canAdd={canAddSubItems}
              hasAvailableEvidence={hasAvailableEvidence}
              busy={busy}
              newSubItem={newSubItem}
              reviewNote={reviewNote}
              onNewSubItemChange={setNewSubItem}
              onReviewNoteChange={setReviewNote}
              onToggle={id => setAcceptedSubItemIds(previous => {
                const next = new Set(previous);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })}
              onAdd={addSubItem}
              onReview={reviewSubItems}
            />

            {finding.rejectionReason && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><strong>Lý do chuyển trả:</strong> {finding.rejectionReason}</div>}
            {finding.resolutionNotes && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-5 text-teal-900"><strong>Giải trình chi nhánh:</strong> {finding.resolutionNotes}</div>}
            {finding.dynamicPayload && Object.keys(finding.dynamicPayload).length > 0 && <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Dữ liệu báo cáo"><h3 className="bg-slate-50 px-3 py-2 text-xs font-black text-slate-800">Dữ liệu báo cáo</h3><dl className={`grid gap-px bg-slate-200 ${finding.presentationMode === 'EXCEL_GRID' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{Object.entries(finding.dynamicPayload).map(([key, value]) => <div key={key} className="bg-white p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/_/g, ' ')}</dt><dd className="mt-1 text-xs font-semibold text-slate-800">{String(value ?? '')}</dd></div>)}</dl></section>}
            {evidenceRequired && !hasAvailableEvidence && ['PENDING', 'REJECTED', 'SUBMITTED_BRANCH', 'SUBMITTED_BRANCH_LEADER', 'SUBMITTED_INTERNAL'].includes(finding.workflowStatus) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">Cần ít nhất một tài liệu hợp lệ trước khi chuyển bước.</div>}

            {canFlagSpecialCase && (finding.workflowStatus === 'PENDING' || finding.workflowStatus === 'REJECTED') && <ActionPanel title="Dấu sao">
              <label className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 ${finding.isSpecialCase ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <input aria-label="Đánh dấu trường hợp đặc biệt" type="checkbox" checked={Boolean(finding.isSpecialCase)} disabled={busy} onChange={event => toggleSpecialCase(event.target.checked)} className="h-4 w-4 shrink-0 accent-amber-500" />
                <Star className={`h-4 w-4 ${finding.isSpecialCase ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
                <span className="text-xs font-black text-slate-900">Trường hợp đặc biệt</span>
              </label>
            </ActionPanel>}

            {(finding.workflowStatus === 'PENDING' || finding.workflowStatus === 'REJECTED') && isBranchInput && <ActionPanel title="Chi nhánh khắc phục">
              <textarea value={resolutionNotes} onChange={event => setResolutionNotes(event.target.value)} rows={4} placeholder="Nêu rõ nội dung đã khắc phục, tài liệu và ngày hoàn thành..." className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#006b68] focus:outline-none focus:ring-2 focus:ring-[#006b68]/15" />
              <button disabled={busy || !hasAvailableEvidence || resolutionNotes.trim().length < 5} onClick={() => commit(() => api.submitBranch(finding.id, { expectedVersion: finding.version, resolutionNotes }))} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{workflowActionLabels.submitBranch} <ArrowRight className="h-4 w-4" /></button>
            </ActionPanel>}

            {finding.workflowStatus === 'SUBMITTED_BRANCH' && isBranchController && <ActionPanel title="Kiểm soát chi nhánh">
              <textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={3} placeholder="Nhập lý do nếu cần chuyển trả hồ sơ..." className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#006b68] focus:outline-none" />
              <div className="grid gap-2 sm:grid-cols-2">
                <button disabled={busy || !hasAvailableEvidence || !allSubItemsAccepted} onClick={() => commit(() => api.branchControlApprove(finding.id, { expectedVersion: finding.version, notes: 'Kiểm soát chi nhánh chuyển hồ sơ phê duyệt HT.' }))} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{workflowActionLabels.branchApprove}</button>
                <button disabled={busy || rejectReason.trim().length < 5} onClick={() => commit(() => api.branchControlReject(finding.id, { expectedVersion: finding.version, reason: rejectReason }))} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" />{workflowActionLabels.returnToBranch}</button>
              </div>
            </ActionPanel>}

            {finding.workflowStatus === 'SUBMITTED_BRANCH_LEADER' && isBranchLeader && <ActionPanel title="Lãnh đạo chi nhánh">
              <textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={3} placeholder="Nhập lý do nếu cần chuyển trả hồ sơ..." className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#006b68] focus:outline-none" />
              <div className="grid gap-2 sm:grid-cols-2">
                <button disabled={busy || !hasAvailableEvidence || !allSubItemsAccepted} onClick={() => commit(() => api.branchLeaderApprove(finding.id, { expectedVersion: finding.version, notes: 'Lãnh đạo chi nhánh chuyển hồ sơ phê duyệt nội bộ.' }))} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Chuyển phê duyệt HT</button>
                <button disabled={busy || rejectReason.trim().length < 5} onClick={() => commit(() => api.branchLeaderReject(finding.id, { expectedVersion: finding.version, reason: rejectReason }))} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" />{workflowActionLabels.returnToBranch}</button>
              </div>
            </ActionPanel>}

            {finding.workflowStatus === 'SUBMITTED_INTERNAL' && isInternalReviewer && <ActionPanel title="Phê duyệt HT">
              <input value={decisionNumber} onChange={event => setDecisionNumber(event.target.value)} placeholder="Số quyết định/công văn đóng lỗi" className="min-h-11 w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#006b68] focus:outline-none" />
              <textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={2} placeholder="Lý do chuyển trả (nếu có)" className="w-full rounded-xl border border-slate-300 p-3 text-xs" />
              <div className="grid gap-2 sm:grid-cols-2">
                <button disabled={busy || !hasAvailableEvidence || !allSubItemsAccepted || decisionNumber.trim().length < 2} onClick={() => commit(() => api.internalWaive(finding.id, { expectedVersion: finding.version, decisionNumber }))} className="min-h-11 rounded-xl bg-[#006b68] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{workflowActionLabels.internalApprove}</button>
                <button disabled={busy || rejectReason.trim().length < 5} onClick={() => commit(() => api.internalReject(finding.id, { expectedVersion: finding.version, reason: rejectReason }))} className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 disabled:opacity-50">{workflowActionLabels.returnToBranch}</button>
              </div>
            </ActionPanel>}

            {/* Where this sai sót came from in CoPlus. Shown open by default: a branch officer
                needs the đoàn and tiểu biên bản codes to look the original record up. */}
            {(finding.inspectionTeamCode || finding.sourceRecordCode || finding.businessLine || finding.penaltyProposalCode || finding.referenceDocument) && <details open className="group border-t border-slate-200 pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-black text-slate-800">Nguồn kiểm tra <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <Detail label="Mã đoàn kiểm tra" value={finding.inspectionTeamCode || 'Chưa gắn đoàn'} />
                <Detail label="Mã tiểu biên bản" value={finding.sourceRecordCode || 'Chưa có'} />
                <Detail label="Loại nghiệp vụ" value={finding.businessLine ? businessLineLabels[finding.businessLine] : 'Chưa phân loại'} />
                <Detail label="Mức độ rủi ro" value={finding.riskLevel ? riskLevelLabels[finding.riskLevel] : 'Chưa chấm'} />
                <Detail label="Đề xuất xử phạt" value={finding.penaltyProposalCode || 'Không đề xuất'} />
                <Detail label="Văn bản dẫn chiếu" value={finding.referenceDocument || 'Chưa có'} />
              </div>
            </details>}

            <details className="group border-t border-slate-200 pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-black text-slate-800">Thông tin biên bản <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <Detail label="Quyết định kiểm tra" value={finding.decisionNo || 'Chưa có'} />
                <Detail label="Ngày kiểm tra" value={finding.auditDate ? new Date(finding.auditDate).toLocaleDateString('vi-VN') : 'Chưa có'} />
                <Detail label="Cán bộ kiểm tra" value={finding.inspectorName || 'Chưa có'} />
                <Detail label="Hạn xử lý" value={new Date(finding.deadlineDate).toLocaleDateString('vi-VN')} />
                <Detail label="Nhóm nợ" value={finding.loanGroup || 'Chưa có'} />
                <Detail label="Trưởng phòng" value={finding.deptHeadName || 'Chưa xác định'} />
              </div>
            </details>

            {finding.history?.length ? <details className="group border-t border-slate-200 pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-black text-slate-800">Lịch sử xử lý ({finding.history.length}) <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <ol className="mt-3 space-y-3">{[...finding.history].reverse().map(event => <li key={event.id} className="relative border-l-2 border-teal-100 pl-3 text-[11px] leading-4"><span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#006b68]" /><strong className="text-slate-800">{event.actorName}</strong><span className="block text-slate-500">{workflowEventLabels[event.command]} · {new Date(event.createdAt).toLocaleString('vi-VN')}</span>{event.notes && <span className="mt-1 block text-slate-600">{event.notes}</span>}</li>)}</ol>
            </details> : null}

            {busy && <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#006b68]"><RefreshCw className="h-4 w-4 animate-spin" />Đang cập nhật hồ sơ...</div>}
          </section>}
        </div>
      </div>
    </article>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span><span className="mt-1 block font-semibold text-slate-700">{value}</span></div>;
const ActionPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <div className="space-y-3 border-t border-slate-200 pt-4"><h3 className="flex items-center gap-2 text-xs font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-[#006b68]" />{title}</h3>{children}</div>;

interface SubItemReviewProps {
  finding: Finding;
  acceptedIds: Set<string>;
  canReview: boolean;
  canAdd: boolean;
  hasAvailableEvidence: boolean;
  busy: boolean;
  newSubItem: string;
  reviewNote: string;
  onNewSubItemChange: (value: string) => void;
  onReviewNoteChange: (value: string) => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onReview: () => void;
}

const SubItemReview: React.FC<SubItemReviewProps> = ({
  finding, acceptedIds, canReview, canAdd, hasAvailableEvidence, busy, newSubItem,
  reviewNote, onNewSubItemChange, onReviewNoteChange, onToggle, onAdd, onReview,
}) => {
  const subItems = finding.subItems || [];
  const isAcceptingAll = subItems.length > 0 && subItems.every(item => acceptedIds.has(item.id));
  return <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-labelledby="sub-item-title">
    <div className="flex items-center justify-between gap-2">
      <h3 id="sub-item-title" className="flex items-center gap-2 text-xs font-black text-slate-900"><ListChecks className="h-4 w-4 text-[#006b68]" />Các ý sai sót trong mã lỗi</h3>
      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#006b68] ring-1 ring-slate-200">{subItems.length}</span>
    </div>
    <div className="mt-3 space-y-2">
      {subItems.map((item, index) => {
        const checked = acceptedIds.has(item.id);
        const status = item.status === 'ACCEPTED'
          ? { label: 'Đồng ý bỏ', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
          : item.status === 'RETURNED'
            ? { label: 'Cần bổ sung', tone: 'bg-red-50 text-red-700 border-red-200' }
            : { label: 'Chưa duyệt', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
        return <label key={item.id} className={`flex gap-3 rounded-xl border bg-white p-3 ${canReview ? 'cursor-pointer hover:border-[#006b68]/40' : 'border-slate-200'} ${checked && canReview ? 'border-[#006b68] ring-1 ring-[#006b68]/10' : 'border-slate-200'}`}>
          {canReview && <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#006b68]" aria-label={`Đồng ý bỏ ý sai sót ${index + 1}`} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold leading-5 text-slate-800">{index + 1}. {item.content}</span>
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${status.tone}`}>{status.label}</span>
            </span>
            {item.reviewerNote && <span className="mt-1 block text-[10px] leading-4 text-slate-500">Nhận xét: {item.reviewerNote}</span>}
          </span>
        </label>;
      })}
    </div>

    {canAdd && finding.workflowStatus !== 'WAIVED_RESOLVED' && <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input value={newSubItem} onChange={event => onNewSubItemChange(event.target.value)} placeholder="Bổ sung thêm một ý sai sót trong mã lỗi..." className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-[#006b68] focus:outline-none" />
      <button type="button" onClick={onAdd} disabled={busy || newSubItem.trim().length < 5} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#006b68] px-3 text-xs font-bold text-[#006b68] disabled:opacity-50"><Plus className="h-4 w-4" />Thêm ý</button>
    </div>}

    {canReview && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <p className="text-[10px] leading-4 text-slate-600">Chọn các ý đủ căn cứ; các ý còn lại sẽ được trả bổ sung.</p>
      <textarea value={reviewNote} onChange={event => onReviewNoteChange(event.target.value)} rows={2} placeholder="Nhập nhận xét..." className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs focus:border-[#006b68] focus:outline-none" />
      {isAcceptingAll && !hasAvailableEvidence && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-semibold leading-4 text-amber-800">Cần ít nhất một tài liệu hợp lệ để đóng toàn bộ mã lỗi.</p>}
      <button type="button" onClick={onReview} disabled={busy || reviewNote.trim().length < 5 || (isAcceptingAll && !hasAvailableEvidence)} className="min-h-11 w-full rounded-xl bg-[#006b68] px-3 text-xs font-bold text-white disabled:opacity-50">{workflowActionLabels.saveSubItemReview}</button>
    </div>}
  </section>;
};

const WatchOption: React.FC<{ label: string; value: string; active: boolean; onClick: () => void }> = ({ label, value, active, onClick }) => <button type="button" role="menuitemcheckbox" aria-checked={active} onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-teal-50">
  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${active ? 'border-[#006b68] bg-[#006b68] text-white' : 'border-slate-300 text-transparent'}`}><CheckCircle2 className="h-3.5 w-3.5" /></span>
  <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{active ? `Đang theo dõi ${label}` : `Theo dõi ${label}`}</span><span className="block truncate text-xs font-bold text-slate-800">{value}</span></span>
</button>;

const EvidenceIcon: React.FC<{ evidence: EvidenceObject }> = ({ evidence }) => {
  const className = 'h-4 w-4 shrink-0 text-[#006b68]';
  if (evidence.mimeType.startsWith('image/')) return <FileImage className={className} />;
  if (evidence.fileName.toLowerCase().endsWith('.xlsx')) return <FileSpreadsheet className={className} />;
  return <FileText className={className} />;
};

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

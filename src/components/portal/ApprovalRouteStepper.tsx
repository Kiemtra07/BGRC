import React, { useEffect, useState } from 'react';
import { Check, CornerUpLeft, Loader2, Star } from 'lucide-react';
import { FindingApprovalRouteView } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';
import { api } from '../../services/api';

interface Props {
  findingId: string;
  /** Bumped by the parent after a workflow command so the route re-resolves. */
  refreshToken: number;
}

const stateTone: Record<FindingApprovalRouteView['steps'][number]['state'], string> = {
  DONE: 'border-teal-200 bg-teal-50',
  CURRENT: 'border-[#006b68] bg-white ring-1 ring-[#006b68]',
  UPCOMING: 'border-slate-200 bg-slate-50',
};

/**
 * Where the finding stands in its approval route. The steps and their names come from the report
 * type version pinned on the finding, so a branch sees the flow an administrator actually
 * configured rather than a fixed three-box picture.
 */
export const ApprovalRouteStepper: React.FC<Props> = ({ findingId, refreshToken }) => {
  const [route, setRoute] = useState<FindingApprovalRouteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void api.getFindingApprovalRoute(findingId)
      .then(result => { if (active) setRoute(result); })
      .catch(() => { if (active) { setRoute(null); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [findingId, refreshToken]);

  if (loading && !route) {
    return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500" role="status" data-testid="approval-route-stepper">
      <Loader2 className="h-4 w-4 animate-spin" />Đang tải tuyến duyệt…
    </div>;
  }
  // The route is context, not the record itself: if it cannot be resolved the rest of the finding
  // must still be workable, so this fails quiet rather than blocking the page.
  if (failed || !route) return null;

  const total = route.steps.length;
  const currentStep = route.currentStepIndex >= 0 ? route.steps[route.currentStepIndex] : undefined;

  return <section data-testid="approval-route-stepper" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Tuyến duyệt hồ sơ">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Tuyến duyệt</h3>
      <span className="text-[11px] font-semibold text-slate-500">
        {route.isClosed
          ? 'Đã hoàn tất toàn bộ các bước'
          : currentStep ? `Bước ${route.currentStepIndex + 1}/${total} · ${currentStep.stageName}` : `${total} bước`}
      </span>
    </div>

    {route.returnedFromStageName && <p className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-800">
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />{route.returnedFromStageName} đã chuyển trả. Hồ sơ quay lại chi nhánh để bổ sung.
    </p>}

    <ol className="grid gap-2 lg:grid-cols-4">
      {route.steps.map((step, index) => <li
        key={step.stageId}
        data-testid="approval-route-step"
        aria-current={step.state === 'CURRENT' ? 'step' : undefined}
        className={`min-w-0 rounded-xl border p-3 ${stateTone[step.state]} ${step.conditional ? 'border-dashed' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-[#006b68]">Bước {index + 1}</span>
          {step.state === 'DONE' && <Check className="h-3.5 w-3.5 text-[#006b68]" aria-label="Đã xong" />}
          {step.conditional && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />Do dấu sao</span>}
        </div>
        <p className="mt-1 truncate text-xs font-bold text-slate-900">{step.stageName}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{step.allowedRoles.map(role => userRoleLabels[role]).join(' · ')}</p>
        {/* Who is holding the record matters more than the abstract role when a branch chases it. */}
        {step.assigneeName && <p className="mt-1 truncate text-[10px] font-bold text-slate-700">{step.assigneeName}</p>}
        {step.state === 'DONE' && step.completedByName && <p className="mt-1 truncate text-[10px] font-medium text-teal-800">
          {step.completedByName}{step.completedAt ? ` · ${new Date(step.completedAt).toLocaleDateString('vi-VN')}` : ''}
        </p>}
        {step.state === 'CURRENT' && !route.isClosed && <p className="mt-1 text-[10px] font-bold text-[#006b68]">Đang chờ tại bước này</p>}
      </li>)}
    </ol>

    {route.isSpecialCase && route.workflowType !== 'THREE_TIER' && <p className="mt-3 text-[10px] font-medium leading-relaxed text-slate-500">
      Hồ sơ được gắn dấu sao nên có thêm bước Lãnh đạo chi nhánh so với luồng mặc định của loại báo cáo.
    </p>}
  </section>;
};

import React, { useEffect, useState } from 'react';
import { CornerUpLeft, Loader2 } from 'lucide-react';
import { FindingApprovalRouteView } from '../../../shared/contracts';
import { api } from '../../services/api';

interface Props {
  findingId: string;
  /** Bumped by the parent after a workflow command so the route re-resolves. */
  refreshToken: number;
}

/**
 * Where the finding stands in its approval route. Only the active hand-off is shown here; the
 * complete route is available to the workflow engine, not something operators need to scan.
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
    return <div className="flex items-center gap-2 rounded-2xl border border-rule bg-white p-4 text-xs font-semibold text-slate-500" role="status" data-testid="approval-route-stepper">
      <Loader2 className="h-4 w-4 animate-spin" />Đang tải tuyến duyệt…
    </div>;
  }
  // The route is context, not the record itself: if it cannot be resolved the rest of the finding
  // must still be workable, so this fails quiet rather than blocking the page.
  if (failed || !route) return null;

  const total = route.steps.length;
  const currentStep = route.currentStepIndex >= 0 ? route.steps[route.currentStepIndex] : undefined;

  return <section data-testid="approval-route-stepper" className="rounded-2xl border border-rule bg-white p-4 shadow-panel" aria-label="Tuyến duyệt hồ sơ">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-xs font-black text-slate-800">Tuyến duyệt</h3>
      <span className="text-[11px] font-semibold text-slate-500">
        {route.isClosed ? 'Đã hoàn tất' : currentStep ? `Bước ${route.currentStepIndex + 1}/${total}` : 'Chưa xác định'}
      </span>
    </div>

    {route.returnedFromStageName && <p className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-800">
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />Đã chuyển trả từ {route.returnedFromStageName}.
    </p>}

    <div data-testid="approval-route-step" className="rounded-xl border border-brand-500/30 bg-brand-50/60 px-3 py-3" aria-live="polite">
      {route.isClosed ? <>
        <p className="text-xs font-bold text-slate-900">Đã hoàn tất tuyến duyệt</p>
        <p className="mt-1 text-[11px] text-slate-600">Không còn bước chờ xử lý.</p>
      </> : currentStep ? <>
        <p className="text-[10px] font-black text-brand-600">{currentStep.stageName}</p>
        <p className="mt-1 text-xs font-bold text-slate-900">{currentStep.assigneeName || 'Chưa phân công người duyệt'}</p>
      </> : <p className="text-xs font-semibold text-slate-600">Chưa xác định vị trí xử lý hiện tại.</p>}
    </div>
  </section>;
};

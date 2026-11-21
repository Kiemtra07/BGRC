import React, { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { ApprovalAssignmentStage, ApproverSelectionsDTO, SubmitRouteOptions, SubmitRouteStep, UserProfile } from '../../../shared/contracts';
import { api } from '../../services/api';

interface Props {
  findingId: string;
  /** Đổi mỗi khi hồ sơ đổi để tải lại danh sách người nhận. */
  refreshToken: number;
  creator: Pick<UserProfile, 'fullName' | 'username'>;
  disabled: boolean;
  onChange: (selections: ApproverSelectionsDTO | undefined) => void;
}

const stageOrder: readonly ApprovalAssignmentStage[] = ['BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER'];

/** Chữ cái đầu của tên gọi (từ cuối bắt đầu bằng chữ); tên có thể kết thúc bằng số, như "Chi nhánh 635". */
const initials = (fullName: string) => {
  const word = fullName.trim().split(/\s+/).reverse().find(part => /^\p{L}/u.test(part));
  return word ? word.charAt(0).toLocaleUpperCase('vi-VN') : '?';
};

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-black text-white">{initials(name)}</span>
);

/**
 * Luồng trình duyệt của hồ sơ khi nộp. Các bước loại báo cáo bắt buộc luôn có mặt và người nộp chọn
 * người nhận cho từng bước. Nút "Thêm bước xử lý mới" thêm bước kiểm soát (Kiểm soát, Lãnh đạo chi
 * nhánh) vào trước Hội sở; thêm bước chỉ làm tuyến chặt hơn, bước bắt buộc không bỏ được. Một người không
 * được chọn cho hai bước nên lựa chọn ở bước này khóa người đó ở các bước còn lại.
 */
export const SubmitRoutePicker: React.FC<Props> = ({ findingId, refreshToken, creator, disabled, onChange }) => {
  const [route, setRoute] = useState<SubmitRouteOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Partial<Record<ApprovalAssignmentStage, string>>>({});
  const [added, setAdded] = useState<ApprovalAssignmentStage[]>([]);
  const idPrefix = useId();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getSubmitRouteOptions(findingId)
      .then(result => {
        if (!active) return;
        setRoute(result);
        setAdded(result.addedStages);
        const known = [...result.steps, ...result.addableSteps];
        setSelections(Object.fromEntries(known.map(step => [step.stage, step.suggestedUserId ?? ''])));
      })
      // Không tải được thì để máy chủ tự chọn người mặc định khi nộp.
      .catch(() => { if (active) setRoute(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [findingId, refreshToken]);

  const displayed = useMemo<Array<SubmitRouteStep & { removable: boolean }>>(() => route
    ? [
      ...route.steps.map(step => ({ ...step, removable: false })),
      ...route.addableSteps.filter(step => added.includes(step.stage)).map(step => ({ ...step, removable: true })),
    ].sort((left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage))
    : [], [route, added]);

  useEffect(() => {
    if (!route || displayed.length === 0) {
      onChange(undefined);
      return;
    }
    const chosen = Object.fromEntries(displayed.map(step => [step.stage, selections[step.stage] ?? '']).filter(([, userId]) => userId));
    onChange(chosen as ApproverSelectionsDTO);
  }, [route, displayed, selections, onChange]);

  if (loading) {
    return <div role="status" className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Đang tải luồng trình duyệt...</div>;
  }
  if (!route || displayed.length === 0) return null;

  const pickedElsewhere = (stage: ApprovalAssignmentStage, userId: string) =>
    displayed.some(other => other.stage !== stage && selections[other.stage] === userId);

  const nextAddable = route.addableSteps.find(step => !added.includes(step.stage));
  const removeStep = (stage: ApprovalAssignmentStage) =>
    // Bỏ một bước thì bỏ luôn các bước thêm đứng sau nó, vì Lãnh đạo chi nhánh luôn đi sau Kiểm soát.
    setAdded(current => current.filter(item => stageOrder.indexOf(item) < stageOrder.indexOf(stage)));

  return <section aria-label="Luồng trình duyệt" className="space-y-3">
    <h4 className="text-xs font-black text-slate-900">Luồng trình duyệt</h4>
    <ol>
      <li className="relative flex gap-3 pb-4">
        <span aria-hidden="true" className="absolute left-[0.9rem] top-8 h-[calc(100%-1.75rem)] w-px bg-slate-300" />
        <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-400 bg-white text-xs font-black text-slate-700">1</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800">Tạo hồ sơ</p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar name={creator.fullName} />
            <span className="min-w-0"><span className="block truncate text-xs font-black text-slate-900">{creator.fullName}</span><span className="block truncate text-xs text-slate-500">{creator.username}</span></span>
          </div>
        </div>
      </li>
      {displayed.map((step, index) => {
        const selectId = `${idPrefix}-${step.stage}`;
        const value = selections[step.stage] ?? '';
        const noOneAvailable = step.options.length === 0 && !step.allowSharedQueue;
        const isLast = index === displayed.length - 1;
        return <li key={step.stage} className="relative flex gap-3 pb-4">
          {!isLast && <span aria-hidden="true" className="absolute left-[0.9rem] top-8 h-[calc(100%-1.75rem)] w-px bg-slate-300" />}
          <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-400 bg-white text-xs font-black text-slate-700">{index + 2}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={selectId} className="text-xs font-bold text-slate-800">{step.stageName}</label>
              {step.removable && <button type="button" disabled={disabled} onClick={() => removeStep(step.stage)} aria-label={`Bỏ bước ${step.stageName}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-700 disabled:opacity-50"><X className="h-4 w-4" /></button>}
            </div>
            <select
              id={selectId}
              value={value}
              disabled={disabled || noOneAvailable}
              onChange={event => setSelections(current => ({ ...current, [step.stage]: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-60"
            >
              {step.allowSharedQueue && <option value="">Hàng chờ chung, ai tiếp nhận thì duyệt</option>}
              {step.options.map(option => <option key={option.id} value={option.id} disabled={pickedElsewhere(step.stage, option.id)}>
                {option.fullName}{option.department ? ` · ${option.department}` : ''}
              </option>)}
            </select>
            {noOneAvailable && <p className="mt-1 text-xs font-semibold text-red-700">Chưa có người phù hợp ở bước này. Báo quản trị viên bổ sung người phụ trách.</p>}
          </div>
        </li>;
      })}
    </ol>
    {nextAddable && <>
      <button
        type="button"
        disabled={disabled || nextAddable.options.length === 0}
        onClick={() => setAdded(current => [...current, nextAddable.stage])}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-500 bg-white px-4 text-xs font-bold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />Thêm bước xử lý mới<span className="font-semibold text-slate-500">({nextAddable.stageName})</span>
      </button>
      {nextAddable.options.length === 0 && <p className="text-xs font-semibold text-slate-500">Chưa có người phù hợp để thêm bước {nextAddable.stageName}.</p>}
    </>}
  </section>;
};

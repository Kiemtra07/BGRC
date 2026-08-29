import React from 'react';
import { ArrowRight, CheckCircle2, Star } from 'lucide-react';
import { DynamicWorkflowConfig, UserRole } from '../../../../shared/contracts';
import { userRoleLabels } from '../../../content/ui-copy';

interface Props {
  channelId: string;
  value: DynamicWorkflowConfig;
  onChange: (value: DynamicWorkflowConfig) => void;
}

export function createWorkflowConfig(channelId: string, workflowType: 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER'): DynamicWorkflowConfig {
  const branch = { stageId: 'branch-remediation', stageName: 'Chi nhánh khắc phục', statusCode: 'PENDING' as const, allowedRoles: ['BRANCH_INPUT' as const], availableButtons: [] };
  const control = { stageId: 'branch-control', stageName: 'Kiểm soát chi nhánh', statusCode: 'SUBMITTED_BRANCH' as const, allowedRoles: ['BRANCH_CONTROLLER' as const], availableButtons: [] };
  const headOffice = { stageId: 'head-office-approval', stageName: 'Phê duyệt HT', statusCode: 'SUBMITTED_INTERNAL' as const, allowedRoles: ['INTERNAL_APPROVER' as const, 'SUPERVISOR' as const], availableButtons: [] };
  const leader = { stageId: 'branch-leader', stageName: 'Lãnh đạo chi nhánh', statusCode: 'SUBMITTED_BRANCH_LEADER' as const, allowedRoles: ['BRANCH_LEADER' as const], availableButtons: [] };
  return { id: `workflow-${channelId || 'draft'}`, channelId, workflowType, stages: workflowType === 'ONE_TIER' ? [branch, headOffice] : workflowType === 'THREE_TIER' ? [branch, control, leader, headOffice] : [branch, control, headOffice] };
}

const roleSummary = (roles: UserRole[]): string => roles.map(role => userRoleLabels[role]).join(' · ');

export const WorkflowConfigEditor: React.FC<Props> = ({ channelId, value, onChange }) => {
  const renameStage = (index: number, stageName: string) => onChange({
    ...value,
    stages: value.stages.map((item, stageIndex) => stageIndex === index ? { ...item, stageName } : item),
  });
  // The engine splices a Lãnh đạo chi nhánh step into a two-tier route whenever a finding carries the
  // special-case star, so the diagram has to show that branch or it misrepresents the real flow.
  const starInsertIndex = value.workflowType === 'TWO_TIER'
    ? value.stages.findIndex(stage => stage.statusCode === 'SUBMITTED_INTERNAL')
    : -1;

  return <section className="space-y-5">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {([
        ['THREE_TIER', 'Luồng có lãnh đạo', 'Chi nhánh → Kiểm soát → Lãnh đạo CN → Phê duyệt HT'],
        ['TWO_TIER', 'Luồng kiểm soát', 'Chi nhánh → Kiểm soát chi nhánh → Phê duyệt HT'],
        ['ONE_TIER', 'Luồng gọn', 'Chi nhánh → Phê duyệt HT'],
      ] as const).map(([type, title, description]) => {
        const active = value.workflowType === type;
        return <button key={type} type="button" onClick={() => onChange(createWorkflowConfig(channelId, type))} className={`rounded-xl border p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-rule bg-white hover:border-slate-300'}`}>
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-900">{title}</span>{active && <CheckCircle2 className="h-4 w-4 text-brand-600" />}</div>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </button>;
      })}
    </div>

    <p className="text-[11px] font-medium text-slate-500">Tên bước đặt ở đây là tên hiển thị trên tuyến duyệt của hồ sơ, người xử lý sẽ thấy đúng tên này.</p>

    <div data-testid="workflow-stage-diagram" className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {value.stages.map((stage, index) => (
        <React.Fragment key={stage.stageId}>
          {index === starInsertIndex && <>
            <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 self-center text-slate-400 lg:block" />
            <div data-testid="workflow-stage-conditional" className="flex-1 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />Bước có điều kiện</span>
              <p className="mt-2 text-sm font-bold text-slate-900">Lãnh đạo chi nhánh</p>
              <p className="mt-2 text-[11px] text-amber-800">Chỉ chèn vào tuyến khi hồ sơ được gắn dấu sao.</p>
            </div>
          </>}
          {index > 0 && <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 self-center text-slate-400 lg:block" />}
          <div className="flex-1 rounded-xl border border-rule bg-slate-50 p-4">
            <span className="text-[10px] font-bold text-brand-600">Bước {index + 1}</span>
            <input aria-label={`Tên bước ${index + 1}`} value={stage.stageName} onChange={event => renameStage(index, event.target.value)} className="mt-2 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm font-bold" />
            <p className="mt-2 text-[11px] text-slate-500">{roleSummary(stage.allowedRoles)}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  </section>;
};

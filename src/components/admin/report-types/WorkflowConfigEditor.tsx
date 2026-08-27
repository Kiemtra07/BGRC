import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { DynamicWorkflowConfig } from '../../../../shared/contracts';

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

export const WorkflowConfigEditor: React.FC<Props> = ({ channelId, value, onChange }) => (
  <section className="space-y-5">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {([
        ['THREE_TIER', 'Luồng có lãnh đạo', 'Chi nhánh → Kiểm soát → Lãnh đạo CN → Phê duyệt HT'],
        ['TWO_TIER', 'Luồng kiểm soát', 'Chi nhánh → Kiểm soát chi nhánh → Phê duyệt HT'],
        ['ONE_TIER', 'Luồng gọn', 'Chi nhánh → Phê duyệt HT'],
      ] as const).map(([type, title, description]) => {
        const active = value.workflowType === type;
        return <button key={type} type="button" onClick={() => onChange(createWorkflowConfig(channelId, type))} className={`rounded-xl border p-4 text-left transition ${active ? 'border-[#006b68] bg-teal-50 ring-1 ring-[#006b68]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-900">{title}</span>{active && <CheckCircle2 className="h-4 w-4 text-[#006b68]" />}</div>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </button>;
      })}
    </div>

    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
      {value.stages.map((stage, index) => (
        <React.Fragment key={stage.stageId}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#006b68]">Bước {index + 1}</span>
            <input value={stage.stageName} onChange={event => onChange({ ...value, stages: value.stages.map((item, stageIndex) => stageIndex === index ? { ...item, stageName: event.target.value } : item) })} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold" />
            <p className="mt-2 text-[11px] text-slate-500">{stage.allowedRoles.includes('BRANCH_INPUT') ? 'Cán bộ chi nhánh' : stage.allowedRoles.includes('BRANCH_CONTROLLER') ? 'Kiểm soát chi nhánh' : stage.allowedRoles.includes('BRANCH_LEADER') ? 'Lãnh đạo chi nhánh' : 'Người phê duyệt HT'}</p>
          </div>
          {index < value.stages.length - 1 && <ArrowRight className="mx-auto hidden h-4 w-4 text-slate-400 lg:block" />}
        </React.Fragment>
      ))}
    </div>
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Luồng mới chỉ áp dụng cho hồ sơ tạo sau khi lưu phiên bản.</div>
  </section>
);

import React from 'react';
import { ArrowDown, ArrowRight, CheckCircle2, FileCheck2, GitBranch, ShieldCheck } from 'lucide-react';
import { workflowActionLabels } from '../../content/ui-copy';

const stages = [
  {
    step: 'Bước 1',
    title: 'Chi nhánh khắc phục',
    role: 'Cán bộ chi nhánh',
    action: 'Giải trình, tải bằng chứng và gửi hồ sơ',
    icon: FileCheck2,
  },
  {
    step: 'Bước 2',
    title: 'Kiểm soát chi nhánh',
    role: 'Kiểm soát chi nhánh',
    action: `${workflowActionLabels.branchApprove} hoặc ${workflowActionLabels.returnToBranch.toLocaleLowerCase('vi')}`,
    icon: ShieldCheck,
  },
  {
    step: 'Bước 3',
    title: 'Phê duyệt HT',
    role: 'Người phê duyệt HT',
    action: `${workflowActionLabels.internalApprove} hoặc ${workflowActionLabels.returnToBranch.toLocaleLowerCase('vi')}`,
    icon: CheckCircle2,
  },
];

export const WorkflowBuilder: React.FC = () => (
  <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Luồng xử lý Audit BGS</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Luồng cố định theo nghiệp vụ hiện hành.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#006b68]/20 bg-[#006b68]/10 px-3 py-1 text-xs font-bold text-[#006b68]">
          <GitBranch className="h-3.5 w-3.5" />
          Đang áp dụng
        </span>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Cụm chỉ dùng để phân nhóm địa bàn.
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h4 className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-900">
        <GitBranch className="h-4 w-4 text-[#006b68]" />
        Trình tự xử lý
      </h4>

      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <React.Fragment key={stage.step}>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#006b68]">{stage.step}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#006b68] text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <h5 className="text-sm font-bold text-slate-900">{stage.title}</h5>
                <dl className="mt-3 space-y-2 text-[11px] leading-5">
                  <div>
                    <dt className="font-bold text-slate-500">Vai trò</dt>
                    <dd className="text-slate-800">{stage.role}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">Hành động</dt>
                    <dd className="text-slate-800">{stage.action}</dd>
                  </div>
                </dl>
              </article>
              {index < stages.length - 1 && (
                <div className="flex items-center justify-center text-slate-400" aria-hidden="true">
                  <ArrowDown className="h-5 w-5 md:hidden" />
                  <ArrowRight className="hidden h-5 w-5 md:block" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  </div>
);

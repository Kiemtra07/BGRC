import React from 'react';
import { AlertTriangle, Clock, Construction, Mail } from 'lucide-react';

const slaPreview = [
  { label: 'Rủi ro cao', days: 7, tone: 'border-red-200 bg-red-50 text-red-800' },
  { label: 'Rủi ro trung bình', days: 15, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { label: 'Thủ tục / hồ sơ', days: 30, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
];

export const SlaEscalationConfig: React.FC = () => (
  <div className="space-y-6">
    <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Chính sách SLA và cảnh báo</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Chính sách dự kiến; chưa có chức năng lưu hoặc gửi email.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          <Construction className="h-3.5 w-3.5" />
          Chưa hoạt động
        </span>
      </div>
    </section>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel sm:p-6">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Clock className="h-4 w-4 text-brand-600" />
          Thời hạn xử lý dự kiến
        </h4>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {slaPreview.map(item => (
            <article key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
              <p className="text-[11px] font-bold">{item.label}</p>
              <p className="mt-2 text-2xl font-extrabold">{item.days}</p>
              <p className="text-[11px]">ngày làm việc</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel sm:p-6">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Mail className="h-4 w-4 text-brand-600" />
          Luồng cảnh báo dự kiến
        </h4>
        <dl className="mt-4 space-y-4 text-xs">
          <div>
            <dt className="font-bold text-slate-500">Thời gian quét</dt>
            <dd className="mt-1 font-mono font-bold text-slate-900">08:30 hằng ngày</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Người nhận theo phạm vi</dt>
            <dd className="mt-1 leading-5 text-slate-800">Cán bộ phụ trách, kiểm soát chi nhánh, giám đốc chi nhánh và phê duyệt HT.</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Tiêu đề mẫu</dt>
            <dd className="mt-1 rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700">
              [CẢNH BÁO TIẾN ĐỘ] Sai sót CIF {'{{cif}}'} - {'{{customerName}}'}
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Chưa thể lưu. Cần cấu hình lịch gửi và dịch vụ email trước khi sử dụng.
      </p>
    </div>
  </div>
);

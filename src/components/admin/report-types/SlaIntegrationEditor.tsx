import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { DynamicSlaConfig, ReportChannelIntegrationConfig, ReportChannelIntegrationReadiness, UserRole } from '../../../../shared/contracts';

interface Props {
  sla: DynamicSlaConfig;
  integration: ReportChannelIntegrationConfig;
  readiness?: ReportChannelIntegrationReadiness;
  onSlaChange: (value: DynamicSlaConfig) => void;
  onIntegrationChange: (value: ReportChannelIntegrationConfig) => void;
}

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'BRANCH_CONTROLLER', label: 'Kiểm soát chi nhánh' },
  { value: 'INTERNAL_APPROVER', label: 'Người phê duyệt HT' },
  { value: 'SUPERVISOR', label: 'Lãnh đạo' },
];

export const SlaIntegrationEditor: React.FC<Props> = ({ sla, integration, readiness, onSlaChange, onIntegrationChange }) => (
  <div className="space-y-6">
    <section>
      <h4 className="text-sm font-bold text-slate-900">SLA của loại báo cáo</h4>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {([
          ['defaultDays', 'Mặc định (ngày)'], ['highRiskDays', 'Rủi ro cao'], ['mediumRiskDays', 'Rủi ro trung bình'],
          ['lowRiskDays', 'Rủi ro thấp'], ['escalationAfterDaysOverdue', 'Nâng cảnh báo sau'],
        ] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-700">{label}
          <input type="number" min={key === 'escalationAfterDaysOverdue' ? 0 : 1} value={sla[key]} onChange={event => onSlaChange({ ...sla, [key]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </label>)}
        <label className="text-xs font-bold text-slate-700">Nhắc trước hạn
          <input value={sla.reminderDaysBefore.join(', ')} onChange={event => onSlaChange({ ...sla, reminderDaysBefore: event.target.value.split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="3, 1" />
        </label>
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h4 className="text-sm font-bold text-slate-900">Google Sheets</h4><p className="text-xs text-slate-500">Đẩy dữ liệu hồ sơ sang bảng đã chọn.</p></div>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={integration.googleSheets.enabled} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, enabled: event.target.checked } })} /> Bật</label>
      </div>
      {integration.googleSheets.enabled && <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700 md:col-span-2">Spreadsheet ID
          <input value={integration.googleSheets.spreadsheetId ?? ''} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, spreadsheetId: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs" />
        </label>
        <label className="text-xs font-bold text-slate-700">Tên sheet
          <input value={integration.googleSheets.sheetName} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, sheetName: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </label>
        <label className="text-xs font-bold text-slate-700">Cách đồng bộ
          <select value={integration.googleSheets.syncMode} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, syncMode: event.target.value as 'APPEND' | 'UPSERT' } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="APPEND">Thêm dòng mới</option><option value="UPSERT">Cập nhật theo mã hồ sơ</option></select>
        </label>
      </div>}
      {readiness && integration.googleSheets.enabled && <Readiness item={readiness.googleSheets} />}
    </section>

    <section className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h4 className="text-sm font-bold text-slate-900">Email tự động</h4><p className="text-xs text-slate-500">Gửi theo mốc luồng và SLA.</p></div>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={integration.email.enabled} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, enabled: event.target.checked } })} /> Bật</label>
      </div>
      {integration.email.enabled && <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
          {([['sendOnSubmission', 'Khi chuyển duyệt'], ['sendBeforeDeadline', 'Trước hạn'], ['sendWhenOverdue', 'Khi quá hạn']] as const).map(([key, label]) => <label key={key} className="inline-flex items-center gap-2"><input type="checkbox" checked={integration.email[key]} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, [key]: event.target.checked } })} /> {label}</label>)}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">Giờ gửi<input type="time" value={integration.email.sendTime} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, sendTime: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Tiêu đề<input value={integration.email.subjectTemplate} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, subjectTemplate: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        </div>
        <div className="flex flex-wrap gap-3">{roleOptions.map(role => <label key={role.value} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={integration.email.recipientRoles.includes(role.value)} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, recipientRoles: event.target.checked ? [...integration.email.recipientRoles, role.value] : integration.email.recipientRoles.filter(item => item !== role.value) } })} />{role.label}</label>)}</div>
        <label className="block text-xs font-bold text-slate-700">Email nhận thêm, phân cách bằng dấu phẩy<input value={integration.email.additionalRecipients.join(', ')} onChange={event => onIntegrationChange({ ...integration, email: { ...integration.email, additionalRecipients: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
      </div>}
      {readiness && integration.email.enabled && <Readiness item={readiness.email} />}
    </section>
  </div>
);

const Readiness: React.FC<{ item: { configured: boolean; message: string } }> = ({ item }) => <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${item.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{item.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}{item.message}</div>;

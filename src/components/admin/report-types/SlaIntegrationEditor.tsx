import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileSpreadsheet, Loader2 } from 'lucide-react';
import { DynamicFieldDefinition, DynamicSlaConfig, ReportChannelIntegrationConfig, ReportChannelIntegrationReadiness, UserRole } from '../../../../shared/contracts';
import { api } from '../../../services/api';

interface Props {
  sla: DynamicSlaConfig;
  integration: ReportChannelIntegrationConfig;
  readiness?: ReportChannelIntegrationReadiness;
  reportName: string;
  fields: DynamicFieldDefinition[];
  onSlaChange: (value: DynamicSlaConfig) => void;
  onIntegrationChange: (value: ReportChannelIntegrationConfig) => void;
}

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'BRANCH_CONTROLLER', label: 'Kiểm soát chi nhánh' },
  { value: 'INTERNAL_APPROVER', label: 'Người phê duyệt HT' },
  { value: 'SUPERVISOR', label: 'Lãnh đạo' },
];

export const SlaIntegrationEditor: React.FC<Props> = ({ sla, integration, readiness, reportName, fields, onSlaChange, onIntegrationChange }) => {
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string>();
  const [sheetNotice, setSheetNotice] = useState<string>();

  const createGoogleSheet = async () => {
    try {
      setCreatingSheet(true);
      setSheetError(undefined);
      setSheetNotice(undefined);
      const baseColumns = [
        { key: 'record_id', label: 'Mã hồ sơ' }, { key: 'cif', label: 'CIF' },
        { key: 'customer_name', label: 'Tên khách hàng' }, { key: 'branch', label: 'Chi nhánh' },
        { key: 'error_code', label: 'Mã lỗi' }, { key: 'workflow_status', label: 'Trạng thái' },
      ];
      const columns = [...baseColumns, ...fields.map(field => ({ key: field.fieldKey, label: field.label }))]
        .filter((column, index, all) => all.findIndex(item => item.key === column.key) === index);
      const result = await api.createReportSpreadsheet({
        reportName: reportName.trim() || 'Báo cáo AuditBGS',
        sheetName: integration.googleSheets.sheetName,
        columns,
      });
      onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, enabled: true, spreadsheetId: result.spreadsheetId, sheetName: result.sheetName } });
      setSheetNotice('Đã tạo Google Sheet. Lưu phiên bản mới để áp dụng cấu hình cho loại báo cáo này.');
    } catch (reason) {
      setSheetError(reason instanceof Error ? reason.message : 'Không thể tạo Google Sheet.');
    } finally {
      setCreatingSheet(false);
    }
  };

  const spreadsheetUrl = integration.googleSheets.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(integration.googleSheets.spreadsheetId)}/edit`
    : undefined;

  return <div className="space-y-6">
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
        <div className="md:col-span-2">
          <span className="text-xs font-bold text-slate-700">Google Sheet của loại báo cáo</span>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Spreadsheet ID" readOnly value={integration.googleSheets.spreadsheetId ?? ''} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600" placeholder="ID được điền tự động sau khi tạo" />
            <button type="button" disabled={creatingSheet} onClick={() => void createGoogleSheet()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#006b68] px-3 text-xs font-bold text-white hover:bg-[#005956] disabled:opacity-60">
              {creatingSheet ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Tạo Google Sheet
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Hệ thống tạo cột từ mẫu form và tự lưu Spreadsheet ID.</p>
        </div>
        <label className="text-xs font-bold text-slate-700">Tên sheet
          <input value={integration.googleSheets.sheetName} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, sheetName: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
        </label>
        <label className="text-xs font-bold text-slate-700">Cách đồng bộ
          <select value={integration.googleSheets.syncMode} onChange={event => onIntegrationChange({ ...integration, googleSheets: { ...integration.googleSheets, syncMode: event.target.value as 'APPEND' | 'UPSERT' } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="APPEND">Thêm dòng mới</option><option value="UPSERT">Cập nhật theo mã hồ sơ</option></select>
        </label>
        {spreadsheetUrl && <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-[#006b68] hover:bg-teal-50"><ExternalLink className="h-4 w-4" />Mở Google Sheet</a>}
      </div>}
      {sheetError && <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{sheetError}</div>}
      {sheetNotice && <div role="status" className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-[#006b68]">{sheetNotice}</div>}
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
  </div>;
};

const Readiness: React.FC<{ item: { configured: boolean; message: string } }> = ({ item }) => <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${item.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{item.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}{item.message}</div>;

import React, { useEffect, useMemo, useState } from 'react';
import { Clock, FileText, GitBranch, Plug, Save, Settings2, X } from 'lucide-react';
import {
  CreateReportChannelDTO,
  CreateReportChannelSchema,
  ReportChannel,
  ReportChannelIntegrationReadiness,
} from '../../../../shared/contracts';
import { api } from '../../../services/api';
import { defaultReportFormTemplate } from '../../reports/ReportFormBlockLayout';
import { FormSchemaEditor } from './FormSchemaEditor';
import { SlaIntegrationEditor } from './SlaIntegrationEditor';
import { createWorkflowConfig, WorkflowConfigEditor } from './WorkflowConfigEditor';

interface Props {
  channel?: ReportChannel;
  onClose: () => void;
  onSave: (data: CreateReportChannelDTO) => Promise<void>;
}

type EditorTab = 'GENERAL' | 'FORM' | 'WORKFLOW' | 'SLA_INTEGRATION';

const DEFAULT_SLA: CreateReportChannelDTO['slaConfig'] = { defaultDays: 15, highRiskDays: 7, mediumRiskDays: 15, lowRiskDays: 30, escalationAfterDaysOverdue: 1, reminderDaysBefore: [3, 1] };
const defaultIntegration = (): CreateReportChannelDTO['integrationConfig'] => ({
  googleSheets: { enabled: false, sheetName: 'AuditBGS', syncMode: 'APPEND' },
  email: { enabled: false, sendOnSubmission: true, sendBeforeDeadline: true, sendWhenOverdue: true, sendTime: '08:00', recipientRoles: ['INTERNAL_APPROVER'], additionalRecipients: [], subjectTemplate: '[Audit Monitoring] {{reportName}} - {{status}}' },
});

function createDraft(channel?: ReportChannel): CreateReportChannelDTO {
  if (channel) {
    // The four config blocks are optional on the wire; an older or partially written channel record
    // must still open in the editor instead of throwing on a null clone.
    const schemaConfig = structuredClone(channel.schemaConfig) ?? { tableName: channel.code.toLowerCase(), fields: [], excelHeaderRowIndex: 1, dataStartRowIndex: 2 };
    schemaConfig.formTemplate ??= defaultReportFormTemplate(`Mẫu ${channel.name}`, schemaConfig.fields);
    return {
      code: channel.code,
      name: channel.name,
      description: channel.description,
      category: channel.category,
      icon: channel.icon,
      badgeColor: channel.badgeColor,
      inputMethods: channel.inputMethods,
      issuingDepartment: channel.issuingDepartment,
      isActive: channel.isActive,
      schemaConfig,
      workflowConfig: structuredClone(channel.workflowConfig) ?? createWorkflowConfig(channel.id, 'TWO_TIER'),
      slaConfig: structuredClone(channel.slaConfig) ?? { ...DEFAULT_SLA },
      integrationConfig: structuredClone(channel.integrationConfig) ?? defaultIntegration(),
    };
  }
  return {
    code: 'LOAI_BAO_CAO_MOI',
    name: 'Loại báo cáo mới',
    description: '',
    category: 'THEMATIC_AUDIT',
    icon: 'FileSpreadsheet',
    badgeColor: 'teal',
    inputMethods: ['WEB_FORM', 'EXCEL_IMPORT'],
    issuingDepartment: 'Ban Kiểm toán Nội bộ',
    isActive: true,
    schemaConfig: { tableName: 'loai_bao_cao_moi', fields: [], excelHeaderRowIndex: 1, dataStartRowIndex: 2, formTemplate: defaultReportFormTemplate('Mẫu loại báo cáo mới', []) },
    workflowConfig: createWorkflowConfig('', 'TWO_TIER'),
    slaConfig: { ...DEFAULT_SLA },
    integrationConfig: defaultIntegration(),
  };
}

const TAB_BY_CONFIG_PATH: Record<string, EditorTab> = {
  schemaConfig: 'FORM',
  workflowConfig: 'WORKFLOW',
  slaConfig: 'SLA_INTEGRATION',
  integrationConfig: 'SLA_INTEGRATION',
};
const TAB_LABEL: Record<EditorTab, string> = {
  GENERAL: 'Thông tin', FORM: 'Mẫu form', WORKFLOW: 'Luồng phê duyệt', SLA_INTEGRATION: 'SLA và tích hợp',
};

export const ReportTypeEditor: React.FC<Props> = ({ channel, onClose, onSave }) => {
  const [draft, setDraft] = useState<CreateReportChannelDTO>(() => createDraft(channel));
  const [activeTab, setActiveTab] = useState<EditorTab>('GENERAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [readiness, setReadiness] = useState<ReportChannelIntegrationReadiness>();

  useEffect(() => {
    if (!channel) return;
    api.getChannelIntegrationReadiness(channel.id).then(setReadiness).catch(() => setReadiness(undefined));
  }, [channel]);

  const tabs = useMemo(() => [
    { id: 'GENERAL' as const, label: 'Thông tin', icon: Settings2 },
    { id: 'FORM' as const, label: `Mẫu biểu mẫu (${draft.schemaConfig.formTemplate?.blocks.length ?? 0} khối)`, icon: FileText },
    { id: 'WORKFLOW' as const, label: 'Luồng phê duyệt', icon: GitBranch },
    { id: 'SLA_INTEGRATION' as const, label: 'SLA và tích hợp', icon: Plug },
  ], [draft.schemaConfig.formTemplate?.blocks.length]);

  const submit = async () => {
    const parsed = CreateReportChannelSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Point the admin at the tab that actually holds the invalid value, otherwise a message like
      // "Mã trường không được trùng nhau" appears while a different tab is open.
      const tab = TAB_BY_CONFIG_PATH[String(issue?.path[0] ?? '')] ?? 'GENERAL';
      setActiveTab(tab);
      setError(`${TAB_LABEL[tab]}: ${issue?.message ?? 'Cấu hình chưa hợp lệ.'}`);
      return;
    }
    try {
      setSaving(true);
      setError(undefined);
      await onSave(parsed.data);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu loại báo cáo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-rule px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-extrabold text-slate-900">{channel ? channel.name : 'Tạo loại báo cáo'}</h3>{channel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Phiên bản {channel.configVersion}</span>}</div>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>

        <nav className="flex gap-2 overflow-x-auto border-b border-rule px-4 py-2 sm:px-6">
          {tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${activeTab === tab.id ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{tab.label}</button>; })}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'GENERAL' && <GeneralEditor value={draft} onChange={setDraft} isNew={!channel} />}
          {activeTab === 'FORM' && <FormSchemaEditor value={draft.schemaConfig} onChange={schemaConfig => setDraft({ ...draft, schemaConfig })} />}
          {activeTab === 'WORKFLOW' && <WorkflowConfigEditor channelId={channel?.id ?? ''} value={draft.workflowConfig} onChange={workflowConfig => setDraft({ ...draft, workflowConfig })} />}
          {activeTab === 'SLA_INTEGRATION' && <SlaIntegrationEditor sla={draft.slaConfig} integration={draft.integrationConfig} readiness={readiness} reportName={draft.name} fields={draft.schemaConfig.fields} onSlaChange={slaConfig => setDraft({ ...draft, slaConfig })} onIntegrationChange={integrationConfig => setDraft({ ...draft, integrationConfig })} />}
        </div>

        <footer className="border-t border-rule bg-slate-50 px-4 py-3 sm:px-6">
          {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
          {/* Form, luồng, SLA và tích hợp are one version, and the version boundary decides which
              findings feel the change — so the rule sits with the button that applies it. */}
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            Form, luồng, SLA và tích hợp được lưu cùng một phiên bản. Thay đổi chỉ áp dụng cho hồ sơ tạo sau khi lưu.
          </p>
          <div className="flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Hủy</button><button type="button" disabled={saving} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Đang lưu...' : channel ? 'Lưu phiên bản mới' : 'Tạo loại báo cáo'}</button></div>
        </footer>
      </div>
    </div>
  );
};

const GeneralEditor: React.FC<{ value: CreateReportChannelDTO; onChange: (value: CreateReportChannelDTO) => void; isNew: boolean }> = ({ value, onChange, isNew }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    {/* Renaming the code of a live report type would repoint its data table, so only a new type
        derives tableName from the code; an existing one keeps its table. */}
    <label className="text-xs font-bold text-slate-700">Mã loại báo cáo<input value={value.code} onChange={event => { const code = event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); onChange(isNew ? { ...value, code, schemaConfig: { ...value.schemaConfig, tableName: code.toLowerCase() } } : { ...value, code }); }} className="mt-1 w-full rounded-lg border border-rule px-3 py-2 font-mono text-xs" /></label>
    <label className="text-xs font-bold text-slate-700">Tên loại báo cáo<input value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-xs" /></label>
    <label className="text-xs font-bold text-slate-700">Nhóm nghiệp vụ<select value={value.category} onChange={event => onChange({ ...value, category: event.target.value as CreateReportChannelDTO['category'] })} className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2 text-xs"><option value="REGULAR_AUDIT">Kiểm tra thường xuyên</option><option value="THEMATIC_AUDIT">Kiểm tra chuyên đề</option><option value="COMPLIANCE_AML">Tuân thủ và AML</option><option value="OPERATIONAL_RISK">Rủi ro vận hành</option><option value="CREDIT_INSPECTION">Kiểm tra tín dụng</option><option value="BRANCH_REPORT">Báo cáo chi nhánh</option></select></label>
    <label className="text-xs font-bold text-slate-700">Đơn vị ban hành<input value={value.issuingDepartment} onChange={event => onChange({ ...value, issuingDepartment: event.target.value })} className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-xs" /></label>
    <label className="text-xs font-bold text-slate-700 md:col-span-2">Mô tả<textarea rows={3} value={value.description} onChange={event => onChange({ ...value, description: event.target.value })} className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-xs" /></label>
    <div className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Cách nhập dữ liệu</span><div className="mt-2 flex flex-wrap gap-3">{([['WEB_FORM', 'Nhập form'], ['EXCEL_IMPORT', 'Nhập Excel'], ['API', 'API']] as const).map(([method, label]) => <label key={method} className="inline-flex items-center gap-2 rounded-lg border border-rule px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={value.inputMethods.includes(method)} onChange={event => onChange({ ...value, inputMethods: event.target.checked ? [...value.inputMethods, method] : value.inputMethods.filter(item => item !== method) })} />{label}</label>)}</div></div>
    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={value.isActive} onChange={event => onChange({ ...value, isActive: event.target.checked })} /> Cho phép tạo hồ sơ mới</label>
    <div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="h-4 w-4" /> Thay đổi được ghi thành phiên bản mới.</div>
  </div>
);

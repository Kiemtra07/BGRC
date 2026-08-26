import React, { useEffect, useMemo, useState } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import {
  AuditCampaign, BUSINESS_LINES, BusinessLine, DynamicFieldDefinition, OrgUnit, RISK_LEVELS, ReportChannel,
  ReportFormBlockWidth, RiskLevel, WebFormFindingDTO, businessLineLabels, riskLevelLabels,
} from '../../../shared/contracts';
import { REPORT_FORM_WIDTH_CLASS, ReportFieldLabel, ReportFormBlockLayout, resolveReportFormTemplate } from '../reports/ReportFormBlockLayout';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  channels: ReportChannel[];
  campaigns: AuditCampaign[];
  initialCampaignId?: string;
  orgUnits: OrgUnit[];
  onSubmit: (dto: WebFormFindingDTO) => void;
}

const emptyValue = (value: unknown): boolean => value === undefined || value === null || value === '';

export const WebFormFindingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  channels,
  campaigns,
  initialCampaignId,
  orgUnits,
  onSubmit,
}) => {
  const branches = useMemo(() => orgUnits.filter(u => u.type === 'BRANCH'), [orgUnits]);

  const [channelId, setChannelId] = useState(channels[0]?.id || 'chan-audit-bgs');
  const [campaignId, setCampaignId] = useState(initialCampaignId || campaigns[0]?.id || '');
  const [cif, setCif] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.code || '');
  const [errorCode, setErrorCode] = useState('TD01.01');
  const [errorTitle, setErrorTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exposureAmount, setExposureAmount] = useState<number>(1000);
  const [creditBalance] = useState<number>(5000);
  const [decisionNo, setDecisionNo] = useState('QĐ-KTNB-2026/08');
  const [sourceRecordCode, setSourceRecordCode] = useState('');
  const [businessLine, setBusinessLine] = useState<BusinessLine>('TIN_DUNG');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('TRUNG_BINH');
  const [penaltyProposalCode, setPenaltyProposalCode] = useState('');
  const [referenceDocument, setReferenceDocument] = useState('');
  const [customPayload, setCustomPayload] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string>();

  // The modal stays mounted while closed, so reopening has to start from a clean draft.
  useEffect(() => {
    if (!isOpen) return;
    setChannelId(channels[0]?.id || 'chan-audit-bgs');
    setCampaignId(initialCampaignId || campaigns[0]?.id || '');
    setCif('');
    setCustomerName('');
    setErrorTitle('');
    setDescription('');
    setSourceRecordCode('');
    setPenaltyProposalCode('');
    setReferenceDocument('');
    setCustomPayload({});
    setFormError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Branches arrive asynchronously; keep the selection on a real branch once they load.
  useEffect(() => {
    if (branches.length && !branches.some(branch => branch.code === selectedBranch)) {
      setSelectedBranch(branches[0].code);
    }
  }, [branches, selectedBranch]);

  const selectedChannelConfig = channels.find(channel => channel.id === channelId);
  const customFields = selectedChannelConfig?.schemaConfig?.fields ?? [];
  const eligibleCampaigns = campaigns.filter(campaign => campaign.reportChannelIds.includes(channelId) && campaign.branchCodes.includes(selectedBranch));
  const effectiveCampaignId = eligibleCampaigns.some(campaign => campaign.id === campaignId) ? campaignId : eligibleCampaigns[0]?.id ?? '';
  const selectedCampaign = eligibleCampaigns.find(campaign => campaign.id === effectiveCampaignId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    if (!cif || !customerName || !errorCode || !errorTitle || !description) {
      setFormError('Vui lòng nhập đủ CIF, tên khách hàng, mã lỗi, tiêu đề và mô tả sai sót.');
      return;
    }
    if (!selectedBranch) {
      setFormError('Chưa có chi nhánh nào để chọn. Liên hệ quản trị viên để được cấp phạm vi chi nhánh.');
      return;
    }
    // `file` fields are uploaded after the case exists, so they can never be satisfied here.
    const missing = customFields.find(field => field.isRequired && field.dataType !== 'file' && emptyValue(customPayload[field.fieldKey]));
    if (missing) {
      setFormError(`Trường “${missing.label}” của loại báo cáo này là bắt buộc.`);
      return;
    }

    const branchObj = branches.find(b => b.code === selectedBranch);

    onSubmit({
      campaignId: effectiveCampaignId || undefined,
      channelId,
      cif,
      customerName,
      clusterName: branchObj?.parentName || 'Cụm Tây Nguyên',
      branchCode: selectedBranch,
      branchName: branchObj?.name || `Chi nhánh ${selectedBranch}`,
      decisionNo,
      errorCode,
      errorTitle,
      description,
      exposureAmount: Number(exposureAmount),
      creditBalance: Number(creditBalance),
      inspectionTeamCode: selectedCampaign?.code,
      sourceRecordCode: sourceRecordCode.trim() || undefined,
      businessLine,
      riskLevel,
      penaltyProposalCode: penaltyProposalCode.trim() || undefined,
      referenceDocument: referenceDocument.trim() || undefined,
      customPayload,
    });

    onClose();
  };

  const renderCustomControl = (field: DynamicFieldDefinition) => field.dataType === 'file'
    ? <span className="block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-500">Tải tệp tại hồ sơ sau khi tạo.</span>
    : field.dataType === 'select' ? <select required={field.isRequired} value={String(customPayload[field.fieldKey] ?? '')} onChange={event => setCustomPayload(previous => ({ ...previous, [field.fieldKey]: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">Chọn...</option>{field.dropdownOptions?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.dataType === 'textarea' ? <textarea required={field.isRequired} rows={3} value={String(customPayload[field.fieldKey] ?? '')} onChange={event => setCustomPayload(previous => ({ ...previous, [field.fieldKey]: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
        : <input required={field.isRequired} type={field.dataType === 'number' || field.dataType === 'currency' ? 'number' : field.dataType === 'date' ? 'date' : 'text'} value={String(customPayload[field.fieldKey] ?? '')} onChange={event => setCustomPayload(previous => ({ ...previous, [field.fieldKey]: field.dataType === 'number' || field.dataType === 'currency' ? Number(event.target.value) : event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />;

  const renderCustomField = (field: DynamicFieldDefinition, width: ReportFormBlockWidth = 'HALF') => {
    const span = field.dataType === 'textarea' ? REPORT_FORM_WIDTH_CLASS.FULL : REPORT_FORM_WIDTH_CLASS[width];
    return <label className={span}>
      <ReportFieldLabel label={field.label} required={field.isRequired && field.dataType !== 'file'} emphasized={field.isEmphasized} />
      <span className="mt-1 block">{renderCustomControl(field)}</span>
      {field.helpText && <span className="mt-1 block text-[11px] font-normal text-slate-500">{field.helpText}</span>}
    </label>;
  };

  const schemaConfig = selectedChannelConfig?.schemaConfig;
  const formTemplate = schemaConfig ? resolveReportFormTemplate(schemaConfig, selectedChannelConfig?.name ? `Mẫu ${selectedChannelConfig.name}` : undefined) : undefined;
  const presentationMode = formTemplate?.presentationMode ?? 'CASE_REVIEW';
  const allowEvidenceAttachments = formTemplate?.allowEvidenceAttachments ?? true;
  const hasCampaignBlock = formTemplate?.blocks.some(block => block.type === 'CAMPAIGN_CONTEXT') ?? false;
  const renderCampaignContext = () => <section className={`rounded-xl border border-teal-200 bg-teal-50 p-3 ${REPORT_FORM_WIDTH_CLASS.FULL}`}>
    <label className="text-xs font-black text-[#006b68]">Chuyên đề áp dụng<select value={effectiveCampaignId} onChange={event => setCampaignId(event.target.value)} required className="mt-1.5 min-h-10 w-full rounded-lg border border-teal-200 bg-white px-3 text-xs font-semibold text-slate-800"><option value="">Chọn chuyên đề</option>{eligibleCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.code} · {campaign.name}</option>)}</select></label>
    {selectedCampaign && <dl className="mt-3 grid gap-2 text-[11px] text-slate-700 sm:grid-cols-3"><div><dt className="font-bold text-slate-500">Quyết định</dt><dd className="mt-0.5 font-semibold">{selectedCampaign.decisionNo}</dd></div><div><dt className="font-bold text-slate-500">Thời gian</dt><dd className="mt-0.5 font-semibold">{selectedCampaign.startDate} – {selectedCampaign.endDate}</dd></div><div><dt className="font-bold text-slate-500">Phạm vi</dt><dd className="mt-0.5 font-semibold">{selectedCampaign.branchCodes.length} chi nhánh</dd></div></dl>}
    {!eligibleCampaigns.length && <p className="mt-2 text-[11px] font-semibold text-red-700">Không có chuyên đề phù hợp loại báo cáo và chi nhánh đã chọn.</p>}
  </section>;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-base">Tạo hồ sơ sai sót</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {!hasCampaignBlock && renderCampaignContext()}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Kênh tiếp nhận</label>
            <select
              value={channelId}
              onChange={e => { setChannelId(e.target.value); setCustomPayload({}); setFormError(undefined); }}
              className="w-full px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
            >
              {channels.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">CIF khách hàng</label>
              <input
                type="text"
                value={cif}
                onChange={e => setCif(e.target.value)}
                placeholder="Ví dụ: 10482910"
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tên khách hàng</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Công ty TNHH..."
                className="w-full px-3 py-2 border rounded-lg text-xs font-semibold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Chi nhánh phụ trách</label>
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs font-medium bg-white"
                required
              >
                {!branches.length && <option value="">Chưa có chi nhánh khả dụng</option>}
                {branches.map(b => (
                  <option key={b.id} value={b.code}>{b.code} - {b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Số quyết định kiểm tra</label>
              <input
                type="text"
                value={decisionNo}
                onChange={e => setDecisionNo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Mã lỗi</label>
              <input
                type="text"
                value={errorCode}
                onChange={e => setErrorCode(e.target.value)}
                placeholder="TD01.01"
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Dư nợ ảnh hưởng (triệu đồng)</label>
              <input
                type="number"
                value={exposureAmount}
                onChange={e => setExposureAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Tên tồn tại, sai sót</label>
            <input
              type="text"
              value={errorTitle}
              onChange={e => setErrorTitle(e.target.value)}
              placeholder="Chưa thu thập đầy đủ chứng từ..."
              className="w-full px-3 py-2 border rounded-lg text-xs font-medium"
              required
            />
          </div>

          {/* Grading and provenance the đoàn kiểm tra assigned in CoPlus, kept with the finding so a
              sai sót lifted from a Tiểu biên bản arrives here complete. */}
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-1 text-[11px] font-black uppercase tracking-wide text-[#006b68]">Nguồn kiểm tra và mức độ</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <label className={REPORT_FORM_WIDTH_CLASS.THIRD}>
                <ReportFieldLabel label="Loại nghiệp vụ" required />
                <select value={businessLine} onChange={e => setBusinessLine(e.target.value as BusinessLine)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  {BUSINESS_LINES.map(line => <option key={line} value={line}>{businessLineLabels[line]}</option>)}
                </select>
              </label>
              <label className={REPORT_FORM_WIDTH_CLASS.THIRD}>
                <ReportFieldLabel label="Mức độ rủi ro" required />
                <select value={riskLevel} onChange={e => setRiskLevel(e.target.value as RiskLevel)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  {RISK_LEVELS.map(level => <option key={level} value={level}>{riskLevelLabels[level]}</option>)}
                </select>
              </label>
              <label className={REPORT_FORM_WIDTH_CLASS.THIRD}>
                <ReportFieldLabel label="Mã tiểu biên bản nguồn" />
                <input value={sourceRecordCode} onChange={e => setSourceRecordCode(e.target.value)} placeholder="117.TBBTD.2026.2" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs" />
              </label>
              <label className={REPORT_FORM_WIDTH_CLASS.THIRD}>
                <ReportFieldLabel label="Đề xuất xử phạt" />
                <input value={penaltyProposalCode} onChange={e => setPenaltyProposalCode(e.target.value)} placeholder="1.1.2" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs" />
              </label>
              <label className={REPORT_FORM_WIDTH_CLASS.HALF}>
                <ReportFieldLabel label="Văn bản dẫn chiếu" />
                <input value={referenceDocument} onChange={e => setReferenceDocument(e.target.value)} placeholder="Văn bản quy định..." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
              </label>
            </div>
          </fieldset>

          {schemaConfig && formTemplate && (customFields.length > 0 || hasCampaignBlock) && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-presentation-mode={presentationMode}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-extrabold text-slate-800">{formTemplate.name}</h4><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{presentationMode === 'EXCEL_GRID' ? 'Nhập theo bảng' : presentationMode === 'FORM_ONLY' ? 'Nhập theo form' : 'Hồ sơ kiểm soát'}</span></div>
            <ReportFormBlockLayout
              schema={schemaConfig}
              template={formTemplate}
              renderField={renderCustomField}
              renderGridCell={renderCustomControl}
              renderCampaignContext={renderCampaignContext}
            />
            {!allowEvidenceAttachments && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">Loại báo cáo này xử lý bằng dữ liệu trên form, không yêu cầu tài liệu đính kèm.</p>}
          </div>}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">{allowEvidenceAttachments ? 'Mô tả và bằng chứng' : 'Mô tả sai sót'}</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ghi rõ ngày giải ngân, số tiền, chứng từ còn thiếu..."
              className="w-full p-3 border rounded-lg text-xs font-medium"
              required
            />
          </div>

          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{formError}</p>}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-md shadow-sky-500/20"
            >
              Tạo hồ sơ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

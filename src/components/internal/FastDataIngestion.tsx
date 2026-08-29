import React, { useState } from 'react';
import { CustomerRecord, BatchUploadResult, UserProfile } from '../../types';
import { ExcelFastIngestionService } from '../../lib/excel-parser';
import { api } from '../../services/api';
import type { AuditCampaign, CampaignImportDraft, CreateAuditCampaignDTO, ReportChannel } from '../../../shared/contracts';
import {
  Upload,
  Archive,
  ClipboardPaste,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  FolderOpen,
  Info
} from 'lucide-react';

interface FastDataIngestionProps {
  currentUser: UserProfile;
  channels: ReportChannel[];
  campaigns: AuditCampaign[];
  onCampaignCreated: (campaign: CreateAuditCampaignDTO) => Promise<AuditCampaign>;
  onCommitNewCustomers: (newCustomers: CustomerRecord[]) => void | Promise<void>;
  onClose?: () => void;
}

const normalizeImportedDate = (value?: string) => {
  const date = value?.trim();
  if (!date) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const vietnameseDate = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!vietnameseDate) return undefined;
  const [, day, month, year] = vietnameseDate;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

type ImportedCampaignForm = Required<Pick<CreateAuditCampaignDTO, 'code' | 'name' | 'decisionNo' | 'startDate' | 'endDate'>>;

const isoDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const FastDataIngestion: React.FC<FastDataIngestionProps> = ({
  currentUser,
  channels,
  campaigns,
  onCampaignCreated,
  onCommitNewCustomers,
  onClose
}) => {
  const [activeMode, setActiveMode] = useState<'MULTI_EXCEL' | 'ZIP_BATCH' | 'CLIPBOARD' | 'DOCX' | 'PRESET_SAMPLE'>('MULTI_EXCEL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResults, setUploadResults] = useState<BatchUploadResult[]>([]);
  const [stagedCustomers, setStagedCustomers] = useState<CustomerRecord[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [channelId, setChannelId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaignDraftSource, setCampaignDraftSource] = useState<CampaignImportDraft | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<ImportedCampaignForm | null>(null);
  const availableCampaigns = campaigns.filter(campaign => campaign.status === 'ACTIVE' && campaign.reportChannelIds.includes(channelId));
  const targetSelected = Boolean(channelId && campaignId);

  // 1. Handle Multi-Excel selection
  const handleMultiExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setSelectedFileCount(files.length);
    const results: BatchUploadResult[] = [];
    const allExtractedCusts: CustomerRecord[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await ExcelFastIngestionService.parseExcelFile(file, currentUser);
      results.push(res);
      allExtractedCusts.push(...res.customers);
    }

    setUploadResults(results);
    setStagedCustomers(allExtractedCusts);
    setIsProcessing(false);
  };

  // 2. Handle Zip archive upload
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const zipFile = files[0];
    const results = await ExcelFastIngestionService.parseZipBatch(zipFile, currentUser);
    const allExtractedCusts = results.flatMap(r => r.customers);

    setUploadResults(results);
    setStagedCustomers(allExtractedCusts);
    setIsProcessing(false);
  };

  // 3. Handle Clipboard Paste from Excel
  const handlePasteProcess = () => {
    if (!pastedText.trim()) {
      alert('Vui lòng dán dữ liệu bảng copy từ Excel vào khung văn bản!');
      return;
    }

    setIsProcessing(true);
    const res = ExcelFastIngestionService.parsePastedExcelText(pastedText, currentUser);
    setUploadResults([res]);
    setStagedCustomers(res.customers);
    setIsProcessing(false);
  };

  const handleDocxUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const [preview, importedCampaign] = await Promise.all([
        api.previewFindingDocx(file),
        campaignId ? Promise.resolve(null) : api.importCampaignDraft(file),
      ]);
      const customers = new Map<string, CustomerRecord>();
      preview.rows.forEach(row => {
        const key = `${row.branchCode}:${row.cif}`;
        const customer: CustomerRecord = customers.get(key) ?? {
          id: `DOCX-${row.branchCode}-${row.cif}`, cif: row.cif, customerName: row.customerName,
          clusterName: 'Theo chuyên đề', branchCode: row.branchCode, branchName: row.branchName,
          department: row.department || 'Chưa có trong tệp', decisionNo: row.decisionNo || 'Chưa có trong tệp', auditDate: '', inspectorName: currentUser.name, creditBalance: 0,
          collateralValue: 0,
          loanGroup: 'Chưa có trong tệp', loanPurpose: 'Chưa có trong tệp', officerName: 'Chưa có trong tệp',
          deptHeadName: 'Chưa có trong tệp', errors: [], totalErrors: 0, activeErrors: 0, resolvedErrors: 0,
        };
        customer.errors.push({
          id: `DOCX-ERR-${row.rowNumber}-${row.errorCode}`, customerId: customer.id,
          errorCode: row.errorCode, errorGroup: row.errorCode.slice(0, 4), errorTitle: row.errorTitle,
          description: row.description, quantity: 1, exposureAmount: 0, status: 'PENDING',
          attachments: [], history: [], isOverdue: false,
        });
        customer.totalErrors = customer.errors.length;
        customer.activeErrors = customer.errors.length;
        customers.set(key, customer);
      });
      const staged = [...customers.values()];
      setStagedCustomers(staged);
      setUploadResults([{ fileName: preview.fileName, totalCustomersFound: staged.length, totalErrorsExtracted: preview.rows.length, branchDetected: staged[0]?.branchName || 'Nhiều chi nhánh', decisionNoDetected: staged[0]?.decisionNo || 'Không xác định', status: 'SUCCESS', message: `Đã tách ${preview.rows.length} mã lỗi để kiểm tra.`, customers: staged }]);
      if (importedCampaign) {
        setCampaignDraftSource(importedCampaign);
        setCampaignDraft({
          code: importedCampaign.draft.code || `CD-${Date.now().toString().slice(-8)}`,
          name: importedCampaign.draft.name || file.name.replace(/\.docx$/i, ''),
          decisionNo: importedCampaign.draft.decisionNo || staged[0]?.decisionNo || 'Chưa xác định',
          startDate: importedCampaign.draft.startDate || isoDateOffset(0),
          endDate: importedCampaign.draft.endDate || isoDateOffset(30),
        });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể đọc DOCX.');
    } finally {
      setIsProcessing(false);
    }
  };

  const createCampaignFromDocument = async () => {
    if (!campaignDraft || !channelId) {
      alert('Hãy chọn Loại báo cáo trước khi tạo chuyên đề.');
      return;
    }
    const branchCodes = [...new Set(stagedCustomers.map(customer => customer.branchCode).filter(Boolean))];
    if (!branchCodes.length) {
      alert('Tiểu biên bản chưa có mã chi nhánh hợp lệ.');
      return;
    }
    try {
      setIsProcessing(true);
      const created = await onCampaignCreated({
        ...campaignDraft,
        description: campaignDraftSource?.draft.description || `Tạo từ ${campaignDraftSource?.source.fileName || 'tiểu biên bản tải lên'}.`,
        leadUserId: currentUser.id,
        members: [{ userId: currentUser.id, memberRole: 'LEAD', assignedBranchCodes: branchCodes }],
        branchCodes,
        reportChannelIds: [channelId],
      });
      setCampaignId(created.id);
      setCampaignDraft(null);
      setCampaignDraftSource(null);
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : 'Không thể tạo chuyên đề.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. One-Click Desktop Sample Loader
  const handleLoadDesktopSample = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const sampleCusts: CustomerRecord[] = [
        {
          id: 'CUST_NAM_BUON_HO_' + Date.now(),
          cif: '109928341',
          customerName: 'Hộ Kinh Doanh Y Krông Niê',
          clusterName: 'Cụm Tây Nguyên',
          branchCode: '635',
          branchName: 'Chi nhánh Nam Buôn Hồ',
          department: 'PGD Nam Buôn Hồ 1',
          decisionNo: '121/QĐ-KTGS2025 ngày 20/01/2025',
          auditDate: '30/09/2025',
          inspectorName: 'Phạm Văn Kiểm Tra',
          creditBalance: 1600,
          loanGroup: 'Nhóm 1',
          collateralValue: 3200,
          loanPurpose: 'Vay chăm sóc tái canh 4ha cà phê Catimor',
          officerName: 'Nguyễn Văn Đạt',
          deptHeadName: 'Trần Đình Trọng',
          totalErrors: 2,
          activeErrors: 2,
          resolvedErrors: 0,
          errors: [
            {
              id: 'ERR_NBH_1',
              customerId: 'CUST_NAM_BUON_HO_' + Date.now(),
              errorCode: 'TD01.01',
              errorGroup: 'TD01',
              errorTitle: 'Chưa tuân thủ điều kiện ủy nhiệm',
              description: 'Chưa ký phụ lục bổ sung điều kiện cam kết theo phê duyệt của Ban Giám đốc.',
              quantity: 1,
              exposureAmount: 1600,
              status: 'PENDING',
              deadlineDate: '2026-09-20',
              attachments: [],
              history: [
                {
                  id: 'LOG_SMP_1',
                  timestamp: '2026-08-24 10:00',
                  action: 'CREATE',
                  actorName: 'Phạm Văn Kiểm Tra',
                  actorRole: 'INTERNAL_OFFICER',
                  notes: 'Nạp nhanh từ mẫu TUYEN TIEU BIEN BAN KHCN PGD NAM BUON HO 1.xlsx'
                }
              ]
            },
            {
              id: 'ERR_NBH_2',
              customerId: 'CUST_NAM_BUON_HO_' + Date.now(),
              errorCode: 'TD02.01',
              errorGroup: 'TD02',
              errorTitle: 'Thiếu hồ sơ pháp lý tài sản',
              description: 'Bản trích lục bản đồ địa chính thửa đất số 45 tờ bản đồ số 12 chưa có dấu xác nhận của Chi nhánh VP Đăng ký đất đai.',
              quantity: 1,
              exposureAmount: 1600,
              status: 'PENDING',
              deadlineDate: '2026-09-20',
              attachments: [],
              history: [
                {
                  id: 'LOG_SMP_2',
                  timestamp: '2026-08-24 10:00',
                  action: 'CREATE',
                  actorName: 'Phạm Văn Kiểm Tra',
                  actorRole: 'INTERNAL_OFFICER',
                  notes: 'Nạp nhanh từ mẫu TUYEN TIEU BIEN BAN KHCN PGD NAM BUON HO 1.xlsx'
                }
              ]
            }
          ]
        },
        {
          id: 'CUST_BINH_TAY_' + Date.now(),
          cif: '104829184',
          customerName: 'Công ty Cổ phần May Xuất Khẩu Sài Gòn Mới',
          clusterName: 'Cụm TP.HCM',
          branchCode: '428',
          branchName: 'Chi nhánh Bình Tây Sài Gòn',
          department: 'Phòng KHDN',
          decisionNo: '20012025/QĐ-BGS ngày 20/01/2025',
          auditDate: '30/09/2025',
          inspectorName: 'Nguyễn Thị Giám Sát',
          creditBalance: 8400,
          loanGroup: 'Nhóm 1',
          collateralValue: 15000,
          loanPurpose: 'Vay tài trợ đơn hàng xuất khẩu vải dệt sang thị trường EU',
          officerName: 'Lý Quốc Huy',
          deptHeadName: 'Trịnh Thanh Bình',
          totalErrors: 1,
          activeErrors: 1,
          resolvedErrors: 0,
          errors: [
            {
              id: 'ERR_BT_1',
              customerId: 'CUST_BINH_TAY_' + Date.now(),
              errorCode: 'TD03.01',
              errorGroup: 'TD03',
              errorTitle: 'Báo cáo thẩm định chưa đánh giá biến động tỷ giá',
              description: 'Chưa tính toán độ nhạy chi phí nguyên liệu nhập khẩu khi tỷ giá EUR/VND biến động.',
              quantity: 1,
              exposureAmount: 8400,
              status: 'PENDING',
              deadlineDate: '2026-09-18',
              attachments: [],
              history: [
                {
                  id: 'LOG_SMP_3',
                  timestamp: '2026-08-24 10:00',
                  action: 'CREATE',
                  actorName: 'Nguyễn Thị Giám Sát',
                  actorRole: 'SUPERVISOR',
                  notes: 'Nạp nhanh từ hồ sơ mẫu CoTeam19 635 / PData / AppDocs'
                }
              ]
            }
          ]
        }
      ];

      setUploadResults([
        {
          fileName: 'TUYEN TIEU BIEN BAN KHCN PGD NAM BUON HO 1.xlsx',
          totalCustomersFound: 1,
          totalErrorsExtracted: 2,
          branchDetected: 'Chi nhánh Nam Buôn Hồ (635)',
          decisionNoDetected: '121/QĐ-KTGS2025',
          status: 'SUCCESS',
          message: 'Trích xuất hoàn chỉnh mẫu tiểu biên bản Nam Buôn Hồ',
          customers: [sampleCusts[0]]
        },
        {
          fileName: 'CoTeam19_B428.251-DLG-HSTD.xlsx',
          totalCustomersFound: 1,
          totalErrorsExtracted: 1,
          branchDetected: 'Chi nhánh Bình Tây Sài Gòn (428)',
          decisionNoDetected: '20012025/QĐ-BGS',
          status: 'SUCCESS',
          message: 'Trích xuất hồ sơ lỗi tín dụng Bình Tây Sài Gòn',
          customers: [sampleCusts[1]]
        }
      ]);
      setStagedCustomers(sampleCusts);
      setIsProcessing(false);
    }, 400);
  };

  // Commit staged data to master system
  const handleCommit = async () => {
    const customersWithErrors = stagedCustomers.filter(customer => customer.errors.length > 0);
    if (customersWithErrors.length === 0) {
      alert('Không có khách hàng nào có mã sai sót hợp lệ để lưu vào hệ thống.');
      return;
    }
    if (!targetSelected) {
      alert('Cần chọn Chuyên đề trước khi lưu dữ liệu.');
      return;
    }
    try {
      setIsProcessing(true);
      const result = await api.importFindings({
        sourceFileName: uploadResults.map(item => item.fileName).join(', ') || 'clipboard-import.xlsx',
        sourceType: activeMode === 'ZIP_BATCH' ? 'ZIP_XLSX' : activeMode === 'CLIPBOARD' ? 'CLIPBOARD' : activeMode === 'DOCX' ? 'DOCX' : 'XLSX',
        rows: customersWithErrors.flatMap(customer => customer.errors.map(error => ({
          channelId,
          campaignId,
          cif: customer.cif,
          customerName: customer.customerName,
          clusterName: customer.clusterName,
          branchCode: customer.branchCode,
          branchName: customer.branchName,
          department: customer.department,
          decisionNo: customer.decisionNo,
          auditDate: normalizeImportedDate(customer.auditDate),
          deadlineDate: normalizeImportedDate(error.deadlineDate),
          loanGroup: customer.loanGroup,
          collateralValue: customer.collateralValue,
          loanPurpose: customer.loanPurpose,
          errorCode: error.errorCode,
          errorGroup: error.errorGroup,
          errorTitle: error.errorTitle,
          description: error.description,
          quantity: error.quantity,
          exposureAmount: error.exposureAmount,
          // CoPlus provenance, when the source file carried those columns.
          inspectionTeamCode: error.inspectionTeamCode,
          sourceRecordCode: error.sourceRecordCode,
          businessLine: error.businessLine,
          riskLevel: error.riskLevel,
          penaltyProposalCode: error.penaltyProposalCode,
          referenceDocument: error.referenceDocument,
          creditBalance: customer.creditBalance,
          officerName: customer.officerName,
          deptHeadName: customer.deptHeadName,
          inspectorName: customer.inspectorName,
        }))),
      });
      await onCommitNewCustomers(customersWithErrors);
      alert(`Đã nhập ${result.customerCount} khách hàng, ${result.findingCount} mã lỗi; bỏ qua ${result.duplicateCount} dòng trùng.`);
      setStagedCustomers([]);
      setUploadResults([]);
      if (onClose) onClose();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : 'Không thể lưu lô dữ liệu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalErrorsInStage = stagedCustomers.flatMap(c => c.errors).length;
  const customersWithErrorsInStage = stagedCustomers.filter(customer => customer.errors.length > 0).length;

  return (
    <div className="bg-white rounded-2xl border border-rule shadow-panel overflow-hidden">

      {/* Header. The gradient slab and its decorative sparkle chip added 96px of chrome above a
          screen whose whole job is two selects and a file picker. */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3.5">
        <div className="min-w-0 flex items-center gap-2.5">
          <Upload className="h-5 w-5 shrink-0 text-brand-500" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-slate-900">
              Nhập dữ liệu
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Chọn loại báo cáo, chuyên đề và nguồn dữ liệu.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        )}
      </div>

      <div className="grid gap-3 border-b border-rule bg-white p-4 md:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-700">
          <span>Loại báo cáo</span>
          <select value={channelId} onChange={event => { setChannelId(event.target.value); setCampaignId(''); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
            <option value="">Chọn loại báo cáo</option>
            {channels.filter(channel => channel.isActive).map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-700">
          <span>Chuyên đề</span>
          <select value={campaignId} onChange={event => setCampaignId(event.target.value)} disabled={!channelId} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
            <option value="">Chọn chuyên đề</option>
            {availableCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
        <p className="text-[11px] text-slate-500 md:col-span-2">Có thể chọn tệp trước; chỉ cần chọn Chuyên đề trước khi lưu dữ liệu vào hệ thống.</p>
      </div>

      {campaignDraft && <section className="border-b border-amber-200 bg-amber-50 p-4" aria-label="Tạo chuyên đề từ tiểu biên bản">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-amber-950">Tạo chuyên đề từ tiểu biên bản</h3><p className="mt-1 text-[11px] text-amber-800">Chưa chọn chuyên đề. Hệ thống đã điền trước thông tin đọc được; kiểm tra rồi tạo để tiếp tục nhập.</p></div>{campaignDraftSource?.warnings.length ? <span className="text-[10px] font-bold text-amber-700">{campaignDraftSource.warnings.length} mục cần kiểm tra</span> : null}</div>
        <div className="grid gap-2 md:grid-cols-5">
          <input aria-label="Mã chuyên đề" value={campaignDraft.code} onChange={event => setCampaignDraft({ ...campaignDraft, code: event.target.value })} placeholder="Mã chuyên đề" className="input" />
          <input aria-label="Tên chuyên đề" value={campaignDraft.name} onChange={event => setCampaignDraft({ ...campaignDraft, name: event.target.value })} placeholder="Tên chuyên đề" className="input md:col-span-2" />
          <input aria-label="Ngày bắt đầu" type="date" value={campaignDraft.startDate} onChange={event => setCampaignDraft({ ...campaignDraft, startDate: event.target.value })} className="input" />
          <input aria-label="Ngày kết thúc" type="date" value={campaignDraft.endDate} onChange={event => setCampaignDraft({ ...campaignDraft, endDate: event.target.value })} className="input" />
          <input aria-label="Số quyết định" value={campaignDraft.decisionNo} onChange={event => setCampaignDraft({ ...campaignDraft, decisionNo: event.target.value })} placeholder="Số quyết định" className="input md:col-span-3" />
          <button type="button" onClick={createCampaignFromDocument} disabled={isProcessing || !channelId} className="min-h-10 rounded-xl bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-40 md:col-span-2">{isProcessing ? 'Đang tạo...' : 'Tạo và chọn chuyên đề'}</button>
        </div>
      </section>}

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-b border-rule bg-slate-50/70 p-2 gap-2 text-xs">
        <button
          onClick={() => setActiveMode('MULTI_EXCEL')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'MULTI_EXCEL'
              ? 'bg-white text-brand-600 shadow-panel border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Nhiều tệp Excel</span>
        </button>

        <button
          onClick={() => setActiveMode('ZIP_BATCH')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'ZIP_BATCH'
              ? 'bg-white text-brand-600 shadow-panel border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <Archive className="w-4 h-4 text-amber-600" />
          <span>Tệp ZIP</span>
        </button>

        <button
          onClick={() => setActiveMode('CLIPBOARD')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'CLIPBOARD'
              ? 'bg-white text-brand-600 shadow-panel border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <ClipboardPaste className="w-4 h-4 text-info" />
          <span>Dán từ Excel</span>
        </button>

        <button
          onClick={() => setActiveMode('PRESET_SAMPLE')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'PRESET_SAMPLE'
              ? 'bg-white text-brand-600 shadow-panel border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <FolderOpen className="w-4 h-4 text-info" />
          <span>Dữ liệu mẫu</span>
        </button>

        <button
          onClick={() => setActiveMode('DOCX')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${activeMode === 'DOCX' ? 'bg-white text-brand-600 shadow-panel border border-brand-200' : 'text-slate-600 hover:bg-white/60'}`}
        >
          <Upload className="w-4 h-4 text-info" /><span>Tệp DOCX</span>
        </button>
      </div>

      {/* Main Mode Action Area */}
      <div className="p-6">
        
        {/* MODE 1: MULTI-EXCEL */}
        {activeMode === 'MULTI_EXCEL' && (
          <div className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-brand-50/20 transition group">
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              id="multi-excel-input"
              className="hidden"
               onChange={handleMultiExcelUpload}
            />
            <label htmlFor="multi-excel-input" className="cursor-pointer flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 group-hover:bg-brand-100 text-brand-500 flex items-center justify-center mb-3 transition shadow-panel">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Chọn các tệp Excel
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Có thể chọn nhiều file .xlsx cùng lúc.
              </p>
              <span className="mt-4 px-4 py-2 bg-brand-500 group-hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-brand transition">
                Chọn tệp Excel
              </span>
            </label>
          </div>
        )}

        {/* MODE 2: ZIP BATCH */}
        {activeMode === 'ZIP_BATCH' && (
          <div className="border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-2xl p-8 text-center bg-amber-50/30 hover:bg-amber-50/60 transition group">
            <input
              type="file"
              accept=".zip,.rar"
              id="zip-batch-input"
              className="hidden"
               onChange={handleZipUpload}
            />
            <label htmlFor="zip-batch-input" className="cursor-pointer flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 transition shadow-panel">
                <Archive className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Chọn tệp ZIP
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Tệp ZIP có thể chứa nhiều tệp Excel.
              </p>
              <span className="mt-4 px-4 py-2 bg-amber-600 group-hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-panel transition">
                Chọn tệp ZIP
              </span>
            </label>
          </div>
        )}

        {/* MODE 3: CLIPBOARD COPY-PASTE */}
        {activeMode === 'CLIPBOARD' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-info" />
                Dán dữ liệu từ Excel
              </span>
              <span className="text-slate-400">Dữ liệu dạng bảng</span>
            </div>
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Dán các dòng đã sao chép từ Excel..."
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <div className="flex justify-end">
              <button
                onClick={handlePasteProcess}
                 disabled={!pastedText.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 rounded-xl shadow-panel transition"
              >
                Đọc dữ liệu
              </button>
            </div>
          </div>
        )}

        {activeMode === 'DOCX' && (
          <div className="border-2 border-dashed border-info-border rounded-2xl p-8 text-center bg-info-surface/30">
            <input type="file" accept=".docx" id="docx-finding-input" className="hidden" onChange={handleDocxUpload} />
            <label htmlFor="docx-finding-input" className="cursor-pointer flex flex-col items-center">
              <Upload className="mb-3 h-10 w-10 text-info" />
              <h3 className="text-base font-bold text-slate-800">Chọn tệp DOCX có bảng sai sót</h3>
              <p className="mt-1 text-xs text-slate-500">Bảng phải có Tên khách hàng, CIF, Mã chi nhánh và Mã sai sót.</p>
            </label>
          </div>
        )}

        {/* MODE 5: PRESET SAMPLE LOADER */}
        {activeMode === 'PRESET_SAMPLE' && (
          <div className="p-6 rounded-2xl bg-info-surface/60 border border-info-border flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-info text-white">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-info">
                  Nạp dữ liệu mẫu
                </h3>
                <p className="text-xs text-info mt-0.5">
                  Dùng dữ liệu mẫu của Nam Buôn Hồ và Bình Tây Sài Gòn.
                </p>
              </div>
            </div>
            <button
              onClick={handleLoadDesktopSample}
                 disabled={isProcessing}
              className="px-5 py-2.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-md transition flex-shrink-0"
            >
              {isProcessing ? 'Đang nạp...' : 'Nạp dữ liệu mẫu'}
            </button>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="my-6 p-4 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center gap-3 text-brand-700 text-xs font-bold animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
            <span>Đang đọc và kiểm tra dữ liệu...</span>
          </div>
        )}

        {/* Extraction Preview & Reconciliation Matrix */}
        {uploadResults.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-800">
                  Kết quả đọc dữ liệu ({uploadResults.length} tệp)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
                  {stagedCustomers.length} khách hàng
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-black">
                  {customersWithErrorsInStage} có sai sót
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800 text-xs font-black">
                  {totalErrorsInStage} mã lỗi
                </span>
              </div>
              <button
                onClick={handleCommit}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg transition transform hover:scale-[1.02]"
              >
                <CheckCircle2 className="w-4 h-4" />
                Lưu hồ sơ ({customersWithErrorsInStage} khách hàng)
              </button>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              {uploadResults.map(result => <div key={result.fileName} className={`rounded-xl border p-3 text-xs ${result.status === 'ERROR' ? 'border-red-200 bg-red-50 text-red-800' : result.status === 'WARNING' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                <div className="font-black">{result.fileName}</div>
                <div className="mt-1 leading-5">{result.message}</div>
                <div className="mt-1 text-[11px] opacity-80">{result.branchDetected} · QĐ {result.decisionNoDetected}</div>
              </div>)}
            </div>

            {/* Staged Results Table */}
            <div className="overflow-x-auto rounded-xl border border-rule max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 sticky top-0 text-slate-600 font-bold border-b border-rule">
                  <tr>
                    <th className="p-3">Tên khách hàng</th>
                    <th className="p-3">CIF</th>
                    <th className="p-3">Chi nhánh / phòng</th>
                    <th className="p-3">Dư nợ (triệu đồng)</th>
                    <th className="p-3">Mã lỗi</th>
                    <th className="p-3">Cán bộ QLKH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {stagedCustomers.map((cust, idx) => (
                    <tr key={cust.id || idx} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{cust.customerName}</td>
                      <td className="p-3 font-mono font-semibold text-brand-600">{cust.cif}</td>
                      <td className="p-3 text-slate-600">{cust.branchName} - {cust.department}</td>
                      <td className="p-3 font-bold text-slate-800">{cust.creditBalance.toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {cust.errors.map(err => (
                            <span key={err.id} className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-mono font-bold text-[11px] border border-brand-200">
                              {err.errorCode}
                            </span>
                          ))}
                          {cust.errors.length === 0 && <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">Không có mã lỗi</span>}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{cust.officerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};

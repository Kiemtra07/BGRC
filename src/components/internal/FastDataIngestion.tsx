import React, { useState } from 'react';
import { CustomerRecord, BatchUploadResult, UserProfile } from '../../types';
import { ExcelFastIngestionService } from '../../lib/excel-parser';
import { api } from '../../services/api';
import {
  Upload,
  Archive,
  ClipboardPaste,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  FolderOpen,
  Info
} from 'lucide-react';

interface FastDataIngestionProps {
  currentUser: UserProfile;
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

export const FastDataIngestion: React.FC<FastDataIngestionProps> = ({
  currentUser,
  onCommitNewCustomers,
  onClose
}) => {
  const [activeMode, setActiveMode] = useState<'MULTI_EXCEL' | 'ZIP_BATCH' | 'CLIPBOARD' | 'PRESET_SAMPLE'>('MULTI_EXCEL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResults, setUploadResults] = useState<BatchUploadResult[]>([]);
  const [stagedCustomers, setStagedCustomers] = useState<CustomerRecord[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [selectedFileCount, setSelectedFileCount] = useState(0);

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
    try {
      setIsProcessing(true);
      const result = await api.importFindings({
        sourceFileName: uploadResults.map(item => item.fileName).join(', ') || 'clipboard-import.xlsx',
        rows: customersWithErrors.flatMap(customer => customer.errors.map(error => ({
          channelId: 'chan-audit-bgs',
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
      alert(`Đã nạp ${result.customerCount} khách hàng, ${result.findingCount} mã lỗi; bỏ qua ${result.duplicateCount} dòng trùng.`);
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="brand-gradient p-6 text-white flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
            <Sparkles className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">
              Nạp dữ liệu
            </h2>
            <p className="text-xs text-brand-100 mt-1">
              Chọn nguồn dữ liệu cần nạp.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/70 p-2 gap-2 text-xs">
        <button
          onClick={() => setActiveMode('MULTI_EXCEL')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'MULTI_EXCEL'
              ? 'bg-white text-brand-600 shadow-sm border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Nhiều file Excel</span>
        </button>

        <button
          onClick={() => setActiveMode('ZIP_BATCH')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'ZIP_BATCH'
              ? 'bg-white text-brand-600 shadow-sm border border-brand-200'
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
              ? 'bg-white text-brand-600 shadow-sm border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <ClipboardPaste className="w-4 h-4 text-sky-600" />
          <span>Dán từ Excel</span>
        </button>

        <button
          onClick={() => setActiveMode('PRESET_SAMPLE')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold transition ${
            activeMode === 'PRESET_SAMPLE'
              ? 'bg-white text-brand-600 shadow-sm border border-brand-200'
              : 'text-slate-600 hover:bg-white/60'
          }`}
        >
          <FolderOpen className="w-4 h-4 text-indigo-600" />
          <span>Dữ liệu mẫu</span>
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
              <div className="w-16 h-16 rounded-2xl bg-brand-50 group-hover:bg-brand-100 text-brand-500 flex items-center justify-center mb-3 transition shadow-sm">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Chọn các file Excel
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Có thể chọn nhiều file .xlsx cùng lúc.
              </p>
              <span className="mt-4 px-4 py-2 bg-brand-500 group-hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-brand transition">
                Chọn file Excel
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
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 transition shadow-sm">
                <Archive className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Chọn tệp ZIP
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Tệp ZIP có thể chứa nhiều file Excel.
              </p>
              <span className="mt-4 px-4 py-2 bg-amber-600 group-hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
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
                <ClipboardPaste className="w-4 h-4 text-sky-600" />
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
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 rounded-xl shadow-sm transition"
              >
                Đọc dữ liệu
              </button>
            </div>
          </div>
        )}

        {/* MODE 4: PRESET SAMPLE LOADER */}
        {activeMode === 'PRESET_SAMPLE' && (
          <div className="p-6 rounded-2xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-600 text-white">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-950">
                  Nạp dữ liệu mẫu
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Dùng dữ liệu mẫu của Nam Buôn Hồ và Bình Tây Sài Gòn.
                </p>
              </div>
            </div>
            <button
              onClick={handleLoadDesktopSample}
              disabled={isProcessing}
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex-shrink-0"
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
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 sticky top-0 text-slate-600 font-bold border-b border-slate-200">
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

import React, { useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { CreateReportChannelDTO, DynamicSchemaConfig } from '../../../shared/contracts';
import { buildReportTemplateFromExcelRows } from '../../lib/report-template';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChannelCreated: (channel: Partial<CreateReportChannelDTO>) => Promise<void>;
}

export const ExcelTemplateImporterModal: React.FC<Props> = ({ isOpen, onClose, onChannelCreated }) => {
  const [file, setFile] = useState<File | null>(null);
  const [channelCode, setChannelCode] = useState('');
  const [channelName, setChannelName] = useState('');
  const [category, setCategory] = useState<'REGULAR_AUDIT' | 'COMPLIANCE_AML' | 'OPERATIONAL_RISK' | 'THEMATIC_AUDIT'>('THEMATIC_AUDIT');
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'MAP_CORE'>('UPLOAD');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatedSchema, setGeneratedSchema] = useState<DynamicSchemaConfig | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsAnalyzing(true);

    try {
      const sheetRows = await readSheet(uploadedFile);
      if (sheetRows.length > 0) {
        const schema = buildReportTemplateFromExcelRows(sheetRows as unknown[][], uploadedFile.name);
        const headers = schema.fields.map(field => field.label);
        setGeneratedSchema(schema);
        setDetectedHeaders(headers);

        const baseName = uploadedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setChannelName(`Báo cáo ${baseName}`);
        setChannelCode(`CHAN_${baseName.toUpperCase().replace(/\s+/g, '_').slice(0, 15)}`);

        const rows = sheetRows.slice(1, 6).map(row => {
          const rowObject: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            rowObject[header] = row[index];
          });
          return rowObject;
        });
        setSampleRows(rows);
        setStep('PREVIEW');
      }
    } catch (err) {
      console.error('Error parsing excel template', err);
      setSubmitError(err instanceof Error ? err.message : 'Tệp Excel không hợp lệ.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleComplete = async () => {
    try {
      setSubmitError(null);
      await onChannelCreated({
        code: channelCode,
        name: channelName,
        description: `Tạo từ mẫu Excel: ${file?.name}`,
        category,
        icon: 'FileSpreadsheet',
        badgeColor: 'purple',
        inputMethods: ['EXCEL_IMPORT', 'WEB_FORM'],
        issuingDepartment: 'Ban Quản trị Nghiệp vụ',
        isActive: true,
        schemaConfig: generatedSchema ? { ...generatedSchema, tableName: channelCode.toLowerCase() } : undefined,
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo kênh báo cáo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-rule w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-sky-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl"><FileSpreadsheet className="w-5 h-5 text-info" /></div>
            <h3 className="font-bold text-lg">Tạo loại báo cáo</h3>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {step === 'UPLOAD' && (
            <div className="space-y-4">
              <label className="border-2 border-dashed border-info-border hover:border-info-border rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer bg-info-surface/50 hover:bg-info-surface transition-all text-center group">
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                <div className="w-16 h-16 bg-info-surface group-hover:bg-info-border text-info rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <span className="font-bold text-slate-800 text-base mb-1">
                  Chọn tệp Excel
                </span>
                <span className="text-xs text-slate-500 max-w-sm">
                  Định dạng .xlsx hoặc .xls
                </span>
              </label>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  Dòng đầu tiên phải là tên cột.
                </div>
              </div>
            </div>
          )}

          {step === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Mã kênh</label>
                  <input 
                    type="text" 
                    value={channelCode} 
                    onChange={e => setChannelCode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-mono bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tên kênh</label>
                  <input 
                    type="text" 
                    value={channelName} 
                    onChange={e => setChannelName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Loại kênh</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-medium bg-white"
                >
                  <option value="REGULAR_AUDIT">Kiểm tra thường xuyên</option>
                  <option value="COMPLIANCE_AML">Giám sát tuân thủ và AML</option>
                  <option value="OPERATIONAL_RISK">Rủi ro vận hành</option>
                  <option value="THEMATIC_AUDIT">Kiểm tra chuyên đề</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Đã đọc {detectedHeaders.length} cột
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">{file?.name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-xl border border-rule max-h-36 overflow-y-auto">
                  {detectedHeaders.map((header, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-white text-slate-700 border border-rule rounded-md text-[11px] font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-info-surface0"></span>
                      {header}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-rule">
          {submitError && <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
              Hủy
            </button>
            {step === 'PREVIEW' && (
              <button 
                onClick={handleComplete} 
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 rounded-xl shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all"
              >
                <span>Tạo loại báo cáo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

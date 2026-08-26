import React, { useState } from 'react';
import { CustomerRecord, AuditError, AttachmentFile, UserProfile } from '../../types';
import { GoogleDriveService } from '../../lib/google-drive';
import { GoogleDriveViewerModal } from './GoogleDriveViewerModal';
import {
  X,
  User,
  Building2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Clock,
  Upload,
  HardDrive,
  Eye,
  Trash2,
  Send,
  CheckCheck,
  RotateCcw,
  FileText,
  ShieldCheck,
  ArrowRight,
  Info,
  DollarSign
} from 'lucide-react';

interface CustomerDetailModalProps {
  customer: CustomerRecord | null;
  currentUser: UserProfile;
  onClose: () => void;
  onUpdateCustomer: (updatedCustomer: CustomerRecord) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customer,
  currentUser,
  onClose,
  onUpdateCustomer
}) => {
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<AttachmentFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ERRORS' | 'DRIVE_FILES' | 'LOGS'>('ERRORS');

  if (!customer) return null;

  const currentError = customer.errors.find(e => e.id === selectedErrorId) || customer.errors[0];

  // Helper to handle local file upload to Google Drive
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, errorId: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const file = files[0];
      const newAttachment = await GoogleDriveService.uploadToDrive(
        file,
        errorId,
        customer.id,
        currentUser,
        resolutionText || 'Hồ sơ tài liệu giải trình/khắc phục lỗi'
      );

      const updatedErrors = customer.errors.map(err => {
        if (err.id === errorId) {
          const updatedAttachments = [...err.attachments, newAttachment];
          return {
            ...err,
            attachments: updatedAttachments,
            history: [
              ...err.history,
              {
                id: 'LOG_' + Date.now(),
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
                action: 'ATTACH_FILE' as const,
                actorName: currentUser.name,
                actorRole: currentUser.role,
                notes: `Tải lên hồ sơ: ${newAttachment.fileName} lên Google Drive`
              }
            ]
          };
        }
        return err;
      });

      const updatedCust: CustomerRecord = {
        ...customer,
        errors: updatedErrors
      };

      onUpdateCustomer(updatedCust);
      alert(`✅ Đã tải tệp "${file.name}" lên Google Drive tổng thành công!`);
    } catch (err: any) {
      alert(`Lỗi tải lên: ${err?.message || 'Không thể tải tệp'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Branch Action: Push to Cluster Approver
  const handlePushToCluster = (errorId: string) => {
    const errorToPush = customer.errors.find(e => e.id === errorId);
    if (!errorToPush || errorToPush.attachments.length === 0) {
      alert('⚠️ Vui lòng đính kèm ít nhất 01 tài liệu/hồ sơ khắc phục trước khi đẩy duyệt!');
      return;
    }

    const updatedErrors = customer.errors.map(err => {
      if (err.id === errorId) {
        return {
          ...err,
          status: 'SUBMITTED_BRANCH' as const,
          resolutionNotes: resolutionText || err.resolutionNotes,
          history: [
            ...err.history,
            {
              id: 'LOG_' + Date.now(),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              action: 'SUBMIT_BRANCH_CONTROL' as const,
              actorName: currentUser.name,
              actorRole: currentUser.role,
              notes: 'Chi nhánh đã hoàn tất hồ sơ và đẩy lên Cụm duyệt'
            }
          ]
        };
      }
      return err;
    });

    const updatedCust: CustomerRecord = {
      ...customer,
      errors: updatedErrors
    };

    onUpdateCustomer(updatedCust);
    alert('🚀 Đã đẩy hồ sơ lên User Phê Duyệt Cụm Chi Nhánh thành công!');
  };

  // Cluster Action: Push to Internal Block
  const handleClusterApprove = (errorId: string) => {
    const updatedErrors = customer.errors.map(err => {
      if (err.id === errorId) {
        return {
          ...err,
          status: 'SUBMITTED_INTERNAL' as const,
          history: [
            ...err.history,
            {
              id: 'LOG_' + Date.now(),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              action: 'BRANCH_CONTROL_APPROVE' as const,
              actorName: currentUser.name,
              actorRole: currentUser.role,
              notes: 'Cụm Chi Nhánh đã tổng hợp, phê duyệt và chuyển tiếp lên Khối Nội Bộ'
            }
          ]
        };
      }
      return err;
    });

    const updatedCust: CustomerRecord = {
      ...customer,
      errors: updatedErrors
    };

    onUpdateCustomer(updatedCust);
    alert('✨ Đã duyệt và chuyển hồ sơ lên Cổng Khối Nội Bộ!');
  };

  // Internal Action: Agree to Waive / Resolve Error
  const handleInternalWaiveError = (errorId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn ĐỒNG Ý BỎ LỖI và hoàn tất xử lý sai sót này?')) {
      return;
    }

    const updatedErrors = customer.errors.map(err => {
      if (err.id === errorId) {
        return {
          ...err,
          status: 'WAIVED_RESOLVED' as const,
          history: [
            ...err.history,
            {
              id: 'LOG_' + Date.now(),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              action: 'INTERNAL_WAIVE' as const,
              actorName: currentUser.name,
              actorRole: currentUser.role,
              notes: 'Khối Nội Bộ thẩm định hồ sơ đạt yêu cầu -> Phê duyệt đồng ý bỏ lỗi'
            }
          ]
        };
      }
      return err;
    });

    const activeCount = updatedErrors.filter(e => e.status !== 'WAIVED_RESOLVED').length;
    const resolvedCount = updatedErrors.filter(e => e.status === 'WAIVED_RESOLVED').length;

    const updatedCust: CustomerRecord = {
      ...customer,
      errors: updatedErrors,
      activeErrors: activeCount,
      resolvedErrors: resolvedCount
    };

    onUpdateCustomer(updatedCust);
    alert('🎉 Khối Nội Bộ đã phê duyệt BỎ LỖI thành công! Lỗi đã được xóa khỏi danh sách tồn đọng.');
  };

  // Delete attachment from Google Drive
  const handleDeleteAttachment = (fileId: string) => {
    const updatedErrors = customer.errors.map(err => {
      const filteredAtts = err.attachments.filter(a => a.id !== fileId);
      if (filteredAtts.length !== err.attachments.length) {
        return {
          ...err,
          attachments: filteredAtts,
          history: [
            ...err.history,
            {
              id: 'LOG_' + Date.now(),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              action: 'DELETE_FILE' as const,
              actorName: currentUser.name,
              actorRole: currentUser.role,
              notes: `Đã xóa tệp đính kèm (File ID: ${fileId}) khỏi Google Drive`
            }
          ]
        };
      }
      return err;
    });

    const updatedCust: CustomerRecord = {
      ...customer,
      errors: updatedErrors
    };

    onUpdateCustomer(updatedCust);
  };

  const getStatusBadge = (status: AuditError['status']) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200"><AlertCircle className="w-3.5 h-3.5" /> Tồn đọng (Chưa xử lý)</span>;
      case 'SUBMITTED_BRANCH':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Chờ Kiểm soát chi nhánh</span>;
      case 'SUBMITTED_INTERNAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200"><Send className="w-3.5 h-3.5" /> Chờ Khối Nội Bộ Duyệt</span>;
      case 'WAIVED_RESOLVED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle className="w-3.5 h-3.5" /> Đã Bỏ Lỗi / Hoàn Tất</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // Collect all drive files for this customer
  const allDriveFiles = customer.errors.flatMap(e => e.attachments);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-brand-500 text-white shadow-sm flex-shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  {customer.customerName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 font-bold text-xs border border-brand-200">
                  CIF: {customer.cif}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                  {customer.loanGroup}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span><strong>Đơn vị:</strong> {customer.branchName} ({customer.department})</span>
                <span>•</span>
                <span><strong>Cụm:</strong> {customer.clusterName}</span>
                <span>•</span>
                <span><strong>QĐ kiểm tra:</strong> {customer.decisionNo}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Quick Stats Bar */}
        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-white border-b border-slate-100 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Dư nợ tín dụng</span>
            <span className="text-sm font-bold text-slate-900">{customer.creditBalance.toLocaleString()} Tr.đ</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Giá trị TSBĐ</span>
            <span className="text-sm font-bold text-slate-900">{customer.collateralValue.toLocaleString()} Tr.đ</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Cán bộ QLKH & TP</span>
            <span className="text-xs font-semibold text-slate-800 truncate block">{customer.officerName} / {customer.deptHeadName}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Mục đích vay vốn</span>
            <span className="text-xs font-medium text-slate-700 truncate block">{customer.loanPurpose}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('ERRORS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'ERRORS'
                ? 'border-brand-500 text-brand-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Danh Sách Sai Sót ({customer.errors.length})
          </button>
          <button
            onClick={() => setActiveTab('DRIVE_FILES')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'DRIVE_FILES'
                ? 'border-brand-500 text-brand-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Hồ Sơ Đính Kèm Google Drive ({allDriveFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'LOGS'
                ? 'border-brand-500 text-brand-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Nhật Ký Xử Lý / Audit Trail
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          {/* TAB 1: ERRORS LIST & RESOLUTION */}
          {activeTab === 'ERRORS' && (
            <div className="grid grid-cols-12 gap-6">
              
              {/* Left Column: Error Selector List */}
              <div className="col-span-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Mã Sai Sót Kiểm Tra
                </h4>
                {customer.errors.map(err => {
                  const isSelected = (currentError && currentError.id === err.id);
                  return (
                    <div
                      key={err.id}
                      onClick={() => setSelectedErrorId(err.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-white border-brand-500 shadow-md ring-2 ring-brand-500/10'
                          : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-brand-700">
                          {err.errorCode}
                        </span>
                        {getStatusBadge(err.status)}
                      </div>
                      <h5 className="text-xs font-bold text-slate-900 line-clamp-2">
                        {err.errorTitle}
                      </h5>
                      <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Giá trị: <strong>{err.exposureAmount.toLocaleString()} Tr</strong></span>
                        <span>Đính kèm: <strong>{err.attachments.length} file</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Error Details & Resolution Actions */}
              <div className="col-span-8">
                {currentError ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
                    
                    {/* Error Header */}
                    <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                            {currentError.errorCode}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            Nhóm {currentError.errorGroup}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-2">
                          {currentError.errorTitle}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {currentError.description}
                        </p>
                      </div>
                      <div>
                        {getStatusBadge(currentError.status)}
                      </div>
                    </div>

                    {/* Resolution Notes Section */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nội dung giải trình / Phương án khắc phục của Chi nhánh:
                      </label>
                      <textarea
                        rows={2}
                        value={resolutionText || currentError.resolutionNotes || ''}
                        onChange={(e) => setResolutionText(e.target.value)}
                        placeholder="Nhập nội dung giải trình, số văn bản bổ sung, các biện pháp đã thực hiện..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        disabled={currentUser.portal === 'INTERNAL' || currentError.status === 'WAIVED_RESOLVED'}
                      />
                    </div>

                    {/* Google Drive Attachments for this error */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <HardDrive className="w-4 h-4 text-brand-500" />
                          Hồ sơ khắc phục đính kèm (Google Drive Tổng)
                        </span>
                        
                        {/* File Upload Button */}
                        {currentError.status !== 'WAIVED_RESOLVED' && (
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer shadow-sm transition">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploading ? 'Đang tải lên Drive...' : 'Tải lên hồ sơ (.pdf, .docx, .xlsx)'}</span>
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg"
                              onChange={(e) => handleFileUpload(e, currentError.id)}
                              disabled={isUploading}
                            />
                          </label>
                        )}
                      </div>

                      {currentError.attachments.length === 0 ? (
                        <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 text-center text-xs text-slate-500">
                          Chưa có tài liệu nào được đính kèm cho mã sai sót này.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentError.attachments.map(att => (
                            <div
                              key={att.id}
                              className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs hover:bg-slate-100/80 transition"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 rounded-lg bg-white border border-slate-200 text-brand-500 flex-shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">{att.fileName}</p>
                                  <p className="text-[11px] text-slate-500">{att.fileSize} • {att.uploadDate} • {att.uploadedBy}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => setSelectedFileForPreview(att)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Xem trước
                                </button>
                                
                                {currentUser.portal === 'INTERNAL' && (
                                  <button
                                    onClick={() => handleDeleteAttachment(att.id)}
                                    title="Chỉ Khối Nội Bộ mới có quyền xóa file trên Google Drive"
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Bar (Role-Based Dynamic Buttons) */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                      
                      {/* Branch User: Push to Cluster */}
                      {currentUser.role === 'BRANCH_INPUT' && currentError.status === 'PENDING' && (
                        <button
                          onClick={() => handlePushToCluster(currentError.id)}
                          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition"
                        >
                          <Send className="w-4 h-4" />
                          Đẩy Duyệt Cụm Chi Nhánh
                        </button>
                      )}

                      {/* Cluster Approver: Approve and Push to Internal */}
                      {currentUser.role === 'BRANCH_CONTROLLER' && currentError.status === 'SUBMITTED_BRANCH' && (
                        <button
                          onClick={() => handleClusterApprove(currentError.id)}
                          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition"
                        >
                          <CheckCheck className="w-4 h-4" />
                          Phê Duyệt Cụm & Đẩy Lên Khối Nội Bộ
                        </button>
                      )}

                      {/* Internal Block: Waive Error (Đồng ý bỏ lỗi) */}
                      {currentUser.portal === 'INTERNAL' && currentError.status !== 'WAIVED_RESOLVED' && (
                        <button
                          onClick={() => handleInternalWaiveError(currentError.id)}
                          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition transform hover:scale-[1.02]"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          ĐỒNG Ý BỎ LỖI (PHÊ DUYỆT BỎ LỖI)
                        </button>
                      )}

                      {currentError.status === 'WAIVED_RESOLVED' && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <CheckCircle className="w-4 h-4" />
                          Sai sót này đã được Khối Nội Bộ duyệt bỏ
                        </div>
                      )}
                    </div>

                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                    Vui lòng chọn một mã sai sót bên trái.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: ALL GOOGLE DRIVE FILES */}
          {activeTab === 'DRIVE_FILES' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5 text-brand-600" />
                  <div>
                    <h4 className="text-xs font-bold text-brand-900">
                      Thư mục lưu trữ Google Drive: AuditBGS_Central_Drive_Archive_2026 / {customer.branchName}
                    </h4>
                    <p className="text-[11px] text-brand-700 mt-0.5">
                      Chính sách bảo mật: Khối Chi nhánh tải lên &rarr; Khối Nội Bộ toàn quyền quản trị & xóa file.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-white text-brand-700 text-xs font-bold rounded-lg border border-brand-200">
                  {allDriveFiles.length} Tệp lưu trữ
                </span>
              </div>

              {allDriveFiles.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
                  Chưa có tệp nào được tải lên cho khách hàng này.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {allDriveFiles.map(file => (
                    <div
                      key={file.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-brand-300 transition flex flex-col justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-lg bg-brand-50 text-brand-600 flex-shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-bold text-slate-900 text-xs truncate">
                            {file.fileName}
                          </h5>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Kích thước: {file.fileSize} • {file.uploadDate}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            Tải bởi: {file.uploadedBy}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                          {file.driveFileId}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedFileForPreview(file)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                          >
                            Xem trước
                          </button>
                          {currentUser.portal === 'INTERNAL' && (
                            <button
                              onClick={() => handleDeleteAttachment(file.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Xóa khỏi Google Drive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL LOGS */}
          {activeTab === 'LOGS' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Lịch Sử Thao Tác & Phê Duyệt Hệ Thống
              </h4>
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 py-2">
                {customer.errors.flatMap(e => e.history).map((log, idx) => (
                  <div key={log.id || idx} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-brand-500 border-2 border-white shadow-sm" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{log.action}</span>
                      <span className="text-xs text-slate-500">• {log.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Thực hiện bởi: <strong>{log.actorName}</strong> ({log.actorRole})
                    </p>
                    {log.notes && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1.5">
                        {log.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>Hệ Thống Kiểm Tra Giám Sát Tín Dụng AuditBGS</span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            Đóng
          </button>
        </div>

      </div>

      {/* Embedded Google Drive File Viewer */}
      {selectedFileForPreview && (
        <GoogleDriveViewerModal
          file={selectedFileForPreview}
          currentUser={currentUser}
          onClose={() => setSelectedFileForPreview(null)}
          onDeleteFile={handleDeleteAttachment}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { AttachmentFile, UserProfile } from '../../types';
import { GoogleDriveService } from '../../lib/google-drive';
import { 
  X, 
  Download, 
  Trash2, 
  ExternalLink, 
  HardDrive, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  Lock,
  Eye
} from 'lucide-react';

interface GoogleDriveViewerModalProps {
  file: AttachmentFile | null;
  currentUser: UserProfile;
  onClose: () => void;
  onDeleteFile: (fileId: string) => void;
}

export const GoogleDriveViewerModal: React.FC<GoogleDriveViewerModalProps> = ({
  file,
  currentUser,
  onClose,
  onDeleteFile
}) => {
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  if (!file) return null;

  const canDeleteCheck = GoogleDriveService.canDeleteFile(currentUser);

  const handleDelete = () => {
    if (!canDeleteCheck.allowed) {
      setDeleteWarning(canDeleteCheck.reason || 'Bạn không có quyền xóa file này.');
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn XÓA vĩnh viễn tệp "${file.fileName}" trên Google Drive tổng?`)) {
      onDeleteFile(file.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-rule w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-brand-50 text-brand-500 flex-shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {file.fileName}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span>Mã tệp Google Drive: <code className="text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded text-[11px]">{file.driveFileId}</code></span>
                <span>•</span>
                <span>Kích thước: {file.fileSize}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={file.driveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-rule rounded-lg transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              Mở trên Drive
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Warning Toast if restricted */}
        {deleteWarning && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-semibold mb-0.5">Hạn chế quyền xóa file:</p>
              <p>{deleteWarning}</p>
            </div>
            <button
              onClick={() => setDeleteWarning(null)}
              className="ml-auto text-amber-500 hover:text-amber-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Preview Body */}
        <div className="p-6 flex-1 overflow-y-auto bg-slate-100/60 flex flex-col items-center justify-center min-h-[360px]">
          <div className="w-full max-w-2xl bg-white rounded-xl p-8 border border-rule shadow-panel text-center">
            
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-500">
              <FileText className="w-8 h-8" />
            </div>

            <h4 className="text-lg font-bold text-slate-800 mb-1">
              Xem trước tài liệu lưu trữ
            </h4>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Tài liệu đã được đồng bộ an toàn lên thư mục tổng của hệ thống:
              <br />
              <span className="font-semibold text-brand-600">AuditBGS_Central_Drive_Archive_2026</span>
            </p>

            <div className="grid grid-cols-2 gap-3 text-left bg-slate-50 p-4 rounded-xl border border-rule text-xs mb-6">
              <div>
                <span className="text-slate-500">Người tải lên:</span>
                <p className="font-medium text-slate-800 mt-0.5">{file.uploadedBy}</p>
              </div>
              <div>
                <span className="text-slate-500">Thời gian tải:</span>
                <p className="font-medium text-slate-800 mt-0.5">{file.uploadDate}</p>
              </div>
              <div className="col-span-2 border-t border-rule pt-2.5 mt-1">
                <span className="text-slate-500">Ghi chú khắc phục:</span>
                <p className="font-medium text-slate-800 mt-0.5">{file.notes || 'Không có ghi chú thêm'}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => alert(`Đang tải xuống tệp ${file.fileName} từ Google Drive...`)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-panel transition"
              >
                <Download className="w-4 h-4 text-slate-500" />
                Tải về bản sao (.zip/.pdf)
              </button>

              {currentUser.portal === 'INTERNAL' ? (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  Xóa khỏi Google Drive (Khối Nội Bộ)
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 bg-slate-100 border border-rule rounded-lg cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5" />
                  Chi nhánh đã khóa quyền xóa
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Tệp được bảo vệ và lưu trữ theo chính sách của Audit Monitoring</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

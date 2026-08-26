import { AttachmentFile, UserProfile, UserRole } from '../types';

export class GoogleDriveService {
  private static DRIVE_ROOT_FOLDER = 'AuditBGS_Central_Drive_Archive_2026';

  /**
   * Upload file to simulated Google Drive Central Storage
   */
  public static async uploadToDrive(
    file: File | { name: string; size: number; type: string },
    errorId: string,
    customerId: string,
    currentUser: UserProfile,
    notes?: string
  ): Promise<AttachmentFile> {
    // Generate unique Google Drive File ID
    const driveFileId = 'gdrive_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    
    // Determine file type
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let fileType: AttachmentFile['fileType'] = 'other';
    if (['pdf'].includes(ext)) fileType = 'pdf';
    else if (['doc', 'docx'].includes(ext)) fileType = 'docx';
    else if (['xls', 'xlsx', 'csv'].includes(ext)) fileType = 'xlsx';
    else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) fileType = 'image';
    else if (file.type.includes('spreadsheet') || ext === 'sheet') fileType = 'sheet';

    const fileSizeFormatted = file.size > 1024 * 1024 
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const attachment: AttachmentFile = {
      id: 'ATT_' + Math.random().toString(36).substring(2, 9),
      fileName: file.name,
      fileType,
      fileSize: fileSizeFormatted,
      driveFileId,
      driveUrl: `https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`,
      uploadDate: formattedDate,
      uploadedBy: `${currentUser.name} (${currentUser.department || currentUser.branchName || currentUser.role})`,
      uploaderRole: currentUser.role,
      errorId,
      customerId,
      notes: notes || 'Hồ sơ tài liệu sửa đổi/bổ sung khắc phục lỗi'
    };

    return attachment;
  }

  /**
   * Delete file with RBAC verification: ONLY INTERNAL PORTAL CAN DELETE!
   */
  public static canDeleteFile(currentUser: UserProfile): { allowed: boolean; reason?: string } {
    if (currentUser.portal === 'INTERNAL') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Cụm Chi Nhánh không có quyền xóa file sau khi đã tải lên Google Drive. Chỉ Khối Nội Bộ mới có thẩm quyền xóa tài liệu lưu trữ!'
    };
  }

  public static getDriveFolderName(): string {
    return this.DRIVE_ROOT_FOLDER;
  }
}

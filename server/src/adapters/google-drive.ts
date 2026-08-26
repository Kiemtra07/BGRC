import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'node:stream';
import { HttpProblem } from '../http/problem';

export interface DriveUploadResult {
  driveFileId: string;
  driveUrl: string;
  sha256Checksum: string;
  fileSize: number;
  mimeType: string;
  folderPath: string;
}

export interface EvidenceStorageOptions {
  storageMode?: string;
  googleServiceAccountKey?: string;
  googleDriveRootFolderId?: string;
  localEvidenceDir?: string;
}

export interface EvidenceStorageStatus {
  mode: 'local' | 'google-drive' | 'misconfigured';
  durable: boolean;
  ready: boolean;
  warning?: string;
}

function createLocalPreviewPdf(): Buffer {
  const pageStream = (page: number) => {
    const content = `BT /F1 18 Tf 72 720 Td (AUDIT BGS - Local evidence preview - Page ${page} of 3) Tj ET`;
    return `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`;
  };
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pageStream(1),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    pageStream(2),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 9 0 R >>',
    pageStream(3),
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}

export class GoogleDriveAdapter {
  private readonly hasGoogleConfiguration: boolean;
  private readonly localFallbackDir: string;
  private readonly storageMode: string;

  constructor(options: EvidenceStorageOptions = {}) {
    this.storageMode = options.storageMode ?? process.env.EVIDENCE_STORAGE_MODE ?? 'local';
    this.hasGoogleConfiguration = Boolean(
      (options.googleServiceAccountKey ?? process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      && (options.googleDriveRootFolderId ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
    );
    this.localFallbackDir = path.resolve(options.localEvidenceDir ?? process.env.LOCAL_EVIDENCE_DIR ?? path.join(process.cwd(), 'data', 'drive_storage'));
    if (this.storageMode === 'local' && !fs.existsSync(this.localFallbackDir)) {
      fs.mkdirSync(this.localFallbackDir, { recursive: true });
    }
  }

  public getStorageStatus(): EvidenceStorageStatus {
    if (this.storageMode === 'local') return { mode: 'local', durable: true, ready: true };
    if (this.storageMode === 'google-drive') {
      return {
        mode: 'google-drive',
        durable: false,
        ready: false,
        warning: this.hasGoogleConfiguration
          ? 'Đã có cấu hình Google Drive nhưng adapter API v3 chưa được cài đặt; hệ thống không tự fallback.'
          : 'Thiếu cấu hình Google Drive; adapter API v3 cũng chưa được cài đặt.',
      };
    }
    return {
      mode: 'misconfigured',
      durable: false,
      ready: false,
      warning: `EVIDENCE_STORAGE_MODE=${this.storageMode} không hợp lệ; hệ thống không fallback local.`,
    };
  }

  public validateUploadMetadata(fileName: string, mimeType: string, fileSize: number): string {
    const allowedByExtension: Record<string, string[]> = {
      '.pdf': ['application/pdf'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],
    };
    const dangerousSegments = new Set(['exe', 'com', 'bat', 'cmd', 'ps1', 'js', 'mjs', 'vbs', 'scr', 'msi', 'jar']);
    const baseName = path.basename(fileName.replaceAll('\\', '/'));
    if (!baseName || baseName !== fileName) {
      throw new HttpProblem(415, 'UNSAFE_FILE_NAME', 'Tên tệp không an toàn', 'Tên tệp không được chứa đường dẫn.');
    }
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) {
      throw new HttpProblem(413, 'EVIDENCE_SIZE_INVALID', 'Kích thước tệp không hợp lệ', 'Minh chứng phải lớn hơn 0 byte và không vượt quá 25 MB.');
    }

    const extension = path.extname(baseName).toLowerCase();
    const allowedMimeTypes = allowedByExtension[extension];
    if (!allowedMimeTypes?.includes(mimeType.toLowerCase())) {
      throw new HttpProblem(415, 'EVIDENCE_TYPE_NOT_ALLOWED', 'Loại tệp không được hỗ trợ', 'Chỉ chấp nhận PDF, DOCX, XLSX, JPG và PNG đúng MIME type.');
    }
    const nameSegments = baseName.toLowerCase().split('.').slice(0, -1);
    if (nameSegments.some(segment => dangerousSegments.has(segment))) {
      throw new HttpProblem(415, 'DOUBLE_EXTENSION_REJECTED', 'Tệp có phần mở rộng kép nguy hiểm', 'Tên tệp chứa phần mở rộng thực thi ẩn.');
    }

    const sanitized = baseName
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}._ -]/gu, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitized) {
      throw new HttpProblem(415, 'UNSAFE_FILE_NAME', 'Tên tệp không an toàn', 'Tên tệp không còn ký tự hợp lệ sau khi chuẩn hóa.');
    }
    return sanitized;
  }

  public generateFolderPath(params: {
    campaignCode?: string;
    channelCode: string;
    year: number | string;
    clusterName: string;
    branchCode: string;
    cif: string;
    customerName?: string;
    errorCode: string;
  }): string {
    const sanitize = (s: string) => s.normalize('NFC').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const campaign = sanitize(params.campaignCode ?? 'KHONG_CHUYEN_DE');
    const customer = `${sanitize(params.cif)}_${sanitize(params.customerName ?? 'KHACH_HANG')}`;
    return `/${campaign}/${sanitize(params.channelCode)}/${params.year}/${sanitize(params.clusterName)}/CN_${sanitize(params.branchCode)}/KHACH_HANG/${customer}/LOI_${sanitize(params.errorCode)}`;
  }

  public async uploadEvidenceFile(params: {
    fileName: string;
    fileBuffer: Buffer;
    mimeType: string;
    folderPath: string;
    findingId: string;
  }): Promise<DriveUploadResult> {
    const sha256Checksum = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');
    const fileSize = params.fileBuffer.length;
    const fileId = `drive_${crypto.randomUUID()}`;

    if (this.storageMode === 'google-drive') {
      throw new HttpProblem(
        503,
        'GOOGLE_DRIVE_ADAPTER_NOT_READY',
        'Google Drive chưa sẵn sàng',
        this.hasGoogleConfiguration
          ? 'Thông tin Google Drive đã được khai báo nhưng adapter API v3 chưa được triển khai.'
          : 'Thiếu cấu hình Google Drive và adapter API v3 chưa được triển khai.',
      );
    }

    if (this.storageMode !== 'local') {
      throw new HttpProblem(
        503,
        'EVIDENCE_STORAGE_MODE_INVALID',
        'Chế độ lưu minh chứng không hợp lệ',
        `EVIDENCE_STORAGE_MODE=${this.storageMode} không được hỗ trợ; hệ thống không fallback local.`,
      );
    }

    // Explicit local storage for development, selected only by EVIDENCE_STORAGE_MODE=local.
    const relativeFolder = params.folderPath.replace(/^[/\\]+/, '');
    const targetFolder = path.resolve(this.localFallbackDir, relativeFolder);
    if (targetFolder !== this.localFallbackDir && !targetFolder.startsWith(`${this.localFallbackDir}${path.sep}`)) {
      throw new HttpProblem(400, 'UNSAFE_STORAGE_PATH', 'Đường dẫn lưu trữ không hợp lệ', 'Đường dẫn thư mục minh chứng vượt ngoài thư mục local cho phép.');
    }
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    const filePath = path.join(targetFolder, `${fileId}_${params.fileName}`);
    fs.writeFileSync(filePath, params.fileBuffer);

    return {
      driveFileId: fileId,
      driveUrl: `/api/v1/evidence/${fileId}/content`,
      sha256Checksum,
      fileSize,
      mimeType: params.mimeType,
      folderPath: params.folderPath,
    };
  }

  public async getFileContentStream(driveFileId: string): Promise<{ stream: NodeJS.ReadableStream; fileName: string; mimeType: string } | null> {
    if (this.storageMode === 'google-drive') {
      throw new HttpProblem(
        503,
        'GOOGLE_DRIVE_ADAPTER_NOT_READY',
        'Google Drive chưa sẵn sàng',
        this.hasGoogleConfiguration
          ? 'Thông tin Google Drive đã được khai báo nhưng adapter API v3 chưa được triển khai.'
          : 'Thiếu cấu hình Google Drive và adapter API v3 chưa được triển khai.',
      );
    }
    if (this.storageMode !== 'local') {
      throw new HttpProblem(
        503,
        'EVIDENCE_STORAGE_MODE_INVALID',
        'Chế độ lưu minh chứng không hợp lệ',
        `EVIDENCE_STORAGE_MODE=${this.storageMode} không được hỗ trợ; hệ thống không fallback local.`,
      );
    }
    if (driveFileId === 'drive_mock_001' || driveFileId === 'drive_mock_002') {
      return {
        stream: Readable.from(createLocalPreviewPdf()),
        fileName: `${driveFileId}_local-preview.pdf`,
        mimeType: 'application/pdf',
      };
    }
    // Search in explicit local storage.
    const files = fs.readdirSync(this.localFallbackDir, { recursive: true }) as string[];
    const matchingFile = files.find(f => path.basename(f).startsWith(`${driveFileId}_`));
    if (matchingFile) {
      const fullPath = path.join(this.localFallbackDir, matchingFile);
      const stream = fs.createReadStream(fullPath);
      const extension = path.extname(matchingFile).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
      };
      return {
        stream,
        fileName: path.basename(matchingFile).replace(`${driveFileId}_`, ''),
        mimeType: mimeTypes[extension] ?? 'application/octet-stream',
      };
    }
    return null;
  }
}

export const googleDriveService = new GoogleDriveAdapter();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'node:stream';
import { JWT } from 'google-auth-library';
import { HttpProblem } from '../http/problem';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

interface GoogleServiceAccount { client_email: string; private_key: string; }
interface DriveFileMetadata { id: string; name: string; mimeType: string; size: string; parents?: string[]; trashed?: boolean; appProperties?: Record<string, string>; }

export interface DriveUploadResult { driveFileId: string; driveUrl: string; sha256Checksum: string; fileSize: number; mimeType: string; folderPath: string; }
export interface DriveResumableUploadSession { uploadMode: 'google-drive'; uploadUrl: string; driveFileId: string; fileName: string; mimeType: string; fileSize: number; sha256Checksum: string; }
export interface EvidenceStorageOptions { storageMode?: string; googleServiceAccountKey?: string; googleDriveRootFolderId?: string; localEvidenceDir?: string; accessTokenProvider?: () => Promise<string>; fetchImpl?: typeof fetch; }
export interface EvidenceStorageStatus { mode: 'local' | 'google-drive' | 'misconfigured'; durable: boolean; ready: boolean; warning?: string; }

function createLocalPreviewPdf(): Buffer {
  const pageStream = (page: number) => { const content = `BT /F1 18 Tf 72 720 Td (AUDIT BGS - Local evidence preview - Page ${page} of 3) Tj ET`; return `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`; };
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', pageStream(1), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>', pageStream(2), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 9 0 R >>', pageStream(3)];
  let document = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(document, 'ascii')); document += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}

function parseServiceAccount(raw: string | undefined): GoogleServiceAccount | null {
  if (!raw) return null;
  try {
    const decoded = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<GoogleServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, '\n') };
  } catch { return null; }
}
function escapeDriveQuery(value: string): string { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

export class GoogleDriveAdapter {
  private readonly localFallbackDir: string;
  private readonly storageMode: string;
  private readonly googleDriveRootFolderId?: string;
  private readonly serviceAccount: GoogleServiceAccount | null;
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: EvidenceStorageOptions = {}) {
    this.storageMode = options.storageMode ?? process.env.EVIDENCE_STORAGE_MODE ?? 'local';
    this.googleDriveRootFolderId = options.googleDriveRootFolderId ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    this.serviceAccount = parseServiceAccount(options.googleServiceAccountKey ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    this.accessTokenProvider = options.accessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.localFallbackDir = path.resolve(options.localEvidenceDir ?? process.env.LOCAL_EVIDENCE_DIR ?? path.join(process.cwd(), 'data', 'drive_storage'));
    if (this.storageMode === 'local' && !fs.existsSync(this.localFallbackDir)) fs.mkdirSync(this.localFallbackDir, { recursive: true });
  }

  public async getStorageStatus(): Promise<EvidenceStorageStatus> {
    if (this.storageMode === 'local') return { mode: 'local', durable: true, ready: true };
    if (this.storageMode !== 'google-drive') return { mode: 'misconfigured', durable: false, ready: false, warning: `EVIDENCE_STORAGE_MODE=${this.storageMode} không hợp lệ; hệ thống không fallback local.` };
    if (!this.googleDriveRootFolderId) return this.googleNotReady('Thiếu cấu hình GOOGLE_DRIVE_ROOT_FOLDER_ID; hệ thống không fallback local.');
    if (!this.accessTokenProvider && !this.serviceAccount) return this.googleNotReady('Thiếu hoặc không đọc được cấu hình credential GOOGLE_SERVICE_ACCOUNT_JSON; hệ thống không fallback local.');
    try { await this.requireGoogleRootFolder(); return { mode: 'google-drive', durable: true, ready: true }; }
    catch (error) { return this.googleNotReady(error instanceof HttpProblem ? error.message : 'Không thể xác minh Google Drive API v3.'); }
  }

  public validateUploadMetadata(fileName: string, mimeType: string, fileSize: number): string {
    const allowedByExtension: Record<string, string[]> = { '.pdf': ['application/pdf'], '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'] };
    const dangerousSegments = new Set(['exe', 'com', 'bat', 'cmd', 'ps1', 'js', 'mjs', 'vbs', 'scr', 'msi', 'jar']);
    const baseName = path.basename(fileName.replaceAll('\\', '/'));
    if (!baseName || baseName !== fileName) throw new HttpProblem(415, 'UNSAFE_FILE_NAME', 'Tên tệp không an toàn', 'Tên tệp không được chứa đường dẫn.');
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) throw new HttpProblem(413, 'EVIDENCE_SIZE_INVALID', 'Kích thước tệp không hợp lệ', 'Minh chứng phải lớn hơn 0 byte và không vượt quá 25 MB.');
    if (!allowedByExtension[path.extname(baseName).toLowerCase()]?.includes(mimeType.toLowerCase())) throw new HttpProblem(415, 'EVIDENCE_TYPE_NOT_ALLOWED', 'Loại tệp không được hỗ trợ', 'Chỉ chấp nhận PDF, DOCX, XLSX, JPG và PNG đúng MIME type.');
    if (baseName.toLowerCase().split('.').slice(0, -1).some(segment => dangerousSegments.has(segment))) throw new HttpProblem(415, 'DOUBLE_EXTENSION_REJECTED', 'Tệp có phần mở rộng kép nguy hiểm', 'Tên tệp chứa phần mở rộng thực thi ẩn.');
    const sanitized = baseName.normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, ' ').trim();
    if (!sanitized) throw new HttpProblem(415, 'UNSAFE_FILE_NAME', 'Tên tệp không an toàn', 'Tên tệp không còn ký tự hợp lệ sau khi chuẩn hóa.');
    return sanitized;
  }

  public generateFolderPath(params: { campaignCode?: string; channelCode: string; year: number | string; clusterName: string; branchCode: string; cif: string; customerName?: string; errorCode: string }): string {
    const sanitize = (value: string) => value.normalize('NFC').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const campaign = sanitize(params.campaignCode ?? 'KHONG_CHUYEN_DE');
    return `/${campaign}/${sanitize(params.channelCode)}/${params.year}/${sanitize(params.clusterName)}/CN_${sanitize(params.branchCode)}/KHACH_HANG/${sanitize(params.cif)}_${sanitize(params.customerName ?? 'KHACH_HANG')}/LOI_${sanitize(params.errorCode)}`;
  }

  public async createResumableUploadSession(params: { fileName: string; mimeType: string; fileSize: number; sha256Checksum: string; folderPath: string; findingId: string }): Promise<DriveResumableUploadSession> {
    this.requireGoogleMode(); const fileName = this.validateUploadMetadata(params.fileName, params.mimeType, params.fileSize); this.requireChecksum(params.sha256Checksum);
    const parentId = await this.ensureGoogleFolderPath(params.folderPath); const driveFileId = await this.generateDriveFileId();
    const response = await this.driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': params.mimeType, 'X-Upload-Content-Length': String(params.fileSize) }, body: JSON.stringify({ id: driveFileId, name: fileName, mimeType: params.mimeType, parents: [parentId], appProperties: { auditBgsFindingId: params.findingId, auditBgsSha256: params.sha256Checksum } }) });
    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) throw new HttpProblem(503, 'GOOGLE_DRIVE_UPLOAD_SESSION_FAILED', 'Không tạo được phiên tải Google Drive', 'Google Drive không trả về URL tải lên có thể tiếp tục.');
    return { uploadMode: 'google-drive', uploadUrl, driveFileId, fileName, mimeType: params.mimeType, fileSize: params.fileSize, sha256Checksum: params.sha256Checksum };
  }

  public async completeResumableUpload(params: { driveFileId: string; fileName: string; mimeType: string; fileSize: number; sha256Checksum: string; folderPath: string; findingId: string }): Promise<DriveUploadResult> {
    this.requireGoogleMode(); const fileName = this.validateUploadMetadata(params.fileName, params.mimeType, params.fileSize); this.requireChecksum(params.sha256Checksum);
    const expectedParentId = await this.ensureGoogleFolderPath(params.folderPath);
    const metadata = await this.driveFetchJson<DriveFileMetadata>(`${DRIVE_API}/files/${encodeURIComponent(params.driveFileId)}?fields=id,name,mimeType,size,parents,trashed,appProperties&supportsAllDrives=true`);
    if (metadata.id !== params.driveFileId || metadata.name !== fileName || metadata.mimeType !== params.mimeType || Number(metadata.size) !== params.fileSize || metadata.trashed || !metadata.parents?.includes(expectedParentId) || metadata.appProperties?.auditBgsFindingId !== params.findingId || metadata.appProperties?.auditBgsSha256 !== params.sha256Checksum) throw new HttpProblem(409, 'GOOGLE_DRIVE_UPLOAD_VERIFICATION_FAILED', 'Không xác minh được tệp Google Drive', 'Metadata tệp tải lên không khớp với phiên minh chứng đã yêu cầu.');
    return { driveFileId: metadata.id, driveUrl: `/api/v1/evidence/${metadata.id}/content`, sha256Checksum: params.sha256Checksum, fileSize: params.fileSize, mimeType: params.mimeType, folderPath: params.folderPath };
  }

  public async uploadEvidenceFile(params: { fileName: string; fileBuffer: Buffer; mimeType: string; folderPath: string; findingId: string }): Promise<DriveUploadResult> {
    if (this.storageMode === 'google-drive') {
      if (!this.googleDriveRootFolderId || (!this.accessTokenProvider && !this.serviceAccount)) this.requireGoogleMode();
      throw new HttpProblem(503, 'GOOGLE_DRIVE_DIRECT_UPLOAD_REQUIRED', 'Cần tải trực tiếp lên Google Drive', 'Dùng API upload-session để trình duyệt tải tệp trực tiếp lên Google Drive.');
    }
    if (this.storageMode !== 'local') throw this.invalidModeProblem();
    const fileSize = params.fileBuffer.length; const safeFileName = this.validateUploadMetadata(params.fileName, params.mimeType, fileSize); const sha256Checksum = crypto.createHash('sha256').update(params.fileBuffer).digest('hex'); const fileId = `drive_${crypto.randomUUID()}`;
    const targetFolder = path.resolve(this.localFallbackDir, params.folderPath.replace(/^[/\\]+/, ''));
    if (targetFolder !== this.localFallbackDir && !targetFolder.startsWith(`${this.localFallbackDir}${path.sep}`)) throw new HttpProblem(400, 'UNSAFE_STORAGE_PATH', 'Đường dẫn lưu trữ không hợp lệ', 'Đường dẫn thư mục minh chứng vượt ngoài thư mục local cho phép.');
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true }); fs.writeFileSync(path.join(targetFolder, `${fileId}_${safeFileName}`), params.fileBuffer);
    return { driveFileId: fileId, driveUrl: `/api/v1/evidence/${fileId}/content`, sha256Checksum, fileSize, mimeType: params.mimeType, folderPath: params.folderPath };
  }

  public async getFileContentStream(driveFileId: string): Promise<{ stream: NodeJS.ReadableStream; fileName: string; mimeType: string } | null> {
    if (this.storageMode === 'google-drive') {
      this.requireGoogleMode(); const metadata = await this.driveFetchJson<DriveFileMetadata>(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType&supportsAllDrives=true`); const response = await this.driveFetch(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`);
      if (!response.body) throw new HttpProblem(503, 'GOOGLE_DRIVE_CONTENT_UNAVAILABLE', 'Không đọc được nội dung Google Drive', 'Google Drive không trả về luồng nội dung tệp.');
      return { stream: Readable.fromWeb(response.body as never), fileName: metadata.name, mimeType: metadata.mimeType };
    }
    if (this.storageMode !== 'local') throw this.invalidModeProblem();
    if (driveFileId === 'drive_mock_001' || driveFileId === 'drive_mock_002') return { stream: Readable.from(createLocalPreviewPdf()), fileName: `${driveFileId}_local-preview.pdf`, mimeType: 'application/pdf' };
    const matchingFile = (fs.readdirSync(this.localFallbackDir, { recursive: true }) as string[]).find(file => path.basename(file).startsWith(`${driveFileId}_`));
    if (!matchingFile) return null;
    const mimeTypes: Record<string, string> = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
    return { stream: fs.createReadStream(path.join(this.localFallbackDir, matchingFile)), fileName: path.basename(matchingFile).replace(`${driveFileId}_`, ''), mimeType: mimeTypes[path.extname(matchingFile).toLowerCase()] ?? 'application/octet-stream' };
  }

  private googleNotReady(warning: string): EvidenceStorageStatus { return { mode: 'google-drive', durable: false, ready: false, warning }; }
  private invalidModeProblem(): HttpProblem { return new HttpProblem(503, 'EVIDENCE_STORAGE_MODE_INVALID', 'Chế độ lưu minh chứng không hợp lệ', `EVIDENCE_STORAGE_MODE=${this.storageMode} không được hỗ trợ; hệ thống không fallback local.`); }
  private requireChecksum(value: string): void { if (!/^[a-f0-9]{64}$/i.test(value)) throw new HttpProblem(422, 'EVIDENCE_CHECKSUM_INVALID', 'Checksum không hợp lệ', 'SHA-256 của tệp phải có đúng 64 ký tự hexadecimal.'); }
  private requireGoogleMode(): void { if (this.storageMode !== 'google-drive') throw this.invalidModeProblem(); if (!this.googleDriveRootFolderId || (!this.accessTokenProvider && !this.serviceAccount)) throw new HttpProblem(503, 'GOOGLE_DRIVE_ADAPTER_NOT_READY', 'Google Drive chưa sẵn sàng', 'Thiếu GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_DRIVE_ROOT_FOLDER_ID; hệ thống không fallback local.'); }
  private async getAccessToken(): Promise<string> { if (this.accessTokenProvider) return this.accessTokenProvider(); if (!this.serviceAccount) throw new HttpProblem(503, 'GOOGLE_DRIVE_ADAPTER_NOT_READY', 'Google Drive chưa sẵn sàng', 'Không đọc được GOOGLE_SERVICE_ACCOUNT_JSON.'); const client = new JWT({ email: this.serviceAccount.client_email, key: this.serviceAccount.private_key, scopes: [DRIVE_SCOPE] }); const token = await client.getAccessToken(); if (!token.token) throw new HttpProblem(503, 'GOOGLE_DRIVE_AUTH_FAILED', 'Không xác thực được Google Drive', 'Google không trả access token cho service account.'); return token.token; }
  private async driveFetch(url: string, init: RequestInit = {}): Promise<Response> { let response: Response; try { response = await this.fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${await this.getAccessToken()}`, ...init.headers } }); } catch { throw new HttpProblem(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive không khả dụng', 'Không kết nối được Google Drive API v3.'); } if (!response.ok) throw new HttpProblem(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive không khả dụng', `Google Drive API v3 trả HTTP ${response.status}.`); return response; }
  private async driveFetchJson<T>(url: string, init?: RequestInit): Promise<T> { return (await this.driveFetch(url, init)).json() as Promise<T>; }
  private async requireGoogleRootFolder(): Promise<void> { this.requireGoogleMode(); const folder = await this.driveFetchJson<{ id: string; mimeType: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } }>(`${DRIVE_API}/files/${encodeURIComponent(this.googleDriveRootFolderId!)}?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`); if (folder.id !== this.googleDriveRootFolderId || folder.mimeType !== FOLDER_MIME_TYPE || folder.trashed || folder.capabilities?.canAddChildren === false) throw new HttpProblem(503, 'GOOGLE_DRIVE_ROOT_UNAVAILABLE', 'Thư mục Google Drive chưa sẵn sàng', 'Service account không có quyền thêm tệp vào thư mục gốc đã cấu hình.'); }
  private async ensureGoogleFolderPath(folderPath: string): Promise<string> { await this.requireGoogleRootFolder(); let parentId = this.googleDriveRootFolderId!; for (const folderName of folderPath.split('/').filter(Boolean)) { const query = `'${escapeDriveQuery(folderName)}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`; const search = await this.driveFetchJson<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files?${new URLSearchParams({ q: query, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })}`); if (search.files?.[0]?.id) { parentId = search.files[0].id; continue; } const created = await this.driveFetchJson<{ id: string }>(`${DRIVE_API}/files?supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }) }); parentId = created.id; } return parentId; }
  private async generateDriveFileId(): Promise<string> { const result = await this.driveFetchJson<{ ids?: string[] }>(`${DRIVE_API}/files/generateIds?count=1&space=drive`); const id = result.ids?.[0]; if (!id) throw new HttpProblem(503, 'GOOGLE_DRIVE_ID_ALLOCATION_FAILED', 'Không tạo được ID tệp Google Drive', 'Google Drive không trả file ID cho phiên tải lên.'); return id; }
}

export const googleDriveService = new GoogleDriveAdapter();

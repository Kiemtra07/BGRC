import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleDriveAdapter } from '../../server/src/adapters/google-drive';

const temporaryDirectories: string[] = [];

function temporaryEvidenceDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-evidence-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('local evidence upload guard', () => {
  const adapter = new GoogleDriveAdapter();

  it('preserves a safe Vietnamese PDF file name', () => {
    expect(adapter.validateUploadMetadata('Biên bản kiểm tra.pdf', 'application/pdf', 1024))
      .toBe('Biên bản kiểm tra.pdf');
  });

  it.each([
    ['malware.exe', 'application/octet-stream'],
    ['invoice.exe.pdf', 'application/pdf'],
    ['../outside.pdf', 'application/pdf'],
  ])('rejects unsafe file %s', (fileName, mimeType) => {
    expect(() => adapter.validateUploadMetadata(fileName, mimeType, 1024)).toThrow();
  });

  it('rejects empty and oversized evidence', () => {
    expect(() => adapter.validateUploadMetadata('proof.pdf', 'application/pdf', 0)).toThrow();
    expect(() => adapter.validateUploadMetadata('proof.pdf', 'application/pdf', 25 * 1024 * 1024 + 1)).toThrow();
  });

  it('builds a stable folder path without traversal segments', () => {
    const folder = adapter.generateFolderPath({
      campaignCode: 'CD-TD-2026',
      channelCode: 'AUDIT_BGS',
      year: 2026,
      clusterName: '../../Cụm Tây Nguyên',
      branchCode: '635',
      cif: '10482910',
      customerName: 'Công ty Cà Phê Tây Nguyên',
      errorCode: 'TD01.01',
    });

    expect(folder).not.toContain('..');
    expect(folder).toContain('Cụm_Tây_Nguyên');
    expect(folder).toContain('CD-TD-2026');
    expect(folder).toContain('10482910_Công_ty_Cà_Phê_Tây_Nguyên');
    expect(folder).toContain('LOI_TD01_01');
  });

  it.each([undefined, { googleServiceAccountKey: '{}', googleDriveRootFolderId: 'folder-id' }])(
    'keeps explicit local storage local even when Google credentials are %s',
    async (googleConfiguration) => {
      const directory = temporaryEvidenceDirectory();
      const adapter = new GoogleDriveAdapter({
        storageMode: 'local',
        localEvidenceDir: directory,
        ...googleConfiguration,
      });

      await expect(adapter.getStorageStatus()).resolves.toEqual({ mode: 'local', durable: true, ready: true });
      await expect(adapter.uploadEvidenceFile({
        fileName: 'proof.pdf',
        fileBuffer: Buffer.from('proof'),
        mimeType: 'application/pdf',
        folderPath: '/AUDIT_BGS/2026',
        findingId: 'finding-1',
      })).resolves.toMatchObject({ driveUrl: expect.stringContaining('/api/v1/evidence/') });
    },
  );

  it('reports Google Drive as not ready without credentials and rejects uploads without local fallback', async () => {
    const adapter = new GoogleDriveAdapter({ storageMode: 'google-drive' });

    await expect(adapter.getStorageStatus()).resolves.toMatchObject({
      mode: 'google-drive',
      durable: false,
      ready: false,
      warning: expect.stringMatching(/thiếu cấu hình/i),
    });
    await expect(adapter.uploadEvidenceFile({
      fileName: 'proof.pdf',
      fileBuffer: Buffer.from('proof'),
      mimeType: 'application/pdf',
      folderPath: '/AUDIT_BGS/2026',
      findingId: 'finding-1',
    })).rejects.toMatchObject({ status: 503, code: 'GOOGLE_DRIVE_ADAPTER_NOT_READY' });
  });

  it('rejects malformed Google credentials instead of claiming readiness', async () => {
    const adapter = new GoogleDriveAdapter({
      storageMode: 'google-drive',
      googleServiceAccountKey: '{}',
      googleDriveRootFolderId: 'folder-id',
    });

    await expect(adapter.getStorageStatus()).resolves.toMatchObject({
      mode: 'google-drive',
      ready: false,
      warning: expect.stringMatching(/cấu hình|credential/i),
    });
  });

  it('creates and verifies a resumable Drive API v3 upload without proxying file bytes', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let folderCounter = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/files/root-folder')) {
        return Response.json({ id: 'root-folder', mimeType: 'application/vnd.google-apps.folder', trashed: false, capabilities: { canAddChildren: true } });
      }
      if (url.includes('/files?') && url.includes('q=')) {
        folderCounter += 1;
        return Response.json({ files: [{ id: `folder-${folderCounter}` }] });
      }
      if (url.includes('/files/generateIds')) return Response.json({ ids: ['drive-file-123'] });
      if (url.includes('/upload/drive/v3/files')) {
        return new Response(null, { status: 200, headers: { location: 'https://upload.example/session-123' } });
      }
      if (url.includes('/files/drive-file-123') && url.includes('alt=media')) {
        return new Response(Buffer.from('drive-content'), { status: 200, headers: { 'content-type': 'application/pdf' } });
      }
      if (url.includes('/files/drive-file-123')) {
        return Response.json({
          id: 'drive-file-123',
          name: 'Biên bản 10MB.pdf',
          mimeType: 'application/pdf',
          size: String(10 * 1024 * 1024 + 1),
          parents: [`folder-${folderCounter}`],
          trashed: false,
          appProperties: { auditBgsFindingId: 'finding-1', auditBgsSha256: 'a'.repeat(64) },
        });
      }
      throw new Error(`Unexpected Drive request: ${url}`);
    };
    const adapter = new GoogleDriveAdapter({
      storageMode: 'google-drive',
      googleDriveRootFolderId: 'root-folder',
      accessTokenProvider: async () => 'token-for-test',
      fetchImpl,
    });

    await expect(adapter.getStorageStatus()).resolves.toMatchObject({ mode: 'google-drive', durable: true, ready: true });
    const session = await adapter.createResumableUploadSession({
      fileName: 'Biên bản 10MB.pdf',
      mimeType: 'application/pdf',
      fileSize: 10 * 1024 * 1024 + 1,
      sha256Checksum: 'a'.repeat(64),
      folderPath: '/AUDIT_BGS/2026',
      findingId: 'finding-1',
    });
    expect(session).toMatchObject({ uploadUrl: 'https://upload.example/session-123', driveFileId: 'drive-file-123' });
    expect(requests.find(request => request.url.includes('/upload/drive/v3/files'))?.init?.body).not.toBeInstanceOf(Buffer);

    await expect(adapter.completeResumableUpload({
      driveFileId: 'drive-file-123',
      fileName: 'Biên bản 10MB.pdf',
      mimeType: 'application/pdf',
      fileSize: 10 * 1024 * 1024 + 1,
      sha256Checksum: 'a'.repeat(64),
      folderPath: '/AUDIT_BGS/2026',
      findingId: 'finding-1',
    })).resolves.toMatchObject({ driveFileId: 'drive-file-123', fileSize: 10 * 1024 * 1024 + 1 });

    const content = await adapter.getFileContentStream('drive-file-123');
    expect(content).toMatchObject({ fileName: 'Biên bản 10MB.pdf', mimeType: 'application/pdf' });
  });

  it('keeps mock seed previews available only to explicit local storage', async () => {
    const adapter = new GoogleDriveAdapter({ storageMode: 'local', localEvidenceDir: temporaryEvidenceDirectory() });

    await expect(adapter.getFileContentStream('drive_mock_001')).resolves.toMatchObject({
      fileName: 'drive_mock_001_local-preview.pdf',
      mimeType: 'application/pdf',
    });
  });

  it.each([
    ['google-drive', 'GOOGLE_DRIVE_ADAPTER_NOT_READY'],
    ['invalid-mode', 'EVIDENCE_STORAGE_MODE_INVALID'],
  ])('fails closed when %s reads a mock seed preview', async (storageMode, code) => {
    const adapter = new GoogleDriveAdapter({ storageMode, localEvidenceDir: temporaryEvidenceDirectory() });

    await expect(adapter.getFileContentStream('drive_mock_001')).rejects.toMatchObject({ status: 503, code });
  });

  it('does not fall back to local storage for an invalid configured evidence mode', async () => {
    const directory = path.join(temporaryEvidenceDirectory(), 'must-not-exist');
    const adapter = new GoogleDriveAdapter({ storageMode: 'invalid-mode', localEvidenceDir: directory });

    await expect(adapter.getStorageStatus()).resolves.toMatchObject({ mode: 'misconfigured', durable: false, ready: false });
    expect(fs.existsSync(directory)).toBe(false);
    await expect(adapter.uploadEvidenceFile({
      fileName: 'proof.pdf',
      fileBuffer: Buffer.from('proof'),
      mimeType: 'application/pdf',
      folderPath: '/AUDIT_BGS/2026',
      findingId: 'finding-1',
    })).rejects.toMatchObject({ status: 503, code: 'EVIDENCE_STORAGE_MODE_INVALID' });
  });
});

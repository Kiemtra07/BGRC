import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/services/api';

afterEach(() => vi.unstubAllGlobals());

describe('browser-to-Drive evidence upload', () => {
  it('uploads a file larger than 10MB directly to the resumable URL, then registers metadata', async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'Biên bản lớn.pdf', { type: 'application/pdf' });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const evidence = {
      id: 'evi-drive-1', findingId: 'find-001', fileName: file.name, fileSize: file.size, mimeType: file.type,
      driveFileId: 'drive-file-1', driveUrl: '/api/v1/evidence/drive-file-1/content', sha256Checksum: 'a'.repeat(64),
      status: 'AVAILABLE', uploadedByUserId: 'user-1', uploadedByName: 'Người tải', uploadedByRole: 'BRANCH_INPUT',
      versionNumber: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/upload-session')) return Response.json({
        uploadMode: 'google-drive', uploadUrl: 'https://upload.example/session', driveFileId: 'drive-file-1',
        fileName: file.name, mimeType: file.type, fileSize: file.size, sha256Checksum: expect.any(String),
      });
      if (url === 'https://upload.example/session') return Response.json({ id: 'drive-file-1' });
      if (url.endsWith('/evidence/complete')) return Response.json(evidence);
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    await expect(api.uploadEvidence('find-001', file)).resolves.toMatchObject({ driveFileId: 'drive-file-1' });

    expect(requests).toHaveLength(3);
    expect(requests[0].url).toContain('/api/v1/findings/find-001/evidence/upload-session');
    expect(requests[1]).toMatchObject({ url: 'https://upload.example/session', init: { method: 'PUT', body: file } });
    expect(requests[2].url).toContain('/api/v1/findings/find-001/evidence/complete');
    expect(requests.some(request => request.init?.body instanceof FormData)).toBe(false);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { cronSecret } = vi.hoisted(() => {
  process.env.CRON_SECRET = 'cron-secret-for-quarantine-tests';
  return { cronSecret: process.env.CRON_SECRET };
});

import { app } from '../../server/src/app';

const officer = { 'x-user-id': 'user-internal-officer' };
const branchInput = { 'x-user-id': 'user-branch-635' };

afterAll(async () => {
  await app.close();
});

function locate(driveFileId: string): string | undefined {
  const root = path.resolve(process.cwd(), 'data', 'drive_storage');
  const files = fs.readdirSync(root, { recursive: true }) as string[];
  return files.find(file => path.basename(file).startsWith(`${driveFileId}_`));
}

describe('thu hồi minh chứng', () => {
  it('chuyển tệp vào thư mục cách ly thay vì để nguyên chỗ cũ hoặc xóa mất', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/findings', headers: officer,
      payload: {
        channelId: 'chan-audit-bgs', campaignId: 'campaign-regular-2026',
        cif: 'QUARANTINE-001', customerName: 'Khách hàng thử cách ly',
        clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
        department: 'Phòng QLKH 1', errorGroup: 'TD01', exposureAmount: 0,
        errorCode: 'QUAR.01', errorTitle: 'Mã lỗi thử cách ly', description: 'Nội dung sai sót dùng để thử cách ly minh chứng.',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const findingId = created.json().id as string;

    const boundary = 'auditbgs-quarantine-test';
    const uploaded = await app.inject({
      method: 'POST', url: `/api/v1/findings/${findingId}/evidence`,
      headers: { ...branchInput, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="chung-tu.pdf"',
        'Content-Type: application/pdf',
        '',
        '%PDF-1.7\nnoi dung can giu lai de doi chieu',
        `--${boundary}--`,
        '',
      ].join('\r\n')),
    });
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    const evidence = uploaded.json() as { id: string; driveFileId: string };
    expect(locate(evidence.driveFileId)).toBeDefined();
    expect(locate(evidence.driveFileId)).not.toContain('_quarantine');

    const revoked = await app.inject({
      method: 'DELETE', url: `/api/v1/findings/${findingId}/evidence/${evidence.id}`,
      headers: branchInput, payload: { reason: 'Thu hồi để tải tài liệu thay thế.' },
    });
    expect(revoked.statusCode, revoked.body).toBe(204);

    const after = locate(evidence.driveFileId);
    expect(after, 'tệp phải còn để đối chiếu').toBeDefined();
    expect(after).toContain('_quarantine');

    // Đã cách ly xong thì lượt bảo trì không còn việc tồn đọng.
    const maintenance = await app.inject({ method: 'POST', url: '/api/v1/internal/sla/run', headers: { authorization: `Bearer ${cronSecret}` } });
    expect(maintenance.statusCode, maintenance.body).toBe(200);
    expect(maintenance.json().maintenance.revokedEvidenceQuarantine).toEqual({ pendingCount: 0, quarantinedCount: 0, failedCount: 0 });
  });
});

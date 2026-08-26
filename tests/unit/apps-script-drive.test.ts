import { describe, expect, it, vi } from 'vitest';
import { AppsScriptDriveGateway, canonicalJson, signDriveRequest } from '../../server/src/adapters/apps-script-drive';

describe('Apps Script Drive gateway', () => {
  it('canonicalizes nested payload keys before signing', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    const first = signDriveRequest({ action: 'PING', payload: { b: 2, a: 1 }, timestamp: 10, nonce: 'n1' }, 'secret');
    const second = signDriveRequest({ action: 'PING', payload: { a: 1, b: 2 }, timestamp: 10, nonce: 'n1' }, 'secret');
    expect(first.signature).toBe(second.signature);
  });

  it('posts only signed server-side commands and returns folder metadata', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(body.action).toBe('PROVISION_CAMPAIGN');
      return new Response(JSON.stringify({ ok: true, requestId: 'r1', data: { folderId: 'folder-1', folderUrl: 'https://drive.google.com/drive/folders/folder-1' } }), { status: 200 });
    });
    const gateway = new AppsScriptDriveGateway({ endpointUrl: 'https://script.google.com/macros/s/test/exec', secret: 'secret', fetchImpl, now: () => 1000, nonce: () => 'nonce-1' });

    const result = await gateway.execute('PROVISION_CAMPAIGN', { campaignCode: 'CD-01' });

    expect(result.data.folderId).toBe('folder-1');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('fails closed when configuration is missing', async () => {
    const gateway = new AppsScriptDriveGateway({ endpointUrl: '', secret: '' });
    await expect(gateway.execute('PING', {})).rejects.toMatchObject({ code: 'DRIVE_NOT_CONFIGURED' });
  });
});

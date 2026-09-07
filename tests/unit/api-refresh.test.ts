import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiService } from '../../src/services/api';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('API session recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches the readable CSRF cookie to an unsafe browser request', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: 'audit_bgs_csrf=csrf-token' });

    await new ApiService().logout();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
    }));
  });

  it('attaches the CSRF cookie to every local multipart request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(response(200, { fileName: 'mau.docx', rows: [] }))
      .mockResolvedValueOnce(response(200, { fileName: 'mau.docx', rows: [] }))
      .mockResolvedValueOnce(response(200, { uploadMode: 'local' }))
      .mockResolvedValueOnce(response(200, { id: 'evidence-1' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: 'audit_bgs_csrf=csrf-token' });
    const file = new File(['nội dung kiểm thử'], 'mau.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const api = new ApiService();

    await api.importCampaignDraft(file);
    await api.previewFindingDocx(file);
    await api.previewFindingDocument(file);
    await api.uploadEvidence('find-1', file);

    const multipartCalls = fetchMock.mock.calls.filter(([url]) => [
      '/admin/campaigns/import-draft',
      '/imports/findings/docx-preview',
      '/imports/findings/document-preview',
      '/findings/find-1/evidence',
    ].some(path => String(url).endsWith(path)));
    expect(multipartCalls).toHaveLength(4);
    for (const [, options] of multipartCalls) {
      expect(new Headers(options?.headers).get('x-csrf-token')).toBe('csrf-token');
    }
  });

  it('refreshes once and retries the original request after an expired access session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { code: 'AUTH_REQUIRED', detail: 'expired' }))
      .mockResolvedValueOnce(response(200, { user: { id: 'u-1' } }))
      .mockResolvedValueOnce(response(200, { value: 'ok' }));

    await expect(new ApiService().getBootstrap()).resolves.toEqual({ value: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/bootstrap');
  });

  it('preserves the original 401 when refresh is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { code: 'AUTH_REQUIRED', detail: 'expired' }))
      .mockResolvedValueOnce(response(404, { code: 'SUPABASE_AUTH_NOT_ENABLED', detail: 'disabled' }));

    await expect(new ApiService().getBootstrap()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' } satisfies Partial<ApiError>);
  });

  it('does not probe refresh again after credentials mode reports it unavailable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { code: 'AUTH_REQUIRED', detail: 'expired' }))
      .mockResolvedValueOnce(response(404, { code: 'SUPABASE_AUTH_NOT_ENABLED', detail: 'disabled' }))
      .mockResolvedValueOnce(response(401, { code: 'AUTH_REQUIRED', detail: 'expired again' }));
    const api = new ApiService();

    await expect(api.getBootstrap()).rejects.toMatchObject({ status: 401 });
    await expect(api.getCampaigns()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'))).toHaveLength(1);
  });

  it('reuses a workflow idempotency key after an uncertain network failure', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('workflow-key-first').mockReturnValueOnce('workflow-key-second');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network dropped'))
      .mockResolvedValueOnce(response(200, { id: 'find-1', version: 2 }));
    const api = new ApiService();
    const dto = { expectedVersion: 1, resolutionNotes: 'Đã bổ sung đủ chứng từ theo yêu cầu.' };

    await expect(api.submitBranch('find-1', dto)).rejects.toMatchObject({ code: 'API_NETWORK_ERROR' });
    await expect(api.submitBranch('find-1', dto)).resolves.toMatchObject({ id: 'find-1', version: 2 });

    const workflowCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/findings/find-1/actions/submit-branch'));
    expect(workflowCalls).toHaveLength(2);
    const firstHeaders = new Headers(workflowCalls[0][1]?.headers);
    const retryHeaders = new Headers(workflowCalls[1][1]?.headers);
    expect(firstHeaders.get('idempotency-key')).toBe('workflow-key-first');
    expect(retryHeaders.get('idempotency-key')).toBe('workflow-key-first');
  });
});

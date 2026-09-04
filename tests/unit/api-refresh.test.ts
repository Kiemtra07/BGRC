import { describe, expect, it, vi } from 'vitest';
import { ApiError, ApiService } from '../../src/services/api';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('API session recovery', () => {
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
});

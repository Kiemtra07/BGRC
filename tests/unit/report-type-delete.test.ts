import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/services/api';

afterEach(() => vi.unstubAllGlobals());

describe('report type deletion', () => {
  it('sends a valid JSON body so Fastify does not reject the DELETE request', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.deleteChannel('channel-unused');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/channels/channel-unused', expect.objectContaining({
      method: 'DELETE',
      body: '{}',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });

  it('shows explicit confirm and cancel actions instead of an invisible second click', () => {
    const source = fs.readFileSync('src/components/admin/DynamicChannelManager.tsx', 'utf8');
    expect(source).toContain('Xác nhận xóa');
    expect(source).toContain('Hủy');
    expect(source).not.toContain('onBlur={() => setPendingDeleteId(undefined)}');
  });
});

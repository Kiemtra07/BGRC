import { afterAll, describe, expect, it, vi } from 'vitest';

// Bộ chuyển Supabase giữ tham chiếu tới `fetch` lúc app được nạp, nên phải dựng môi trường trước khi nhập app.
const recoverCalls = vi.hoisted(() => ({ count: 0 }));
vi.hoisted(() => {
  process.env.AUTH_MODE = 'supabase';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.APP_BASE_URL = 'http://localhost:3000';
  globalThis.fetch = (async (input: unknown) => {
    if (String(input).endsWith('/auth/v1/recover')) recoverCalls.count += 1;
    return new Response('', { status: 200 });
  }) as typeof fetch;
});

import { app } from '../../server/src/app';

afterAll(async () => {
  await app.close();
});

const requestReset = (email: string) => app.inject({
  method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email },
});

describe('quên mật khẩu', () => {
  it('chỉ gửi một số thư giới hạn tới cùng một địa chỉ và vẫn trả 204 để không lộ ngưỡng', async () => {
    recoverCalls.count = 0;
    for (let index = 0; index < 15; index += 1) {
      const response = await requestReset('nan.nhan@bank.com.vn');
      expect(response.statusCode, `lần ${index + 1}`).toBe(204);
    }
    expect(recoverCalls.count).toBeGreaterThan(0);
    expect(recoverCalls.count).toBeLessThanOrEqual(8);
  });

  it('không để địa chỉ này chặn thư của địa chỉ khác', async () => {
    recoverCalls.count = 0;
    const response = await requestReset('nguoi.khac@bank.com.vn');
    expect(response.statusCode).toBe(204);
    expect(recoverCalls.count).toBe(1);
  });
});

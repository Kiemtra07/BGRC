import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthAdapter, SupabaseAuthConfigurationError } from '../../server/src/auth/supabase-auth';

describe('SupabaseAuthAdapter', () => {
  it('fails closed when server configuration is incomplete', () => {
    expect(() => createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: '' })).toThrow(SupabaseAuthConfigurationError);
  });

  it('verifies a bearer token through the Supabase Auth user endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'auth-1', email: 'user@example.com' }), { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', fetchImpl });

    await expect(adapter.verifyAccessToken('jwt-token')).resolves.toEqual({ id: 'auth-1', email: 'user@example.com' });
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/user', expect.objectContaining({
      headers: expect.objectContaining({ apikey: 'publishable', Authorization: 'Bearer jwt-token' }),
    }));
  });

  it('uses the secret key only for server-side admin operations', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'auth-2', email: 'new@example.com' }), { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', secretKey: 'server-secret', fetchImpl });

    await adapter.createUser({ email: 'new@example.com', password: 'A-long-password-123' });
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/admin/users', expect.objectContaining({
      headers: expect.objectContaining({ apikey: 'server-secret', Authorization: 'Bearer server-secret' }),
    }));
  });

  it('signs in with password and returns the Supabase session tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600,
      user: { id: 'auth-1', email: 'user@example.com' },
    }), { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', fetchImpl });

    await expect(adapter.signInWithPassword('user@example.com', 'A-long-password-123')).resolves.toEqual({
      accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 3600,
      user: { id: 'auth-1', email: 'user@example.com' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/token?grant_type=password', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ apikey: 'publishable' }),
      body: JSON.stringify({ email: 'user@example.com', password: 'A-long-password-123' }),
    }));
  });

  it('rotates access and refresh tokens with the refresh token grant', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600,
      user: { id: 'auth-1', email: 'user@example.com' },
    }), { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', fetchImpl });

    await expect(adapter.refreshSession('refresh-1')).resolves.toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/token?grant_type=refresh_token', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ refresh_token: 'refresh-1' }),
    }));
  });

  it('changes a password with the current access token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', fetchImpl });

    await adapter.changePassword('access-1', 'A-new-password-123');
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/user', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ apikey: 'publishable', Authorization: 'Bearer access-1' }),
      body: JSON.stringify({ password: 'A-new-password-123' }),
    }));
  });

  it('revokes the current session through Supabase logout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const adapter = createSupabaseAuthAdapter({ url: 'https://demo.supabase.co', publishableKey: 'publishable', fetchImpl });

    await adapter.signOut('access-1');
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.supabase.co/auth/v1/logout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ apikey: 'publishable', Authorization: 'Bearer access-1' }),
    }));
  });
});

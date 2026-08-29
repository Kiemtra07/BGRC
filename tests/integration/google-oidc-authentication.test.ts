import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const oidc = vi.hoisted(() => ({
  createAuthorizationUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?state=signed-state'),
  exchangeCode: vi.fn(async () => ({
    identity: { subject: 'google-admin-001', email: 'admin.hethong@bidv.com.vn', fullName: 'Quản trị hệ thống' },
    returnTo: '/',
  })),
}));

vi.mock('../../server/src/security/google-oidc-client', () => oidc);

import { app } from '../../server/src/app';

const environment = ['AUTH_MODE', 'OIDC_ISSUER_URL', 'OIDC_AUDIENCE', 'GOOGLE_OIDC_CLIENT_ID', 'GOOGLE_OIDC_CLIENT_SECRET', 'GOOGLE_OIDC_REDIRECT_URI', 'GOOGLE_OIDC_STATE_SECRET'] as const;
const originalEnvironment = Object.fromEntries(environment.map(key => [key, process.env[key]]));

beforeEach(() => {
  Object.assign(process.env, {
    AUTH_MODE: 'oidc',
    OIDC_ISSUER_URL: 'https://accounts.google.com',
    OIDC_AUDIENCE: 'client-id.apps.googleusercontent.com',
    GOOGLE_OIDC_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_OIDC_CLIENT_SECRET: 'client-secret',
    GOOGLE_OIDC_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/google/callback',
    GOOGLE_OIDC_STATE_SECRET: 'google-oidc-state-secret-for-tests',
  });
  oidc.createAuthorizationUrl.mockClear();
  oidc.exchangeCode.mockClear();
});

afterEach(() => {
  for (const key of environment) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('Google OIDC authentication', () => {
  it('starts Google authorization without requiring an existing session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/google?returnTo=/reports' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    expect(oidc.createAuthorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ returnTo: '/reports' }));
  });

  it('creates the normal AuditBGS session for a provisioned Google email', async () => {
    const start = await app.inject({ method: 'GET', url: '/api/v1/auth/google?returnTo=/' });
    const stateCookie = start.cookies.find(cookie => cookie.name === 'audit_bgs_oidc_state');
    expect(stateCookie?.value).toBeTruthy();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback?code=google-code&state=signed-state',
      headers: { cookie: `audit_bgs_oidc_state=${stateCookie?.value}` },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(oidc.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'google-code', state: 'signed-state' }));
    expect(response.cookies.find(cookie => cookie.name === 'audit_bgs_session')?.httpOnly).toBe(true);
    expect(response.cookies.find(cookie => cookie.name === 'audit_bgs_oidc_state')?.maxAge).toBe(0);
  });

  it('rejects a callback when the browser state cookie is missing or mismatched', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/v1/auth/google/callback?code=google-code&state=signed-state' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().code).toBe('GOOGLE_OIDC_STATE_MISMATCH');

    const mismatched = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback?code=google-code&state=signed-state',
      headers: { cookie: 'audit_bgs_oidc_state=other-state' },
    });
    expect(mismatched.statusCode).toBe(401);
    expect(mismatched.json().code).toBe('GOOGLE_OIDC_STATE_MISMATCH');
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('does not accept password login when Google OIDC mode is active', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'admin.hethong', password: 'AuditAdmin@2026' },
    });

    expect(response.statusCode).toBe(405);
    expect(response.json().code).toBe('OIDC_LOGIN_REQUIRED');
  });
});

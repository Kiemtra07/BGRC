import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { generateTotpCode } from '../../server/src/security/totp';

const originalHeaderBridge = process.env.ALLOW_TEST_USER_HEADER;

afterEach(() => {
  if (originalHeaderBridge === undefined) delete process.env.ALLOW_TEST_USER_HEADER;
  else process.env.ALLOW_TEST_USER_HEADER = originalHeaderBridge;
});

describe('local credential authentication', () => {
  it('logs in all five operating personas with the expected roles', async () => {
    const accounts = [
      ['admin.hethong', 'AuditAdmin@2026', ['ADMIN']],
      ['linhlbk', 'AuditLead@2026', ['SUPERVISOR', 'INTERNAL_APPROVER']],
      ['bachtd', 'AuditOfficer@2026', ['INTERNAL_OFFICER']],
      ['cbht635', 'BranchInput@2026', ['BRANCH_INPUT']],
      ['lyltk1', 'BranchControl@2026', ['BRANCH_CONTROLLER']],
    ] as const;

    for (const [username, password, roles] of accounts) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username, password },
      });

      expect(response.statusCode, username).toBe(200);
      expect(response.json().user.roles, username).toEqual(roles);
      expect(response.cookies.find(cookie => cookie.name === 'audit_bgs_session')?.httpOnly).toBe(true);
      expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    }
  });

  it('returns the same safe message for an unknown account and a wrong password', async () => {
    const [unknown, wrong] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'khong.co', password: 'anything' } }),
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'admin.hethong', password: 'wrong' } }),
    ]);

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().detail).toBe('Tài khoản hoặc mật khẩu không đúng.');
    expect(wrong.json().detail).toBe(unknown.json().detail);
  });

  it('authenticates /me from the session cookie and revokes it on logout', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'cbht635', password: 'BranchInput@2026' },
    });
    const cookie = login.cookies.find(item => item.name === 'audit_bgs_session');
    expect(cookie).toBeDefined();

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `audit_bgs_session=${cookie!.value}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.primaryRole).toBe('BRANCH_INPUT');

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: `audit_bgs_session=${cookie!.value}` } });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `audit_bgs_session=${cookie!.value}` } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('returns the initial workspace data through one authenticated bootstrap response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      channels: expect.any(Array),
      campaigns: expect.any(Array),
      branches: expect.any(Array),
      summary: expect.objectContaining({ totalFindings: expect.any(Number) }),
      work: expect.objectContaining({ actionable: expect.any(Array), watchTargets: expect.any(Array) }),
    }));

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/bootstrap' });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('does not trust x-user-id when the explicit test bridge is disabled', async () => {
    process.env.ALLOW_TEST_USER_HEADER = 'false';
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': 'user-admin' } });
    expect(response.statusCode).toBe(401);
  });

  // Whether a code is demanded is a system policy, not a per-account flag. Issuing a secret alone
  // must never start demanding one, otherwise the requirement depends on click order.
  it('demands the Google Authenticator token only while the system policy covers the account', async () => {
    const enable = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/user-branch-635/authenticator',
      headers: { 'x-user-id': 'user-admin' },
      payload: { enabled: true },
    });
    expect(enable.statusCode).toBe(200);
    const setup = enable.json().setup;
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUri).toContain('otpauth://totp/');

    // Holding a secret while the policy is off must not block a normal login.
    const policyOff = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026' },
    });
    expect(policyOff.statusCode).toBe(200);

    const setPolicy = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' },
      payload: { mfaPolicy: 'REQUIRED_ALL' },
    });
    expect(setPolicy.statusCode).toBe(200);

    const missingToken = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026' },
    });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.json().code).toBe('MFA_REQUIRED');

    const token = generateTotpCode(setup.secret);
    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026', mfaCode: token },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.email).toBe('cbht635@bidv.com.vn');

    // Revoking a secret the policy still requires would lock the account out, so it is refused.
    const refused = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/user-branch-635/authenticator',
      headers: { 'x-user-id': 'user-admin' },
      payload: { enabled: false },
    });
    expect(refused.statusCode).toBe(409);

    const clearPolicy = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' },
      payload: { mfaPolicy: 'DISABLED' },
    });
    expect(clearPolicy.statusCode).toBe(200);

    const disable = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/user-branch-635/authenticator',
      headers: { 'x-user-id': 'user-admin' },
      payload: { enabled: false },
    });
    expect(disable.statusCode).toBe(200);
    expect(disable.json().user.authenticatorRequired).toBe(false);
  });
});

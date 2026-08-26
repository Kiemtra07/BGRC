import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

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

  it('does not trust x-user-id when the explicit test bridge is disabled', async () => {
    process.env.ALLOW_TEST_USER_HEADER = 'false';
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': 'user-admin' } });
    expect(response.statusCode).toBe(401);
  });
});

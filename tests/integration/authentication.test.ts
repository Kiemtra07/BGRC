import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { generateTotpCode } from '../../server/src/security/totp';

const originalHeaderBridge = process.env.ALLOW_TEST_USER_HEADER;

afterEach(() => {
  if (originalHeaderBridge === undefined) delete process.env.ALLOW_TEST_USER_HEADER;
  else process.env.ALLOW_TEST_USER_HEADER = originalHeaderBridge;
});

async function enrolAllActiveUsers(): Promise<Map<string, string>> {
  const directory = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: { 'x-user-id': 'user-admin' } });
  expect(directory.statusCode).toBe(200);
  const secrets = new Map<string, string>();
  for (const user of directory.json().filter((item: { isActive: boolean }) => item.isActive)) {
    const issue = await app.inject({
      method: 'PUT', url: `/api/v1/admin/users/${user.id}/authenticator`,
      headers: { 'x-user-id': 'user-admin' }, payload: { enabled: true },
    });
    expect(issue.statusCode).toBe(200);
    const secret = issue.json().setup?.secret;
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const confirm = await app.inject({
      method: 'POST', url: `/api/v1/admin/users/${user.id}/authenticator/confirm`,
      headers: { 'x-user-id': 'user-admin' }, payload: { code: generateTotpCode(secret) },
    });
    expect(confirm.statusCode).toBe(200);
    secrets.set(user.id, secret);
  }
  return secrets;
}

async function revokeAuthenticatorSecrets(userIds: Iterable<string>): Promise<void> {
  for (const id of userIds) {
    const response = await app.inject({
      method: 'PUT', url: `/api/v1/admin/users/${id}/authenticator`,
      headers: { 'x-user-id': 'user-admin' }, payload: { enabled: false },
    });
    expect(response.statusCode).toBe(200);
  }
}

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
      expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
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
    const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf');
    expect(cookie).toBeDefined();
    expect(csrf).toBeDefined();

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `audit_bgs_session=${cookie!.value}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.primaryRole).toBe('BRANCH_INPUT');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${cookie!.value}; audit_bgs_csrf=${csrf!.value}`,
        origin: 'http://localhost:3000',
        'x-csrf-token': csrf!.value,
      },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `audit_bgs_session=${cookie!.value}` } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('rejects a cross-origin state change authenticated by a session cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'cbht635', password: 'BranchInput@2026' },
    });
    const cookie = login.cookies.find(item => item.name === 'audit_bgs_session');
    expect(cookie).toBeDefined();

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${cookie!.value}`,
        origin: 'https://attacker.example',
      },
    });

    expect(logout.statusCode).toBe(403);
    expect(logout.json()).toMatchObject({ code: 'CSRF_ORIGIN_REJECTED' });

    const stillAuthenticated = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `audit_bgs_session=${cookie!.value}` },
    });
    expect(stillAuthenticated.statusCode).toBe(200);
  });

  it('accepts a same-origin state change from a host outside CORS_ALLOWED_ORIGINS', async () => {
    // Giao diện và API dùng chung tên miền trên Vercel, và mỗi bản preview lại có tên miền riêng.
    // Yêu cầu xuất phát từ chính trang đó không phải CSRF, kể cả khi biến môi trường chưa liệt kê.
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'cbht635', password: 'BranchInput@2026' },
    });
    const session = login.cookies.find(item => item.name === 'audit_bgs_session')!;
    const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf')!;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${session.value}; audit_bgs_csrf=${csrf.value}`,
        host: 'bgrc.example.app',
        origin: 'http://bgrc.example.app',
        'x-csrf-token': csrf.value,
      },
    });
    expect(logout.statusCode).toBe(204);
  });

  it('still rejects a write whose origin does not match the request host', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'cbht635', password: 'BranchInput@2026' },
    });
    const session = login.cookies.find(item => item.name === 'audit_bgs_session')!;
    const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf')!;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${session.value}; audit_bgs_csrf=${csrf.value}`,
        host: 'bgrc.example.app',
        origin: 'http://attacker.example.app',
        'x-csrf-token': csrf.value,
      },
    });
    expect(logout.statusCode).toBe(403);
    expect(logout.json()).toMatchObject({ code: 'CSRF_ORIGIN_REJECTED' });
  });

  it('requires a matching CSRF token for an allowed-origin session-cookie write', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'cbht635', password: 'BranchInput@2026' },
    });
    const session = login.cookies.find(item => item.name === 'audit_bgs_session');
    const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf');
    expect(session).toBeDefined();
    expect(csrf).toBeDefined();

    const missingToken = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${session!.value}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(missingToken.statusCode).toBe(403);
    expect(missingToken.json()).toMatchObject({ code: 'CSRF_TOKEN_REQUIRED' });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `audit_bgs_session=${session!.value}; audit_bgs_csrf=${csrf!.value}`,
        origin: 'http://localhost:3000',
        'x-csrf-token': csrf!.value,
      },
    });
    expect(logout.statusCode).toBe(204);
  });

  it('requires a fresh password confirmation before a cookie session changes MFA policy', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'admin.hethong', password: 'AuditAdmin@2026' },
    });
    expect(login.statusCode).toBe(200);
    const session = login.cookies.find(item => item.name === 'audit_bgs_session')!;
    const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf')!;
    const headers = {
      cookie: `audit_bgs_session=${session.value}; audit_bgs_csrf=${csrf.value}`,
      origin: 'http://localhost:3000',
      'x-csrf-token': csrf.value,
    };

    const denied = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings', headers,
      payload: { mfaPolicy: 'DISABLED' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('STEP_UP_REQUIRED');

    const userChangeDenied = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/users/user-admin', headers,
      payload: { fullName: 'Quản trị hệ thống' },
    });
    expect(userChangeDenied.statusCode).toBe(403);
    expect(userChangeDenied.json().code).toBe('STEP_UP_REQUIRED');

    const stepUp = await app.inject({
      method: 'POST', url: '/api/v1/auth/step-up', headers,
      payload: { password: 'AuditAdmin@2026' },
    });
    expect(stepUp.statusCode).toBe(204);

    const allowed = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings', headers,
      payload: { mfaPolicy: 'DISABLED' },
    });
    expect(allowed.statusCode).toBe(200);

    const userChangeAllowed = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/users/user-admin', headers,
      payload: { fullName: 'Quản trị hệ thống' },
    });
    expect(userChangeAllowed.statusCode).toBe(200);
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

  it('keeps the Supabase refresh endpoint public to the auth pre-handler', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SUPABASE_AUTH_NOT_ENABLED' });
  });

  it('does not trust x-user-id when the explicit test bridge is disabled', async () => {
    process.env.ALLOW_TEST_USER_HEADER = 'false';
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': 'user-admin' } });
    expect(response.statusCode).toBe(401);
  });

  it('keeps an issued Authenticator secret pending until its first code is confirmed', async () => {
    const issue = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/user-branch-635/authenticator',
      headers: { 'x-user-id': 'user-admin' },
      payload: { enabled: true },
    });

    expect(issue.statusCode).toBe(200);
    expect(issue.json().user.authenticatorConfigured).toBe(false);

    const blockedPolicy = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' }, payload: { mfaPolicy: 'REQUIRED_ALL' },
    });
    expect(blockedPolicy.statusCode).toBe(409);
    expect(blockedPolicy.json().code).toBe('MFA_ENROLMENT_INCOMPLETE');

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/user-branch-635/authenticator/confirm',
      headers: { 'x-user-id': 'user-admin' },
      payload: { code: generateTotpCode(issue.json().setup.secret) },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().user.authenticatorConfigured).toBe(true);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/user-branch-635/authenticator',
      headers: { 'x-user-id': 'user-admin' },
      payload: { enabled: false },
    });
  });

  // Whether a code is demanded is a system policy, not a per-account flag. Issuing a secret alone
  // must never start demanding one, otherwise the requirement depends on click order.
  it('demands the Google Authenticator token only while the system policy covers the account', async () => {
    const secrets = await enrolAllActiveUsers();
    const secret = secrets.get('user-branch-635')!;

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

    const token = generateTotpCode(secret);
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

    await revokeAuthenticatorSecrets(secrets.keys());
  });

  it('accepts a Google Authenticator token only once during its time step', async () => {
    const secrets = await enrolAllActiveUsers();

    const policy = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' },
      payload: { mfaPolicy: 'REQUIRED_ALL' },
    });
    expect(policy.statusCode).toBe(200);

    const token = generateTotpCode(secrets.get('user-branch-635')!);
    const payload = { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026', mfaCode: token };
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('MFA_REQUIRED');

    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' },
      payload: { mfaPolicy: 'DISABLED' },
    });
    await revokeAuthenticatorSecrets(secrets.keys());
  });

  it('accepts an issued recovery code once when an enrolled user loses the Authenticator device', async () => {
    const secrets = await enrolAllActiveUsers();
    const issued = await app.inject({
      method: 'POST', url: '/api/v1/admin/users/user-branch-635/authenticator/recovery-codes',
      headers: { 'x-user-id': 'user-admin' },
    });
    expect(issued.statusCode).toBe(200);
    const recoveryCode = issued.json().codes[0];
    expect(recoveryCode).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/);

    const policy = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' }, payload: { mfaPolicy: 'REQUIRED_ALL' },
    });
    expect(policy.statusCode).toBe(200);

    const payload = { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026', mfaCode: recoveryCode };
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(401);

    await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: { 'x-user-id': 'user-admin' }, payload: { mfaPolicy: 'DISABLED' },
    });
    await revokeAuthenticatorSecrets(secrets.keys());
  });
});

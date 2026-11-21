import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { generateTotpCode } from '../../server/src/security/totp';

const admin = { 'x-user-id': 'user-admin' };
const FAILURE_LIMIT = 8;

afterEach(async () => {
  await app.inject({
    method: 'PUT', url: '/api/v1/admin/security-settings',
    headers: admin, payload: { mfaPolicy: 'DISABLED' },
  });
});

afterAll(async () => {
  await app.close();
});

async function enrolAllActiveUsers(): Promise<Map<string, string>> {
  const directory = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: admin });
  const secrets = new Map<string, string>();
  for (const user of directory.json().filter((item: { isActive: boolean }) => item.isActive)) {
    const issue = await app.inject({
      method: 'PUT', url: `/api/v1/admin/users/${user.id}/authenticator`,
      headers: admin, payload: { enabled: true },
    });
    const secret = issue.json().setup.secret as string;
    const confirm = await app.inject({
      method: 'POST', url: `/api/v1/admin/users/${user.id}/authenticator/confirm`,
      headers: admin, payload: { code: generateTotpCode(secret) },
    });
    expect(confirm.statusCode, confirm.body).toBe(200);
    secrets.set(user.id, secret);
  }
  return secrets;
}

async function sessionFor(username: string, password: string) {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });
  expect(login.statusCode, login.body).toBe(200);
  const session = login.cookies.find(item => item.name === 'audit_bgs_session')!;
  const csrf = login.cookies.find(item => item.name === 'audit_bgs_csrf')!;
  return {
    cookie: `audit_bgs_session=${session.value}; audit_bgs_csrf=${csrf.value}`,
    origin: 'http://localhost:3000',
    'x-csrf-token': csrf.value,
  };
}

describe('giới hạn số lần thử ở các bước xác thực', () => {
  it('khóa tài khoản khi nhập đúng mật khẩu nhưng sai mã Authenticator liên tiếp', async () => {
    const secrets = await enrolAllActiveUsers();
    const secret = secrets.get('user-branch-635')!;
    const policy = await app.inject({
      method: 'PUT', url: '/api/v1/admin/security-settings',
      headers: admin, payload: { mfaPolicy: 'REQUIRED_ALL' },
    });
    expect(policy.statusCode, policy.body).toBe(200);

    const valid = generateTotpCode(secret);
    const wrongCode = (index: number) => {
      const candidate = String(100000 + index * 7919).slice(0, 6);
      return candidate === valid ? '999999' : candidate;
    };
    const attempt = (mfaCode: string) => app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'cbht635@bidv.com.vn', password: 'BranchInput@2026', mfaCode },
    });

    for (let index = 0; index < FAILURE_LIMIT; index += 1) {
      const failed = await attempt(wrongCode(index));
      expect(failed.statusCode, `lần ${index + 1}`).toBe(401);
    }
    const locked = await attempt(valid);
    expect(locked.statusCode, locked.body).toBe(429);
    expect(locked.json()).toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED' });
  });

  it('không tính lượt chưa nhập mã vào bộ đếm khóa', async () => {
    for (let index = 0; index < FAILURE_LIMIT + 2; index += 1) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { username: 'lyltk1', password: 'BranchControl@2026' },
      });
      expect(response.statusCode, `lần ${index + 1}`).toBe(200);
    }
  });

  it('khóa bước xác thực lại khi đoán sai mật khẩu liên tiếp', async () => {
    const headers = await sessionFor('admin.hethong', 'AuditAdmin@2026');
    for (let index = 0; index < FAILURE_LIMIT; index += 1) {
      const failed = await app.inject({ method: 'POST', url: '/api/v1/auth/step-up', headers, payload: { password: `sai-mat-khau-${index}` } });
      expect(failed.statusCode, `lần ${index + 1}`).toBe(401);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/step-up', headers, payload: { password: 'AuditAdmin@2026' } });
    expect(locked.statusCode, locked.body).toBe(429);
    expect(locked.json()).toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED' });
  });

  it('khóa bước đổi mật khẩu khi nhập sai mật khẩu hiện tại liên tiếp', async () => {
    const headers = await sessionFor('bachtd', 'AuditOfficer@2026');
    for (let index = 0; index < FAILURE_LIMIT; index += 1) {
      const failed = await app.inject({
        method: 'POST', url: '/api/v1/auth/password', headers,
        payload: { currentPassword: `sai-mat-khau-${index}`, password: 'MatKhauMoiRatDai@2026' },
      });
      expect(failed.statusCode, `lần ${index + 1}`).toBe(422);
    }
    const locked = await app.inject({
      method: 'POST', url: '/api/v1/auth/password', headers,
      payload: { currentPassword: 'AuditOfficer@2026', password: 'MatKhauMoiRatDai@2026' },
    });
    expect(locked.statusCode, locked.body).toBe(429);
    expect(locked.json()).toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED' });
  });
});

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('authentication UI architecture', () => {
  it('uses a credential form and no mock identity switcher', () => {
    const appSource = read('src/App.tsx');
    const loginSource = read('src/components/auth/LoginPage.tsx');
    const apiSource = read('src/services/api.ts');

    expect(appSource).not.toContain('aria-label="Chuyển người dùng"');
    expect(appSource).not.toContain('switchUser');
    expect(loginSource).toContain('autoComplete="username"');
    expect(loginSource).toContain('autoComplete="current-password"');
    expect(loginSource).not.toContain('autoComplete="one-time-code"');
    expect(loginSource).not.toContain('Google Authenticator');
    expect(loginSource).not.toContain('mfaCode');
    expect(loginSource).toContain('Email đăng nhập');
    expect(loginSource).toContain('Đăng nhập');
    expect(apiSource).not.toContain("'x-user-id'");
    expect(apiSource).toContain("credentials: 'same-origin'");
    expect(apiSource).toContain('/authenticator');
  });

  it('reveals login after identity check instead of waiting on authenticated bootstrap', () => {
    const appSource = read('src/App.tsx');
    const identityCheck = appSource.indexOf('const me = await api.getMe();');
    const authGate = appSource.indexOf('setAuthChecked(true);', identityCheck);
    const bootstrapCall = appSource.indexOf('void bootstrapData();', authGate);
    const loginResponse = appSource.indexOf('const response = await api.login(credentials);');

    expect(identityCheck).toBeGreaterThanOrEqual(0);
    expect(authGate).toBeGreaterThan(identityCheck);
    expect(bootstrapCall).toBeGreaterThan(authGate);
    expect(loginResponse).toBeGreaterThanOrEqual(0);
    expect(appSource).toContain('setCurrentUser(response.user);');
    expect(appSource).toContain('void bootstrapData();');
    expect(appSource).toContain("reason.code === 'STATE_MERGE_CONFLICT'");
  });

  it('uses one authenticated bootstrap request for initial workspace data', () => {
    const appSource = read('src/App.tsx');
    const apiSource = read('src/services/api.ts');
    const serverSource = read('server/src/app.ts');

    expect(apiSource).toContain("this.request('/bootstrap')");
    expect(appSource).toContain('api.getBootstrap()');
    expect(serverSource).toContain("app.get('/api/v1/bootstrap'");
    expect(serverSource).toContain('getScopedBranchesForUser(user)');
    expect(serverSource).toContain('getDashboardSummaryForUser(user)');
    expect(serverSource).toContain('getMyWorkForUser(user)');
  });

  it('keeps browser smokes on the real session-login contract', () => {
    const helperPath = 'tests/e2e/auth-helpers.mjs';
    expect(fs.existsSync(helperPath)).toBe(true);

    const helperSource = read(helperPath);
    const smokePaths = [
      'tests/e2e/local-smoke.mjs',
      'tests/e2e/evidence-lifecycle-smoke.mjs',
      'tests/e2e/report-form-cms-smoke.mjs',
      'tests/e2e/reports-smoke.mjs',
    ];

    expect(helperSource).toContain('/api/v1/auth/login');
    expect(helperSource).toContain('credentials');
    for (const smokePath of smokePaths) {
      const smokeSource = read(smokePath);
      expect(smokeSource, smokePath).toContain("from './auth-helpers.mjs'");
      expect(smokeSource, smokePath).not.toContain("locator('header select')");
      expect(smokeSource, smokePath).not.toContain("'x-user-id'");
    }
  });
});

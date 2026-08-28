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
    expect(loginSource).toContain('autoComplete="one-time-code"');
    expect(loginSource).toContain('Email đăng nhập');
    expect(loginSource).toContain('Đăng nhập');
    expect(apiSource).not.toContain("'x-user-id'");
    expect(apiSource).toContain("credentials: 'same-origin'");
    expect(apiSource).toContain('/authenticator');
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

const APP_URL = 'http://localhost:3000';

const accounts = {
  admin: {
    expectedUserId: 'user-admin',
    credentials: { username: 'admin.hethong', password: 'AuditAdmin@2026' },
  },
  branchInput: {
    expectedUserId: 'user-branch-635',
    credentials: { username: 'cbht635', password: 'BranchInput@2026' },
  },
  branchController: {
    expectedUserId: 'user-branch-controller-635',
    credentials: { username: 'lyltk1', password: 'BranchControl@2026' },
  },
  internalOfficer: {
    expectedUserId: 'user-internal-officer',
    credentials: { username: 'bachtd', password: 'AuditOfficer@2026' },
  },
};

export async function loginAs(page, accountName) {
  const account = accounts[accountName];
  if (!account) throw new Error(`Unknown local smoke account: ${accountName}`);

  // A direct Playwright request does not receive the app's CSRF header. Starting
  // a fresh browser session is equivalent for the smoke test and avoids masking
  // the production double-submit CSRF guard with a test-only bypass.
  await page.context().clearCookies();
  const response = await page.request.post(`${APP_URL}/api/v1/auth/login`, {
    data: account.credentials,
  });
  if (!response.ok()) {
    throw new Error(`Local smoke login failed for ${accountName}: HTTP ${response.status()}`);
  }

  const payload = await response.json();
  if (payload.user?.id !== account.expectedUserId) {
    throw new Error(`Local smoke login resolved ${payload.user?.id ?? 'no user'} instead of ${account.expectedUserId}`);
  }

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Đăng xuất' }).waitFor();
}

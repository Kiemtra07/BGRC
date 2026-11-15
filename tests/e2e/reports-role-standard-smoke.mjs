import assert from 'node:assert/strict';
import { chromium, request as playwrightRequest } from 'playwright';
import { loginAs } from './auth-helpers.mjs';

// Chạy với API ở NODE_ENV=test (nhận header x-user-id) và web ở cổng 3000.
const API_URL = 'http://localhost:3001';
const REPORT_NAME = 'Tồn đọng theo đơn vị (smoke)';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const api = await playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'x-user-id': 'user-internal-officer' } });

try {
  const created = await api.post('/api/v1/reports/definitions', {
    data: { name: REPORT_NAME, exportColumns: ['dimension.branch'], visibility: 'ROLE_SHARED', sharedWithRoles: ['BRANCH_INPUT'] },
  });
  assert.equal(created.status(), 201, await created.text());

  await loginAs(page, 'admin');
  await page.getByRole('button', { name: 'Cấu hình', exact: true }).click();

  // Bộ trường theo vai trò: ma trận hiện đủ và lưu được.
  await page.getByRole('button', { name: 'Trường báo cáo' }).click();
  await page.getByRole('tab', { name: 'Theo vai trò' }).click();
  const matrix = page.getByTestId('report-role-matrix');
  await matrix.waitFor();
  const boxes = matrix.getByRole('checkbox');
  assert.ok(await boxes.count() >= 7 * 20, 'Ma trận vai trò thiếu ô chọn.');
  await matrix.getByRole('button', { name: 'Gọn' }).first().click();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await page.getByText('Đã cập nhật trường dữ liệu dùng trên màn Báo cáo.').waitFor();

  // Báo cáo chuẩn: đặt từ trang quản trị.
  await page.getByRole('button', { name: 'Báo cáo đã lưu' }).click();
  const manager = page.getByTestId('saved-reports-manager');
  await manager.waitFor();
  const row = manager.getByRole('row').filter({ hasText: REPORT_NAME });
  await row.getByRole('button', { name: 'Sửa' }).click();
  await page.getByRole('checkbox', { name: /Đặt làm báo cáo chuẩn/ }).check();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).last().click();
  await manager.getByRole('row').filter({ hasText: REPORT_NAME }).getByText('Chuẩn', { exact: true }).waitFor();

  // Người dùng được chia sẻ thấy báo cáo trong mục chuẩn, không trong mục tự lưu.
  await loginAs(page, 'branchInput');
  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  const workspace = page.getByTestId('reports-workspace');
  await workspace.waitFor();
  await workspace.getByTestId('report-standard-list').getByRole('button', { name: REPORT_NAME }).waitFor();
  assert.equal(await workspace.getByTestId('report-saved-list').count(), 0, 'Báo cáo chuẩn không được lẫn vào mục báo cáo tự lưu.');

  // Trường nâng cao được gom lại: bảng chéo nằm trong mục Nâng cao.
  await workspace.getByRole('tab', { name: 'Tự thiết kế' }).click();
  const advanced = workspace.getByTestId('designer-advanced');
  await advanced.waitFor();
  assert.equal(await advanced.evaluate(element => element.open), false, 'Mục Nâng cao phải đóng sẵn.');

  assert.equal(pageErrors.length, 0, `Lỗi trình duyệt: ${pageErrors.join(' | ')}`);
  console.log('reports-role-standard smoke: PASS');
} finally {
  await api.dispose();
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { loginAs } from './auth-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await loginAs(page, 'admin');
  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  const workspace = page.getByTestId('reports-workspace');
  await workspace.waitFor();

  assert.equal(await workspace.getByText('Trường dữ liệu', { exact: true }).count(), 0, 'Người xem không được thấy danh mục trường kỹ thuật.');
  assert.equal(await workspace.getByText('Thiết lập báo cáo', { exact: true }).count(), 0, 'Người xem không được thấy khối thiết lập kỹ thuật.');

  const presetList = workspace.getByTestId('report-preset-list');
  await presetList.waitFor();
  await presetList.getByRole('button').filter({ hasText: 'Tổng hợp theo chi nhánh' }).click();
  await workspace.getByText('Đang xem mẫu dựng sẵn “Tổng hợp theo chi nhánh”.', { exact: true }).waitFor();
  await workspace.getByText('Kết quả truy vấn', { exact: true }).waitFor();
  await workspace.getByText('Bảng', { exact: true }).waitFor();

  for (const format of ['Excel', 'CSV', 'HTML']) {
    const exportResponse = page.waitForResponse(response =>
      response.url().includes('/api/v1/reports/exports')
      && response.request().method() === 'POST'
      && response.status() === 200,
    );
    await workspace.getByRole('button', { name: format, exact: true }).click();
    const response = await exportResponse;
    assert.ok(response.headers()['content-type'], `Xuất ${format} thiếu Content-Type.`);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Báo cáo không được tràn ngang ở mobile 375px.');
  assert.equal(pageErrors.length, 0, `Lỗi trình duyệt: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ status: 'PASS', preset: 'Tổng hợp theo chi nhánh', exports: ['Excel', 'CSV', 'HTML'], mobileWidth: 375 }));
} finally {
  await browser.close();
}

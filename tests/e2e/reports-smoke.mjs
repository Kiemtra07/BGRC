import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loginAs } from './auth-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const pageErrors = [];
const reportRequests = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => { if (request.url().includes('/api/v1/reports')) reportRequests.push(`${request.method()} ${request.url()}`); });

try {
  await loginAs(page, 'admin');
  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  const workspace = page.getByTestId('reports-workspace');
  await workspace.waitFor();

  assert.equal(await workspace.getByText('Trường dữ liệu', { exact: true }).count(), 0, 'Người xem không được thấy danh mục trường kỹ thuật');
  assert.equal(await workspace.getByText('Thiết lập báo cáo', { exact: true }).count(), 0, 'Người xem không được thấy khối thiết lập kỹ thuật');
  await page.getByLabel('Mẫu báo cáo').waitFor();
  await page.getByLabel('Xem theo').waitFor();
  const filterActionRow = page.getByRole('button', { name: 'Thêm điều kiện', exact: true }).locator('xpath=..');
  assert.ok((await filterActionRow.boundingBox()).height < 100, 'Hàng thao tác bộ lọc phải gọn trên desktop');

  await page.getByRole('button', { name: 'Lưu cách xem', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu mẫu', exact: true }).waitFor();
  await page.getByLabel('Tên mẫu báo cáo').fill('Dashboard smoke');
  await page.getByRole('button', { name: 'Lưu mẫu', exact: true }).click();
  await page.getByLabel('Dashboard').waitFor();
  await page.getByRole('button', { name: 'Tạo dashboard', exact: true }).click();
  await page.getByLabel('Tên dashboard').fill('Dashboard smoke');
  await workspace.locator('fieldset').filter({ hasText: 'Báo cáo hiển thị' }).locator('input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Lưu dashboard', exact: true }).click();
  await page.getByTestId('report-dashboard').waitFor();

  const xlsxButton = page.getByRole('button', { name: /Xuất Excel/ });
  const xlsxResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/reports/exports') && response.request().postDataJSON()?.format === 'xlsx', { timeout: 5000 }).catch(() => null);
  await xlsxButton.click();
  const xlsxResponse = await xlsxResponsePromise;
  assert.ok(xlsxResponse, `Nút Xuất Excel không gọi API. disabled=${await xlsxButton.isDisabled()}, error=${await workspace.locator('[role="alert"]').allTextContents()}, status=${await workspace.locator('[role="status"]').allTextContents()}, pageErrors=${pageErrors}, requests=${reportRequests}`);
  assert.equal(xlsxResponse.status(), 200);
  assert.match(xlsxResponse.headers()['content-type'], /spreadsheetml/);
  const xlsxArtifact = path.resolve('tests/e2e/artifacts/report-export-sample.xlsx');
  const catalogResponse = await page.request.get('http://localhost:3000/api/v1/reports/catalog');
  const catalog = await catalogResponse.json();
  const exportPayload = {
    query: { rules: [], match: 'ALL', groupBy: 'dimension.branch', metrics: catalog.metrics.map(metric => metric.key), limit: 25 },
    columns: catalog.fields.filter(field => field.defaultExport).map(field => field.key),
  };
  const xlsxArtifactResponse = await page.request.post('http://localhost:3000/api/v1/reports/exports', { data: { ...exportPayload, format: 'xlsx' } });
  const xlsx = await xlsxArtifactResponse.body();
  await writeFile(xlsxArtifact, xlsx);
  assert.equal(xlsx.subarray(0, 2).toString(), 'PK');

  const htmlResponsePromise = page.waitForResponse(response => response.url().includes('/api/v1/reports/exports') && response.request().postDataJSON()?.format === 'html');
  await page.getByRole('button', { name: /Xuất HTML/ }).click();
  const htmlResponse = await htmlResponsePromise;
  assert.equal(htmlResponse.status(), 200);
  assert.match(htmlResponse.headers()['content-type'], /text\/html/);
  const htmlArtifact = path.resolve('tests/e2e/artifacts/report-export-sample.html');
  const htmlArtifactResponse = await page.request.post('http://localhost:3000/api/v1/reports/exports', { data: { ...exportPayload, format: 'html' } });
  const html = await htmlArtifactResponse.body();
  await writeFile(htmlArtifact, html);
  assert.match(html.toString('utf8'), /<title>Báo cáo Audit BGS<\/title>/);
  const htmlPage = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await htmlPage.goto(pathToFileURL(htmlArtifact).href);
  assert.equal(await htmlPage.locator('table').count(), 2);
  await htmlPage.screenshot({ path: path.resolve('tests/e2e/artifacts/report-export-html-desktop.png'), fullPage: true });
  await htmlPage.close();
  await page.getByRole('button', { name: 'Thêm điều kiện', exact: true }).click();
  await page.getByLabel('Nội dung lọc 1').selectOption('dimension.branch');
  await page.getByLabel('Giá trị lọc').selectOption('635');
  const reportResponse = page.waitForResponse(response => response.url().includes('/api/v1/reports/runs') && response.request().method() === 'POST' && response.status() === 200);
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  await reportResponse;
  await page.screenshot({ path: path.resolve('tests/e2e/artifacts/reports-filtered-desktop.png'), fullPage: true });

  await page.getByLabel('Cột bảng chéo').selectOption('dimension.workflow_status');
  const pivotResponse = page.waitForResponse(response => response.url().includes('/api/v1/reports/runs') && response.request().method() === 'POST' && response.status() === 200);
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  await pivotResponse;
  await page.getByRole('tab', { name: 'Bảng chéo', exact: true }).click();
  await page.getByTestId('report-crosstab').waitFor();
  await page.getByRole('tab', { name: 'Biểu đồ', exact: true }).click();
  await page.getByLabel('Loại biểu đồ').selectOption('line');
  await page.getByTestId('report-chart').waitFor();

  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `Báo cáo không được tràn ngang ở ${width}px`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.resolve('tests/e2e/artifacts/reports-filtered-mobile-375.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Quản trị', exact: true }).click();
  await page.getByRole('button', { name: 'Trường báo cáo', exact: true }).click();
  const catalogManager = page.getByTestId('report-catalog-manager');
  await catalogManager.waitFor();
  await catalogManager.getByLabel('Tên hiển thị Chi nhánh').waitFor();
  assert.ok(await catalogManager.getByText('Cột xuất mặc định', { exact: true }).count() > 0);
  await page.screenshot({ path: path.resolve('tests/e2e/artifacts/admin-report-fields-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Quản trị trường báo cáo không được tràn ngang ở 375px');
  await page.screenshot({ path: path.resolve('tests/e2e/artifacts/admin-report-fields-mobile-375.png'), fullPage: true });

  console.log(JSON.stringify({ status: 'PASS', xlsxBytes: xlsx.length, htmlBytes: html.length, xlsxArtifact, htmlArtifact, widths: [320, 375, 414, 768, 1440], adminCatalog: true }));
} finally {
  await browser.close();
}

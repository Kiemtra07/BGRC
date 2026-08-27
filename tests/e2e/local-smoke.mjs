import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loginAs } from './auth-helpers.mjs';

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright';
const importedPlaywright = await import(playwrightModule);
const chromium = importedPlaywright.chromium ?? importedPlaywright.default?.chromium;
if (!chromium) throw new Error('Không tìm thấy Chromium trong Playwright runtime.');
const executablePath = [process.env.CHROME_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(candidate => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: 'chrome' }) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const failedResponses = [];
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', error => consoleErrors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

const sharesHorizontalBand = (first, second) => Boolean(first && second && Math.max(first.y, second.y) < Math.min(first.y + first.height, second.y + second.height));

try {
  await loginAs(page, 'admin');
  await page.getByText('AUDIT BGS', { exact: true }).waitFor();
  const appBrandBox = await page.getByText('AUDIT BGS', { exact: true }).locator('..').boundingBox();
  const primaryNavigationBox = await page.getByRole('navigation', { name: 'Điều hướng chính' }).boundingBox();
  if (!sharesHorizontalBand(appBrandBox, primaryNavigationBox)) throw new Error('Primary navigation must share the app brand header row on desktop.');
  await page.getByTestId('channel-sidebar').waitFor();
  await page.getByText('Công việc đang làm', { exact: true }).waitFor();
  await page.getByText('Đang theo dõi', { exact: true }).waitFor();
  const initialRows = await page.locator('tbody tr').count();
  if (initialRows !== 3) throw new Error(`Expected 3 customer-level rows, received ${initialRows}.`);

  await loginAs(page, 'branchInput');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  const branchRows = await page.locator('tbody tr').count();
  const visibleTable = await page.locator('tbody').innerText();
  if (branchRows !== 1 || !visibleTable.includes('10482910') || !visibleTable.includes('TD01.01') || !visibleTable.includes('TD05.05') || visibleTable.includes('10849201')) {
    throw new Error('Customer grouping or branch scope is incorrect.');
  }

  await page.locator('tbody tr').first().getByRole('button', { name: /Mở hồ sơ/ }).click();
  await page.getByTestId('customer-case-page').waitFor();
  if (await page.getByRole('dialog').count()) throw new Error('Customer detail must be a full page, not a dialog.');
  const customerNameBox = await page.locator('h1').filter({ hasText: 'Công ty TNHH Cà Phê Tây Nguyên Xanh' }).boundingBox();
  const errorSliderBox = await page.getByRole('tablist', { name: 'Thanh trượt mã lỗi' }).boundingBox();
  if (!sharesHorizontalBand(customerNameBox, errorSliderBox)) throw new Error('Error-code navigation must share the customer identity header row on desktop.');
  await page.getByText('Các mã lỗi của khách hàng').waitFor();
  await page.getByText('Tài liệu và bằng chứng').waitFor();
  await page.getByText('Nội dung cần giải trình').waitFor();
  if (await page.getByText('TD01.01', { exact: true }).count() < 1 || await page.getByText('TD05.05', { exact: true }).count() < 1) throw new Error('Customer case does not expose all error codes.');
  const caseHeaderBox = await page.getByTestId('customer-case-page').locator('header').boundingBox();
  const firstErrorTabBox = await page.getByRole('tab').first().boundingBox();
  if (!caseHeaderBox || !firstErrorTabBox || firstErrorTabBox.y + firstErrorTabBox.height > caseHeaderBox.y + caseHeaderBox.height + 1) throw new Error('Error slider must be inside the customer header.');
  const infoToggle = page.getByRole('button', { name: 'Ẩn hoặc hiện thông tin hồ sơ' });
  await infoToggle.click();
  if (await infoToggle.getAttribute('aria-expanded') !== 'false') throw new Error('Information panel did not collapse.');
  await infoToggle.click();
  if (await infoToggle.getAttribute('aria-expanded') !== 'true') throw new Error('Information panel did not reopen.');
  if (await page.getByTestId('excel-viewer').count()) {
    await page.getByLabel('Chọn trang tính').waitFor();
    await page.getByLabel('Phóng to').click();
  }
  await page.getByLabel('Quay lại danh sách hồ sơ').click();

  await loginAs(page, 'branchController');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.locator('tbody tr').first().getByRole('button', { name: /Mở hồ sơ/ }).click();
  await page.getByTestId('customer-case-page').getByRole('tab').filter({ hasText: 'TD05.05' }).click();
  const acceptButton = page.getByRole('button', { name: /Tiếp nhận công việc|Đã tiếp nhận/ });
  await acceptButton.waitFor();
  const actionBox = await acceptButton.boundingBox();
  const railBox = await page.getByRole('tablist', { name: 'Thanh trượt mã lỗi' }).boundingBox();
  if (!sharesHorizontalBand(actionBox, railBox)) throw new Error('Work actions must share the error-code navigation rail.');
  if (await acceptButton.getAttribute('aria-pressed') !== 'true') {
    const response = page.waitForResponse(item => item.url().includes('/workspace/accepted') && item.request().method() === 'PUT' && item.status() === 200);
    await acceptButton.click();
    await response;
  }
  await page.getByRole('button', { name: 'Đã tiếp nhận' }).waitFor();
  await page.getByRole('button', { name: 'Theo dõi', exact: true }).click();
  for (const scopeLabel of ['Cụm địa bàn', 'Chi nhánh', 'Khách hàng']) {
    await page.getByRole('menuitemcheckbox').filter({ hasText: scopeLabel }).waitFor();
  }
  await page.getByRole('button', { name: 'Theo dõi', exact: true }).click();
  const reviewScreenshot = path.resolve('tests/e2e/artifacts/branch-control-review-desktop.png');
  await page.screenshot({ path: reviewScreenshot, fullPage: true });
  await page.getByLabel('Quay lại danh sách hồ sơ').click();
  await page.getByLabel('Không gian làm việc').getByText('Công ty TNHH Cà Phê Tây Nguyên Xanh').first().waitFor();

  await loginAs(page, 'admin');
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
  await page.locator('tbody tr').filter({ hasText: '10993821' }).getByRole('button', { name: /Mở hồ sơ/ }).click();
  if (await page.getByTestId('pdf-viewer').count()) {
    await page.getByLabel('Chọn trang').waitFor();
    await page.getByLabel('Trang sau').click();
    await page.getByLabel('Chọn trang').waitFor();
    if (await page.getByLabel('Chọn trang').inputValue() !== '2') throw new Error('PDF page navigation did not move to page 2.');
    await page.getByLabel('Phóng to').click();
    await page.getByLabel('Thu nhỏ').click();
    await page.getByLabel('Xoay trang').click();
    await page.getByLabel('Vừa chiều rộng').click();
  }
  const pdfViewerScreenshot = path.resolve('tests/e2e/artifacts/customer-case-pdf-viewer-desktop.png');
  await page.screenshot({ path: pdfViewerScreenshot, fullPage: true });
  await page.getByLabel('Quay lại danh sách hồ sơ').click();

  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  await page.getByRole('heading', { name: 'Báo cáo', exact: true }).waitFor();
  await page.getByTestId('reports-workspace').waitFor();
  await page.getByRole('button', { name: 'Lưu cách xem', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu mẫu', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lưu cách xem', exact: true }).click();
  await page.getByLabel('Mẫu báo cáo').waitFor();
  await page.getByRole('button', { name: /Xuất Excel/ }).waitFor();
  await page.getByRole('button', { name: /Xuất HTML/ }).waitFor();
  await page.getByText('Bộ lọc', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'Thêm điều kiện', exact: true }).click();
  await page.getByLabel('Nội dung lọc 1').selectOption('dimension.branch');
  await page.getByLabel('Giá trị lọc').selectOption('635');
  const filteredReportResponse = page.waitForResponse(response => {
    if (!response.url().includes('/api/v1/reports/runs') || response.request().method() !== 'POST' || response.status() !== 200) return false;
    const body = response.request().postDataJSON();
    return body.rules?.some(rule => rule.key === 'dimension.branch' && rule.operator === 'op.eq' && rule.value === '635');
  });
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  await filteredReportResponse;
  const reportScreenshot = path.resolve('tests/e2e/artifacts/reports-filtered-desktop.png');
  await page.screenshot({ path: reportScreenshot, fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  const reportHasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (reportHasOverflow) {
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
      .slice(0, 12)
      .map(({ element, rect }) => ({ tag: element.tagName, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) })));
    throw new Error(`Reports workspace has horizontal overflow at 375px: ${JSON.stringify(overflowing)}`);
  }
  const reportMobileScreenshot = path.resolve('tests/e2e/artifacts/reports-filtered-mobile-375.png');
  await page.screenshot({ path: reportMobileScreenshot, fullPage: true });

  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 812 });
    await page.getByRole('button', { name: 'Hồ sơ khách hàng' }).click();
    await page.locator('[data-testid="customer-card"]').first().waitFor();
    const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (hasPageOverflow) throw new Error(`Page has horizontal overflow at ${width}px.`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Hồ sơ khách hàng' }).click();
  await page.locator('[data-testid="customer-card"]').first().waitFor();
  const mobileScreenshot = path.resolve('tests/e2e/artifacts/customer-cases-mobile-375.png');
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await page.locator('[data-testid="customer-card"]').first().click();
  await page.getByTestId('customer-case-page').waitFor();
  await page.getByText('Các mã lỗi của khách hàng').waitFor();
  const detailHasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (detailHasOverflow) throw new Error('Full-page customer detail has horizontal overflow at 375px.');
  const mobileDetailScreenshot = path.resolve('tests/e2e/artifacts/customer-case-detail-mobile-375.png');
  await page.screenshot({ path: mobileDetailScreenshot, fullPage: true });
  await page.getByLabel('Quay lại danh sách hồ sơ').click();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, 'admin');
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Quản trị', exact: true }).click();
  await page.getByRole('heading', { name: 'Quản trị', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Loại báo cáo', exact: true }).click();
  await page.getByRole('button', { name: 'Sửa', exact: true }).first().click();
  await page.getByRole('button', { name: 'Luồng phê duyệt', exact: true }).click();
  await page.locator('input[value="Kiểm soát chi nhánh"]').waitFor();
  await page.waitForTimeout(250); // Let tab color transitions settle before visual evidence.
  const adminWorkflowScreenshot = path.resolve('tests/e2e/artifacts/admin-workflow-desktop.png');
  await page.screenshot({ path: adminWorkflowScreenshot, fullPage: true });
  await page.getByRole('button', { name: 'Đóng' }).click();

  await page.getByRole('button', { name: 'Người dùng', exact: true }).click();
  await page.getByTestId('admin-user-directory').waitFor();
  await page.getByRole('tab', { name: 'Khối nội bộ' }).waitFor();
  await page.getByText('Phê duyệt HT', { exact: true }).first().waitFor();
  await page.getByText('Trưởng nhóm', { exact: true }).first().waitFor();
  await page.getByRole('tab', { name: 'Theo địa bàn' }).click();
  await page.getByText('Cụm chỉ dùng để nhóm địa bàn; quyền duyệt thuộc kiểm soát chi nhánh.', { exact: true }).waitFor();
  await page.getByText('Chi nhánh 635', { exact: true }).waitFor();
  await page.getByText('Kiểm soát chi nhánh', { exact: true }).first().waitFor();
  const adminUsersScreenshot = path.resolve('tests/e2e/artifacts/admin-users-geography-desktop.png');
  await page.screenshot({ path: adminUsersScreenshot, fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  const adminUsersHasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (adminUsersHasOverflow) {
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1)
      .slice(0, 12)
      .map(({ element, rect }) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 80), className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) })));
    throw new Error(`Admin user directory has horizontal overflow at 375px: ${JSON.stringify(overflowing)}`);
  }
  const adminUsersMobileScreenshot = path.resolve('tests/e2e/artifacts/admin-users-geography-mobile-375.png');
  await page.screenshot({ path: adminUsersMobileScreenshot, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const auditResponse = page.waitForResponse(response => response.url().includes('/api/v1/admin/audit-events') && response.status() === 200);
  await page.getByRole('button', { name: 'Nhật ký', exact: true }).click();
  await auditResponse;
  await page.getByText('Nhật ký xử lý').waitFor();
  await page.locator('table').getByText('Gửi kiểm soát chi nhánh', { exact: true }).first().waitFor();
  await page.waitForTimeout(250); // Let tab color transitions settle before visual evidence.
  const adminAuditScreenshot = path.resolve('tests/e2e/artifacts/admin-audit-desktop.png');
  await page.screenshot({ path: adminAuditScreenshot, fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  const adminHasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (adminHasOverflow) throw new Error('Admin audit workspace has horizontal overflow at 375px.');
  const adminAuditMobileScreenshot = path.resolve('tests/e2e/artifacts/admin-audit-mobile-375.png');
  await page.screenshot({ path: adminAuditMobileScreenshot, fullPage: true });

  const unnamedButtons = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(button => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent?.trim())).length);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`);
  if (failedResponses.length) throw new Error(`Failed responses: ${failedResponses.join(' | ')}`);
  if (unnamedButtons) throw new Error(`Found ${unnamedButtons} visible button(s) without accessible name.`);

  console.log(JSON.stringify({ status: 'PASS', initialRows, branchRows, unnamedButtons, reviewScreenshot, pdfViewerScreenshot, reportScreenshot, reportMobileScreenshot, mobileScreenshot, mobileDetailScreenshot, adminWorkflowScreenshot, adminUsersScreenshot, adminUsersMobileScreenshot, adminAuditScreenshot, adminAuditMobileScreenshot }, null, 2));
} finally {
  await browser.close();
}

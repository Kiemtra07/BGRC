import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { loginAs } from './auth-helpers.mjs';

const openCustomerCase = async page => {
  await loginAs(page, 'branchInput');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.locator('tbody tr').first().click();
  await page.getByTestId('customer-case-page').waitFor();
};

const browser = await chromium.launch({ headless: true });
const pageErrors = [];

try {
  const lockedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  lockedPage.on('pageerror', error => pageErrors.push(error.message));
  await openCustomerCase(lockedPage);
  await lockedPage.getByRole('button').filter({ hasText: 'bài thu hoạch 07.06.2026.pdf' }).click();
  await lockedPage.getByTestId('pdf-viewer').waitFor();
  assert.equal(await lockedPage.getByText('Không thể tải bản xem trước của bằng chứng.').count(), 0);
  assert.equal(await lockedPage.getByRole('button', { name: 'Xóa để thay thế' }).count(), 0, 'Hồ sơ đã chuyển duyệt không được xóa tài liệu');
  assert.equal(await lockedPage.getByText('Tải lên', { exact: true }).count(), 0, 'Hồ sơ đã chuyển duyệt không được tải thêm tài liệu');
  await lockedPage.close();

  const editablePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  editablePage.on('pageerror', error => pageErrors.push(error.message));
  await editablePage.route('**/api/v1/findings/find-001', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, workflowStatus: 'PENDING' } });
  });
  await openCustomerCase(editablePage);
  await editablePage.getByRole('button', { name: 'Xóa để thay thế' }).waitFor();
  await editablePage.getByText('Tải lên', { exact: true }).waitFor();
  await editablePage.setViewportSize({ width: 375, height: 812 });
  assert.equal(await editablePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Thanh tài liệu không được tràn ngang trên mobile');
  await editablePage.getByRole('button', { name: 'Xóa để thay thế' }).click();
  await editablePage.getByText(/Xóa “.*” khỏi hồ sơ\?/).waitFor();
  await editablePage.getByRole('button', { name: 'Giữ lại' }).click();
  assert.equal(pageErrors.length, 0, `Lỗi trình duyệt: ${pageErrors.join(' | ')}`);
  await editablePage.close();

  console.log(JSON.stringify({ status: 'PASS', unicodePdfPreview: true, lockedAfterSubmission: true, editableBeforeSubmission: true, mobileWidth: 375 }));
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { loginAs } from './auth-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await loginAs(page, 'admin');
  await page.getByRole('button', { name: 'Quản trị', exact: true }).click();
  await page.getByRole('button', { name: 'Loại báo cáo', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo loại báo cáo', exact: true }).click();
  await page.getByRole('button', { name: /Mẫu form/ }).click();
  const cms = page.getByTestId('report-form-cms');
  await cms.getByText('Thư viện block', { exact: true }).waitFor();
  await cms.getByText('Khung mẫu báo cáo', { exact: true }).waitFor();

  const sample = path.resolve('data/drive_storage/AUDIT_BGS/2026/Cụm_Tây_Nguyên/CN_635/10482910_TD01_01/drive_09780d3e-e4ad-4936-a0dd-42b96c861ed5_crm-template-customers.xlsx');
  await cms.locator('input[type="file"]').setInputFiles(sample);
  await cms.getByText(/Đã tạo từ/).waitFor();
  assert.ok(await cms.getByText(/dòng tiêu đề/).count() > 0);
  assert.ok(await cms.getByText(/block · \d+ trường/).count() > 0);

  await cms.getByLabel('Màn hình người dùng').selectOption('EXCEL_GRID');
  await cms.getByLabel('Cho phép đính kèm').uncheck();
  await cms.getByRole('button', { name: 'Xem trước người dùng', exact: true }).click();
  await cms.getByLabel('Bản xem trước form báo cáo').waitFor();
  await cms.getByText('Dạng bảng Excel · Không đính kèm', { exact: true }).waitFor();
  const desktopScreenshot = path.resolve('tests/e2e/artifacts/report-form-preview-desktop.png');
  await page.screenshot({ path: desktopScreenshot, fullPage: true });

  await cms.getByRole('button', { name: 'Đoạn hướng dẫn', exact: true }).click();
  await cms.getByLabel(/Nội dung block/).last().fill('Hướng dẫn nhập dữ liệu từ mẫu Excel.');
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'CMS form không được tràn ngang ở 375px');
  const mobileScreenshot = path.resolve('tests/e2e/artifacts/report-form-preview-mobile-375.png');
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  assert.equal(pageErrors.length, 0, `Lỗi trình duyệt: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ status: 'PASS', excelTemplate: true, blockLibrary: true, presentationPreview: true, mobileWidth: 375, desktopScreenshot, mobileScreenshot }));
} finally {
  await browser.close();
}

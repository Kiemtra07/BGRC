import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loginAs } from './auth-helpers.mjs';

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright';
const importedPlaywright = await import(playwrightModule);
const chromium = importedPlaywright.chromium ?? importedPlaywright.default?.chromium;
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(candidate => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: 'chrome' }) });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

try {
  await loginAs(page, 'admin');
  await page.getByRole('button', { name: 'Nhập dữ liệu' }).click();
  await page.getByRole('heading', { name: 'Nhập dữ liệu' }).waitFor();
  if (await page.locator('#multi-excel-input').isDisabled()) throw new Error('Bộ chọn Excel vẫn bị khóa khi chưa chọn chuyên đề.');
  await page.getByRole('button', { name: 'Tệp DOCX' }).click();
  if (await page.locator('#docx-finding-input').isDisabled()) throw new Error('Bộ chọn DOCX vẫn bị khóa khi chưa chọn chuyên đề.');

  await page.getByRole('button', { name: 'Hồ sơ khách hàng' }).click();
  await page.getByRole('button', { name: 'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên', exact: true }).click();
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  const customerRow = page.locator('tbody tr', { hasText: 'Công ty TNHH Cà Phê Tây Nguyên Xanh' });
  await customerRow.waitFor();
  await customerRow.getByRole('button', { name: 'Mở hồ sơ' }).click();
  await page.getByRole('button', { name: 'Đánh dấu khách hàng là trường hợp đặc biệt' }).waitFor();
  if (await page.getByText('Dấu sao', { exact: true }).count()) throw new Error('Điều khiển dấu sao vẫn còn trong nội dung từng mã lỗi.');

  await loginAs(page, 'internalOfficer');
  await page.getByRole('button', { name: 'Cấu hình' }).click();
  await page.getByRole('button', { name: 'Chuyên đề', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Loại báo cáo', exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Người dùng', exact: true }).count()) throw new Error('Cán bộ Hội sở nhìn thấy tab quản trị người dùng.');

  console.log('Import, customer star and Hội sở configuration smoke: PASS');
} finally {
  await browser.close();
}

import JSZip from 'jszip';
import { readSheet } from 'read-excel-file/node';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

/**
 * Tệp Excel phải là đúng báo cáo đang xem: tên tệp và tiêu đề mang tên báo cáo, nội dung chỉ gồm bảng
 * đang xem (hoặc dòng chi tiết khi chọn vậy), số là số thật có định dạng, có dòng tổng và thông tin
 * xuất. Các bài này khoá điều đó để một báo cáo không thể ra tệp của báo cáo khác.
 */
const headers = { 'x-user-id': 'user-admin', 'content-type': 'application/json' };
const columns = ['dimension.branch', 'dimension.cif', 'dimension.error_code', 'date.deadline', 'measure.exposure'];
const design = { groupBy: 'dimension.branch', metrics: ['metric.finding_count', 'metric.exposure_sum', 'metric.remediation_rate'] };

afterAll(async () => {
  await app.close();
});

async function exportXlsx(body: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/reports/exports', headers,
    payload: { columns, format: 'xlsx', query: design, ...body },
  });
  expect(response.statusCode, response.payload.slice(0, 300)).toBe(200);
  const zip = await JSZip.loadAsync(response.rawPayload);
  const workbook = await zip.file('xl/workbook.xml')!.async('string');
  const sheetNames = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1]);
  const sheet = async (index: number) => zip.file(`xl/worksheets/sheet${index}.xml`)!.async('string');
  return { response, zip, sheetNames, sheet };
}

describe('xuất Excel đúng báo cáo đang xem', () => {
  it('đặt tên tệp theo tên báo cáo thay vì một tên chung', async () => {
    const named = await exportXlsx({ reportName: 'Sai sót quá hạn theo chi nhánh' });
    const disposition = String(named.response.headers['content-disposition']);
    expect(disposition).toContain('attachment');
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toMatch(/^Sai sót quá hạn theo chi nhánh - \d{4}-\d{2}-\d{2}\.xlsx$/);

    const retitled = await exportXlsx({ reportName: 'Mẫu gốc', presentation: { title: 'Báo cáo tuần 47', metrics: {} } });
    expect(decodeURIComponent(String(retitled.response.headers['content-disposition']).split("filename*=UTF-8''")[1])).toMatch(/^Báo cáo tuần 47 - /);
    expect(await retitled.sheet(1)).toContain('Báo cáo tuần 47');

    const unnamed = await exportXlsx({});
    expect(decodeURIComponent(String(unnamed.response.headers['content-disposition']).split("filename*=UTF-8''")[1])).toMatch(/^Báo cáo theo Chi nhánh - /);
  });

  it('chỉ chứa bảng đang xem và trang thông tin, không đổ cả dữ liệu chi tiết', async () => {
    expect((await exportXlsx({})).sheetNames).toEqual(['Báo cáo', 'Thông tin']);
    expect((await exportXlsx({
      query: { ...design, pivotBy: 'dimension.workflow_status', metrics: ['metric.finding_count'] },
    })).sheetNames).toEqual(['Bảng chéo', 'Thông tin']);
    expect((await exportXlsx({ section: 'detail' })).sheetNames).toEqual(['Dữ liệu chi tiết', 'Thông tin']);
  });

  it('ghi số thật có định dạng, dòng tổng và tiêu đề cột đúng chỗ', async () => {
    const { sheet, zip } = await exportXlsx({});
    const xml = await sheet(1);
    // Tiêu đề, dòng phụ đề và hàng tiêu đề cột nằm ở vị trí cố định để cố định khung và in lặp tiêu đề.
    expect(xml).toMatch(/<c r="A1"[^>]*>.*?Báo cáo theo Chi nhánh/);
    expect(xml).toMatch(/<c r="A5"[^>]*t="inlineStr"[^>]*><is><t[^>]*>Chi nhánh<\/t>/);
    // Cột đếm là số thật, không phải chuỗi.
    expect(xml).toMatch(/<c r="B6"[^>]*t="n"><v>\d+(\.\d+)?<\/v>/);
    expect(xml).toContain('Tổng cộng');
    expect(xml).toContain('ySplit="5"');
    expect(xml).toContain('fitToWidth="1"');

    const styles = await zip.file('xl/styles.xml')!.async('string');
    expect(styles).toContain('formatCode="#,##0"');
    expect(styles).toContain('formatCode="0.0&quot;%&quot;"');

    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('_xlnm.Print_Titles');
  });

  it('có trang thông tin về người xuất, phạm vi, điều kiện và số hồ sơ', async () => {
    const { sheet } = await exportXlsx({
      reportName: 'Báo cáo thử',
      query: { ...design, rules: [{ key: 'dimension.branch', operator: 'op.eq', value: '635' }] },
    });
    const info = await sheet(2);
    expect(info).toContain('Quản trị hệ thống');
    expect(info).toContain('Điều kiện áp dụng');
    expect(info).toContain('Chi nhánh');
    expect(info).toContain('Số hồ sơ phù hợp');
    expect(info).toContain('Báo cáo thử');
  });

  it('khai thuộc tính tài liệu với tiêu đề báo cáo', async () => {
    const { zip } = await exportXlsx({ reportName: 'Báo cáo thuộc tính' });
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('Báo cáo thuộc tính');
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('/docProps/core.xml');
  });

  it('tô màu ô vượt ngưỡng như trên màn hình và không tô khi không đặt ngưỡng', async () => {
    const plain = await exportXlsx({});
    expect(await plain.zip.file('xl/styles.xml')!.async('string')).not.toContain('FFFEE4E2');
    const highlighted = await exportXlsx({
      query: { ...design, metrics: ['metric.finding_count'] },
      presentation: { metrics: { 'metric.finding_count': { highlight: { operator: 'gte', value: 0, tone: 'risk' } } } },
    });
    expect(await highlighted.zip.file('xl/styles.xml')!.async('string')).toContain('FFFEE4E2');
  });

  it('ngày là ngày thật của Excel, không phải chuỗi', async () => {
    const { sheet, zip } = await exportXlsx({ section: 'detail' });
    const xml = await sheet(1);
    expect(await zip.file('xl/styles.xml')!.async('string')).toContain('formatCode="dd/mm/yyyy"');
    // Hạn xử lý ở cột D: số serial lớn hơn 40000 (sau năm 2009), không phải chuỗi ISO.
    expect(xml).toMatch(/<c r="D6"[^>]*t="n"><v>4\d{4}(\.\d+)?<\/v>/);
  });

  it('mở lại được bằng trình đọc Excel và đúng bố cục: tiêu đề, hàng tiêu đề cột, dữ liệu, dòng tổng', async () => {
    const { response } = await exportXlsx({ reportName: 'Báo cáo đọc lại' });
    const buffer = Buffer.from(response.rawPayload);
    const main = await readSheet(buffer, 1);
    expect(String(main[0][0])).toBe('Báo cáo đọc lại');
    expect(main[4].slice(0, 2)).toEqual(['Chi nhánh', 'Mã lỗi']);
    const last = main[main.length - 1];
    expect(last[0]).toBe('Tổng cộng');
    expect(typeof last[1]).toBe('number');
    // Tổng trên dòng cuối bằng tổng số hồ sơ phù hợp ghi ở trang thông tin.
    const info = await readSheet(buffer, 2);
    const matched = info.find(row => row[0] === 'Số hồ sơ phù hợp');
    expect(last[1]).toBe(matched?.[1]);

    const detail = await readSheet(Buffer.from((await exportXlsx({ section: 'detail' })).response.rawPayload), 1);
    expect(detail[4]).toEqual(['Chi nhánh', 'CIF', 'Mã lỗi', 'Hạn xử lý', 'Giá trị ảnh hưởng']);
    expect(detail[5][3]).toBeInstanceOf(Date);
    expect(typeof detail[5][4]).toBe('number');
  });

  it('HTML và CSV cũng theo đúng báo cáo: tên tệp, tiêu đề và phần nội dung', async () => {
    const html = await app.inject({
      method: 'POST', url: '/api/v1/reports/exports', headers,
      payload: { columns, format: 'html', query: design, reportName: 'Báo cáo HTML thử' },
    });
    expect(html.statusCode).toBe(200);
    expect(html.payload).toContain('<title>Báo cáo HTML thử</title>');
    expect(html.payload).toContain('Phân tích theo');
    expect(html.payload).not.toContain('Dữ liệu chi tiết');
    expect(decodeURIComponent(String(html.headers['content-disposition']).split("filename*=UTF-8''")[1])).toMatch(/^Báo cáo HTML thử - .*\.html$/);

    const detail = await app.inject({
      method: 'POST', url: '/api/v1/reports/exports', headers,
      payload: { columns, format: 'html', query: design, section: 'detail' },
    });
    expect(detail.payload).toContain('Dữ liệu chi tiết');
    expect(detail.payload).not.toContain('Phân tích theo');

    const csv = await app.inject({
      method: 'POST', url: '/api/v1/reports/exports', headers,
      payload: { columns, format: 'csv', query: design, reportName: 'Báo cáo CSV thử' },
    });
    expect(decodeURIComponent(String(csv.headers['content-disposition']).split("filename*=UTF-8''")[1])).toMatch(/^Báo cáo CSV thử - .*\.csv$/);
  });
});

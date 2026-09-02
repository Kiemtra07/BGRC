import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

/**
 * Nguyên tắc của một công cụ báo cáo tự phục vụ: tệp tải về phải trùng với bảng trên màn hình.
 *
 * Trước đây không phải vậy. CSV luôn đổ dòng thô theo danh sách cột cấu hình sẵn, còn bảng chéo thì
 * không một định dạng nào giữ lại — kéo thả thiết kế kiểu gì cũng ra đúng một tệp. Những bài dưới
 * đây khoá lại điều ngược lại: đổi thiết kế thì tệp phải đổi theo.
 */
const adminHeaders = { 'x-user-id': 'user-admin', 'content-type': 'application/json' };
const COLUMNS = ['dimension.branch', 'dimension.cif', 'dimension.error_code'];

async function exportReport(body: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/reports/exports', headers: adminHeaders,
    payload: { columns: COLUMNS, ...body },
  });
  expect(response.statusCode, response.payload.slice(0, 300)).toBe(200);
  return response;
}

// Đóng app một lần sau TẤT CẢ các nhóm bài. Đặt trong nhóm đầu thì nhóm sau gọi vào một app đã đóng.
afterAll(async () => {
  await app.close();
});

describe('Xuất báo cáo bám theo thiết kế kéo thả', () => {
  it('CSV đổi theo trường ở vùng Hàng', async () => {
    const byBranch = (await exportReport({
      format: 'csv',
      query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
    })).payload;
    const byErrorCode = (await exportReport({
      format: 'csv',
      query: { groupBy: 'dimension.error_code', metrics: ['metric.finding_count'] },
    })).payload;

    expect(byBranch.split('\r\n')[0]).toContain('Chi nhánh');
    expect(byErrorCode.split('\r\n')[0]).toContain('Mã lỗi');
    expect(byBranch).not.toBe(byErrorCode);
  });

  it('CSV đổi theo chỉ số ở vùng Giá trị', async () => {
    const header = (metrics: string[]) => exportReport({
      format: 'csv', query: { groupBy: 'dimension.branch', metrics },
    }).then(response => response.payload.split('\r\n')[0]);

    expect(await header(['metric.customer_count'])).toContain('Khách hàng');
    expect(await header(['metric.exposure_sum'])).toContain('Tổng giá trị ảnh hưởng');
    // Hai chỉ số thì phải ra hai cột số, không phải một.
    const two = await header(['metric.customer_count', 'metric.finding_count']);
    expect(two.split(',')).toHaveLength(3);
  });

  it('CSV chuyển thành bảng chéo khi có trường ở vùng Cột', async () => {
    const flat = (await exportReport({
      format: 'csv',
      query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
    })).payload;
    const crosstab = (await exportReport({
      format: 'csv',
      query: { groupBy: 'dimension.branch', pivotBy: 'dimension.workflow_status', metrics: ['metric.finding_count'] },
    })).payload;

    expect(crosstab).not.toBe(flat);
    const header = crosstab.split('\r\n')[0];
    expect(header).toContain('Chi nhánh');
    expect(header).toContain('Tổng');
    // Bảng chéo phải rộng hơn bảng một chiều — đó chính là chiều dữ liệu từng bị đánh rơi.
    expect(header.split(',').length).toBeGreaterThan(flat.split('\r\n')[0].split(',').length);
  });

  it('CSV vẫn xuất được dòng chi tiết khi yêu cầu rõ ràng', async () => {
    const detail = (await exportReport({
      format: 'csv', section: 'detail',
      query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
    })).payload;
    const header = detail.split('\r\n')[0];
    expect(header).toContain('CIF');
    expect(header).toContain('Mã lỗi');
  });

  it('XLSX thêm sheet Bảng chéo và giữ nguyên cấu trúc gói hợp lệ', async () => {
    const readWorkbook = async (query: Record<string, unknown>) => {
      const response = await exportReport({ format: 'xlsx', query });
      const zip = await JSZip.loadAsync(response.rawPayload);
      const workbook = await zip.file('xl/workbook.xml')!.async('string');
      const types = await zip.file('[Content_Types].xml')!.async('string');
      const sheetNames = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1]);
      const sheetFiles = Object.keys(zip.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
      const typedSheets = [...types.matchAll(/worksheets\/sheet\d+\.xml/g)].length;
      return { zip, sheetNames, sheetFiles, typedSheets };
    };

    const flat = await readWorkbook({ groupBy: 'dimension.branch', metrics: ['metric.finding_count'] });
    expect(flat.sheetNames).toEqual(['Tổng quan', 'Phân tích', 'Dữ liệu chi tiết']);

    const crosstab = await readWorkbook({
      groupBy: 'dimension.branch', pivotBy: 'dimension.workflow_status', metrics: ['metric.finding_count'],
    });
    expect(crosstab.sheetNames).toContain('Bảng chéo');

    // Excel báo tệp hỏng nếu ba nơi khai báo sheet lệch nhau; cấu trúc này vừa chuyển từ hardcode
    // sang sinh động nên đây là chỗ dễ vỡ nhất.
    for (const workbook of [flat, crosstab]) {
      expect(workbook.sheetFiles).toHaveLength(workbook.sheetNames.length);
      expect(workbook.typedSheets).toBe(workbook.sheetNames.length);
      for (const sheetFile of workbook.sheetFiles) {
        const xml = await workbook.zip.file(sheetFile)!.async('string');
        const relPath = `${sheetFile.replace('worksheets/', 'worksheets/_rels/')}.rels`;
        expect(xml.includes('<tableParts'), `${sheetFile} tableParts ↔ ${relPath}`)
          .toBe(Boolean(workbook.zip.file(relPath)));
      }
    }
  });

  it('HTML chứa bảng chéo khi thiết kế có trường Cột', async () => {
    const html = (await exportReport({
      format: 'html',
      query: { groupBy: 'dimension.branch', pivotBy: 'dimension.workflow_status', metrics: ['metric.finding_count'] },
    })).payload;
    expect(html).toContain('Bảng chéo');

    const flat = (await exportReport({
      format: 'html',
      query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
    })).payload;
    expect(flat).not.toContain('Bảng chéo');
  });
});

/**
 * Panel Thuộc tính chỉ có nghĩa nếu nó đi được vào tệp. Đổi tên một cột trên màn hình mà tệp tải về
 * vẫn tên cũ thì lại rơi đúng vào lỗi "tệp không giống cái đang nhìn" mà bộ bài trên vừa khoá lại.
 */
describe('Thuộc tính trình bày đi vào tệp xuất', () => {
  const design = { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] };

  it('CSV dùng tên cột và tên cột hàng do người dùng đặt', async () => {
    const mac_dinh = (await exportReport({ format: 'csv', query: design })).payload.split('\r\n')[0];
    expect(mac_dinh).toContain('Chi nhánh');
    expect(mac_dinh).toContain('Mã lỗi');

    const dat_ten = (await exportReport({
      format: 'csv', query: design,
      presentation: { rowLabel: 'Đơn vị', metrics: { 'metric.finding_count': { label: 'Số sai sót' } } },
    })).payload.split('\r\n')[0];
    expect(dat_ten).toContain('Đơn vị');
    expect(dat_ten).toContain('Số sai sót');
    expect(dat_ten).not.toContain('Chi nhánh');
  });

  it('CSV áp số lẻ và hậu tố đã đặt', async () => {
    const rows = (await exportReport({
      format: 'csv', query: design,
      presentation: { metrics: { 'metric.finding_count': { decimals: 2, suffix: 'hồ sơ' } } },
    })).payload.split('\r\n');
    expect(rows[1]).toMatch(/\d+,\d{2} hồ sơ/);
  });

  it('HTML lấy tiêu đề do người dùng đặt', async () => {
    const html = (await exportReport({
      format: 'html', query: design, presentation: { title: 'Báo cáo tồn đọng Quý 3' },
    })).payload;
    expect(html).toContain('<title>Báo cáo tồn đọng Quý 3</title>');
    expect(html).toContain('<h1>Báo cáo tồn đọng Quý 3</h1>');
  });

  it('bảng chéo cũng nhận tên cột hàng đã đặt', async () => {
    const csv = (await exportReport({
      format: 'csv',
      query: { ...design, pivotBy: 'dimension.workflow_status' },
      presentation: { rowLabel: 'Đơn vị' },
    })).payload;
    expect(csv.split('\r\n')[0]).toContain('Đơn vị');
  });
});

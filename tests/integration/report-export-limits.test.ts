import { afterAll, describe, expect, it } from 'vitest';

// Trần xuất dữ liệu đọc từ môi trường lúc nạp module, nên phải đặt trước khi import app. Trả lại
// ngay sau khi import: biến này thuộc về cả tiến trình, và vitest chạy các file test tuần tự trong
// cùng một worker — để nó rớt lại là áp trần 2 dòng lên mọi file test chạy sau.
const originalMaxRows = process.env.REPORT_EXPORT_MAX_ROWS;
process.env.REPORT_EXPORT_MAX_ROWS = '2';
const { app } = await import('../../server/src/app');
if (originalMaxRows === undefined) delete process.env.REPORT_EXPORT_MAX_ROWS;
else process.env.REPORT_EXPORT_MAX_ROWS = originalMaxRows;

const adminHeaders = { 'x-user-id': 'user-admin' };

async function exportedEventCount(): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/admin/audit-events?page=1&limit=100',
    headers: adminHeaders,
  });
  return response.json().items
    .filter((item: { eventType: string }) => item.eventType === 'DATA_REPORT_EXPORTED').length;
}

describe('report export limits', () => {
  afterAll(async () => {
    await app.close();
  });

  it('refuses a CSV export above the row cap with a count the user can act on', async () => {
    const before = await exportedEventCount();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/findings.csv',
      headers: adminHeaders,
    });

    // Thân phản hồi của hàm serverless bị cắt ở khoảng 4,5 MB. Không có trần thì một lần xuất lớn
    // hỏng mà người dùng không nhận được thông báo nào — bấm nút, chờ, rồi không có gì xảy ra.
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('REPORT_EXPORT_TOO_LARGE');
    expect(response.json().detail).toMatch(/vượt mức 2 dòng/);

    // Lần xuất bị từ chối thì không có dữ liệu nào rời hệ thống, nên cũng không được để lại dấu vết
    // nói rằng đã xuất — nhật ký kiểm toán phải khớp với việc thật sự xảy ra.
    expect(await exportedEventCount()).toBe(before);
  });

  it('exports and records an audit trail when the filter stays under the cap', async () => {
    const before = await exportedEventCount();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/findings.csv?branchCode=635&workflowStatus=PENDING',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.body.startsWith('﻿')).toBe(true);

    // Xuất dữ liệu là đường mang hồ sơ ra khỏi hệ thống, nên nó vẫn phải để lại dấu vết — việc bỏ
    // persistLocalState() khỏi endpoint này là để bớt chi phí, không phải để bớt nhật ký.
    expect(await exportedEventCount()).toBe(before + 1);
  });

  it('shares one cap between the CSV endpoint and the report export endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/exports',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      payload: {
        query: {
          groupBy: 'dimension.branch',
          metrics: ['metric.finding_count'],
          rules: [],
          match: 'ALL',
          limit: 25,
        },
        columns: ['dimension.cif'],
        format: 'csv',
        section: 'detail',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('REPORT_EXPORT_TOO_LARGE');
  });
});

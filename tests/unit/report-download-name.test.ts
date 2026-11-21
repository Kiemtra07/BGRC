import { describe, expect, it } from 'vitest';
import { filenameFromDisposition } from '../../src/services/api';

describe('tên tệp báo cáo tải về', () => {
  it('lấy tên tiếng Việt từ filename* và quay về tên thường khi thiếu', () => {
    const header = `attachment; filename="Bao cao theo Chi nhanh - 2026-11-21.xlsx"; filename*=UTF-8''B%C3%A1o%20c%C3%A1o%20theo%20Chi%20nh%C3%A1nh%20-%202026-11-21.xlsx`;
    expect(filenameFromDisposition(header)).toBe('Báo cáo theo Chi nhánh - 2026-11-21.xlsx');
    expect(filenameFromDisposition('attachment; filename="report.csv"')).toBe('report.csv');
    expect(filenameFromDisposition(null)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { WebFormFindingSchema } from '../../shared/contracts';

const validFinding = {
  channelId: 'chan-audit-bgs',
  cif: '12345678',
  customerName: 'Khách hàng kiểm thử',
  clusterName: 'Cụm Tây Nguyên',
  branchCode: '635',
  branchName: 'Chi nhánh Nam Buôn Hồ',
  errorCode: 'TD01.01',
  errorTitle: 'Sai sót có hạn xử lý',
  description: 'Mô tả đủ dài cho dữ liệu kiểm thử hợp lệ.',
  exposureAmount: 0,
};

describe('WebFormFindingSchema deadlineDate', () => {
  it('accepts a real calendar date and rejects impossible calendar dates', () => {
    expect(WebFormFindingSchema.safeParse({ ...validFinding, deadlineDate: '2024-02-29' }).success).toBe(true);
    expect(WebFormFindingSchema.safeParse({ ...validFinding, deadlineDate: '2024-02-30' }).success).toBe(false);
    expect(WebFormFindingSchema.safeParse({ ...validFinding, deadlineDate: '2026-13-01' }).success).toBe(false);
  });
});

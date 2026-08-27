import { describe, expect, it } from 'vitest';
import { BulkFindingImportSchema, WebFormFindingSchema, buildFindingBusinessKey } from '../../shared/contracts';

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

  it('requires a campaign target and normalizes the finding business key', () => {
    expect(BulkFindingImportSchema.safeParse({ sourceFileName: 'a.xlsx', sourceType: 'CLIPBOARD', rows: [validFinding] }).success).toBe(false);
    expect(buildFindingBusinessKey({
      ...validFinding,
      campaignId: ' campaign-1 ',
      branchCode: ' B633 ',
      cif: ' 12 345 678 ',
      errorCode: ' td01.01 ',
      decisionNo: ' QĐ 01 ',
    })).toBe('chan-audit-bgs|campaign-1|633|12345678|TD01.01|QĐ 01');
  });
});

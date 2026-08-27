import { describe, expect, it } from 'vitest';
import { ExcelFastIngestionService } from '../../src/lib/excel-parser';
import type { UserProfile } from '../../src/types';

const user: UserProfile = {
  id: 'user-inspector',
  name: 'Nguyễn Thị Phương Tuyến',
  email: 'tuyen@local.test',
  portal: 'INTERNAL',
  role: 'INTERNAL_OFFICER',
};

const row = (...values: unknown[]) => values;

describe('ExcelFastIngestionService', () => {
  it('parses the hierarchical personal-audit report instead of treating template markers as customers', () => {
    const rows = [
      row('QĐ số: 23179/QD-BIDV ngày 08/11/2024'),
      row('Tên Chi nhánh: Chi nhánh Buôn Hồ'),
      row('Mã Chi nhánh: B633'),
      row('Ngày dữ liệu: 31/10/2024'),
      row('', '', '', '', '', '', 'TIỂU BIÊN BẢN KIỂM TRA KHÁCH HÀNG CÁ NHÂN'),
      row('', 'Cán bộ kiểm tra:', '', 'Nguyễn Thị Phương Tuyến'),
      row(1, 'NGUYEN ANH DUONG - CIF: 728986 (Dư nợ cấp TD:10,000 trđ, TSBĐ: 13,822 trđ, PLN: 10, Thẩm quyền cấp TD: 2-CN)'),
      row('', 'CB QLKH:', '', '', '', '', 'TP QLKH:'),
      row('ü', 'Mô tả khoản vay'),
      row('', 'Vay đầu tư, chăm sóc sầu riêng, cà phê, tiêu'),
      row('TT', 'Mã sai sót', 'Mô tả chi tiết', '', '', '', '', '', '', 'Số lượng SS', 'Giá trị SS'),
      row(1, 'TD03.07', 'Báo cáo đề xuất khá sơ sài, chưa đầy đủ thông tin.', '', '', '', '', '', '', 5, 10000),
      row('', 'Chi tiết SS:Báo cáo đề xuất tín dụng chưa nêu đầy đủ phương án kinh doanh.', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Chi tiết SS:'),
      row('', 'Nội dung tiếp theo của cùng ý sai sót.', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Chi tiết SS:'),
      row('', 'VB dẫn chiếu:Cẩm nang cấp tín dụng bán lẻ 11537'),
      row(2, 'NGUYEN THI HUE - CIF: 10294114 (Dư nợ cấp TD:0 trđ, TSBĐ: 8,800 trđ, PLN: 10, Thẩm quyền cấp TD: 2-CN)'),
      row(3, 'NGUYEN THI OANH OANH - CIF: 21766342 (Dư nợ cấp TD:10,000 trđ, TSBĐ: 15,937 trđ, PLN: 10, Thẩm quyền cấp TD: 2-CN)'),
      row('TT', 'Mã sai sót', 'Mô tả chi tiết', '', '', '', '', '', '', 'Số lượng SS', 'Giá trị SS'),
      row(1, 'TD05.99', 'Chứng từ giải ngân chưa phù hợp thực tế.', '', '', '', '', '', '', 1, 10000),
      row('', 'Chi tiết SS:Cho vay mua vật tư chưa có chứng từ hợp lệ.'),
      row('II', 'Kiến nghị'),
      row('', 'Nội dung kiến nghị không thuộc chi tiết sai sót cuối cùng.'),
    ];

    const result = (ExcelFastIngestionService as unknown as {
      processRawRows: (rows: unknown[][], fileName: string, user: UserProfile) => ReturnType<typeof ExcelFastIngestionService.parsePastedExcelText>;
    }).processRawRows(rows, 'TUYEN TIEU BIEN BAN KHCN PGD NAM BUON HO 1.xlsx', user);

    expect(result.status).toBe('SUCCESS');
    expect(result.branchDetected).toBe('Chi nhánh Buôn Hồ');
    expect(result.decisionNoDetected).toBe('23179/QD-BIDV ngày 08/11/2024');
    expect(result.totalCustomersFound).toBe(3);
    expect(result.totalErrorsExtracted).toBe(2);
    expect(result.customers.map(customer => customer.cif)).toEqual(['728986', '10294114', '21766342']);
    expect(result.customers[0]).toMatchObject({
      customerName: 'NGUYEN ANH DUONG',
      branchCode: '633',
      department: 'PGD Nam Buôn Hồ 1',
      inspectorName: 'Nguyễn Thị Phương Tuyến',
      creditBalance: 10000,
      collateralValue: 13822,
      loanPurpose: 'Vay đầu tư, chăm sóc sầu riêng, cà phê, tiêu',
    });
    expect(result.customers[0].errors[0]).toMatchObject({
      errorCode: 'TD03.07',
      errorTitle: 'Báo cáo đề xuất khá sơ sài, chưa đầy đủ thông tin.',
      description: 'Báo cáo đề xuất tín dụng chưa nêu đầy đủ phương án kinh doanh.\nNội dung tiếp theo của cùng ý sai sót.',
      quantity: 5,
      exposureAmount: 10000,
    });
    expect(result.customers[1].errors).toEqual([]);
    expect(result.customers[2].errors[0].description).not.toContain('Nội dung kiến nghị');
    expect(result.customers.flatMap(customer => customer.errors).some(error => error.errorCode === 'TD01.01')).toBe(false);
  });

  it('selects the populated report worksheet instead of the placeholder mapping sheet', () => {
    const templateRows = [row('', '', '', '', 'TIỂU BIÊN BẢN KIỂM TRA KHÁCH HÀNG CÁ NHÂN'), row('', '', -5, '', -6)];
    const reportRows = [
      row('', '', '', '', '', '', 'TIỂU BIÊN BẢN KIỂM TRA KHÁCH HÀNG CÁ NHÂN'),
      row(1, 'NGUYEN ANH DUONG - CIF: 728986 (Dư nợ cấp TD:10,000 trđ)'),
      row(1, 'TD03.07', 'Báo cáo đề xuất sơ sài'),
    ];
    const selected = (ExcelFastIngestionService as unknown as {
      selectReportSheet: (sheets: Array<{ sheet: string; data: unknown[][] }>) => { sheet: string; data: unknown[][] };
    }).selectReportSheet([
      { sheet: 'Sheet1', data: templateRows },
      { sheet: 'Mau 05A-KTNV.TD', data: reportRows },
    ]);

    expect(selected.sheet).toBe('Mau 05A-KTNV.TD');
  });

  it('preserves a deadline supplied in a flat Excel row instead of inventing one', () => {
    const rows = [
      row('Tên khách hàng', 'CIF', 'Mã sai sót', 'Hạn xử lý'),
      row('Khách hàng giữ hạn', '12345678', 'TD01.01', '15/09/2026'),
    ];

    const result = (ExcelFastIngestionService as unknown as {
      processRawRows: (rows: unknown[][], fileName: string, user: UserProfile) => ReturnType<typeof ExcelFastIngestionService.parsePastedExcelText>;
    }).processRawRows(rows, 'deadline.xlsx', user);

    expect(result.status).toBe('SUCCESS');
    expect(result.customers[0].errors[0].deadlineDate).toBe('2026-09-15');
  });

  it('preserves local calendar dates from Excel Date cells while allowing a blank deadline', () => {
    const rows = [
      row('Tên khách hàng', 'CIF', 'Mã sai sót', 'Hạn xử lý'),
      row('Ngày Date hợp lệ', '12345678', 'TD01.01', new Date(2026, 8, 15)),
      row('Ngày nhuận hợp lệ', '12345679', 'TD01.01', new Date(2024, 1, 29)),
      row('Không có hạn nguồn', '12345680', 'TD01.01', ''),
    ];

    const result = (ExcelFastIngestionService as unknown as {
      processRawRows: (rows: unknown[][], fileName: string, user: UserProfile) => ReturnType<typeof ExcelFastIngestionService.parsePastedExcelText>;
    }).processRawRows(rows, 'deadline-date-cells.xlsx', user);

    expect(result.customers.flatMap(customer => customer.errors).map(error => error.deadlineDate)).toEqual([
      '2026-09-15',
      '2024-02-29',
      undefined,
    ]);
  });

  it('rejects a flat file when a business row contains a nonblank invalid deadline', () => {
    const parseRows = (deadline: unknown) => (ExcelFastIngestionService as unknown as {
      processRawRows: (rows: unknown[][], fileName: string, currentUser: UserProfile) => ReturnType<typeof ExcelFastIngestionService.parsePastedExcelText>;
    }).processRawRows([
      row('Tên khách hàng', 'CIF', 'Mã sai sót', 'Hạn xử lý'),
      row('Hạn không hợp lệ', '12345680', 'TD01.01', deadline),
    ], 'invalid-deadline.xlsx', user);

    const invalidDate = parseRows(new Date('invalid date'));
    const invalidCalendarDate = parseRows('2026-02-29');

    expect(invalidDate).toMatchObject({ status: 'ERROR', customers: [] });
    expect(invalidDate.message).toMatch(/dòng 2.*Invalid Date/i);
    expect(invalidCalendarDate).toMatchObject({ status: 'ERROR', customers: [] });
    expect(invalidCalendarDate.message).toMatch(/dòng 2.*2026-02-29/i);
  });

  it('deduplicates identical pasted rows while preserving different error codes', () => {
    const result = ExcelFastIngestionService.parsePastedExcelText([
      'Tên khách hàng\tCIF\tMã sai sót',
      'Khách hàng trùng\t12345678\tTD01.01',
      'Khách hàng trùng\t12345678\ttd01.01',
      'Khách hàng trùng\t12345678\tTD03.07',
    ].join('\n'), user);

    expect(result.status).toBe('SUCCESS');
    expect(result.totalErrorsExtracted).toBe(2);
    expect(result.customers[0].errors.map(error => error.errorCode)).toEqual(['TD01.01', 'TD03.07']);
    expect(result.duplicateRowsCount).toBe(1);
  });
});

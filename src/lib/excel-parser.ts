import readXlsxFile, { type Sheet } from 'read-excel-file/browser';
import JSZip from 'jszip';
import { CustomerRecord, AuditError, BatchUploadResult, UserProfile } from '../types';
import type { BusinessLine, RiskLevel } from '../../shared/contracts';
import { ERROR_CODE_CATALOG } from './error-catalog';

type WorkbookSheet = Pick<Sheet, 'sheet' | 'data'>;

interface ReportMetadata {
  branchDetected: string;
  branchCode: string;
  decisionNo: string;
  auditDate: string;
  inspectorName: string;
  clusterName: string;
  department: string;
}

const customerHeaderPattern = /^(.*?)\s*-\s*CIF\s*:\s*([A-Z0-9.-]+)(?:\s*\((.*)\))?/i;
const errorCodePattern = /^TD\d{2}(?:\.\d{2})?$/i;

/**
 * CoPlus writes the risk grade either as its enum (CAO / TRUNG_BINH / THAP) or as the Vietnamese
 * label shown on screen ("Cao", "Trung bình", "Thấp"); accept both and ignore anything else rather
 * than guessing a grade the đoàn kiểm tra did not assign.
 */
const parseRiskLevel = (raw: string): RiskLevel | undefined => {
  const value = raw.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  if (!value) return undefined;
  if (value === 'cao' || value === 'high') return 'CAO';
  if (value === 'trung binh' || value === 'trung bình' || value === 'medium') return 'TRUNG_BINH';
  if (value === 'thap' || value === 'thấp' || value === 'low') return 'THAP';
  return undefined;
};

const parseBusinessLine = (raw: string, errorCode: string): BusinessLine | undefined => {
  const value = raw.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  if (value.includes('phi tin dung') || value.includes('phi tín dụng')) return 'PHI_TIN_DUNG';
  if (value.includes('tin dung') || value.includes('tín dụng')) return 'TIN_DUNG';
  // No column in the file: a TD… mã sai sót is by definition a credit finding.
  return errorCode.toUpperCase().startsWith('TD') ? 'TIN_DUNG' : undefined;
};

/** Optional CoPlus columns; every field is omitted when its column is absent or blank. */
const readCoPlusProvenance = (
  row: unknown[],
  aliases: Record<string, number>,
  errorCode: string,
): Partial<AuditError> => {
  const at = (key: string): string => aliases[key] === undefined ? '' : cellText(row[aliases[key]]);
  const provenance: Partial<AuditError> = {
    businessLine: parseBusinessLine(at('businessLine'), errorCode),
    riskLevel: parseRiskLevel(at('riskLevel')),
  };
  const inspectionTeamCode = at('inspectionTeam');
  const sourceRecordCode = at('sourceRecord');
  const penaltyProposalCode = at('penalty');
  const referenceDocument = at('reference');
  if (inspectionTeamCode) provenance.inspectionTeamCode = inspectionTeamCode;
  if (sourceRecordCode) provenance.sourceRecordCode = sourceRecordCode;
  if (penaltyProposalCode) provenance.penaltyProposalCode = penaltyProposalCode;
  if (referenceDocument) provenance.referenceDocument = referenceDocument;
  return provenance;
};

export class ExcelFastIngestionService {
  public static async parseExcelFile(file: File, currentUser: UserProfile): Promise<BatchUploadResult> {
    try {
      const sheets = await readXlsxFile(file);
      const selected = this.selectReportSheet(sheets as WorkbookSheet[]);
      return this.processRawRows(selected.data as unknown[][], file.name, currentUser);
    } catch (err: any) {
      return this.errorResult(file.name, `Lỗi đọc file Excel: ${err?.message || 'Định dạng không hợp lệ'}`);
    }
  }

  public static async parseZipBatch(zipFile: File, currentUser: UserProfile): Promise<BatchUploadResult[]> {
    const results: BatchUploadResult[] = [];
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const fileNames = Object.keys(zip.files).filter(name => !name.startsWith('__MACOSX') && name.toLowerCase().endsWith('.xlsx'));
      for (const fileName of fileNames) {
        const fileData = await zip.files[fileName].async('arraybuffer');
        const sheets = await readXlsxFile(fileData);
        const selected = this.selectReportSheet(sheets as WorkbookSheet[]);
        results.push(this.processRawRows(selected.data as unknown[][], fileName, currentUser));
      }
    } catch (err: any) {
      results.push(this.errorResult(zipFile.name, `Lỗi giải nén hoặc xử lý file ZIP: ${err?.message || 'Hỏng tệp tin'}`));
    }
    return results;
  }

  public static parsePastedExcelText(text: string, currentUser: UserProfile): BatchUploadResult {
    const rows = text.trim().split(/\r?\n/).map(line => line.split('\t'));
    return this.processRawRows(rows, 'Clipboard_Excel_Paste.xlsx', currentUser);
  }

  public static selectReportSheet(sheets: WorkbookSheet[]): WorkbookSheet {
    if (!sheets.length) throw new Error('Workbook không có worksheet.');
    return [...sheets].sort((left, right) => this.sheetScore(right) - this.sheetScore(left))[0];
  }

  public static processRawRows(rawRows: unknown[][], fileName: string, currentUser: UserProfile): BatchUploadResult {
    const hasStructuredCustomers = rawRows.some(row => row.some(cell => customerHeaderPattern.test(cellText(cell))));
    return hasStructuredCustomers
      ? this.parseStructuredMiniReport(rawRows, fileName, currentUser)
      : this.parseFlatTable(rawRows, fileName, currentUser);
  }

  private static parseStructuredMiniReport(rawRows: unknown[][], fileName: string, currentUser: UserProfile): BatchUploadResult {
    const metadata = this.readMetadata(rawRows, fileName, currentUser);
    const customers: CustomerRecord[] = [];
    let current: CustomerRecord | null = null;
    let lastError: AuditError | null = null;
    let awaitingPurpose = false;
    let colDescription = 2;
    let colQuantity = 9;
    let colExposure = 10;

    rawRows.forEach((row, rowIndex) => {
      const values = row.map(cellText);
      const meaningfulValues = [...new Set(values.filter(Boolean))];
      const joined = meaningfulValues.join(' ').trim();
      const customerCell = values.find(value => customerHeaderPattern.test(value));
      const customerMatch = customerCell?.match(customerHeaderPattern);

      if (customerMatch) {
        const financialText = customerMatch[3] || '';
        current = this.newCustomer({
          rowIndex,
          cif: customerMatch[2].replace(/[^A-Z0-9]/gi, ''),
          customerName: customerMatch[1].trim(),
          creditBalance: numberAfterLabel(financialText, /Dư\s*nợ(?:\s*cấp\s*TD)?\s*:/i),
          collateralValue: numberAfterLabel(financialText, /TSBĐ\s*:/i),
          loanGroup: textAfterLabel(financialText, /PLN\s*:/i) || 'Chưa có trong tiểu biên bản',
          metadata,
        });
        customers.push(current);
        lastError = null;
        awaitingPurpose = false;
        return;
      }

      const normalized = values.map(value => value.toLowerCase());
      if (normalized.some(value => value === 'kiến nghị')) {
        lastError = null;
        awaitingPurpose = false;
        return;
      }
      if (normalized.some(value => value.includes('mã sai sót'))) {
        colDescription = normalized.findIndex(value => value.includes('mô tả chi tiết'));
        colQuantity = normalized.findIndex(value => value.includes('số lượng'));
        colExposure = normalized.findIndex(value => value.includes('giá trị'));
        return;
      }

      if (!current) return;
      if (normalized.some(value => value === 'mô tả khoản vay')) {
        awaitingPurpose = true;
        lastError = null;
        return;
      }
      if (awaitingPurpose && joined && !isSectionLabel(joined)) {
        current.loanPurpose = joined;
        awaitingPurpose = false;
        return;
      }

      const codeIndex = values.findIndex(value => errorCodePattern.test(value));
      if (codeIndex >= 0) {
        const code = values[codeIndex].toUpperCase();
        const title = values[colDescription] || values.slice(codeIndex + 1).find(value => value.length > 2) || `Sai sót mã ${code}`;
        const quantity = parseReportNumber(row[colQuantity]);
        const exposure = parseReportNumber(row[colExposure]);
        lastError = this.newError(current, currentUser, fileName, rowIndex, code, title, title, quantity || 1, exposure);
        current.errors.push(lastError);
        current.totalErrors = current.errors.length;
        current.activeErrors = current.errors.length;
        return;
      }

      if (!lastError || !joined) return;
      const detailCell = meaningfulValues.find(value => {
        if (!/^chi\s*tiết\s*SS\s*:/i.test(value)) return false;
        return value.replace(/^chi\s*tiết\s*SS\s*:\s*/i, '').trim().length > 0;
      });
      if (detailCell) {
        lastError.description = detailCell.replace(/^chi\s*tiết\s*SS\s*:\s*/i, '').trim() || lastError.errorTitle;
        return;
      }
      if (/^VB\s*dẫn\s*chiếu\s*:/i.test(joined) || isSectionLabel(joined)) return;
      const continuation = meaningfulValues.find(value => value.length >= 20 && !/^chi\s*tiết\s*SS\s*:/i.test(value) && !/^VB\s*dẫn\s*chiếu\s*:/i.test(value));
      if (continuation && !lastError.description.includes(continuation)) lastError.description = `${lastError.description}\n${continuation}`.trim();
    });

    const totalErrors = customers.reduce((sum, customer) => sum + customer.errors.length, 0);
    return this.successResult(fileName, metadata, customers, totalErrors);
  }

  private static parseFlatTable(rawRows: unknown[][], fileName: string, currentUser: UserProfile): BatchUploadResult {
    const metadata = this.readMetadata(rawRows, fileName, currentUser);
    const aliases: Record<string, number> = {};
    let headerIndex = -1;

    for (let r = 0; r < Math.min(40, rawRows.length); r++) {
      rawRows[r].forEach((cell, column) => {
        const value = cellText(cell).toLowerCase();
        if (value.includes('tên khách hàng') || value === 'tên kh') aliases.name = column;
        else if (value === 'cif' || value.includes('mã kh')) aliases.cif = column;
        else if (value.includes('mã sai sót') || value === 'mã ss') aliases.error = column;
        else if (value.includes('dư nợ')) aliases.credit = column;
        else if (value.includes('phân loại nợ') || value.includes('nhóm nợ')) aliases.loanGroup = column;
        else if (value.includes('tsbđ') || value.includes('tài sản')) aliases.collateral = column;
        else if (value.includes('cán bộ qlkh') || value.includes('cb qlkh')) aliases.officer = column;
        else if (value.includes('tp. qlkh') || value.includes('tp qlkh')) aliases.head = column;
        else if (value.includes('mục đích')) aliases.purpose = column;
        else if (value.includes('hạn xử lý') || value.includes('hạn khắc phục') || value.includes('deadline')) aliases.deadline = column;
        // Columns a CoPlus "Báo cáo theo mã sai sót" export carries; all optional.
        else if (value.includes('mã đoàn')) aliases.inspectionTeam = column;
        else if (value.includes('mã tbb') || value.includes('tiểu biên bản')) aliases.sourceRecord = column;
        else if (value.includes('loại nghiệp vụ') || value.includes('nghiệp vụ')) aliases.businessLine = column;
        else if (value.includes('mức độ rủi ro') || value.includes('mức độ sai sót')) aliases.riskLevel = column;
        else if (value.includes('đề xuất xử phạt') || value.includes('xử phạt')) aliases.penalty = column;
        else if (value.includes('văn bản dẫn chiếu') || value.includes('văn bản tham chiếu')) aliases.reference = column;
      });
      if (aliases.name !== undefined && aliases.cif !== undefined && aliases.error !== undefined) {
        headerIndex = r;
        break;
      }
    }

    if (headerIndex < 0) return this.warningResult(fileName, metadata, 'Không nhận diện được bảng dữ liệu hoặc mẫu tiểu biên bản được hỗ trợ.');

    const customersMap = new Map<string, CustomerRecord>();
    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      const name = cellText(row[aliases.name]);
      const cif = cellText(row[aliases.cif]).replace(/\D/g, '');
      const code = cellText(row[aliases.error]).toUpperCase();
      if (!name || cif.length < 4 || !errorCodePattern.test(code)) continue;
      const deadlineValue = aliases.deadline === undefined ? undefined : row[aliases.deadline];
      const deadlineDate = normalizeSpreadsheetDate(deadlineValue);
      if (aliases.deadline !== undefined && cellText(deadlineValue) && !deadlineDate) {
        return this.errorResult(fileName, `Hạn xử lý không hợp lệ tại dòng ${r + 1}: ${cellText(deadlineValue)}.`);
      }
      const key = `${metadata.branchCode}:${cif}`;
      let customer = customersMap.get(key);
      if (!customer) {
        customer = this.newCustomer({
          rowIndex: r,
          cif,
          customerName: name,
          creditBalance: parseReportNumber(row[aliases.credit]),
          collateralValue: parseReportNumber(row[aliases.collateral]),
          loanGroup: cellText(row[aliases.loanGroup]) || 'Chưa có trong file',
          metadata,
          officerName: cellText(row[aliases.officer]),
          deptHeadName: cellText(row[aliases.head]),
          loanPurpose: cellText(row[aliases.purpose]),
        });
        customersMap.set(key, customer);
      }
      const master = ERROR_CODE_CATALOG.find(item => item.code === code);
      customer.errors.push({
        ...this.newError(customer, currentUser, fileName, r, code, master?.title || `Sai sót mã ${code}`, master?.description || `Phát hiện sai sót ${code} trong file nguồn.`, 1, 0, deadlineDate),
        ...readCoPlusProvenance(row, aliases, code),
      });
      customer.totalErrors = customer.errors.length;
      customer.activeErrors = customer.errors.length;
    }

    const customers = [...customersMap.values()];
    const totalErrors = customers.reduce((sum, customer) => sum + customer.errors.length, 0);
    return customers.length ? this.successResult(fileName, metadata, customers, totalErrors) : this.warningResult(fileName, metadata, 'Không có dòng khách hàng nào đồng thời có CIF và mã sai sót hợp lệ.');
  }

  private static readMetadata(rawRows: unknown[][], fileName: string, currentUser: UserProfile): ReportMetadata {
    let branchDetected = 'Không xác định';
    let branchCode = '';
    let decisionNo = 'Không xác định';
    let auditDate = '';
    let inspectorName = currentUser.name || 'Chưa xác định';

    for (let r = 0; r < Math.min(20, rawRows.length); r++) {
      const values = rawRows[r].map(cellText);
      const decisionIndex = values.findIndex(value => /QĐ(?:\s+kiểm\s+tra)?\s+số/i.test(value));
      if (decisionIndex >= 0) {
        const inline = values[decisionIndex].match(/QĐ(?:\s+kiểm\s+tra)?\s+số\s*:\s*(.+)$/i)?.[1];
        decisionNo = inline?.trim() || values.slice(decisionIndex + 1).find(Boolean) || decisionNo;
      }
      const branchIndex = values.findIndex(value => /Tên\s+Chi\s+nhánh/i.test(value));
      if (branchIndex >= 0) {
        const inline = values[branchIndex].match(/Tên\s+Chi\s+nhánh\s*:\s*(.+)$/i)?.[1];
        const branchValue = inline?.trim() || values.slice(branchIndex + 1).find(Boolean);
        if (branchValue) branchDetected = normalizeBranchName(branchValue);
      }
      const codeIndex = values.findIndex(value => /Mã\s+Chi\s+nhánh/i.test(value));
      if (codeIndex >= 0) {
        const inline = values[codeIndex].match(/Mã\s+Chi\s+nhánh\s*:\s*([A-Z]?\d{3,4})/i)?.[1];
        const codeValue = inline || values.slice(codeIndex + 1).find(value => /[A-Z]?\d{3,4}/i.test(value));
        if (codeValue) branchCode = codeValue.replace(/\D/g, '');
      }
      const dateIndex = values.findIndex(value => /Ngày\s+dữ\s+liệu/i.test(value));
      if (dateIndex >= 0) {
        const inline = values[dateIndex].match(/Ngày\s+dữ\s+liệu\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
        const dateValue = inline || values.slice(dateIndex + 1).find(value => /\d{1,2}\/\d{1,2}\/\d{4}/.test(value));
        if (dateValue) auditDate = dateValue.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || auditDate;
      }
      const inspectorLabelIndex = values.findIndex(value => /Cán\s+bộ\s+kiểm\s+tra\s*:?/i.test(value));
      if (inspectorLabelIndex >= 0) {
        const inline = values[inspectorLabelIndex].replace(/^.*?Cán\s+bộ\s+kiểm\s+tra\s*:\s*/i, '').trim();
        const next = values.slice(inspectorLabelIndex + 1).find(value => value && !/Cán\s+bộ\s+kiểm\s+tra/i.test(value));
        if (inline && !/Cán\s+bộ\s+kiểm\s+tra/i.test(inline)) inspectorName = inline;
        else if (next) inspectorName = next;
      }
    }

    const department = departmentFromFileName(fileName) || currentUser.department || 'Chưa xác định';
    return {
      branchDetected,
      branchCode: branchCode || currentUser.branchCode || 'UNKNOWN',
      decisionNo,
      auditDate,
      inspectorName,
      clusterName: clusterFromBranch(branchDetected, branchCode),
      department,
    };
  }

  private static newCustomer(input: {
    rowIndex: number;
    cif: string;
    customerName: string;
    creditBalance: number;
    collateralValue: number;
    loanGroup: string;
    metadata: ReportMetadata;
    officerName?: string;
    deptHeadName?: string;
    loanPurpose?: string;
  }): CustomerRecord {
    return {
      id: localId('CUST', input.rowIndex),
      cif: input.cif,
      customerName: input.customerName,
      clusterName: input.metadata.clusterName,
      branchCode: input.metadata.branchCode,
      branchName: input.metadata.branchDetected,
      department: input.metadata.department,
      decisionNo: input.metadata.decisionNo,
      auditDate: input.metadata.auditDate,
      inspectorName: input.metadata.inspectorName,
      creditBalance: input.creditBalance,
      loanGroup: input.loanGroup,
      collateralValue: input.collateralValue,
      loanPurpose: input.loanPurpose || 'Chưa có trong tiểu biên bản',
      officerName: input.officerName || 'Chưa có trong tiểu biên bản',
      deptHeadName: input.deptHeadName || 'Chưa có trong tiểu biên bản',
      errors: [],
      totalErrors: 0,
      activeErrors: 0,
      resolvedErrors: 0,
    };
  }

  private static newError(customer: CustomerRecord, currentUser: UserProfile, fileName: string, rowIndex: number, code: string, title: string, description: string, quantity: number, exposure: number, deadlineDate?: string): AuditError {
    const master = ERROR_CODE_CATALOG.find(item => item.code === code);
    return {
      id: localId('ERR', rowIndex),
      customerId: customer.id,
      errorCode: code,
      errorGroup: master?.group || code.slice(0, 4),
      errorTitle: title,
      description,
      quantity,
      exposureAmount: exposure,
      status: 'PENDING',
      ...(deadlineDate ? { deadlineDate } : {}),
      isOverdue: false,
      attachments: [],
      history: [{
        id: localId('LOG', rowIndex),
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
        action: 'CREATE',
        actorName: currentUser.name,
        actorRole: currentUser.role,
        notes: `Trích xuất từ ${fileName}, dòng ${rowIndex + 1}`,
      }],
    };
  }

  private static sheetScore(sheet: WorkbookSheet): number {
    const values = sheet.data.flat().map(cellText).filter(Boolean);
    const title = values.some(value => /TIỂU\s+BIÊN\s+BẢN\s+KIỂM\s+TRA\s+KHÁCH\s+HÀNG/i.test(value)) ? 10 : 0;
    const customers = values.filter(value => customerHeaderPattern.test(value)).length;
    const errorCodes = values.filter(value => errorCodePattern.test(value)).length;
    const metadata = values.filter(value => /^(QĐ số|Tên Chi nhánh|Mã Chi nhánh|Cán bộ kiểm tra)/i.test(value)).length;
    const placeholderPenalty = values.filter(value => /^-\d+$/.test(value) || /ngắt dòng tự động/i.test(value)).length * 2;
    return title + customers * 25 + errorCodes * 3 + metadata - placeholderPenalty;
  }

  private static successResult(fileName: string, metadata: ReportMetadata, customers: CustomerRecord[], totalErrors: number): BatchUploadResult {
    const customersWithErrors = customers.filter(customer => customer.errors.length > 0).length;
    return {
      fileName,
      totalCustomersFound: customers.length,
      totalErrorsExtracted: totalErrors,
      branchDetected: metadata.branchDetected,
      decisionNoDetected: metadata.decisionNo,
      status: customers.length > 0 ? 'SUCCESS' : 'WARNING',
      message: `Đọc đúng ${customers.length} khách hàng (${customersWithErrors} khách hàng có sai sót), ${totalErrors} mã sai sót từ ${fileName}`,
      customers,
    };
  }

  private static warningResult(fileName: string, metadata: ReportMetadata, message: string): BatchUploadResult {
    return { fileName, totalCustomersFound: 0, totalErrorsExtracted: 0, branchDetected: metadata.branchDetected, decisionNoDetected: metadata.decisionNo, status: 'WARNING', message, customers: [] };
  }

  private static errorResult(fileName: string, message: string): BatchUploadResult {
    return { fileName, totalCustomersFound: 0, totalErrorsExtracted: 0, branchDetected: 'Không xác định', decisionNoDetected: 'Không xác định', status: 'ERROR', message, customers: [] };
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parseReportNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = cellText(value).replace(/\s*(?:trđ|triệu).*$/i, '').replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(normalized)) return Number(normalized.replace(/[.,]/g, ''));
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSpreadsheetDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return undefined;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  const match = cellText(value).match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}))$/);
  if (!match) return undefined;
  const [, isoYear, isoMonth, isoDay, dayText, monthText, yearText] = match;
  const year = Number(isoYear || yearText);
  const month = Number(isoMonth || monthText);
  const day = Number(isoDay || dayText);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function numberAfterLabel(text: string, label: RegExp): number {
  const match = text.match(new RegExp(`${label.source}\\s*([\\d.,]+)`, 'i'));
  return parseReportNumber(match?.[1]);
}

function textAfterLabel(text: string, label: RegExp): string {
  const match = text.match(new RegExp(`${label.source}\\s*([^,)]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function normalizeBranchName(value: string): string {
  const cleaned = value.replace(/^Tên\s+Chi\s+nhánh\s*:\s*/i, '').trim();
  return /^Chi\s+nhánh/i.test(cleaned) ? cleaned : `Chi nhánh ${cleaned}`;
}

function departmentFromFileName(fileName: string): string {
  const match = fileName.replace(/\.xlsx$/i, '').match(/\bPGD[\s_-]+(.+)$/i);
  if (!match) return '';
  const words: Record<string, string> = { NAM: 'Nam', BUON: 'Buôn', HO: 'Hồ' };
  const name = match[1].split(/[\s_-]+/).map(token => words[token.toUpperCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`).join(' ');
  return `PGD ${name}`;
}

function clusterFromBranch(branchName: string, branchCode: string): string {
  if (/Sài Gòn|Chợ Lớn/i.test(branchName) || branchCode === '428') return 'Cụm TP. Hồ Chí Minh';
  if (/Hà Nội|Miền Bắc/i.test(branchName)) return 'Cụm Miền Bắc';
  if (/Gia Lai|Buôn|Đắk|Đăk/i.test(branchName) || ['633', '635', '640'].includes(branchCode)) return 'Cụm Tây Nguyên';
  return 'Chưa phân cụm địa bàn';
}

function isSectionLabel(value: string): boolean {
  return /^(TT\s+Mã sai sót|Sai sót, tồn tại|Mô tả khoản vay|Kiến nghị|Kết quả kiểm tra|CB QLKH|TP QLKH)/i.test(value);
}

function localId(prefix: string, rowIndex: number): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rowIndex + 1}_${random}`;
}

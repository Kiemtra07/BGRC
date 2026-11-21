import JSZip from 'jszip';
import type { FullReportExport, ReportExportColumn, ReportExportTone, ReportExportValue } from './report-export';

/**
 * Tệp Excel của báo cáo.
 *
 * Mỗi tệp chỉ chứa cái người dùng đang xem (bảng, bảng chéo hoặc dòng chi tiết) cộng một trang thông
 * tin; số là số thật có định dạng, ngày là ngày thật, có dòng tổng, tiêu đề cột cố định khi cuộn và
 * lặp lại ở mỗi trang in. Tệp được dựng trực tiếp từ OOXML nên mọi nơi khai báo sheet, bảng và kiểu
 * định dạng đều sinh ra từ cùng một danh sách, để không thể lệch nhau (lệch là Excel báo tệp hỏng).
 */

const BRAND = 'FF006B68';
const BRAND_SOFT = 'FFE8F4F3';
const ZEBRA = 'FFF7FAFA';
const GRID = 'FFD9E2E8';
const MUTED = 'FF5B6B7A';

const TONES: Record<ReportExportTone, { fill: string; font: string }> = {
  risk: { fill: 'FFFEE4E2', font: 'FFB42318' },
  warn: { fill: 'FFFEF0C7', font: 'FFB54708' },
  ok: { fill: 'FFD1FADF', font: 'FF067647' },
};

const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;

const xmlEscape = (value: ReportExportValue): string => String(value ?? '')
  // Ký tự điều khiển làm Excel báo tệp hỏng; chúng không có nghĩa trong một ô văn bản.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const columnName = (index: number): string => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

/** Mã định dạng số của Excel theo số chữ số thập phân và hậu tố. */
export function numberFormatCode(decimals: number, suffix?: string): string {
  const base = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
  return suffix ? `${base}" ${suffix.replaceAll('"', '')}"` : base;
}
export const DATE_FORMAT = 'dd/mm/yyyy';

/**
 * Mã định dạng của một chỉ số: đếm hiển thị số nguyên, tiền (triệu đồng) và tỷ lệ mặc định một chữ số
 * lẻ. Số lẻ và hậu tố người dùng đặt trên màn hình được ưu tiên.
 */
export function metricNumberFormat(unit: 'COUNT' | 'MILLION_VND' | 'PERCENT', decimals?: number, suffix?: string): string {
  const places = decimals ?? (unit === 'COUNT' ? 0 : 1);
  if (unit === 'PERCENT') return `${places > 0 ? `0.${'0'.repeat(places)}` : '0'}"%"${suffix ? ` "${suffix.replaceAll('"', '')}"` : ''}`;
  return numberFormatCode(places, suffix);
}

interface StyleSpec {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fill?: string;
  border?: 'thin' | 'total';
  numFmt?: string;
  horizontal?: 'left' | 'right' | 'center';
  vertical?: 'top' | 'center';
  wrap?: boolean;
}

/** Kiểu ô đăng ký theo yêu cầu: chỉ phông, nền, viền và định dạng số thật sự được dùng mới vào tệp. */
class StyleBook {
  private readonly fonts: string[] = ['<font><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/><family val="2"/></font>'];
  private readonly fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private readonly borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private readonly numFmts = new Map<string, number>();
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly xfIndex = new Map<string, number>();

  private index(list: string[], xml: string): number {
    const found = list.indexOf(xml);
    if (found >= 0) return found;
    list.push(xml);
    return list.length - 1;
  }

  private numFmtId(code?: string): number {
    if (!code) return 0;
    const known = this.numFmts.get(code);
    if (known) return known;
    const id = 164 + this.numFmts.size;
    this.numFmts.set(code, id);
    return id;
  }

  public register(spec: StyleSpec): number {
    const key = JSON.stringify(spec);
    const existing = this.xfIndex.get(key);
    if (existing !== undefined) return existing;

    const font = this.index(this.fonts, `<font>${spec.bold ? '<b/>' : ''}${spec.italic ? '<i/>' : ''}<sz val="${spec.size ?? 11}"/><color rgb="${spec.color ?? 'FF1E293B'}"/><name val="Calibri"/><family val="2"/></font>`);
    const fill = spec.fill ? this.index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${spec.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let border = 0;
    if (spec.border === 'thin') {
      const side = (tag: string) => `<${tag} style="thin"><color rgb="${GRID}"/></${tag}>`;
      border = this.index(this.borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`);
    } else if (spec.border === 'total') {
      const thin = (tag: string) => `<${tag} style="thin"><color rgb="${GRID}"/></${tag}>`;
      border = this.index(this.borders, `<border>${thin('left')}${thin('right')}<top style="medium"><color rgb="${BRAND}"/></top><bottom style="medium"><color rgb="${BRAND}"/></bottom><diagonal/></border>`);
    }
    const numFmtId = this.numFmtId(spec.numFmt);
    const alignment = spec.horizontal || spec.vertical || spec.wrap
      ? `<alignment${spec.horizontal ? ` horizontal="${spec.horizontal}"` : ''} vertical="${spec.vertical ?? 'center'}"${spec.wrap ? ' wrapText="1"' : ''}/>`
      : '';
    const xf = `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="${numFmtId ? 1 : 0}" applyFont="1" applyFill="${fill ? 1 : 0}" applyBorder="${border ? 1 : 0}" applyAlignment="${alignment ? 1 : 0}">${alignment}</xf>`;
    this.xfs.push(xf);
    this.xfIndex.set(key, this.xfs.length - 1);
    return this.xfs.length - 1;
  }

  public xml(): string {
    const formats = [...this.numFmts.entries()].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xmlEscape(code)}"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${formats ? `<numFmts count="${this.numFmts.size}">${formats}</numFmts>` : ''}<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  }
}

const cellRef = (row: number, column: number): string => `${columnName(column)}${row}`;

/** Ngày dạng YYYY-MM-DD thành số ngày của Excel; không đọc được thì trả `undefined` để giữ nguyên chữ. */
function excelDateSerial(value: ReportExportValue): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const serial = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000 + 25_569;
  return Number.isFinite(serial) ? serial : undefined;
}

function xlsxCell(ref: string, value: ReportExportValue, style: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
  const text = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

const vietnamTime = (iso: string): string => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

/** Tên cột duy nhất và không rỗng: Excel coi trùng tên (không phân biệt hoa thường) là tệp hỏng. */
const uniqueColumnNames = (columns: ReportExportColumn[]): string[] => {
  const used = new Set<string>();
  return columns.map((column, index) => {
    const base = column.label.trim() || `Cột ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLocaleLowerCase('vi-VN'))) name = `${base} (${suffix++})`;
    used.add(name.toLocaleLowerCase('vi-VN'));
    return name;
  });
};

const sanitizeSheetName = (name: string): string => name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Báo cáo';

interface ReportTable {
  sheetName: string;
  tableName: string;
  columns: ReportExportColumn[];
  rows: ReportExportValue[][];
  tones?: Array<Array<ReportExportTone | undefined>>;
  totals?: ReportExportValue[];
}

interface SheetOutput { name: string; xml: string; table?: { name: string; ref: string; names: string[] }; printTitles: boolean }

function columnWidths(columns: ReportExportColumn[], rows: ReportExportValue[][]): number[] {
  return columns.map((column, index) => {
    const sample = rows.slice(0, 300).map(row => {
      const value = row[index];
      return typeof value === 'number' ? value.toLocaleString('vi-VN').length + 2 : String(value ?? '').length;
    });
    const widest = Math.max(column.label.length * 0.95, ...sample);
    return Math.min(46, Math.max(index === 0 ? 20 : 11, Math.ceil(widest * 1.1) + 3));
  });
}

function buildReportSheet(report: FullReportExport, table: ReportTable, styles: StyleBook, title: string): SheetOutput {
  const { columns } = table;
  const last = Math.max(0, columns.length - 1);
  const hasData = table.rows.length > 0;
  const rows = hasData ? table.rows : [['Không có dữ liệu phù hợp', ...columns.slice(1).map(() => '')]];
  const widths = columnWidths(columns, rows);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  const titleStyle = styles.register({ size: 18, bold: true, color: 'FFFFFFFF', fill: BRAND, vertical: 'center', horizontal: 'left' });
  const subtitleStyle = styles.register({ size: 10, italic: true, color: MUTED, vertical: 'center' });
  const filterStyle = styles.register({ size: 10, color: 'FF334155', vertical: 'top', wrap: true });
  const headerStyle = styles.register({ bold: true, color: 'FFFFFFFF', fill: BRAND, border: 'thin', horizontal: 'center', vertical: 'center', wrap: true });
  const emptyStyle = styles.register({ italic: true, color: MUTED, border: 'thin', vertical: 'center' });

  const filterText = report.filters.length ? `Điều kiện áp dụng: ${report.filters.join('  |  ')}` : 'Điều kiện áp dụng: không có điều kiện lọc';
  const filterLines = Math.max(1, Math.ceil(filterText.length / Math.max(30, totalWidth * 1.05)));
  const subtitle = [
    `Xuất lúc ${vietnamTime(report.generatedAt)}`,
    report.generatedBy ? `Người xuất: ${report.generatedBy}` : '',
    report.scope ? `Phạm vi: ${report.scope}` : '',
  ].filter(Boolean).join('   |   ');

  const rowXml: string[] = [];
  rowXml.push(`<row r="1" ht="34" customHeight="1">${xlsxCell('A1', title, titleStyle)}${columns.slice(1).map((_, column) => `<c r="${cellRef(1, column + 1)}" s="${titleStyle}"/>`).join('')}</row>`);
  rowXml.push(`<row r="2" ht="20" customHeight="1">${xlsxCell('A2', subtitle, subtitleStyle)}</row>`);
  rowXml.push(`<row r="3" ht="${Math.max(20, filterLines * 15 + 6)}" customHeight="1">${xlsxCell('A3', filterText, filterStyle)}</row>`);
  rowXml.push('<row r="4" ht="8" customHeight="1"/>');
  rowXml.push(`<row r="${HEADER_ROW}" ht="34" customHeight="1">${uniqueColumnNames(columns).map((label, column) => xlsxCell(cellRef(HEADER_ROW, column), label, headerStyle)).join('')}</row>`);

  rows.forEach((row, rowIndex) => {
    const rowNumber = FIRST_DATA_ROW + rowIndex;
    if (!hasData) {
      rowXml.push(`<row r="${rowNumber}">${xlsxCell(cellRef(rowNumber, 0), row[0], emptyStyle)}${columns.slice(1).map((_, column) => `<c r="${cellRef(rowNumber, column + 1)}" s="${emptyStyle}"/>`).join('')}</row>`);
      return;
    }
    const zebra = rowIndex % 2 === 1 ? ZEBRA : undefined;
    const cells = columns.map((column, columnIndex) => {
      const tone = table.tones?.[rowIndex]?.[columnIndex];
      const fill = tone ? TONES[tone].fill : zebra;
      const color = tone ? TONES[tone].font : undefined;
      const raw = row[columnIndex];
      const ref = cellRef(rowNumber, columnIndex);
      if (column.kind === 'number') {
        return xlsxCell(ref, raw, styles.register({ border: 'thin', fill, color, bold: Boolean(tone), numFmt: column.numFmt ?? '#,##0.00', horizontal: 'right', vertical: 'center' }));
      }
      if (column.kind === 'date') {
        const serial = excelDateSerial(raw);
        return serial === undefined
          ? xlsxCell(ref, raw, styles.register({ border: 'thin', fill, horizontal: 'center', vertical: 'center' }))
          : xlsxCell(ref, serial, styles.register({ border: 'thin', fill, numFmt: DATE_FORMAT, horizontal: 'center', vertical: 'center' }));
      }
      if (column.kind === 'boolean') return xlsxCell(ref, raw, styles.register({ border: 'thin', fill, horizontal: 'center', vertical: 'center' }));
      return xlsxCell(ref, raw, styles.register({ border: 'thin', fill, vertical: 'center', wrap: true }));
    });
    rowXml.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  });

  const dataEnd = FIRST_DATA_ROW + rows.length - 1;
  let lastRow = dataEnd;
  if (hasData && table.totals) {
    const totalRow = dataEnd + 1;
    lastRow = totalRow;
    const cells = columns.map((column, columnIndex) => {
      const ref = cellRef(totalRow, columnIndex);
      const value = columnIndex === 0 ? 'Tổng cộng' : table.totals?.[columnIndex];
      const numeric = column.kind === 'number';
      return xlsxCell(ref, value, styles.register({
        bold: true, color: 'FF00504E', fill: BRAND_SOFT, border: 'total',
        numFmt: numeric ? column.numFmt ?? '#,##0.00' : undefined,
        horizontal: numeric ? 'right' : 'left', vertical: 'center',
      }));
    });
    rowXml.push(`<row r="${totalRow}" ht="24" customHeight="1">${cells.join('')}</row>`);
  }

  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const merges = last > 0
    ? ['1', '2', '3'].map(row => `<mergeCell ref="A${row}:${columnName(last)}${row}"/>`)
    : [];
  const tableEnd = `${columnName(last)}${dataEnd}`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${columnName(last)}${lastRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${FIRST_DATA_ROW}" sqref="A${FIRST_DATA_ROW}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${rowXml.join('')}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.7" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;9Audit BGS&amp;C&amp;9Trang &amp;P / &amp;N&amp;R&amp;9&amp;D</oddFooter></headerFooter><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`;

  return {
    name: table.sheetName,
    xml,
    table: { name: table.tableName, ref: `A${HEADER_ROW}:${tableEnd}`, names: uniqueColumnNames(columns) },
    printTitles: true,
  };
}

function buildInfoSheet(report: FullReportExport, title: string, styles: StyleBook): SheetOutput {
  const titleStyle = styles.register({ size: 16, bold: true, color: 'FFFFFFFF', fill: BRAND, vertical: 'center' });
  const sectionStyle = styles.register({ bold: true, color: 'FFFFFFFF', fill: BRAND, vertical: 'center' });
  const labelStyle = styles.register({ bold: true, color: 'FF334155', fill: BRAND_SOFT, border: 'thin', vertical: 'top', wrap: true });
  const valueStyle = styles.register({ border: 'thin', vertical: 'top', wrap: true });
  const numberStyle = (code?: string) => styles.register({ border: 'thin', vertical: 'top', horizontal: 'left', numFmt: code ?? '#,##0.##' });
  const noteStyle = styles.register({ size: 10, italic: true, color: MUTED, vertical: 'top', wrap: true });

  interface InfoRow { cells: Array<{ value: ReportExportValue; style: number }>; height?: number; merged?: boolean }
  const rows: InfoRow[] = [];
  const pair = (label: string, value: ReportExportValue, style = valueStyle): InfoRow => ({ cells: [{ value: label, style: labelStyle }, { value, style }] });
  const section = (text: string): InfoRow => ({ cells: [{ value: text, style: sectionStyle }, { value: '', style: sectionStyle }], height: 24, merged: true });

  rows.push({ cells: [{ value: 'Thông tin báo cáo', style: titleStyle }, { value: '', style: titleStyle }], height: 32, merged: true });
  rows.push(pair('Tên báo cáo', title));
  rows.push(pair('Nội dung tệp', report.section === 'detail' ? 'Dòng chi tiết từng hồ sơ' : report.pivot ? `Bảng chéo ${report.pivot.rowLabel} theo ${report.pivot.columnLabel}` : `Bảng phân tích theo ${report.groupLabel}`));
  rows.push(pair('Thời điểm xuất', vietnamTime(report.generatedAt)));
  if (report.generatedBy) rows.push(pair('Người xuất', report.generatedBy));
  if (report.scope) rows.push(pair('Phạm vi dữ liệu', report.scope));
  rows.push(pair('Số hồ sơ phù hợp', report.matchedCount, numberStyle('#,##0')));
  rows.push({ cells: [{ value: '', style: 0 }, { value: '', style: 0 }], height: 10 });
  rows.push(section('Điều kiện áp dụng'));
  (report.filters.length ? report.filters : ['Không có điều kiện lọc']).forEach((filter, index) => rows.push(pair(report.filters.length ? `${index + 1}` : '-', filter)));
  if (report.summary.length) {
    rows.push({ cells: [{ value: '', style: 0 }, { value: '', style: 0 }], height: 10 });
    rows.push(section('Chỉ số tổng hợp'));
    for (const item of report.summary) rows.push(pair(item.label, item.value, typeof item.value === 'number' ? numberStyle(item.numFmt) : valueStyle));
  }
  rows.push({ cells: [{ value: '', style: 0 }, { value: '', style: 0 }], height: 10 });
  const notes = [
    'Số liệu tính trên dữ liệu thuộc phạm vi được cấp cho người xuất, tại thời điểm xuất.',
    ...(report.section === 'design' ? ['Dòng "Tổng cộng" tính trên toàn bộ hồ sơ phù hợp, không phải tổng cộng dồn các dòng đang hiển thị.'] : []),
    'Chỉ số có ghi chú "(triệu đồng)" tính theo đơn vị triệu đồng.',
  ];
  notes.forEach(note => rows.push({ cells: [{ value: note, style: noteStyle }, { value: '', style: noteStyle }], merged: true, height: 18 }));

  const merges: string[] = [];
  const rowXml = rows.map((row, index) => {
    const number = index + 1;
    if (row.merged) merges.push(`A${number}:B${number}`);
    return `<row r="${number}"${row.height ? ` ht="${row.height}" customHeight="1"` : ''}>${row.cells.map((cell, column) => xlsxCell(cellRef(number, column), cell.value, cell.style)).join('')}</row>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:B${rows.length}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="72" customWidth="1"/></cols><sheetData>${rowXml}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;9Audit BGS&amp;C&amp;9Trang &amp;P / &amp;N&amp;R&amp;9&amp;D</oddFooter></headerFooter></worksheet>`;
  return { name: 'Thông tin', xml, printTitles: false };
}

const tableXml = (id: number, table: NonNullable<SheetOutput['table']>): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${table.name}" displayName="${table.name}" ref="${table.ref}" totalsRowShown="0"><autoFilter ref="${table.ref}"/><tableColumns count="${table.names.length}">${table.names.map((label, index) => `<tableColumn id="${index + 1}" name="${xmlEscape(label)}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"/></table>`;

/** Bảng chéo thành lưới phẳng: cột đầu là nhãn hàng, cột cuối là tổng dòng. */
function pivotTable(report: FullReportExport): ReportTable {
  const pivot = report.pivot!;
  const format = pivot.numFmt ?? '#,##0';
  const columns: ReportExportColumn[] = [
    { label: pivot.rowLabel },
    ...pivot.columns.map(label => ({ label, kind: 'number' as const, numFmt: format })),
    { label: 'Tổng', kind: 'number' as const, numFmt: format },
  ];
  return {
    sheetName: 'Bảng chéo',
    tableName: 'BangCheo',
    columns,
    rows: pivot.rows.map(row => [row.label, ...row.values, row.total]),
    totals: pivot.totals ? ['Tổng cộng', ...pivot.totals, pivot.grandTotal ?? pivot.totals.reduce((sum, value) => sum + value, 0)] : undefined,
  };
}

export async function renderReportXlsx(report: FullReportExport): Promise<Buffer> {
  const title = report.title?.trim() || (report.section === 'detail' ? 'Danh sách hồ sơ chi tiết' : `Báo cáo theo ${report.groupLabel}`);
  const styles = new StyleBook();

  const main: ReportTable = report.section === 'detail'
    ? { sheetName: 'Dữ liệu chi tiết', tableName: 'DuLieuChiTiet', columns: report.detailColumns, rows: report.detailRows }
    : report.pivot
      ? pivotTable(report)
      : {
        sheetName: 'Báo cáo',
        tableName: 'BaoCao',
        columns: report.groupColumns,
        rows: report.groupValues ?? report.groupRows,
        tones: report.groupTones,
        totals: report.groupTotals,
      };

  const sheets: SheetOutput[] = [
    buildReportSheet(report, { ...main, sheetName: sanitizeSheetName(main.sheetName) }, styles, title),
    buildInfoSheet(report, title, styles),
  ];

  const tableSheets = sheets.map((sheet, index) => ({ sheet, sheetIndex: index + 1 })).filter(entry => entry.sheet.table);
  const createdAt = report.generatedAt;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${tableSheets.map((_, index) => `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join('')}</Types>`);
  zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.folder('docProps')!.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(report.generatedBy || 'Audit BGS')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(createdAt)}</dcterms:created></cp:coreProperties>`);

  const printTitles = sheets
    .map((sheet, index) => sheet.printTitles ? `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${sheet.name.replaceAll("'", "''")}'!$${HEADER_ROW}:$${HEADER_ROW}</definedName>` : '')
    .join('');
  const xl = zip.folder('xl')!;
  xl.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>${printTitles ? `<definedNames>${printTitles}</definedNames>` : ''}<calcPr calcId="191029"/></workbook>`);
  xl.folder('_rels')!.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  xl.file('styles.xml', styles.xml());

  const worksheets = xl.folder('worksheets')!;
  sheets.forEach((sheet, index) => worksheets.file(`sheet${index + 1}.xml`, sheet.xml));
  const sheetRels = worksheets.folder('_rels')!;
  const tables = xl.folder('tables')!;
  tableSheets.forEach((entry, tableIndex) => {
    const id = tableIndex + 1;
    sheetRels.file(`sheet${entry.sheetIndex}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${id}.xml"/></Relationships>`);
    tables.file(`table${id}.xml`, tableXml(id, entry.sheet.table!));
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

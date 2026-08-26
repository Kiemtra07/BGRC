import JSZip from 'jszip';

export type ReportExportValue = string | number | boolean | null | undefined;

export interface ReportExportColumn {
  label: string;
  kind?: 'text' | 'number' | 'date' | 'boolean';
}

export interface FullReportExport {
  generatedAt: string;
  filters: string[];
  summary: Array<{ label: string; value: ReportExportValue }>;
  groupLabel: string;
  groupColumns: ReportExportColumn[];
  groupRows: ReportExportValue[][];
  detailColumns: ReportExportColumn[];
  detailRows: ReportExportValue[][];
}

const xmlEscape = (value: ReportExportValue): string => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const htmlValue = (value: ReportExportValue): string => {
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return String(value ?? '');
};

export function renderReportHtml(report: FullReportExport): string {
  const renderTable = (columns: ReportExportColumn[], rows: ReportExportValue[][]) => `
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map(column => `<th>${xmlEscape(column.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length > 0
          ? rows.map(row => `<tr>${row.map((value, index) => `<td class="${columns[index]?.kind === 'number' ? 'number' : ''}">${xmlEscape(htmlValue(value))}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}">Không có dữ liệu phù hợp.</td></tr>`}</tbody>
      </table>
    </div>`;

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Báo cáo Audit BGS</title>
  <style>
    :root{color-scheme:light;--brand:#006b68;--brand-dark:#00504e;--ink:#172033;--muted:#64748b;--line:#dbe3ea;--soft:#f3f8f7}
    *{box-sizing:border-box}body{margin:0;background:#eef3f3;color:var(--ink);font:14px/1.5 Arial,"Helvetica Neue",sans-serif}
    main{width:min(1180px,calc(100% - 32px));margin:28px auto;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,80,78,.10);overflow:hidden}
    header{padding:30px 34px;background:var(--brand);color:#fff}header p{margin:6px 0 0;color:#d8f3f1}h1{margin:0;font-size:26px;letter-spacing:-.02em}
    section{padding:24px 34px;border-bottom:1px solid var(--line)}h2{margin:0 0 14px;font-size:17px}h3{margin:22px 0 10px;font-size:14px;color:var(--brand-dark)}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.tag{border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:5px 9px;font-size:12px}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.metric{padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}
    .metric span{display:block;color:var(--muted);font-size:12px}.metric strong{display:block;margin-top:5px;color:var(--brand-dark);font-size:20px;font-variant-numeric:tabular-nums}
    .filters{margin:0;padding-left:20px;color:#475569}.filters li+li{margin-top:5px}.table-wrap{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:12px}
    table{width:100%;border-collapse:collapse;white-space:nowrap}th{position:sticky;top:0;background:var(--brand);color:#fff;text-align:left;font-size:12px}th,td{padding:10px 12px;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:#f8fafc}tbody tr:hover{background:#ecf7f6}.number{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
    footer{padding:16px 34px;color:var(--muted);font-size:11px;background:#f8fafc}
    @media(max-width:640px){main{width:100%;margin:0;border-radius:0}header,section,footer{padding-left:18px;padding-right:18px}.metrics{grid-template-columns:1fr 1fr}}
    @media print{body{background:#fff}main{width:100%;margin:0;box-shadow:none;border-radius:0}.table-wrap{overflow:visible}th{position:static}section{break-inside:avoid}.details{break-inside:auto}}
  </style>
</head>
<body><main>
  <header><h1>Báo cáo Audit BGS</h1><p>Báo cáo tổng hợp và dữ liệu chi tiết theo phạm vi được cấp.</p><div class="meta"><span class="tag">Thời điểm xuất: ${xmlEscape(new Date(report.generatedAt).toLocaleString('vi-VN'))}</span><span class="tag">${report.detailRows.length} dòng chi tiết</span></div></header>
  <section><h2>Tổng quan</h2><div class="metrics">${report.summary.map(item => `<div class="metric"><span>${xmlEscape(item.label)}</span><strong>${xmlEscape(htmlValue(item.value))}</strong></div>`).join('')}</div>
    <h3>Điều kiện áp dụng</h3><ul class="filters">${(report.filters.length ? report.filters : ['Không có điều kiện lọc']).map(item => `<li>${xmlEscape(item)}</li>`).join('')}</ul></section>
  <section><h2>Phân tích theo ${xmlEscape(report.groupLabel)}</h2>${renderTable(report.groupColumns, report.groupRows)}</section>
  <section class="details"><h2>Dữ liệu chi tiết</h2>${renderTable(report.detailColumns, report.detailRows)}</section>
  <footer>Audit BGS | Tệp độc lập, có thể lưu trữ hoặc in trực tiếp.</footer>
</main></body></html>`;
}

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

const xlsxCell = (value: ReportExportValue, row: number, column: number, style: number): string => {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
  const display = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(display)}</t></is></c>`;
};

const columnWidths = (columns: ReportExportColumn[], rows: ReportExportValue[][]): string => columns.map((column, index) => {
  const widest = Math.max(column.label.length, ...rows.slice(0, 250).map(row => String(row[index] ?? '').length));
  return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(12, widest + 2))}" customWidth="1"/>`;
}).join('');

const tableSheet = (columns: ReportExportColumn[], sourceRows: ReportExportValue[][], tableRelId: string): string => {
  const rows = sourceRows.length > 0 ? sourceRows : [['Không có dữ liệu', ...columns.slice(1).map(() => '')]];
  // The header cells must repeat the table's column names verbatim or Excel flags a mismatch.
  const headerNames = uniqueColumnNames(columns);
  const header = `<row r="1" ht="26" customHeight="1">${headerNames.map((label, index) => xlsxCell(label, 1, index, 3)).join('')}</row>`;
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${columns.map((column, columnIndex) => xlsxCell(row[columnIndex], rowIndex + 2, columnIndex, column.kind === 'number' ? 5 : 4)).join('')}</row>`).join('');
  const end = `${columnName(columns.length - 1)}${rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/><cols>${columnWidths(columns, rows)}</cols><sheetData>${header}${body}</sheetData>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <tableParts count="1"><tablePart r:id="${tableRelId}"/></tableParts>
</worksheet>`;
};

const overviewSheet = (report: FullReportExport): string => {
  const data: Array<{ values: ReportExportValue[]; style: number; height?: number }> = [
    { values: ['BÁO CÁO AUDIT BGS', '', '', ''], style: 1, height: 30 },
    { values: ['Thời điểm xuất', new Date(report.generatedAt).toLocaleString('vi-VN'), 'Số dòng chi tiết', report.detailRows.length], style: 4 },
    { values: ['', '', '', ''], style: 0 },
    { values: ['TỔNG QUAN', '', '', ''], style: 2, height: 24 },
    ...report.summary.map(item => ({ values: [item.label, item.value, '', ''] as ReportExportValue[], style: 4 })),
    { values: ['', '', '', ''], style: 0 },
    { values: ['ĐIỀU KIỆN ÁP DỤNG', '', '', ''], style: 2, height: 24 },
    ...(report.filters.length ? report.filters : ['Không có điều kiện lọc']).map((filter, index) => ({ values: [`${index + 1}`, filter, '', ''] as ReportExportValue[], style: 4 })),
  ];
  const rows = data.map((item, index) => `<row r="${index + 1}"${item.height ? ` ht="${item.height}" customHeight="1"` : ''}>${item.values.map((value, column) => xlsxCell(value, index + 1, column, item.style)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D${data.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/></cols><sheetData>${rows}</sheetData><mergeCells count="3"><mergeCell ref="A1:D1"/><mergeCell ref="A4:D4"/><mergeCell ref="A${report.summary.length + 6}:D${report.summary.length + 6}"/></mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
};

/**
 * Excel requires every tableColumn/@name in a table to be non-empty and unique (case-insensitively).
 * A duplicate makes the workbook unopenable — it reports corruption and drops the table — so
 * disambiguate here rather than trusting whatever labels the report catalog was configured with.
 */
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

const tableXml = (id: number, name: string, columns: ReportExportColumn[], rowCount: number): string => {
  const end = `${columnName(columns.length - 1)}${Math.max(2, rowCount + 1)}`;
  const names = uniqueColumnNames(columns);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${name}" displayName="${name}" ref="A1:${end}" totalsRowShown="0"><autoFilter ref="A1:${end}"/><tableColumns count="${columns.length}">${names.map((columnLabel, index) => `<tableColumn id="${index + 1}" name="${xmlEscape(columnLabel)}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
};

export async function renderReportXlsx(report: FullReportExport): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/tables/table2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`);
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Tổng quan" sheetId="1" r:id="rId1"/><sheet name="Phân tích" sheetId="2" r:id="rId2"/><sheet name="Dữ liệu chi tiết" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029"/></workbook>`);
  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.folder('xl')!.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#\,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006B68"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F4F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2E8"/></left><right style="thin"><color rgb="FFD9E2E8"/></right><top style="thin"><color rgb="FFD9E2E8"/></top><bottom style="thin"><color rgb="FFD9E2E8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="1" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);
  const sheets = zip.folder('xl')!.folder('worksheets')!;
  sheets.file('sheet1.xml', overviewSheet(report));
  sheets.file('sheet2.xml', tableSheet(report.groupColumns, report.groupRows, 'rId1'));
  sheets.file('sheet3.xml', tableSheet(report.detailColumns, report.detailRows, 'rId1'));
  const sheetRels = sheets.folder('_rels')!;
  sheetRels.file('sheet2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>`);
  sheetRels.file('sheet3.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table2.xml"/></Relationships>`);
  const tables = zip.folder('xl')!.folder('tables')!;
  tables.file('table1.xml', tableXml(1, 'PhanTich', report.groupColumns, report.groupRows.length));
  tables.file('table2.xml', tableXml(2, 'DuLieuChiTiet', report.detailColumns, report.detailRows.length));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

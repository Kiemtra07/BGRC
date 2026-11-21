export type ReportExportValue = string | number | boolean | null | undefined;

export interface ReportExportColumn {
  label: string;
  kind?: 'text' | 'number' | 'date' | 'boolean';
  /** Mã định dạng số của Excel (ví dụ `#,##0.0`); chỉ dùng cho cột số. */
  numFmt?: string;
}

/** Mức tô màu của một ô vượt ngưỡng, cùng tên với ngưỡng người dùng đặt trên màn hình. */
export type ReportExportTone = 'risk' | 'warn' | 'ok';

/**
 * Bảng chéo đúng như trên màn hình. Trước đây mô hình xuất không có phần này, nên trường kéo vào
 * vùng "Cột" bị bỏ rơi trong lặng lẽ: tệp tải về vẫn là bảng một chiều, và người dùng không có cách
 * nào biết chiều thứ hai đã biến mất.
 */
export interface ReportExportPivot {
  rowLabel: string;
  columnLabel: string;
  metricLabel: string;
  columns: string[];
  rows: Array<{ label: string; values: number[]; total: number }>;
  numFmt?: string;
  /** Dòng tổng theo cột, chỉ có khi chỉ số cộng dồn được (đếm hồ sơ, tổng tiền). */
  totals?: number[];
  grandTotal?: number;
}

export interface FullReportExport {
  /** Tên báo cáo: tiêu đề người dùng đặt, hoặc tên mẫu đang xem, hoặc tên suy từ thiết kế. */
  title?: string;
  /** Tệp chứa bảng đang xem (`design`) hay dòng chi tiết (`detail`). */
  section: 'design' | 'detail';
  generatedAt: string;
  generatedBy?: string;
  /** Phạm vi dữ liệu của người xuất, viết cho người đọc. */
  scope?: string;
  matchedCount: number;
  filters: string[];
  summary: Array<{ label: string; value: ReportExportValue; numFmt?: string }>;
  groupLabel: string;
  groupColumns: ReportExportColumn[];
  /** Giá trị đã định dạng chữ, dùng cho CSV và HTML. */
  groupRows: ReportExportValue[][];
  /** Giá trị số thô cùng thứ tự với `groupRows`, để Excel ghi số thật. */
  groupValues?: ReportExportValue[][];
  groupTones?: Array<Array<ReportExportTone | undefined>>;
  /** Dòng tổng cộng tính trên toàn bộ hồ sơ phù hợp, cùng thứ tự cột với `groupColumns`. */
  groupTotals?: ReportExportValue[];
  /** Có mặt khi người dùng đã kéo một trường vào vùng Cột. */
  pivot?: ReportExportPivot;
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
  <title>${xmlEscape(report.title || 'Báo cáo Audit BGS')}</title>
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
  <header><h1>${xmlEscape(report.title || 'Báo cáo Audit BGS')}</h1><p>${report.section === 'detail' ? 'Dòng chi tiết từng hồ sơ' : 'Bảng đang xem'} theo phạm vi dữ liệu được cấp${report.scope ? `: ${xmlEscape(report.scope)}` : ''}.</p><div class="meta"><span class="tag">Thời điểm xuất: ${xmlEscape(new Date(report.generatedAt).toLocaleString('vi-VN'))}</span><span class="tag">${report.matchedCount} hồ sơ phù hợp</span>${report.generatedBy ? `<span class="tag">Người xuất: ${xmlEscape(report.generatedBy)}</span>` : ''}</div></header>
  <section><h2>Tổng quan</h2><div class="metrics">${report.summary.map(item => `<div class="metric"><span>${xmlEscape(item.label)}</span><strong>${xmlEscape(htmlValue(item.value))}</strong></div>`).join('')}</div>
    <h3>Điều kiện áp dụng</h3><ul class="filters">${(report.filters.length ? report.filters : ['Không có điều kiện lọc']).map(item => `<li>${xmlEscape(item)}</li>`).join('')}</ul></section>
  ${report.section === 'detail' ? '' : `<section><h2>Phân tích theo ${xmlEscape(report.groupLabel)}</h2>${renderTable(report.groupColumns, report.groupRows)}</section>`}
  ${report.section !== 'detail' && report.pivot ? `<section><h2>Bảng chéo: ${xmlEscape(report.pivot.rowLabel)} × ${xmlEscape(report.pivot.columnLabel)}</h2>
    <p style="margin:0 0 12px;color:var(--muted);font-size:12px">Chỉ số: ${xmlEscape(report.pivot.metricLabel)}</p>
    ${renderTable(
    [{ label: report.pivot.rowLabel }, ...report.pivot.columns.map(label => ({ label, kind: 'number' as const })), { label: 'Tổng', kind: 'number' as const }],
    report.pivot.rows.map(row => [row.label, ...row.values, row.total]),
  )}</section>` : ''}
  ${report.section === 'detail' ? `<section class="details"><h2>Dữ liệu chi tiết</h2>${renderTable(report.detailColumns, report.detailRows)}</section>` : ''}
  <footer>Audit BGS | Tệp độc lập, có thể lưu trữ hoặc in trực tiếp.</footer>
</main></body></html>`;
}

export { renderReportXlsx } from './report-xlsx';

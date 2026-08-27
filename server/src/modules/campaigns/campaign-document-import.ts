import JSZip from 'jszip';
import { readSheet } from 'read-excel-file/node';
import { CampaignDocumentKind, CampaignImportDraft } from '../../../../shared/contracts';

export class CampaignDocumentImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignDocumentImportError';
  }
}

type DraftFields = CampaignImportDraft['draft'];

const labels: Record<keyof DraftFields, string[]> = {
  code: ['mã chuyên đề', 'mã kế hoạch', 'mã ct'],
  name: ['tên chuyên đề', 'chuyên đề kiểm tra', 'tên kế hoạch'],
  description: ['mô tả', 'nội dung kiểm tra', 'phạm vi kiểm tra'],
  decisionNo: ['số quyết định', 'quyết định', 'số qđ'],
  startDate: ['từ ngày', 'ngày bắt đầu', 'thời gian bắt đầu'],
  endDate: ['đến ngày', 'ngày kết thúc', 'thời gian kết thúc'],
};

function documentKind(fileName: string): CampaignDocumentKind {
  const extension = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === 'docx') return 'DOCX';
  if (extension === 'pdf') return 'PDF';
  if (extension === 'xlsx' || extension === 'xls') return 'EXCEL';
  throw new CampaignDocumentImportError('Chỉ hỗ trợ tệp DOCX, PDF hoặc Excel (.xlsx, .xls).');
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\r/g, '').trim();
}

function normalizeLabel(value: string): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

function toIsoDate(value: string | number | Date | undefined): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = cleanText(String(value ?? ''));
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const vietnamese = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (vietnamese) return `${vietnamese[3]}-${vietnamese[2].padStart(2, '0')}-${vietnamese[1].padStart(2, '0')}`;
  return undefined;
}

function textDraft(lines: string[]): DraftFields {
  const draft: DraftFields = {};
  for (const [field, fieldLabels] of Object.entries(labels) as Array<[keyof DraftFields, string[]]>) {
    const found = lines.find(line => {
      const normalized = normalizeLabel(line);
      return fieldLabels.some(label => normalized.startsWith(normalizeLabel(label)));
    });
    if (!found) continue;
    const value = cleanText(found.replace(/^.*?(?::|–|-)/, ''));
    if (!value || value === cleanText(found)) continue;
    if (field === 'startDate' || field === 'endDate') {
      const date = toIsoDate(value);
      if (date) draft[field] = date;
    } else {
      draft[field] = value;
    }
  }
  if (!draft.name) {
    const heading = lines.find(line => /^chuyên đề(?: kiểm tra)?\b/i.test(line));
    if (heading) draft.name = cleanText(heading.replace(/^chuyên đề(?: kiểm tra)?\s*[:\-–]?\s*/i, '')) || heading;
  }
  return draft;
}

function warningsFor(draft: DraftFields): string[] {
  const missing = [
    ['code', 'mã chuyên đề'],
    ['name', 'tên chuyên đề'],
    ['decisionNo', 'số quyết định'],
    ['startDate', 'ngày bắt đầu'],
    ['endDate', 'ngày kết thúc'],
  ].filter(([key]) => !draft[key as keyof DraftFields]).map(([, label]) => label);
  return [
    ...(missing.length ? [`Chưa trích xuất được ${missing.join(', ')}; hãy bổ sung trước khi lưu.`] : []),
    'Trưởng đoàn, thành viên, chi nhánh và loại báo cáo không tự suy diễn từ tệp; quản trị viên phải chọn trước khi lưu.',
  ];
}

async function extractDocxLines(buffer: Buffer): Promise<string[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new CampaignDocumentImportError('Tệp DOCX không hợp lệ hoặc không thể mở.');
  }
  const source = zip.file('word/document.xml');
  if (!source) throw new CampaignDocumentImportError('Tệp DOCX không có nội dung văn bản để trích xuất.');
  const xml = await source.async('string');
  return (xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [])
    .map(paragraph => cleanText(decodeXml(paragraph
      .replace(/<w:tab\s*\/>/g, ' ')
      .replace(/<w:t[^>]*>/g, '')
      .replace(/<\/w:t>/g, '')
      .replace(/<[^>]+>/g, ' '))))
    .filter(Boolean);
}

async function extractPdfLines(buffer: Buffer): Promise<string[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const content = await (await document.getPage(index + 1)).getTextContent();
      return content.items.map(item => 'str' in item ? item.str : '').join(' ');
    }));
    return pages.map(cleanText).filter(Boolean);
  } catch {
    throw new CampaignDocumentImportError('Không thể đọc văn bản trong PDF. Nếu đây là bản scan, hãy dùng PDF có OCR hoặc nhập thủ công.');
  }
}

async function extractExcelDraft(buffer: Buffer): Promise<DraftFields> {
  let rows: Array<Array<string | number | Date | null>>;
  try {
    rows = await readSheet(buffer) as Array<Array<string | number | Date | null>>;
  } catch {
    throw new CampaignDocumentImportError('Tệp Excel không hợp lệ hoặc không thể đọc.');
  }
  const headerIndex = rows.findIndex(row => row.some(cell => labels.name.some(label => normalizeLabel(String(cell ?? '')).includes(normalizeLabel(label)))));
  if (headerIndex < 0) throw new CampaignDocumentImportError('Không tìm thấy dòng tiêu đề Excel cho chuyên đề.');
  const headers = rows[headerIndex].map(cell => normalizeLabel(String(cell ?? '')));
  const values = rows.slice(headerIndex + 1).find(row => row.some(cell => cleanText(String(cell ?? ''))));
  if (!values) throw new CampaignDocumentImportError('Excel chưa có dòng dữ liệu chuyên đề để trích xuất.');
  const draft: DraftFields = {};
  for (const [field, fieldLabels] of Object.entries(labels) as Array<[keyof DraftFields, string[]]>) {
    const column = headers.findIndex(header => fieldLabels.some(label => header.includes(normalizeLabel(label))));
    if (column < 0) continue;
    const value = values[column];
    if (value === null || value === undefined || cleanText(String(value)) === '') continue;
    if (field === 'startDate' || field === 'endDate') {
      const date = toIsoDate(value);
      if (date) draft[field] = date;
    } else {
      draft[field] = cleanText(String(value));
    }
  }
  return draft;
}

export async function extractCampaignImportDraft(fileName: string, buffer: Buffer): Promise<CampaignImportDraft> {
  if (!buffer.length) throw new CampaignDocumentImportError('Tệp tải lên đang trống.');
  const kind = documentKind(fileName);
  const draft = kind === 'EXCEL'
    ? await extractExcelDraft(buffer)
    : textDraft(kind === 'DOCX' ? await extractDocxLines(buffer) : await extractPdfLines(buffer));
  return { source: { fileName, kind }, draft, warnings: warningsFor(draft) };
}

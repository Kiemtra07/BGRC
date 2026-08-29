import JSZip from 'jszip';

export interface FindingDocumentRow {
  rowNumber: number;
  cif: string;
  customerName: string;
  branchCode: string;
  branchName: string;
  errorCode: string;
  errorTitle: string;
  description: string;
  department?: string;
  decisionNo?: string;
}

export class FindingDocumentImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FindingDocumentImportError';
  }
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_PDF_PAGES = 100;
const MAX_EXTRACTED_TEXT_BYTES = 5 * 1024 * 1024;

function assertUploadSize(buffer: Buffer): void {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new FindingDocumentImportError('Tệp tải lên vượt quá giới hạn 25 MB.');
}

function assertSafeZip(zip: JSZip): void {
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) throw new FindingDocumentImportError('Tệp nén chứa quá nhiều mục dữ liệu.');
  let totalUncompressed = 0;
  for (const entry of entries) {
    const item = entry as unknown as { dir?: boolean; _data?: { compressedSize?: number; uncompressedSize?: number } };
    const metadata = item._data;
    const compressed = metadata?.compressedSize ?? 0;
    const uncompressed = metadata?.uncompressedSize ?? 0;
    totalUncompressed += uncompressed;
    if (!item.dir && compressed > 0 && uncompressed / compressed > MAX_ZIP_COMPRESSION_RATIO) {
      throw new FindingDocumentImportError('Tệp nén có tỷ lệ giải nén bất thường.');
    }
  }
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) throw new FindingDocumentImportError('Nội dung giải nén vượt quá giới hạn an toàn.');
}

const decodeXml = (value: string): string => value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const cellText = (xml: string): string => decodeXml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map(match => match[1]).join(' ')).replace(/\s+/g, ' ').trim();

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const aliases: Record<string, string[]> = {
  cif: ['cif', 'ma kh', 'ma khach hang'],
  customerName: ['ten khach hang', 'ten kh'],
  branchCode: ['ma chi nhanh', 'ma cn'],
  branchName: ['ten chi nhanh', 'chi nhanh'],
  department: ['phong pgd', 'phong', 'pgd'],
  decisionNo: ['so quyet dinh', 'quyet dinh', 'so qd'],
  errorCode: ['ma sai sot', 'ma loi', 'ma ss'],
  errorTitle: ['ten sai sot', 'noi dung sai sot', 'tieu de'],
  description: ['mo ta chi tiet', 'chi tiet sai sot', 'mo ta'],
};

export async function parseFindingDocx(buffer: Buffer): Promise<FindingDocumentRow[]> {
  assertUploadSize(buffer);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new FindingDocumentImportError('Tệp DOCX không hợp lệ hoặc không thể mở.');
  }
  assertSafeZip(zip);
  const document = zip.file('word/document.xml');
  if (!document) throw new FindingDocumentImportError('Tệp DOCX không có nội dung để bóc tách.');
  const xml = await document.async('string');
  if (Buffer.byteLength(xml, 'utf8') > MAX_EXTRACTED_TEXT_BYTES) throw new FindingDocumentImportError('Văn bản DOCX vượt quá giới hạn trích xuất.');
  const tables = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? [];
  for (const table of tables) {
    const rows = (table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [])
      .map(row => (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map(cellText));
    if (rows.length < 2) continue;
    const headers = rows[0].map(normalize);
    const column = (key: string): number => headers.findIndex(header => aliases[key].some(alias => header === alias || header.includes(alias)));
    const columns = Object.fromEntries(Object.keys(aliases).map(key => [key, column(key)])) as Record<string, number>;
    if (columns.cif < 0 || columns.customerName < 0 || columns.branchCode < 0 || columns.errorCode < 0) continue;
    const parsed: FindingDocumentRow[] = [];
    rows.slice(1).forEach((row, rowIndex) => {
      const at = (key: string): string => columns[key] < 0 ? '' : (row[columns[key]] || '').trim();
      const cif = at('cif').replace(/\s+/g, '');
      const customerName = at('customerName');
      const branchCode = at('branchCode').replace(/^[A-Z](?=\d)/i, '');
      const codes = at('errorCode').split(/[,;\n]+/).map(code => code.trim().toUpperCase()).filter(Boolean);
      if (!cif || !customerName || !branchCode || !codes.length) return;
      codes.forEach(errorCode => parsed.push({
        rowNumber: rowIndex + 2,
        cif,
        customerName,
        branchCode,
        branchName: at('branchName') || `Chi nhánh ${branchCode}`,
        department: at('department') || undefined,
        decisionNo: at('decisionNo') || undefined,
        errorCode,
        errorTitle: at('errorTitle') || `Sai sót ${errorCode}`,
        description: at('description') || at('errorTitle') || `Sai sót ${errorCode} được trích xuất từ DOCX.`,
      }));
    });
    if (parsed.length) return parsed;
  }
  throw new FindingDocumentImportError('Không tìm thấy bảng DOCX có đủ cột Tên khách hàng, CIF, Mã chi nhánh và Mã sai sót.');
}

/**
 * Extract the common text layout emitted by OCR-enabled tiểu biên bản PDFs. PDF is intentionally
 * parsed on the server so the browser never needs to ship a second PDF parser; scanned, image-only
 * PDFs return a clear validation error and can still be uploaded as evidence after manual entry.
 */
export async function parseFindingPdf(buffer: Buffer): Promise<FindingDocumentRow[]> {
  assertUploadSize(buffer);
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    if (document.numPages > MAX_PDF_PAGES) throw new FindingDocumentImportError('PDF vượt quá giới hạn 100 trang.');
    let extractedBytes = 0;
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      const text = cleanPdfText(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      extractedBytes += Buffer.byteLength(text, 'utf8');
      if (extractedBytes > MAX_EXTRACTED_TEXT_BYTES) throw new FindingDocumentImportError('Văn bản PDF vượt quá giới hạn trích xuất.');
      return text;
    }));
    const text = pages.filter(Boolean).join('\n');
    const rows: FindingDocumentRow[] = [];
    const segments = text.split(/(?=(?:CIF|Mã\s*KH)\s*[:#-]?\s*[A-Z0-9.-]{3,20})/i).filter(Boolean);
    segments.forEach((segment, segmentIndex) => {
      const cifMatch = segment.match(/(?:CIF|Mã\s*KH)\s*[:#-]?\s*([A-Z0-9.-]{3,20})/i);
      if (!cifMatch) return;
      const cif = cifMatch[1].replace(/\s+/g, '');
      const customerName = segment.slice(0, segment.indexOf(cifMatch[0])).replace(/^.*?[:：]\s*/, '').trim() || `Khách hàng ${cif}`;
      const branch = segment.match(/(?:Mã\s*chi\s*nhánh|Mã\s*CN)\s*[:#-]?\s*([A-Z]?\d{3,4})/i)?.[1]?.replace(/^[A-Z](?=\d)/i, '');
      if (!branch) return;
      const branchName = segment.match(/Tên\s*chi\s*nhánh\s*[:：-]?\s*([^\n]+?)(?=\s+(?:Mã\s*chi|CIF|Mã\s*KH)\b|$)/i)?.[1]?.trim();
      const decisionNo = segment.match(/(?:Số\s*quyết\s*định|Quyết\s*định|Số\s*QĐ)\s*[:：-]?\s*([^\n]+?)(?=\s+(?:Mã\s*chi|CIF|Mã\s*KH)\b|$)/i)?.[1]?.trim();
      const codes = [...segment.matchAll(/\b((?:TD|PNTD)\d{2}(?:\.\d{2})?)\b/gi)];
      codes.forEach((match, codeIndex) => {
        const code = match[1].toUpperCase();
        const nextCodeAt = codes[codeIndex + 1]?.index ?? segment.length;
        const detail = cleanPdfText(segment.slice((match.index ?? 0) + match[0].length, nextCodeAt)).replace(/^\s*[-:–]\s*/, '').trim();
        rows.push({
          rowNumber: segmentIndex + 1,
          cif,
          customerName,
          branchCode: branch,
          branchName: branchName || `Chi nhánh ${branch}`,
          decisionNo,
          errorCode: code,
          errorTitle: detail.split(/[.;]/)[0]?.trim() || `Sai sót ${code}`,
          description: detail || `Sai sót ${code} được trích xuất từ PDF.`,
        });
      });
    });
    if (!rows.length) throw new FindingDocumentImportError('Không tìm thấy dữ liệu CIF, mã chi nhánh và mã sai sót trong PDF. Nếu đây là bản scan, hãy dùng PDF có OCR hoặc nhập thủ công.');
    return rows;
  } catch (error) {
    if (error instanceof FindingDocumentImportError) throw error;
    throw new FindingDocumentImportError('Không thể đọc văn bản trong PDF. Nếu đây là bản scan, hãy dùng PDF có OCR hoặc nhập thủ công.');
  }
}

const cleanPdfText = (value: string): string => value.replace(/\s+/g, ' ').trim();

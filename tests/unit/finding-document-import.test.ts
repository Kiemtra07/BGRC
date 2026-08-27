import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { FindingDocumentImportError, parseFindingDocx } from '../../server/src/modules/ingestion/finding-document-import';

const cell = (value: string) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
const row = (...values: string[]) => `<w:tr>${values.map(cell).join('')}</w:tr>`;

async function docx(...rows: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="x"><w:body><w:tbl>${rows.join('')}</w:tbl></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('parseFindingDocx', () => {
  it('extracts a structured table and expands multiple error codes', async () => {
    const result = await parseFindingDocx(await docx(
      row('Tên khách hàng', 'CIF', 'Mã chi nhánh', 'Tên chi nhánh', 'Mã sai sót', 'Mô tả chi tiết'),
      row('Khách hàng DOCX', '12345678', 'B635', 'Chi nhánh Nam Buôn Hồ', 'TD01.01; TD03.07', 'Mô tả từ Word'),
    ));
    expect(result).toHaveLength(2);
    expect(result.map(item => item.errorCode)).toEqual(['TD01.01', 'TD03.07']);
    expect(result[0]).toMatchObject({ branchCode: '635', customerName: 'Khách hàng DOCX', rowNumber: 2 });
  });

  it('fails closed when no supported table exists', async () => {
    await expect(parseFindingDocx(await docx(row('Nội dung tự do'), row('Không có cấu trúc')))).rejects.toBeInstanceOf(FindingDocumentImportError);
  });
});

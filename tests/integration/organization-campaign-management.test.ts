import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

function multipartFile(fileName: string, mimeType: string, file: Buffer): { body: Buffer; headers: Record<string, string> } {
  const boundary = '----audit-bgs-campaign-import';
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8');
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([prefix, file, suffix]),
    headers: { ...adminHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function makeCampaignDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:r><w:t>Mã chuyên đề: CD-NHAP-2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tên chuyên đề: Kiểm tra hồ sơ tín dụng</w:t></w:r></w:p>
    <w:p><w:r><w:t>Số quyết định: 25/QĐ-KTNB</w:t></w:r></w:p>
    <w:p><w:r><w:t>Từ ngày: 01/09/2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>Đến ngày: 30/09/2026</w:t></w:r></w:p>
  </w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

async function makeCampaignXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Chuyên đề" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Mã chuyên đề</t></is></c><c r="B1" t="inlineStr"><is><t>Tên chuyên đề</t></is></c><c r="C1" t="inlineStr"><is><t>Số quyết định</t></is></c><c r="D1" t="inlineStr"><is><t>Từ ngày</t></is></c><c r="E1" t="inlineStr"><is><t>Đến ngày</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>CD-EXCEL-2026</t></is></c><c r="B2" t="inlineStr"><is><t>Kiểm tra từ Excel</t></is></c><c r="C2" t="inlineStr"><is><t>27/QĐ-KTNB</t></is></c><c r="D2" t="inlineStr"><is><t>01/11/2026</t></is></c><c r="E2" t="inlineStr"><is><t>30/11/2026</t></is></c></row></sheetData></worksheet>`);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

describe('organization and campaign administration APIs', () => {
  it('edits and deletes an unused organization unit while protecting the hierarchy', async () => {
    const existing = await app.inject({ method: 'GET', url: '/api/v1/admin/org-units', headers: adminHeaders });
    const headOffice = existing.json().find((unit: { type: string }) => unit.type === 'HEAD_OFFICE');
    expect(headOffice).toBeDefined();

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/org-units',
      headers: adminHeaders,
      payload: { code: 'CUM-CRUD-TEST', name: 'Cụm thử nghiệm CRUD', type: 'CLUSTER', parentId: headOffice.id, isActive: true },
    });
    expect(created.statusCode).toBe(200);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/org-units/${created.json().id}`,
      headers: adminHeaders,
      payload: { name: 'Cụm đã cập nhật', expectedUpdatedAt: created.json().updatedAt },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Cụm đã cập nhật' });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/admin/org-units/${created.json().id}`, headers: adminHeaders });
    expect(deleted.statusCode).toBe(204);
  });

  it('returns a reviewable campaign draft from a DOCX upload without creating a campaign', async () => {
    const source = await makeCampaignDocx();
    const upload = multipartFile('ke-hoach-kiem-tra.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source);
    const imported = await app.inject({ method: 'POST', url: '/api/v1/admin/campaigns/import-draft', ...upload });

    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({
      source: { fileName: 'ke-hoach-kiem-tra.docx', kind: 'DOCX' },
      draft: {
        code: 'CD-NHAP-2026',
        name: 'Kiểm tra hồ sơ tín dụng',
        decisionNo: '25/QĐ-KTNB',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      },
    });

    const campaigns = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: adminHeaders });
    expect(campaigns.json().some((campaign: { code: string }) => campaign.code === 'CD-NHAP-2026')).toBe(false);
  });

  it('extracts the first campaign row from an Excel upload', async () => {
    const upload = multipartFile('danh-sach-chuyen-de.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await makeCampaignXlsx());
    const imported = await app.inject({ method: 'POST', url: '/api/v1/admin/campaigns/import-draft', ...upload });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({
      source: { kind: 'EXCEL' },
      draft: { code: 'CD-EXCEL-2026', name: 'Kiểm tra từ Excel', decisionNo: '27/QĐ-KTNB', startDate: '2026-11-01', endDate: '2026-11-30' },
    });
  });

  it('deletes a draft campaign only when it has no findings', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/campaigns',
      headers: adminHeaders,
      payload: {
        code: 'CD-XOA-TEST', name: 'Chuyên đề xóa thử', decisionNo: '26/QĐ-KTNB',
        startDate: '2026-10-01', endDate: '2026-10-31', leadUserId: 'user-internal-supervisor',
        members: [{ userId: 'user-internal-supervisor', memberRole: 'LEAD', assignedBranchCodes: ['635'] }],
        branchCodes: ['635'], reportChannelIds: ['chan-audit-bgs'],
      },
    });
    expect(created.statusCode).toBe(201);

    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/admin/campaigns/${created.json().id}`, headers: adminHeaders });
    expect(deleted.statusCode).toBe(204);
  });
});

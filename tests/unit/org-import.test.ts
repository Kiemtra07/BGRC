import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOrgImportFile, parseOrgImportRows } from '../../src/lib/org-import';

describe('organization bulk import parser', () => {
  it('accepts hierarchy rows and resolves Vietnamese headers', () => {
    const rows = [
      ['Mã đơn vị', 'Tên đơn vị', 'Loại đơn vị', 'Mã đơn vị cha', 'Trạng thái'],
      ['01', 'Cụm miền Bắc', 'CLUSTER', 'HO_AUDIT', 'ACTIVE'],
      ['0101', 'Chi nhánh mẫu', 'BRANCH', '01', 'ACTIVE'],
    ];
    const result = parseOrgImportRows(rows, [{ id: 'org-ho', code: 'HO_AUDIT', name: 'Hội sở', type: 'HEAD_OFFICE', isActive: true, createdAt: '', updatedAt: '' }]);
    expect(result).toHaveLength(2);
    expect(result.every(row => row.errors.length === 0)).toBe(true);
    expect(result[1].payload?.parentId).toBe('01');
  });

  it('ships the CSV template with a UTF-8 BOM for Excel', () => {
    const bytes = readFileSync('public/templates/mau-nhap-don-vi.csv');

    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it('accepts semicolon-delimited CSV exported by Vietnamese Excel', async () => {
    const file = new File([
      '\uFEFFMã đơn vị;Tên đơn vị;Loại đơn vị;Mã đơn vị cha;Trạng thái\n1;Cụm demo;CLUSTER;HO_AUDIT;ACTIVE\n969;Chi Nhánh Fdi I;BRANCH;1;ACTIVE',
    ], 'mau-nhap-don-vi (1).csv', { type: 'text/csv' });

    const result = await parseOrgImportFile(file, []);

    expect(result).toHaveLength(2);
    expect(result.every(row => row.errors.length === 0)).toBe(true);
    expect(result.map(row => row.payload?.code)).toEqual(['1', '969']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseOrgImportRows } from '../../src/lib/org-import';

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
});

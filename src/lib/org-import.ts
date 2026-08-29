import readXlsxFile from 'read-excel-file/browser';
import { CreateOrgUnitSchema, type CreateOrgUnitDTO, type OrgUnit } from '../../shared/contracts';

export interface OrgImportPreviewRow {
  rowNumber: number;
  payload?: CreateOrgUnitDTO;
  errors: string[];
}

const normalize = (value: unknown): string => String(value ?? '').trim();
const headerKey = (value: unknown): string => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases: Record<string, string[]> = {
  code: ['ma don vi', 'ma', 'code'], name: ['ten don vi', 'ten', 'name'], type: ['loai don vi', 'loai', 'type'], parent: ['ma don vi cha', 'don vi cha', 'parent', 'parent code'], status: ['trang thai', 'status'],
};

const parseCsvLine = (line: string, delimiter: ',' | ';'): string[] => {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

export function parseOrgImportRows(rows: unknown[][], existingUnits: OrgUnit[]): OrgImportPreviewRow[] {
  if (!rows.length) return [];
  const headers = rows[0].map(headerKey);
  const column = (key: string) => headers.findIndex(header => aliases[key].includes(header));
  const columns = Object.fromEntries(Object.keys(aliases).map(key => [key, column(key)])) as Record<string, number>;
  if (columns.code < 0 || columns.name < 0 || columns.type < 0) return [{ rowNumber: 1, errors: ['Thiếu cột bắt buộc: Mã đơn vị, Tên đơn vị, Loại đơn vị.'] }];
  const seen = new Set(existingUnits.map(unit => unit.code.toLocaleLowerCase('vi-VN')));
  return rows.slice(1).map((row, index) => {
    const at = (key: string) => columns[key] < 0 ? '' : normalize(row[columns[key]]);
    const type = at('type').toUpperCase().replace(/\s+/g, '_') as CreateOrgUnitDTO['type'];
    const code = at('code');
    const payload = CreateOrgUnitSchema.safeParse({ code, name: at('name'), type, parentId: at('parent') || undefined, isActive: !['INACTIVE', 'NGUNG HOAT DONG', 'TAM KHOA'].includes(at('status').toUpperCase()) });
    const errors = payload.success ? [] : payload.error.issues.map(issue => issue.message);
    if (seen.has(code.toLocaleLowerCase('vi-VN'))) errors.push('Mã đơn vị đã tồn tại hoặc bị trùng trong lô.');
    if (payload.success && payload.data.type === 'HEAD_OFFICE') errors.push('Không nhập thêm HEAD_OFFICE; Hội sở đã được hệ thống khởi tạo.');
    seen.add(code.toLocaleLowerCase('vi-VN'));
    return { rowNumber: index + 2, payload: payload.success && !errors.length ? payload.data : undefined, errors };
  }).filter(row => row.payload || row.errors.length);
}

export async function parseOrgImportFile(file: File, existingUnits: OrgUnit[]): Promise<OrgImportPreviewRow[]> {
  if (file.name.toLocaleLowerCase().endsWith('.csv')) {
    const content = await file.text();
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const delimiter: ',' | ';' = lines[0]?.includes(';') ? ';' : ',';
    const rows = lines.map(line => parseCsvLine(line, delimiter));
    return parseOrgImportRows(rows, existingUnits);
  }
  return parseOrgImportRows(await readXlsxFile(file) as unknown as unknown[][], existingUnits);
}

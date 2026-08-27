import readXlsxFile from 'read-excel-file/browser';
import { CreateUserSchema, type CreateUserDTO, type OrgUnit, type UserProfile, type UserRole } from '../../shared/contracts';

export interface UserImportPreviewRow {
  rowNumber: number;
  payload?: CreateUserDTO;
  passwordMode: 'PROVIDED' | 'GENERATED';
  errors: string[];
}

const normalize = (value: unknown): string => String(value ?? '').trim();
const headerKey = (value: unknown): string => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const aliases: Record<string, string[]> = {
  username: ['ten dang nhap', 'username'], fullName: ['ho va ten', 'ten nguoi dung'], email: ['email'], password: ['mat khau tam', 'mat khau'],
  portal: ['cong', 'portal'], primaryRole: ['vai tro chinh', 'vai tro'], additionalRoles: ['vai tro bo sung'],
  internalTeam: ['ma don vi nhom noi bo', 'ma nhom noi bo', 'nhom noi bo'], branchCode: ['ma chi nhanh', 'chi nhanh'],
  department: ['phong pgd', 'phong', 'pgd'], status: ['trang thai'],
};

export function parseUserImportRows(rows: unknown[][], existingUsers: UserProfile[], orgUnits: OrgUnit[]): UserImportPreviewRow[] {
  if (!rows.length) return [];
  const headers = rows[0].map(headerKey);
  const column = (key: string): number => headers.findIndex(header => aliases[key].some(alias => header === alias));
  const columns = Object.fromEntries(Object.keys(aliases).map(key => [key, column(key)])) as Record<string, number>;
  if (columns.fullName < 0 || columns.email < 0 || columns.portal < 0 || columns.primaryRole < 0) {
    return [{ rowNumber: 1, passwordMode: 'GENERATED', errors: ['Thiếu cột bắt buộc: Họ và tên, Email, Cổng hoặc Vai trò chính.'] }];
  }
  const seenEmails = new Set(existingUsers.map(user => user.email.toLowerCase()));
  const seenUsernames = new Set(existingUsers.map(user => user.username.toLowerCase()));
  return rows.slice(1).map((row, index) => {
    const at = (key: string): string => columns[key] < 0 ? '' : normalize(row[columns[key]]);
    const email = at('email').toLowerCase();
    const username = (at('username') || email.split('@')[0]).toLowerCase();
    const primaryRole = at('primaryRole').toUpperCase() as UserRole;
    const portal = at('portal').toUpperCase() as 'INTERNAL' | 'BRANCH';
    const internalTeam = orgUnits.find(unit => unit.type === 'INTERNAL_TEAM' && [unit.id, unit.code, unit.name].some(value => value.toLowerCase() === at('internalTeam').toLowerCase()));
    const roles = [...new Set([primaryRole, ...at('additionalRoles').split(/[,;]+/).map(role => role.trim().toUpperCase()).filter(Boolean) as UserRole[]])];
    const password = at('password') || undefined;
    const payload = {
      username, fullName: at('fullName'), email, password, portal, roles, primaryRole,
      internalTeamId: internalTeam?.id,
      teamRole: primaryRole === 'INTERNAL_APPROVER' ? 'LEAD' as const : primaryRole === 'INTERNAL_OFFICER' ? 'MEMBER' as const : undefined,
      branchCode: at('branchCode') || undefined,
      department: at('department') || undefined,
      isActive: !['INACTIVE', 'TAM KHOA', 'TẠM KHÓA'].includes(at('status').toUpperCase()),
    };
    const parsed = CreateUserSchema.safeParse(payload);
    const errors = parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
    if (seenEmails.has(email)) errors.push('Email đã tồn tại hoặc bị trùng trong lô.');
    if (seenUsernames.has(username)) errors.push('Tên đăng nhập đã tồn tại hoặc bị trùng trong lô.');
    seenEmails.add(email); seenUsernames.add(username);
    return { rowNumber: index + 2, payload: parsed.success ? parsed.data : undefined, passwordMode: password ? 'PROVIDED' as const : 'GENERATED' as const, errors };
  }).filter(row => row.payload || row.errors.length);
}

export function selectUserImportRows(workbookData: unknown): unknown[][] {
  if (!Array.isArray(workbookData)) return [];
  const sheetEntries = workbookData as Array<unknown>;
  const namedSheet = sheetEntries.find(entry => (
    typeof entry === 'object' && entry !== null && 'sheet' in entry && 'data' in entry
    && String((entry as { sheet: unknown }).sheet).toUpperCase() === 'NGUOI_DUNG'
  ));
  if (namedSheet) {
    const data = (namedSheet as { data: unknown }).data;
    return Array.isArray(data) ? data as unknown[][] : [];
  }
  return workbookData as unknown[][];
}

export async function parseUserImportFile(file: File, existingUsers: UserProfile[], orgUnits: OrgUnit[]): Promise<UserImportPreviewRow[]> {
  return parseUserImportRows(selectUserImportRows(await readXlsxFile(file) as unknown), existingUsers, orgUnits);
}

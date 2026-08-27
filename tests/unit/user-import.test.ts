import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/node';
import { parseUserImportRows, selectUserImportRows } from '../../src/lib/user-import';
import type { OrgUnit, UserProfile } from '../../shared/contracts';

describe('parseUserImportRows', () => {
  it('ships a readable Excel template with the canonical import headers', async () => {
    const rows = selectUserImportRows(await readXlsxFile('public/templates/mau-nhap-nguoi-dung.xlsx'));
    expect(rows[0]).toEqual([
      'Tên đăng nhập', 'Họ và tên', 'Email', 'Mật khẩu tạm', 'Cổng', 'Vai trò chính',
      'Vai trò bổ sung', 'Vai trò CoPlus', 'Mã đơn vị/nhóm nội bộ', 'Mã chi nhánh',
      'Phòng/PGD', 'Trạng thái', 'Ghi chú',
    ]);
  });

  it('maps a valid batch row, masks password mode and detects duplicate email', () => {
    const rows = [
      ['Tên đăng nhập', 'Họ và tên', 'Email', 'Mật khẩu tạm', 'Cổng', 'Vai trò chính', 'Mã đơn vị/nhóm nội bộ', 'Trạng thái'],
      ['canbo01', 'Cán bộ Một', 'canbo01@example.com', 'MatKhauTam@123', 'INTERNAL', 'INTERNAL_OFFICER', 'TEAM_01', 'ACTIVE'],
      ['canbo02', 'Cán bộ Hai', 'CANBO01@example.com', '', 'INTERNAL', 'INTERNAL_OFFICER', 'TEAM_01', 'ACTIVE'],
    ];
    const orgUnits = [{ id: 'team-1', code: 'TEAM_01', name: 'Nhóm 01', type: 'INTERNAL_TEAM', isActive: true }] as OrgUnit[];
    const preview = parseUserImportRows(rows, [] as UserProfile[], orgUnits);
    expect(preview[0]).toMatchObject({ passwordMode: 'PROVIDED', errors: [], payload: { internalTeamId: 'team-1', teamRole: 'MEMBER' } });
    expect(preview[0].payload).toHaveProperty('password', 'MatKhauTam@123');
    expect(preview[1].passwordMode).toBe('GENERATED');
    expect(preview[1].errors).toContain('Email đã tồn tại hoặc bị trùng trong lô.');
  });
});

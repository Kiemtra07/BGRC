import { describe, expect, it } from 'vitest';
import type { Finding, UserProfile, DataScopeType } from '../../shared/contracts';
import {
  buildScopeClauses,
  matchesScopeClauses,
  renderScopeSql,
  scopeSqlForUser,
} from '../../server/src/security/scope-predicate';
import { hasFindingAccess } from '../../server/src/security/access-control';

/**
 * Phạm vi dữ liệu chạy ở hai nơi: lọc mảng trong bộ nhớ, và mệnh đề WHERE gửi xuống Postgres. Nếu
 * hai đường lệch nhau thì hậu quả không phải là hiển thị sai — mà là một chi nhánh đọc được hồ sơ
 * của chi nhánh khác. File này tồn tại để chứng minh chúng không thể lệch.
 */

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'find-x', cif: '1', customerName: 'KH', clusterName: 'Cụm Tây Nguyên',
  branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng QLKH 1',
  errorCode: 'TD01.01', errorTitle: 'Lỗi', description: '', workflowStatus: 'PENDING',
  slaStatus: 'ON_TRACK', isOverdue: false, createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', version: 1, evidences: [], subItems: [],
  ...over,
} as Finding);

const user = (
  scopes: Array<Record<string, unknown>> | undefined,
  over: Partial<UserProfile> = {},
): UserProfile => ({
  id: 'u1', username: 'u1', email: 'u1@bidv.com.vn', fullName: 'U1', portal: 'BRANCH',
  roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', isActive: true,
  clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
  department: 'Phòng QLKH 1',
  scopes: scopes as UserProfile['scopes'],
  ...over,
} as UserProfile);

/** Ánh xạ hồ sơ sang tên cột của bảng `findings`. */
const asRow = (item: Finding) => ({
  cluster_name: item.clusterName,
  branch_code: item.branchCode,
  branch_name: item.branchName,
  department: item.department,
});

const normalizeLikePostgres = (value: unknown): string | undefined =>
  typeof value === 'string' ? (value.trim().toLocaleLowerCase('vi-VN') || undefined) : undefined;

/**
 * Diễn giải mệnh đề SQL vừa sinh, theo đúng ngữ nghĩa Postgres của những cấu trúc mà
 * `renderScopeSql` phát ra. Văn phạm rất hẹp và do chính chúng ta sinh ra, nên chuyển thẳng sang
 * một biểu thức JavaScript là đủ — và đó chính là điều cần kiểm chứng: SQL nói cùng một điều.
 */
function evaluateScopeSql(sql: string, params: unknown[], row: Record<string, unknown>): boolean {
  const emptyText = /btrim\(coalesce\(f\.(\w+), ''\)\) = ''/g;
  const sameText = /lower\(btrim\(f\.(\w+)\)\) IS NOT DISTINCT FROM \$(\d+)/g;
  const exactCode = /f\.(\w+) = \$(\d+)/g;
  const expression = sql
    .replace(emptyText, "(String(row.$1 ?? '').trim() === '')")
    .replace(sameText, '(norm(row.$1) === (p[$2 - 1] ?? undefined))')
    .replace(exactCode, '(row.$1 === p[$2 - 1])')
    .replace(/ AND /g, ' && ')
    .replace(/ OR /g, ' || ');
  const evaluate = new Function('row', 'p', 'norm', 'return ' + expression + ';');
  return evaluate(row, params, normalizeLikePostgres) as boolean;
}

describe('vị từ phạm vi — JavaScript và SQL nói cùng một điều', () => {
  const branchNames = ['Chi nhánh Nam Buôn Hồ', 'Chi nhánh Hà Nội', '  chi nhánh nam buôn hồ  '];
  const departments: Array<string | undefined> = ['Phòng QLKH 1', 'Phòng QLKH 2', '', undefined];
  const clusters: Array<string | undefined> = ['Cụm Tây Nguyên', 'Cụm Đồng Bằng Sông Hồng', undefined];
  const branchCodes = ['635', '102'];

  const scopeShapes: Array<{ label: string; scopes: Array<Record<string, unknown>> }> = [
    { label: 'ALL', scopes: [{ scopeType: 'ALL' as DataScopeType }] },
    { label: 'CLUSTER theo tên cụm', scopes: [{ scopeType: 'CLUSTER', clusterName: 'Cụm Tây Nguyên' }] },
    { label: 'CLUSTER không ghi cụm', scopes: [{ scopeType: 'CLUSTER' }] },
    { label: 'BRANCH theo mã', scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635' }] },
    { label: 'BRANCH theo tên', scopes: [{ scopeType: 'BRANCH', branchName: 'Chi nhánh Nam Buôn Hồ' }] },
    { label: 'DEPARTMENT theo mã và phòng', scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }] },
    { label: 'DEPARTMENT phòng khác', scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 2' }] },
    {
      label: 'nhiều phạm vi cộng dồn',
      scopes: [
        { scopeType: 'BRANCH', orgUnitCode: '102' },
        { scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' },
      ],
    },
    { label: 'không có phạm vi nào', scopes: [] },
  ];

  it('cho cùng kết quả trên toàn bộ ma trận phạm vi nhân hồ sơ', () => {
    let compared = 0;
    for (const shape of scopeShapes) {
      // Cả tài khoản có mã chi nhánh lẫn tài khoản không có, để đường lùi theo tên thực sự chạy qua.
      for (const carriesBranchCode of [true, false]) {
        const account = user(shape.scopes, carriesBranchCode ? {} : { branchCode: undefined });
        const clauses = buildScopeClauses(account);
        const rendered = renderScopeSql(clauses);

        for (const branchCode of branchCodes) {
          for (const branchName of branchNames) {
            for (const department of departments) {
              for (const clusterName of clusters) {
                const item = finding({
                  branchCode,
                  branchName,
                  department: department as string,
                  clusterName: clusterName as string,
                });
                const viaJs = matchesScopeClauses(clauses, item);
                const viaSql = evaluateScopeSql(rendered.sql, rendered.params, asRow(item));
                const where = shape.label + ' | có mã=' + carriesBranchCode
                  + ' | ' + branchCode + '/' + branchName + '/' + department + '/' + clusterName;
                expect(viaSql, where).toBe(viaJs);
                // hasFindingAccess phải là đúng cùng một luật, không phải một bản sao gần giống.
                expect(hasFindingAccess(account, item), where).toBe(viaJs);
                compared += 1;
              }
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('không thấy gì khi tài khoản bị khoá hoặc chưa lưu phạm vi', () => {
    const accounts = [
      user([{ scopeType: 'ALL' }], { isActive: false }),
      user([], {}),
      user(undefined, {}),
    ];
    for (const account of accounts) {
      expect(buildScopeClauses(account)).toEqual([]);
      expect(renderScopeSql(buildScopeClauses(account)).sql).toBe('false');
      expect(hasFindingAccess(account, finding())).toBe(false);
    }
  });

  it('rút gọn thành true cho phạm vi toàn hệ thống, không sinh tham số thừa', () => {
    const rendered = scopeSqlForUser(user([
      { scopeType: 'BRANCH', orgUnitCode: '635' },
      { scopeType: 'ALL' },
    ]));
    expect(rendered).toEqual({ sql: 'true', params: [] });
  });

  it('so mã chi nhánh nguyên văn, so văn bản đã chuẩn hoá', () => {
    const rendered = scopeSqlForUser(user([
      { scopeType: 'BRANCH', orgUnitCode: '635' },
      { scopeType: 'CLUSTER', clusterName: '  Cụm Tây Nguyên  ' },
    ]));
    expect(rendered.sql).toContain('f.branch_code = $1');
    // Mã đi nguyên văn; tên cụm được hạ chữ và cắt khoảng trắng ngay ở tham số.
    expect(rendered.params).toEqual(['635', 'cụm tây nguyên']);
  });

  it('dùng IS NOT DISTINCT FROM để NULL khớp NULL đúng như phía JavaScript', () => {
    // `=` trong SQL trả NULL khi gặp NULL, tức loại dòng đó ra; còn `undefined === undefined` bên
    // JavaScript lại là true. Dùng `=` ở đây là hai đường cho kết quả khác nhau.
    const account = user([{ scopeType: 'CLUSTER' }], { clusterName: undefined });
    const rendered = scopeSqlForUser(account);
    expect(rendered.sql).toContain('IS NOT DISTINCT FROM');
    expect(rendered.params).toEqual([null]);

    const item = finding({ clusterName: undefined as unknown as string });
    expect(matchesScopeClauses(buildScopeClauses(account), item)).toBe(true);
    expect(evaluateScopeSql(rendered.sql, rendered.params, asRow(item))).toBe(true);
  });

  it('đánh số tham số tiếp nối truy vấn đã có tham số phía trước', () => {
    const account = user([{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }]);
    const rendered = renderScopeSql(buildScopeClauses(account), 'f', 4);
    expect(rendered.sql).toContain('$4');
    expect(rendered.sql).toContain('$5');
    expect(rendered.sql).not.toContain('$1');
    expect(rendered.params).toHaveLength(2);
  });
});

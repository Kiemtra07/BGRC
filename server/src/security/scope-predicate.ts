import { Finding, UserProfile } from '../../../shared/contracts';

/**
 * Phạm vi dữ liệu, mô tả một lần rồi diễn giải hai đường.
 *
 * Quy tắc "ai được đọc hồ sơ nào" cần chạy ở hai nơi: lọc mảng trong bộ nhớ (đường cũ) và mệnh đề
 * WHERE gửi xuống Postgres (đường mới, để mỗi người chỉ tải đúng phần dữ liệu của mình). Viết hai
 * bản độc lập rồi mong chúng khớp nhau là cách chắc chắn nhất để một hôm nào đó chi nhánh này đọc
 * được hồ sơ của chi nhánh khác.
 *
 * Nên ở đây phạm vi được dựng thành một cây điều kiện *một lần*, rồi:
 *   - `matchesScopeClauses` diễn giải cây đó bằng JavaScript — chính là ruột của `hasFindingAccess`;
 *   - `renderScopeSql` dịch đúng cây đó thành SQL có tham số.
 * Hai đường không thể lệch nhau, vì chúng đọc chung một cấu trúc.
 */

/** Cách đối chiếu chi nhánh. Mã là định danh thật; tên chỉ là đường lùi cho hồ sơ chưa có mã. */
export type BranchMatch =
  | { by: 'code'; code: string }
  | { by: 'name'; name?: string };

export type ScopeClause =
  | { kind: 'ALL' }
  | { kind: 'CLUSTER'; clusterName?: string }
  | { kind: 'BRANCH'; branch: BranchMatch }
  | { kind: 'DEPARTMENT'; branch: BranchMatch; departmentName?: string };

/** Chuẩn hoá đúng như bản gốc trong access-control: cắt khoảng trắng rồi hạ chữ theo vi-VN. */
export const normalizeScopeValue = (value?: string): string | undefined =>
  value?.trim().toLocaleLowerCase('vi-VN');

function branchMatchFor(scope: UserProfile['scopes'][number], user: UserProfile): BranchMatch {
  const code = scope.orgUnitCode ?? user.branchCode;
  return code ? { by: 'code', code } : { by: 'name', name: scope.branchName ?? user.branchName };
}

/**
 * Dựng danh sách điều kiện từ hồ sơ người dùng. Mảng rỗng nghĩa là **không thấy gì** — tài khoản
 * bị khoá, hoặc hồ sơ cũ chưa lưu `scopes`. Đây là mặc định fail-closed, và nó phải là mặc định:
 * một hồ sơ người dùng dị dạng thì phải mất quyền đọc, chứ không phải mở toang.
 */
export function buildScopeClauses(user: UserProfile): ScopeClause[] {
  if (!user.isActive) return [];
  const scopes = Array.isArray(user.scopes) ? user.scopes : [];
  if (scopes.some(scope => scope.scopeType === 'ALL')) return [{ kind: 'ALL' }];

  const clauses: ScopeClause[] = [];
  for (const scope of scopes) {
    if (scope.scopeType === 'CLUSTER') {
      clauses.push({ kind: 'CLUSTER', clusterName: scope.clusterName ?? user.clusterName });
    } else if (scope.scopeType === 'BRANCH') {
      clauses.push({ kind: 'BRANCH', branch: branchMatchFor(scope, user) });
    } else if (scope.scopeType === 'DEPARTMENT') {
      clauses.push({
        kind: 'DEPARTMENT',
        branch: branchMatchFor(scope, user),
        departmentName: scope.departmentName ?? user.department,
      });
    }
  }
  return clauses;
}

function branchMatches(branch: BranchMatch, finding: Finding): boolean {
  // Mã chi nhánh so khớp nguyên văn, không chuẩn hoá — nó là định danh, không phải văn bản hiển thị.
  return branch.by === 'code'
    ? branch.code === finding.branchCode
    : normalizeScopeValue(branch.name) === normalizeScopeValue(finding.branchName);
}

/** Diễn giải cây điều kiện bằng JavaScript. */
export function matchesScopeClauses(clauses: readonly ScopeClause[], finding: Finding): boolean {
  return clauses.some(clause => {
    switch (clause.kind) {
      case 'ALL':
        return true;
      case 'CLUSTER':
        return normalizeScopeValue(clause.clusterName) === normalizeScopeValue(finding.clusterName);
      case 'BRANCH':
        return branchMatches(clause.branch, finding);
      case 'DEPARTMENT': {
        if (!branchMatches(clause.branch, finding)) return false;
        // Hồ sơ không gắn phòng thuộc về cả chi nhánh. Giấu nó khỏi mọi cán bộ theo phòng nghĩa là
        // giấu nó khỏi chính chi nhánh — công việc biến mất chứ không phải bị thu hẹp phạm vi.
        if (!normalizeScopeValue(finding.department)) return true;
        return normalizeScopeValue(clause.departmentName) === normalizeScopeValue(finding.department);
      }
      default:
        return false;
    }
  });
}

export interface ScopeSql {
  sql: string;
  params: unknown[];
}

/**
 * Dịch cây điều kiện thành SQL có tham số.
 *
 * Về chuẩn hoá: phía tham số đã hạ chữ bằng `toLocaleLowerCase('vi-VN')` trong JavaScript, còn phía
 * cột dùng `lower(btrim(...))` của Postgres. Với bảng chữ tiếng Việt hai phép này cho cùng kết quả
 * (ánh xạ hoa–thường là 1–1 và không phụ thuộc locale, khác với chữ I của tiếng Thổ Nhĩ Kỳ). Mã chi
 * nhánh thì so nguyên văn ở cả hai đường, nên không có chỗ nào để lệch.
 *
 * `nextParamIndex` cho phép ghép mệnh đề này vào một truy vấn đã có sẵn tham số phía trước.
 */
export function renderScopeSql(
  clauses: readonly ScopeClause[],
  alias = 'f',
  nextParamIndex = 1,
): ScopeSql {
  if (clauses.length === 0) return { sql: 'false', params: [] };
  if (clauses.some(clause => clause.kind === 'ALL')) return { sql: 'true', params: [] };

  const params: unknown[] = [];
  let index = nextParamIndex;
  const placeholder = (value: unknown): string => {
    params.push(value);
    return `$${index++}`;
  };
  // `IS NOT DISTINCT FROM` chứ không phải `=`: phía JavaScript, `undefined === undefined` là true,
  // nên một phạm vi không ghi cụm và một hồ sơ không ghi cụm vẫn khớp nhau. `=` trong SQL trả NULL
  // khi có NULL, tức là loại dòng đó ra — hai đường sẽ cho kết quả khác nhau đúng ở trường hợp này.
  const sameText = (column: string, value?: string): string =>
    `lower(btrim(${column})) IS NOT DISTINCT FROM ${placeholder(normalizeScopeValue(value) ?? null)}`;

  const branchSql = (branch: BranchMatch): string => (
    branch.by === 'code'
      ? `${alias}.branch_code = ${placeholder(branch.code)}`
      : sameText(`${alias}.branch_name`, branch.name)
  );

  const rendered = clauses.map(clause => {
    switch (clause.kind) {
      case 'CLUSTER':
        return sameText(`${alias}.cluster_name`, clause.clusterName);
      case 'BRANCH':
        return branchSql(clause.branch);
      case 'DEPARTMENT': {
        const branch = branchSql(clause.branch);
        // Trống ở đây gồm cả NULL lẫn chuỗi rỗng, khớp với `!normalizeScopeValue(...)` bên JS.
        const noDepartment = `btrim(coalesce(${alias}.department, '')) = ''`;
        const sameDepartment = sameText(`${alias}.department`, clause.departmentName);
        return `(${branch} AND (${noDepartment} OR ${sameDepartment}))`;
      }
      default:
        return 'false';
    }
  });

  return { sql: rendered.length === 1 ? rendered[0] : `(${rendered.join(' OR ')})`, params };
}

/** Tiện ích cho phía gọi chỉ cần một mệnh đề WHERE từ một người dùng. */
export function scopeSqlForUser(user: UserProfile, alias = 'f', nextParamIndex = 1): ScopeSql {
  return renderScopeSql(buildScopeClauses(user), alias, nextParamIndex);
}

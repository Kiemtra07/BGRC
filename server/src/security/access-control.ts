import { Finding, UserProfile, UserRole } from '../../../shared/contracts';
import { HttpProblem } from '../http/problem';
import { buildScopeClauses, matchesScopeClauses } from './scope-predicate';

export function resolveLocalUser(
  headerValue: string | string[] | undefined,
  users: UserProfile[],
): UserProfile {
  const requestedId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!requestedId) {
    throw new HttpProblem(401, 'AUTH_REQUIRED', 'Chưa xác thực', 'Local API yêu cầu header x-user-id hợp lệ.');
  }

  const user = users.find(item => item.id === requestedId || item.username === requestedId);
  if (!user) {
    throw new HttpProblem(401, 'INVALID_LOCAL_USER', 'Tài khoản local không hợp lệ', 'Không tìm thấy tài khoản tương ứng với x-user-id.');
  }
  if (!user.isActive) {
    throw new HttpProblem(403, 'USER_DISABLED', 'Tài khoản đã bị khóa', 'Tài khoản hiện không được phép truy cập.');
  }
  return user;
}

export function requireRoles(user: UserProfile, allowedRoles: UserRole[]): void {
  if (!allowedRoles.some(role => user.roles.includes(role))) {
    throw new HttpProblem(403, 'FORBIDDEN', 'Không đủ quyền thực hiện', 'Vai trò hiện tại không được phép thực hiện thao tác này.');
  }
}

export function requireAdmin(user: UserProfile): void {
  if (!user.roles.includes('ADMIN')) {
    throw new HttpProblem(403, 'ADMIN_REQUIRED', 'Không đủ quyền quản trị', 'Chỉ quản trị viên được truy cập tài nguyên này.');
  }
}

/**
 * Which data scope a role gets inside its branch.
 *
 * Capture staff are confined to their own Phòng/PGD. Kiểm soát and Lãnh đạo chi nhánh must keep
 * the whole branch: their job is to review hồ sơ from every phòng, and a department-limited
 * reviewer simply could not approve most of the queue.
 */
export function branchScopeTypeForRole(primaryRole: UserRole): 'BRANCH' | 'DEPARTMENT' {
  return primaryRole === 'BRANCH_INPUT' ? 'DEPARTMENT' : 'BRANCH';
}

/**
 * Người dùng này có được đọc hồ sơ này không.
 *
 * Luật nằm trong `scope-predicate`, không nằm ở đây. Hàm này và mệnh đề WHERE mà truy vấn SQL dùng
 * đều diễn giải cùng một cây điều kiện, nên không có bản nào để lệch khỏi bản nào — chuyện lệch ở
 * đây nghĩa là một chi nhánh đọc được hồ sơ của chi nhánh khác.
 *
 * Tài khoản bị khoá, hoặc hồ sơ cũ chưa lưu `scopes`, đều cho ra danh sách điều kiện rỗng, tức là
 * không thấy gì: một hồ sơ người dùng dị dạng phải mất quyền đọc chứ không được thành lỗi 500.
 */
export function hasFindingAccess(user: UserProfile, finding: Finding): boolean {
  return matchesScopeClauses(buildScopeClauses(user), finding);
}

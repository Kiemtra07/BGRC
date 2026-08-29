import { Finding, UserProfile, UserRole } from '../../../shared/contracts';
import { HttpProblem } from '../http/problem';

const normalize = (value?: string) => value?.trim().toLocaleLowerCase('vi-VN');

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

export function hasFindingAccess(user: UserProfile, finding: Finding): boolean {
  if (!user.isActive) return false;
  // Legacy snapshots may not have persisted scopes for an account. Missing scope is deny-all,
  // and must not turn a malformed profile into a runtime 500.
  const scopes = Array.isArray(user.scopes) ? user.scopes : [];
  if (scopes.some(scope => scope.scopeType === 'ALL')) return true;

  return scopes.some(scope => {
    const scopedBranchCode = scope.orgUnitCode ?? user.branchCode;
    const scopedBranchName = scope.branchName ?? user.branchName;
    const branchMatches = scopedBranchCode
      ? scopedBranchCode === finding.branchCode
      : normalize(scopedBranchName) === normalize(finding.branchName);

    switch (scope.scopeType) {
      case 'CLUSTER':
        return normalize(scope.clusterName ?? user.clusterName) === normalize(finding.clusterName);
      case 'BRANCH':
        return branchMatches;
      case 'DEPARTMENT': {
        if (!branchMatches) return false;
        // A hồ sơ that carries no phòng belongs to the branch as a whole. Hiding it from every
        // department-scoped officer would make it invisible to the branch entirely — the work
        // would silently disappear instead of merely being scoped.
        if (!normalize(finding.department)) return true;
        return normalize(scope.departmentName ?? user.department) === normalize(finding.department);
      }
      default:
        return false;
    }
  });
}

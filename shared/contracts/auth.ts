import { z } from 'zod';
import { UserRole, PortalType, DataScopeType } from './common';
import { CoPlusRoleCode, CoPlusRoleCodeSchema, capabilitiesForCoPlusRole } from './coplus-roles';

export interface UserDataScope {
  scopeType: DataScopeType;
  orgUnitId?: string;
  orgUnitCode?: string;
  clusterName?: string;
  branchName?: string;
  departmentName?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone?: string;
  portal: PortalType;
  /** Capability primitives the workflow engine authorises against. */
  roles: UserRole[];
  primaryRole: UserRole;
  /** Role code the account holds in CoPlus; `roles` is derived from it. */
  coplusRole?: CoPlusRoleCode;
  isActive: boolean;
  scopes: UserDataScope[];
  orgUnitId?: string;
  internalTeamId?: string;
  internalTeamName?: string;
  teamRole?: 'MEMBER' | 'LEAD';
  clusterName?: string;
  branchCode?: string;
  branchName?: string;
  department?: string;
  googleWorkspaceEmail?: string;
}

export interface LoginDTO {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserProfile;
  expiresAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenDigest: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export const LoginSchema = z.object({
  username: z.string().trim().min(2).max(100),
  password: z.string().min(1).max(200),
});

const UserRoleSchema = z.enum([
  'ADMIN',
  'SUPERVISOR',
  'INTERNAL_APPROVER',
  'INTERNAL_OFFICER',
  'BRANCH_CONTROLLER',
  'BRANCH_LEADER',
  'BRANCH_INPUT',
  'VIEWER',
]);

export const CreateUserSchema = z.object({
  username: z.string().min(2).max(100).optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(2).max(255),
  phone: z.string().max(50).optional(),
  portal: z.enum(['INTERNAL', 'BRANCH']),
  roles: z.array(UserRoleSchema).min(1),
  coplusRole: CoPlusRoleCodeSchema.optional(),
  /**
   * Mật khẩu ban đầu. Bỏ trống thì hệ thống sinh mật khẩu tạm và trả về đúng một lần trong
   * phản hồi tạo tài khoản — không lưu ở dạng đọc được và không hiển thị lại lần nào nữa.
   */
  password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(200).optional(),
  primaryRole: UserRoleSchema,
  internalTeamId: z.string().min(1).optional(),
  teamRole: z.enum(['MEMBER', 'LEAD']).optional(),
  clusterName: z.string().min(2).optional(),
  branchCode: z.string().min(1).optional(),
  branchName: z.string().min(2).optional(),
  department: z.string().min(2).optional(),
  googleWorkspaceEmail: z.string().email().optional(),
  isActive: z.boolean().default(true),
}).superRefine((value, context) => {
  if (!value.roles.includes(value.primaryRole)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primaryRole'],
      message: 'primaryRole phải nằm trong roles',
    });
  }
  const branchRoles = new Set(['BRANCH_INPUT', 'BRANCH_CONTROLLER', 'BRANCH_LEADER']);
  const internalRoles = new Set(['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER']);
  if (value.portal === 'BRANCH' && value.roles.some(role => internalRoles.has(role))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['roles'],
      message: 'User chi nhánh không được mang vai trò nội bộ',
    });
  }
  if (value.portal === 'INTERNAL' && value.roles.some(role => branchRoles.has(role))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['roles'],
      message: 'User nội bộ không được mang vai trò chi nhánh',
    });
  }
  if (['BRANCH_CONTROLLER', 'BRANCH_LEADER'].includes(value.primaryRole) && (!value.branchCode || !value.department)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branchCode'],
      message: 'Vai trò kiểm soát hoặc lãnh đạo chi nhánh phải có branchCode và department',
    });
  }
  if (value.primaryRole === 'BRANCH_INPUT' && (!value.branchCode || !value.department)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branchCode'],
      message: 'BRANCH_INPUT phải có branchCode và department',
    });
  }
  if (value.primaryRole === 'INTERNAL_OFFICER' && (!value.internalTeamId || value.teamRole !== 'MEMBER')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['internalTeamId'],
      message: 'Cán bộ nội bộ phải thuộc một nhóm với vai trò thành viên',
    });
  }
  if (value.primaryRole === 'INTERNAL_APPROVER' && (!value.internalTeamId || value.teamRole !== 'LEAD')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['teamRole'],
      message: 'Người kiểm soát duyệt của nhóm phải là trưởng nhóm',
    });
  }
  if (value.teamRole && !value.internalTeamId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['internalTeamId'],
      message: 'teamRole yêu cầu internalTeamId',
    });
  }
  // A CoPlus role code is the account's identity; the capabilities it grants must actually be held,
  // otherwise the label shown in the UI would promise access the workflow engine refuses.
  if (value.coplusRole) {
    const missing = capabilitiesForCoPlusRole(value.coplusRole).filter(capability => !value.roles.includes(capability));
    if (missing.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coplusRole'],
        message: `Vai trò ${value.coplusRole} cần thêm quyền: ${missing.join(', ')}`,
      });
    }
  }
});

export type CreateUserDTO = z.infer<typeof CreateUserSchema>;

/**
 * Tài khoản vừa tạo. `temporaryPassword` chỉ xuất hiện khi hệ thống tự sinh mật khẩu, và chỉ ở
 * đúng phản hồi này — quản trị viên phải chuyển cho người dùng ngay, không tra cứu lại được.
 */
export interface CreatedUserResponse {
  user: UserProfile;
  temporaryPassword?: string;
}

export const ResetUserPasswordSchema = z.object({
  password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(200).optional(),
});
export type ResetUserPasswordDTO = z.infer<typeof ResetUserPasswordSchema>;

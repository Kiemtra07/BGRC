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
  /** Supabase Auth identity id when AUTH_MODE=supabase; absent for legacy local accounts. */
  authUserId?: string;
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
  /** Admin-controlled second-factor requirement. The secret is never part of this profile. */
  authenticatorRequired?: boolean;
  /** True after the server has provisioned an encrypted TOTP secret for the account. */
  authenticatorConfigured?: boolean;
}

export interface LoginDTO {
  username: string;
  password: string;
  /** Google Authenticator six-digit token when the account requires MFA. */
  mfaCode?: string;
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
  mfaCode: z.string().trim().regex(/^\d{6}$/, 'Mã Authenticator phải gồm 6 chữ số.').optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(200),
});
export type ChangePasswordDTO = z.infer<typeof ChangePasswordSchema>;

export const UpdateUserSchema = z.object({
  username: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().optional(),
  fullName: z.string().trim().min(2).max(255).optional(),
  phone: z.string().max(50).optional(),
  googleWorkspaceEmail: z.union([z.string().email(), z.literal('')]).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;

export const UpdateAuthenticatorSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateAuthenticatorDTO = z.infer<typeof UpdateAuthenticatorSchema>;

export interface AuthenticatorSetup {
  secret: string;
  otpauthUri: string;
}

export interface UpdateAuthenticatorResponse {
  user: UserProfile;
  setup?: AuthenticatorSetup;
}

/**
 * Whether Google Authenticator is demanded at login is a system-wide policy, not a
 * per-account preference: an account that opts out is exactly the account an attacker
 * picks. Enrolment stays per user because TOTP needs one secret per person, but the
 * *requirement* comes from here.
 */
export const MfaPolicySchema = z.enum(['DISABLED', 'REQUIRED_INTERNAL', 'REQUIRED_ALL']);
export type MfaPolicy = z.infer<typeof MfaPolicySchema>;

export const SecuritySettingsSchema = z.object({
  mfaPolicy: MfaPolicySchema,
});
export type SecuritySettingsDTO = z.infer<typeof SecuritySettingsSchema>;

export interface SecuritySettings {
  mfaPolicy: MfaPolicy;
  updatedAt: string;
  updatedByUserId?: string;
  updatedByName?: string;
}

export interface MfaEnrolmentRow {
  id: string;
  fullName: string;
  email: string;
  portal: PortalType;
  /** True once a TOTP secret exists for the account. */
  configured: boolean;
  /** True when the current policy demands a code from this account. */
  covered: boolean;
}

/**
 * Policy plus the enrolment picture it creates. Issuing and revoking codes lives on this one
 * screen, so it needs both who is still missing a code and who already has one.
 */
export interface SecuritySettingsResponse {
  settings: SecuritySettings;
  /** Active accounts the policy covers that have no authenticator secret yet. */
  pendingEnrolment: Array<{ id: string; fullName: string; email: string; portal: PortalType }>;
  coveredUserCount: number;
  /** Every active account, with its enrolment and coverage state. */
  enrolment: MfaEnrolmentRow[];
}

export const mfaPolicyLabels: Record<MfaPolicy, string> = {
  DISABLED: 'Tắt — không yêu cầu mã',
  REQUIRED_INTERNAL: 'Bắt buộc với khối nội bộ',
  REQUIRED_ALL: 'Bắt buộc với toàn bộ người dùng',
};

/** Single source of truth for "does this account have to enter a code", used by server and UI. */
export const mfaPolicyCovers = (policy: MfaPolicy, portal: PortalType): boolean =>
  policy === 'REQUIRED_ALL' || (policy === 'REQUIRED_INTERNAL' && portal === 'INTERNAL');

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

export const BulkUserImportSchema = z.object({
  rows: z.array(z.object({
    rowNumber: z.number().int().min(2),
    user: CreateUserSchema,
  })).min(1).max(500),
});

export type BulkUserImportDTO = z.infer<typeof BulkUserImportSchema>;

export interface BulkUserImportCreatedRow extends CreatedUserResponse {
  rowNumber: number;
}

export interface BulkUserImportFailedRow {
  rowNumber: number;
  code: string;
  message: string;
}

export interface BulkUserImportResult {
  batchId: string;
  created: BulkUserImportCreatedRow[];
  failed: BulkUserImportFailedRow[];
}

export const ResetUserPasswordSchema = z.object({
  password: z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(200).optional(),
});
export type ResetUserPasswordDTO = z.infer<typeof ResetUserPasswordSchema>;

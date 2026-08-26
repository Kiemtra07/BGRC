import { z } from 'zod';
import { UserRole } from './common';

/**
 * Role codes published by CoPlus (Quản lý kiểm tra CoPlus, Ban KT&GSTT — 08/2026).
 *
 * CoPlus covers the inspection itself, up to a signed Biên bản tổng hợp; this system covers what
 * happens next — the branch remediating each sai sót. The two share the same people, so a user
 * keeps the CoPlus role code they were issued, and that code decides what they may do here.
 *
 * `capabilities` maps each code onto the permission primitives the workflow engine already
 * enforces. Authorisation keeps checking capabilities, so the CoPlus code is an identity that
 * grants permissions, never a second, parallel permission system.
 */
export const COPLUS_ROLE_CODES = [
  'ROLE_BANLD',
  'ROLE_GDBTT',
  'ROLE_PGDBANTT',
  'ROLE_CBBANTT',
  'GD_KTGSTT',
  'PGD1_KTGSTT',
  'CB1_KTGSTT',
  'PGD2_KTGSTT',
  'CB2_KTGSTT',
  'CBHT_CN',
  'CB_GSKT_TH',
  'LD_GSKT_TH',
  'ADMIN_HT',
] as const;

export const CoPlusRoleCodeSchema = z.enum(COPLUS_ROLE_CODES);
export type CoPlusRoleCode = z.infer<typeof CoPlusRoleCodeSchema>;

export type CoPlusRoleGroup =
  | 'BAN_LANH_DAO'
  | 'BAN_TT_NGOAI_KTGSTT'
  | 'KTGSTT_THAM_GIA_DOAN'
  | 'KTGSTT_KHONG_THAM_GIA_DOAN'
  | 'HO_TRO_GIAM_SAT'
  | 'QUAN_TRI';

export interface CoPlusRoleDefinition {
  code: CoPlusRoleCode;
  label: string;
  group: CoPlusRoleGroup;
  /** What this role does in the remediation phase this system owns. */
  responsibility: string;
  capabilities: UserRole[];
}

export const COPLUS_ROLE_GROUP_LABELS: Record<CoPlusRoleGroup, string> = {
  BAN_LANH_DAO: 'Ban lãnh đạo',
  BAN_TT_NGOAI_KTGSTT: 'Ban/TT ngoài KT&GSTT',
  KTGSTT_THAM_GIA_DOAN: 'Ban KT&GSTT tham gia đoàn',
  KTGSTT_KHONG_THAM_GIA_DOAN: 'Ban KT&GSTT không tham gia đoàn',
  HO_TRO_GIAM_SAT: 'Hỗ trợ và giám sát tổng hợp',
  QUAN_TRI: 'Quản trị hệ thống',
};

export const COPLUS_ROLE_CATALOG: CoPlusRoleDefinition[] = [
  {
    code: 'ROLE_BANLD', label: 'Ban lãnh đạo BIDV', group: 'BAN_LANH_DAO',
    responsibility: 'Tra cứu tiến độ khắc phục, xem và xuất báo cáo toàn hàng.',
    capabilities: ['VIEWER'],
  },
  {
    code: 'ROLE_GDBTT', label: 'Giám đốc Ban/TT ngoài KT&GSTT', group: 'BAN_TT_NGOAI_KTGSTT',
    responsibility: 'Tra cứu hồ sơ khắc phục thuộc đoàn kiểm tra được phân công.',
    capabilities: ['VIEWER'],
  },
  {
    code: 'ROLE_PGDBANTT', label: 'Phó Giám đốc Ban/TT ngoài KT&GSTT', group: 'BAN_TT_NGOAI_KTGSTT',
    responsibility: 'Tra cứu hồ sơ khắc phục thuộc đoàn kiểm tra được phân công.',
    capabilities: ['VIEWER'],
  },
  {
    code: 'ROLE_CBBANTT', label: 'Cán bộ Ban/TT ngoài KT&GSTT', group: 'BAN_TT_NGOAI_KTGSTT',
    responsibility: 'Tra cứu hồ sơ khắc phục thuộc đoàn kiểm tra được phân công.',
    capabilities: ['VIEWER'],
  },
  {
    code: 'GD_KTGSTT', label: 'Giám đốc Ban KT&GSTT', group: 'KTGSTT_THAM_GIA_DOAN',
    responsibility: 'Phê duyệt đóng lỗi, chốt kết quả khắc phục của đoàn kiểm tra.',
    capabilities: ['INTERNAL_APPROVER', 'SUPERVISOR'],
  },
  {
    code: 'PGD1_KTGSTT', label: 'Phó Giám đốc Ban KT&GSTT (tham gia đoàn)', group: 'KTGSTT_THAM_GIA_DOAN',
    responsibility: 'Phê duyệt hoặc chuyển trả hồ sơ khắc phục của đoàn mình phụ trách.',
    capabilities: ['INTERNAL_APPROVER'],
  },
  {
    code: 'CB1_KTGSTT', label: 'Cán bộ Ban KT&GSTT (tham gia đoàn)', group: 'KTGSTT_THAM_GIA_DOAN',
    responsibility: 'Chuyển sai sót từ tiểu biên bản sang theo dõi khắc phục, cập nhật hồ sơ.',
    capabilities: ['INTERNAL_OFFICER'],
  },
  {
    code: 'PGD2_KTGSTT', label: 'Phó Giám đốc Ban KT&GSTT (không tham gia đoàn)', group: 'KTGSTT_KHONG_THAM_GIA_DOAN',
    responsibility: 'Tra cứu và phê duyệt thay khi được phân công.',
    capabilities: ['INTERNAL_APPROVER'],
  },
  {
    code: 'CB2_KTGSTT', label: 'Cán bộ Ban KT&GSTT (không tham gia đoàn)', group: 'KTGSTT_KHONG_THAM_GIA_DOAN',
    responsibility: 'Tra cứu hồ sơ, cập nhật khi được phân quyền.',
    capabilities: ['INTERNAL_OFFICER'],
  },
  {
    code: 'CBHT_CN', label: 'Cán bộ hỗ trợ chi nhánh', group: 'HO_TRO_GIAM_SAT',
    responsibility: 'Nhập giải trình và tài liệu khắc phục cho chi nhánh được phân công.',
    capabilities: ['BRANCH_INPUT'],
  },
  {
    code: 'CB_GSKT_TH', label: 'Cán bộ nhóm Giám sát HĐKT / Tổng hợp', group: 'HO_TRO_GIAM_SAT',
    responsibility: 'Rà soát hồ sơ khắc phục trước khi trình Khối Nội bộ, theo dõi tiến độ toàn hàng.',
    capabilities: ['BRANCH_CONTROLLER'],
  },
  {
    code: 'LD_GSKT_TH', label: 'Lãnh đạo nhóm Giám sát HĐKT / Tổng hợp', group: 'HO_TRO_GIAM_SAT',
    responsibility: 'Duyệt kết quả rà soát, theo dõi tổng hợp và xuất báo cáo toàn hàng.',
    capabilities: ['SUPERVISOR'],
  },
  {
    code: 'ADMIN_HT', label: 'Quản trị hệ thống', group: 'QUAN_TRI',
    responsibility: 'Cấu hình loại báo cáo, tham số, người dùng và phân quyền.',
    capabilities: ['ADMIN'],
  },
];

const BY_CODE = new Map(COPLUS_ROLE_CATALOG.map(role => [role.code, role]));

export const coplusRole = (code: CoPlusRoleCode): CoPlusRoleDefinition => BY_CODE.get(code)!;

export const coplusRoleLabel = (code?: CoPlusRoleCode): string =>
  (code && BY_CODE.get(code)?.label) || 'Chưa gán vai trò CoPlus';

/** Capability set a CoPlus role grants, deduplicated and safe to pass to the workflow engine. */
export const capabilitiesForCoPlusRole = (code: CoPlusRoleCode): UserRole[] =>
  [...new Set(BY_CODE.get(code)?.capabilities ?? [])];

/**
 * Best-effort reverse lookup, used to label accounts created before CoPlus codes were recorded.
 * Picks the role whose capabilities the account fully satisfies with the fewest extras.
 */
export const inferCoPlusRole = (roles: UserRole[]): CoPlusRoleCode | undefined => {
  const held = new Set(roles);
  const matches = COPLUS_ROLE_CATALOG
    .filter(role => role.capabilities.every(capability => held.has(capability)))
    .sort((left, right) => right.capabilities.length - left.capabilities.length);
  return matches[0]?.code;
};

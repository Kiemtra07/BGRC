import { UserRole } from './common';

export type AppCapability = 'CONFIGURE_CATALOG' | 'IMPORT_FINDINGS' | 'CREATE_FINDING';

/** Single source of truth for the capabilities shown in the UI and enforced by the API. */
export const APP_CAPABILITY_ROLES: Record<AppCapability, readonly UserRole[]> = {
  CONFIGURE_CATALOG: ['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER'],
  IMPORT_FINDINGS: ['ADMIN', 'SUPERVISOR', 'INTERNAL_OFFICER'],
  CREATE_FINDING: ['ADMIN', 'INTERNAL_OFFICER'],
};

export function hasAppCapability(roles: readonly UserRole[], capability: AppCapability): boolean {
  return APP_CAPABILITY_ROLES[capability].some(role => roles.includes(role));
}

import { describe, expect, it } from 'vitest';
import { APP_CAPABILITY_ROLES, hasAppCapability } from '../../shared/contracts';

describe('application capability matrix', () => {
  it('keeps UI/API role boundaries aligned', () => {
    expect(APP_CAPABILITY_ROLES.CONFIGURE_CATALOG).toEqual(['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER']);
    expect(APP_CAPABILITY_ROLES.IMPORT_FINDINGS).toEqual(['ADMIN', 'SUPERVISOR', 'INTERNAL_OFFICER']);
    expect(APP_CAPABILITY_ROLES.CREATE_FINDING).toEqual(['ADMIN', 'INTERNAL_OFFICER']);
  });

  it('does not grant import or create to an internal approver', () => {
    expect(hasAppCapability(['INTERNAL_APPROVER'], 'CONFIGURE_CATALOG')).toBe(true);
    expect(hasAppCapability(['INTERNAL_APPROVER'], 'IMPORT_FINDINGS')).toBe(false);
    expect(hasAppCapability(['INTERNAL_APPROVER'], 'CREATE_FINDING')).toBe(false);
  });
});

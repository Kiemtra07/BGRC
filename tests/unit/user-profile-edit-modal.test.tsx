import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../shared/contracts';
import { UserProfileEditModal } from '../../src/components/admin/UserProfileEditModal';

const user: UserProfile = {
  id: 'user-admin',
  username: 'admin.hethong',
  email: 'admin@example.com',
  fullName: 'Quản trị hệ thống',
  portal: 'INTERNAL',
  roles: ['ADMIN'],
  primaryRole: 'ADMIN',
  isActive: true,
  scopes: [{ scopeType: 'ALL' }],
};

describe('UserProfileEditModal', () => {
  it('renders the Google Workspace field together with its hint', () => {
    const html = renderToStaticMarkup(React.createElement(UserProfileEditModal, {
      user,
      orgUnits: [],
      onClose: () => undefined,
      onSave: async () => undefined,
    }));

    expect(html).toContain('Email Google Workspace để cấp quyền tệp đính kèm');
    expect(html).toContain('Dùng để cấp quyền Google Drive; không thay đổi email đăng nhập.');
    expect(html).toContain('value="admin.hethong"');
  });
});

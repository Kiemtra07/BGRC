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

const assignedBranchUser: UserProfile = {
  ...user,
  id: 'user-branch-edit',
  username: 'branch.edit',
  email: 'branch.edit@example.com',
  fullName: 'Cán bộ chi nhánh',
  portal: 'BRANCH',
  roles: ['BRANCH_INPUT'],
  primaryRole: 'BRANCH_INPUT',
  orgUnitId: 'org-dept-635-qlkh1',
  clusterName: 'Cụm Tây Nguyên',
  branchCode: '635',
  branchName: 'Chi nhánh Nam Buôn Hồ',
  department: 'Phòng QLKH 1',
  scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }],
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

  it('pre-fills the organizational hierarchy and keeps an unassigned user editable', () => {
    const html = renderToStaticMarkup(React.createElement(UserProfileEditModal, {
      user: assignedBranchUser,
      orgUnits: [
        { id: 'org-cluster-tn', code: 'CUM_TAY_NGUYEN', name: 'Cụm Tây Nguyên', type: 'CLUSTER', isActive: true },
        { id: 'org-br-635', code: '635', name: 'Chi nhánh Nam Buôn Hồ', type: 'BRANCH', parentId: 'org-cluster-tn', isActive: true },
        { id: 'org-dept-635-qlkh1', code: '635-QLKH1', name: 'Phòng QLKH 1', type: 'DEPARTMENT', parentId: 'org-br-635', isActive: true },
      ],
      onClose: () => undefined,
      onSave: async () => undefined,
    }));

    expect(html).toContain('Cụm địa bàn');
    expect(html).toContain('Chi nhánh');
    expect(html).toContain('Phòng / PGD');
    expect(html).toContain('value="org-cluster-tn" selected');
    expect(html).toContain('value="635" selected');
    expect(html).toContain('value="org-dept-635-qlkh1" selected');
    expect(html).toContain('Có thể phân công sau');
  });
});

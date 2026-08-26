import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Finding, MyWorkQueue, UserProfile } from '../../shared/contracts';
import { FindingDetailPage } from '../../src/components/portal/FindingDetailPage';

const dateOffset = (days: number) => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const user: UserProfile = {
  id: 'user-viewer', username: 'viewer', email: 'viewer@local.test', fullName: 'Người xem', portal: 'INTERNAL',
  roles: ['VIEWER'], primaryRole: 'VIEWER', isActive: true, scopes: [],
};

const finding: Finding = {
  id: 'finding-overdue', channelId: 'chan-audit-bgs', channelCode: 'AUDIT_BGS', channelName: 'Kiểm toán',
  channelVersionId: 'v1', workflowVersionId: 'wf-v1', slaPolicyVersionId: 'sla-v1', cif: '12345678',
  customerName: 'Khách hàng SLA', clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
  creditBalance: 0, errorCode: 'TD01.01', errorTitle: 'Sai sót đã quá hạn', description: 'Mô tả sai sót dùng để kiểm thử giao diện SLA.',
  quantity: 1, exposureAmount: 0, workflowStatus: 'PENDING', slaStatus: 'OVERDUE', version: 1,
  deadlineDate: dateOffset(-1), isOverdue: true, evidenceCount: 0, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

const workQueue: MyWorkQueue = { actionable: [], following: [], accepted: [], watchTargets: [] };

describe('SLA UI behavior', () => {
  it('renders an overdue badge and calendar-day warning in the actual finding detail view', () => {
    const markup = renderToStaticMarkup(React.createElement(FindingDetailPage, {
      findings: [finding], currentUser: user, workQueue, onBack: () => undefined,
      onFindingUpdated: () => undefined, onWorkspaceChanged: () => undefined,
    }));

    expect(markup).toContain('aria-label="Trạng thái SLA: Quá hạn"');
    expect(markup).toContain('Quá hạn');
    expect(markup).toContain('Quá hạn 1 ngày.');
  });

  it('renders Vietnamese workflow history labels instead of technical event commands', () => {
    const historyFinding: Finding = {
      ...finding,
      history: [
        {
          id: 'event-submit', findingId: finding.id, command: 'SUBMIT_BRANCH', fromStatus: 'PENDING', toStatus: 'SUBMITTED_BRANCH',
          actorUserId: 'user-branch', actorName: 'Cán bộ chi nhánh', actorRole: 'BRANCH_INPUT', createdAt: '2026-08-25T08:00:00.000Z',
        },
        {
          id: 'event-approve', findingId: finding.id, command: 'BRANCH_CONTROL_APPROVE', fromStatus: 'SUBMITTED_BRANCH', toStatus: 'SUBMITTED_INTERNAL',
          actorUserId: 'user-controller', actorName: 'Kiểm soát chi nhánh', actorRole: 'BRANCH_CONTROLLER', createdAt: '2026-08-25T09:00:00.000Z',
        },
      ],
    };

    const markup = renderToStaticMarkup(React.createElement(FindingDetailPage, {
      findings: [historyFinding], currentUser: user, workQueue, onBack: () => undefined,
      onFindingUpdated: () => undefined, onWorkspaceChanged: () => undefined,
    }));

    expect(markup).toContain('Gửi kiểm soát chi nhánh');
    expect(markup).toContain('Chuyển phê duyệt HT');
    expect(markup).not.toContain('SUBMIT_BRANCH');
    expect(markup).not.toContain('BRANCH_CONTROL_APPROVE');
  });

  it('binds the overdue KPI component to dashboard.overdueCount', async () => {
    const appModule = await import('../../src/App');
    const OverdueKpi = (appModule as { OverdueKpi?: React.ComponentType<{ overdueCount: number }> }).OverdueKpi;

    expect(OverdueKpi).toBeTypeOf('function');
    if (!OverdueKpi) return;
    const markup = renderToStaticMarkup(React.createElement(OverdueKpi, { overdueCount: 7 }));
    expect(markup).toContain('Quá hạn');
    expect(markup).toContain('>7<');
  });
});

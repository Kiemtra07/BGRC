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

  /**
   * Thẻ số quá hạn nay do `ScopeSummaryTabs` dựng, cho cả hai phạm vi. Kiểm tra ngay tại đó thay vì
   * qua một component xuất khỏi `App` mà màn hình không còn dựng nữa — một bài kiểm tra chạy trên
   * code không ai gọi thì chỉ tạo cảm giác an tâm chứ không bảo vệ được gì.
   */
  it('renders the overdue count from the summary being shown', async () => {
    const { ScopeSummaryTabs } = await import('../../src/components/portal/ScopeSummaryTabs');
    const summary = {
      totalFindings: 12, activeFindings: 9, pendingRemediation: 3, submittedBranch: 2,
      submittedInternal: 1, rejected: 0, waivedResolved: 3, onTrackCount: 5, dueSoonCount: 0,
      overdueCount: 7, totalExposureAmount: 0, resolvedExposureAmount: 0, remediationRatePercent: 25,
    };
    const markup = renderToStaticMarkup(React.createElement(ScopeSummaryTabs, {
      scope: 'SCOPE' as const, onScopeChange: () => undefined, currentUser: null,
      scopeSummary: summary, campaignSummary: null, loading: false,
    }));

    expect(markup).toContain('Quá hạn');
    expect(markup).toContain('>7<');
    // Tab chuyên đề phải bị khoá khi chưa có kết quả tìm kiếm nào.
    expect(markup).toContain('disabled');
  });
});

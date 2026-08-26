import { describe, it, expect } from 'vitest';
import { SlaEvaluationWorker } from '../../server/src/worker/sla-worker';
import { Finding } from '../../shared/contracts';

describe('SLA Worker Invariants (P0-06)', () => {
  const worker = new SlaEvaluationWorker();

  const baseFinding: Finding = {
    id: 'find-sla-01',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng BGS',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '99999999',
    customerName: 'SLA Test Corp',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    creditBalance: 5000,
    errorCode: 'TD01.01',
    errorTitle: 'Sai sót kiểm tra',
    description: 'Mô tả',
    quantity: 1,
    exposureAmount: 1000,
    workflowStatus: 'PENDING',
    slaStatus: 'ON_TRACK',
    version: 1,
    deadlineDate: '2026-08-30',
    isOverdue: false,
    evidenceCount: 0,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
  };

  it('Evaluates ON_TRACK when deadline is > 3 days away', () => {
    const asOfDate = new Date('2026-08-20T08:30:00.000Z');
    const result = worker.evaluateFindingSla(baseFinding, asOfDate);

    expect(result.slaStatus).toBe('ON_TRACK');
    expect(result.isOverdue).toBe(false);
    expect(result.daysRemaining).toBe(10);
  });

  it('Evaluates DUE_SOON when deadline is between 1 and 3 days away', () => {
    const asOfDate = new Date('2026-08-28T08:30:00.000Z');
    const result = worker.evaluateFindingSla(baseFinding, asOfDate);

    expect(result.slaStatus).toBe('DUE_SOON');
    expect(result.isOverdue).toBe(false);
  });

  it('compares SLA by calendar date instead of the worker execution hour', () => {
    const result = worker.evaluateFindingSla(baseFinding, new Date('2026-08-27T00:01:00+07:00'));

    expect(result.daysRemaining).toBe(3);
    expect(result.slaStatus).toBe('DUE_SOON');
  });

  it('Evaluates OVERDUE when current date is past deadline', () => {
    const asOfDate = new Date('2026-09-02T08:30:00.000Z');
    const result = worker.evaluateFindingSla(baseFinding, asOfDate);

    expect(result.slaStatus).toBe('OVERDUE');
    expect(result.isOverdue).toBe(true);
  });

  it('P0-06 Invariant: Worker updates slaStatus but NEVER changes workflowStatus', () => {
    const asOfDate = new Date('2026-09-05T08:30:00.000Z'); // Far past deadline
    const copyFinding = { ...baseFinding, workflowStatus: 'SUBMITTED_BRANCH' as const };
    
    worker.runDailyEvaluation([copyFinding], asOfDate);

    expect(copyFinding.slaStatus).toBe('OVERDUE');
    expect(copyFinding.isOverdue).toBe(true);
    // CRITICAL: workflowStatus must remain exactly SUBMITTED_BRANCH
    expect(copyFinding.workflowStatus).toBe('SUBMITTED_BRANCH');
  });

  it('Resolved finding is evaluated as CLOSED and not marked overdue', () => {
    const resolvedFinding: Finding = {
      ...baseFinding,
      workflowStatus: 'WAIVED_RESOLVED',
      deadlineDate: '2026-08-01', // Expired date
    };

    const asOfDate = new Date('2026-08-24T08:30:00.000Z');
    const result = worker.evaluateFindingSla(resolvedFinding, asOfDate);

    expect(result.slaStatus).toBe('CLOSED');
    expect(result.isOverdue).toBe(false);
  });
});

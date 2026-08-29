import { describe, expect, it } from 'vitest';
import { countActiveFilters, emptyQueueFilters, matchesQueueFilters } from '../../src/components/portal/QueueFilterPanel';
import type { Finding } from '../../shared/contracts';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1', cif: '10482910', customerName: 'Công ty Cà Phê', clusterName: 'Cụm Tây Nguyên',
  branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng QLKH 1',
  officerName: 'Phạm Cán Bộ QLKH', errorCode: 'TD01.01', errorGroup: 'TD01',
  errorTitle: 'Lỗi', description: '', workflowStatus: 'PENDING', slaStatus: 'ON_TRACK',
  isOverdue: false, auditDate: '2026-05-10', createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z', version: 1, evidences: [], subItems: [],
  ...over,
} as Finding);

describe('bộ lọc hồ sơ', () => {
  const base = emptyQueueFilters();

  it('passes everything when nothing is selected', () => {
    expect(matchesQueueFilters(finding(), base)).toBe(true);
    expect(countActiveFilters(base)).toBe(0);
  });

  it('filters by chi nhánh, phòng, cụm, mã lỗi, nhóm lỗi and cán bộ', () => {
    const cases: Array<[Partial<typeof base>, boolean]> = [
      [{ branchCode: '635' }, true], [{ branchCode: '102' }, false],
      [{ department: 'Phòng QLKH 1' }, true], [{ department: 'Phòng QLKH 2' }, false],
      [{ clusterName: 'Cụm Tây Nguyên' }, true], [{ clusterName: 'Cụm Miền Bắc' }, false],
      [{ errorCode: 'TD01.01' }, true], [{ errorCode: 'TD09.99' }, false],
      [{ errorGroup: 'TD01' }, true], [{ errorGroup: 'TD09' }, false],
      [{ officerName: 'Phạm Cán Bộ QLKH' }, true], [{ officerName: 'Ai đó' }, false],
    ];
    for (const [patch, expected] of cases) {
      expect(matchesQueueFilters(finding(), { ...base, ...patch }), JSON.stringify(patch)).toBe(expected);
    }
  });

  it('treats an isOverdue flag as OVERDUE even when slaStatus lags behind', () => {
    const late = finding({ slaStatus: 'ON_TRACK', isOverdue: true });
    expect(matchesQueueFilters(late, { ...base, sla: 'OVERDUE' })).toBe(true);
    expect(matchesQueueFilters(late, { ...base, sla: 'ON_TRACK' })).toBe(false);
  });

  it('keeps only unresolved hồ sơ when "lỗi chưa xử lý" is on', () => {
    expect(matchesQueueFilters(finding({ workflowStatus: 'PENDING' }), { ...base, unresolvedOnly: true })).toBe(true);
    expect(matchesQueueFilters(finding({ workflowStatus: 'SUBMITTED_INTERNAL' }), { ...base, unresolvedOnly: true })).toBe(true);
    expect(matchesQueueFilters(finding({ workflowStatus: 'WAIVED_RESOLVED' }), { ...base, unresolvedOnly: true })).toBe(false);
  });

  it('filters trường hợp đặc biệt and tài liệu đính kèm', () => {
    expect(matchesQueueFilters(finding({ isSpecialCase: true }), { ...base, specialOnly: true })).toBe(true);
    expect(matchesQueueFilters(finding(), { ...base, specialOnly: true })).toBe(false);
    expect(matchesQueueFilters(finding({ evidences: [] }), { ...base, hasEvidence: 'NO' })).toBe(true);
    expect(matchesQueueFilters(finding({ evidences: [] }), { ...base, hasEvidence: 'YES' })).toBe(false);
    expect(matchesQueueFilters(finding({ evidences: [{ id: 'e1' } as never] }), { ...base, hasEvidence: 'YES' })).toBe(true);
  });

  it('applies the ngày kiểm tra range inclusively', () => {
    expect(matchesQueueFilters(finding(), { ...base, auditFrom: '2026-05-10', auditTo: '2026-05-10' })).toBe(true);
    expect(matchesQueueFilters(finding(), { ...base, auditFrom: '2026-05-11' })).toBe(false);
    expect(matchesQueueFilters(finding(), { ...base, auditTo: '2026-05-09' })).toBe(false);
  });

  it('falls back to the created date when a hồ sơ has no ngày kiểm tra', () => {
    const undated = finding({ auditDate: undefined, createdAt: '2026-03-02T00:00:00.000Z' });
    expect(matchesQueueFilters(undated, { ...base, auditFrom: '2026-03-01', auditTo: '2026-03-31' })).toBe(true);
    expect(matchesQueueFilters(undated, { ...base, auditFrom: '2026-04-01' })).toBe(false);
  });

  it('counts only the conditions that actually narrow the queue', () => {
    expect(countActiveFilters({ ...base, branchCode: '635' })).toBe(1);
    expect(countActiveFilters({ ...base, branchCode: '635', unresolvedOnly: true, auditFrom: '2026-01-01' })).toBe(3);
    // 'ALL', false and '' all mean "not filtering" and must never be counted.
    expect(countActiveFilters({ ...base, specialOnly: false, auditTo: '' })).toBe(0);
  });
});

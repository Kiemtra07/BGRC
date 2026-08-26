import { validateHeaderValue } from 'node:http';
import { describe, expect, it } from 'vitest';
import { canManageEvidenceAtBranch } from '../../shared/contracts/evidence';
import { buildInlineContentDisposition } from '../../server/src/http/content-disposition';

describe('evidence lifecycle policy', () => {
  it('allows branch evidence changes only before approval submission or after a return', () => {
    expect(canManageEvidenceAtBranch('PENDING')).toBe(true);
    expect(canManageEvidenceAtBranch('REJECTED')).toBe(true);
    expect(canManageEvidenceAtBranch('SUBMITTED_BRANCH')).toBe(false);
    expect(canManageEvidenceAtBranch('SUBMITTED_INTERNAL')).toBe(false);
    expect(canManageEvidenceAtBranch('WAIVED_RESOLVED')).toBe(false);
  });

  it('builds a valid inline header for a Vietnamese PDF filename', () => {
    const header = buildInlineContentDisposition('bài thu hoạch 07.06.2026.pdf');

    expect(() => validateHeaderValue('Content-Disposition', header)).not.toThrow();
    expect(header).toContain("filename*=UTF-8''b%C3%A0i%20thu%20ho%E1%BA%A1ch%2007.06.2026.pdf");
  });
});

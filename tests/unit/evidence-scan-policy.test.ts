import { describe, expect, it } from 'vitest';
import { initialEvidenceScanDisposition } from '../../server/src/security/evidence-scan-policy';

describe('initial evidence scan policy', () => {
  it('quarantines production uploads until an asynchronous scanner confirms them', () => {
    expect(initialEvidenceScanDisposition('production')).toEqual({
      status: 'QUARANTINED',
      notes: expect.stringMatching(/quét minh chứng/i),
    });
  });

  it('keeps test and local development workflows available after structural validation', () => {
    expect(initialEvidenceScanDisposition('test')).toEqual({ status: 'AVAILABLE' });
    expect(initialEvidenceScanDisposition('development')).toEqual({ status: 'AVAILABLE' });
    expect(initialEvidenceScanDisposition('test', true)).toMatchObject({ status: 'QUARANTINED' });
  });
});

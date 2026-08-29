import { describe, expect, it } from 'vitest';
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../../server/src/security/totp';

describe('Google Authenticator TOTP', () => {
  it('matches the RFC 6238 SHA-1 vector at Unix time 59', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(generateTotpCode(secret, 59_000, 8)).toBe('94287082');
  });

  it('accepts the current six-digit token and rejects malformed or stale tokens', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotpCode(secret, now);

    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, '000000', now)).toBe(false);
    expect(verifyTotpCode(secret, code, now + 120_000)).toBe(false);
  });

  it('creates a Google Authenticator provisioning URI', () => {
    const uri = buildOtpAuthUri('JBSWY3DPEHPK3PXP', 'admin@example.com');
    expect(uri).toBe('otpauth://totp/Audit%20Monitoring%3Aadmin%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Audit%20Monitoring&algorithm=SHA1&digits=6&period=30');
  });

  it('encrypts and decrypts a secret without storing it in plaintext', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP', key);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptTotpSecret(encrypted, key)).toBe('JBSWY3DPEHPK3PXP');
  });
});

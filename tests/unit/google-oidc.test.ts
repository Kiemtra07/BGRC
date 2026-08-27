import { describe, expect, it } from 'vitest';
import {
  createGoogleOidcState,
  validateGoogleOidcIdentity,
  verifyGoogleOidcState,
} from '../../server/src/security/google-oidc';

const stateSecret = 'oidc-state-secret-for-unit-tests';

describe('Google OIDC security helpers', () => {
  it('signs a short-lived login state and restores a safe in-app path', () => {
    const state = createGoogleOidcState({ secret: stateSecret, returnTo: '/reports', now: 1_000 });

    expect(verifyGoogleOidcState({ state, secret: stateSecret, now: 1_000 + 9 * 60_000 }))
      .toEqual({ returnTo: '/reports' });
  });

  it('rejects a tampered, expired, or external login callback path', () => {
    const state = createGoogleOidcState({ secret: stateSecret, returnTo: '/', now: 1_000 });

    expect(() => verifyGoogleOidcState({ state: `${state}tampered`, secret: stateSecret, now: 1_001 }))
      .toThrow(/state/i);
    expect(() => verifyGoogleOidcState({ state, secret: stateSecret, now: 1_000 + 11 * 60_000 }))
      .toThrow(/state/i);
    expect(() => createGoogleOidcState({ secret: stateSecret, returnTo: 'https://attacker.invalid', now: 1_000 }))
      .toThrow(/return/i);
  });

  /**
   * Trình duyệt coi dấu gạch ngược tương đương "/" và loại bỏ ký tự điều khiển khi phân giải URL,
   * nên các chuỗi dưới đây tuy bắt đầu bằng đúng một dấu "/" vẫn rời khỏi site nếu chỉ kiểm tra
   * tiền tố. Mỗi mục là một kiểu vượt rào đã được xác minh bằng bộ phân giải URL của Node.
   */
  it('rejects every off-site login return path that survives a prefix check', () => {
    const backslash = String.fromCharCode(92);
    const escapes = [
      `/${backslash}evil.example`,
      `/${backslash}${backslash}evil.example`,
      `/${String.fromCharCode(9)}/evil.example`,
      `/${String.fromCharCode(10)}/evil.example`,
      `/${String.fromCharCode(13)}${String.fromCharCode(10)}Location: https://evil.example`,
      '//evil.example',
    ];

    for (const returnTo of escapes) {
      expect(() => createGoogleOidcState({ secret: stateSecret, returnTo, now: 1_000 }), returnTo)
        .toThrow(/return/i);
    }
  });

  it('keeps ordinary in-app paths, including query and fragment, usable after login', () => {
    for (const returnTo of ['/', '/reports', '/findings/find-1?tab=evidence#top']) {
      const state = createGoogleOidcState({ secret: stateSecret, returnTo, now: 1_000 });
      expect(verifyGoogleOidcState({ state, secret: stateSecret, now: 1_000 })).toEqual({ returnTo });
    }
  });

  it('accepts only a verified Google identity for the configured audience', () => {
    expect(validateGoogleOidcIdentity({
      payload: {
        sub: 'google-subject-123',
        email: 'admin@example.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: 'client-id.apps.googleusercontent.com',
        name: 'Quản trị viên',
      },
      audience: 'client-id.apps.googleusercontent.com',
      issuer: 'https://accounts.google.com',
    })).toEqual({ subject: 'google-subject-123', email: 'admin@example.com', fullName: 'Quản trị viên' });

    expect(() => validateGoogleOidcIdentity({
      payload: { sub: 'other', email: 'admin@example.com', email_verified: false, iss: 'https://accounts.google.com', aud: 'client-id.apps.googleusercontent.com' },
      audience: 'client-id.apps.googleusercontent.com',
      issuer: 'https://accounts.google.com',
    })).toThrow(/email/i);
  });
});

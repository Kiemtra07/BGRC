import { describe, expect, it } from 'vitest';
import {
  createGoogleDriveOAuthState,
  decryptGoogleDriveRefreshToken,
  encryptGoogleDriveRefreshToken,
  verifyGoogleDriveOAuthState,
} from '../../server/src/security/google-drive-oauth-state';

const stateSecret = 'state-secret-for-unit-tests-only';
const encryptionKey = 'a'.repeat(64);

describe('Google Drive OAuth security helpers', () => {
  it('signs a short-lived state bound to the initiating administrator', () => {
    const state = createGoogleDriveOAuthState({ userId: 'admin-001', secret: stateSecret, now: 1_000 });

    expect(verifyGoogleDriveOAuthState({ state, secret: stateSecret, now: 1_000 + 9 * 60_000 }))
      .toEqual({ userId: 'admin-001' });
    expect(() => verifyGoogleDriveOAuthState({ state: `${state}tampered`, secret: stateSecret, now: 1_001 }))
      .toThrow(/OAuth state/i);
    expect(() => verifyGoogleDriveOAuthState({ state, secret: stateSecret, now: 1_000 + 11 * 60_000 }))
      .toThrow(/OAuth state/i);
  });

  it('encrypts a refresh token before it enters durable application state', () => {
    const encrypted = encryptGoogleDriveRefreshToken('refresh-token-value', encryptionKey);

    expect(encrypted).not.toContain('refresh-token-value');
    expect(decryptGoogleDriveRefreshToken(encrypted, encryptionKey)).toBe('refresh-token-value');
    expect(() => decryptGoogleDriveRefreshToken(encrypted, 'b'.repeat(64))).toThrow(/credential/i);
  });
});

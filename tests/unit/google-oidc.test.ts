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

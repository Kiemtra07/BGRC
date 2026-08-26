import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/src/security/password';
import { AuthSessionStore } from '../../server/src/security/session-store';

describe('password credentials', () => {
  it('hashes without storing plaintext and verifies only the correct password', async () => {
    const encoded = await hashPassword('AuditAdmin@2026');

    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain('AuditAdmin@2026');
    await expect(verifyPassword('AuditAdmin@2026', encoded)).resolves.toBe(true);
    await expect(verifyPassword('mat-khau-sai', encoded)).resolves.toBe(false);
  });

  it('rejects malformed stored credentials without throwing', async () => {
    await expect(verifyPassword('AuditAdmin@2026', 'not-a-valid-hash')).resolves.toBe(false);
  });
});

describe('server-side auth sessions', () => {
  it('stores only a digest and resolves an opaque token', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const store = new AuthSessionStore({ now: () => now, ttlMs: 60_000 });

    const created = store.create('user-admin');

    expect(created.token).toHaveLength(64);
    expect(created.record.tokenDigest).not.toBe(created.token);
    expect(store.resolve(created.token)?.userId).toBe('user-admin');
  });

  it('revokes and expires sessions', () => {
    let now = new Date('2026-08-25T00:00:00.000Z');
    const store = new AuthSessionStore({ now: () => now, ttlMs: 60_000 });
    const revoked = store.create('user-admin');
    const expired = store.create('user-branch-635');

    expect(store.revoke(revoked.token)).toBe(true);
    expect(store.resolve(revoked.token)).toBeUndefined();

    now = new Date('2026-08-25T00:01:01.000Z');
    expect(store.resolve(expired.token)).toBeUndefined();
    expect(store.records()).toHaveLength(0);
  });
});

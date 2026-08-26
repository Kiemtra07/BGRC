import crypto from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthStatePayload {
  version: 1;
  userId: string;
  expiresAt: number;
  nonce: string;
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function requireSecret(value: string, label: string): void {
  if (!value || value.length < 16) throw new Error(`${label} is not configured.`);
}

function secureEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createGoogleDriveOAuthState({ userId, secret, now = Date.now() }: { userId: string; secret: string; now?: number }): string {
  requireSecret(secret, 'Google OAuth state secret');
  if (!userId) throw new Error('Google OAuth state requires a user.');
  const payload: OAuthStatePayload = { version: 1, userId, expiresAt: now + STATE_TTL_MS, nonce: crypto.randomUUID() };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
  return `${encodedPayload}.${base64Url(signature)}`;
}

export function verifyGoogleDriveOAuthState({ state, secret, now = Date.now() }: { state: string; secret: string; now?: number }): { userId: string } {
  requireSecret(secret, 'Google OAuth state secret');
  const [encodedPayload, encodedSignature, ...extra] = state.split('.');
  if (!encodedPayload || !encodedSignature || extra.length) throw new Error('OAuth state is invalid.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
  if (!secureEqual(expectedSignature, decodeBase64Url(encodedSignature))) throw new Error('OAuth state signature is invalid.');
  let payload: OAuthStatePayload;
  try { payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as OAuthStatePayload; }
  catch { throw new Error('OAuth state is invalid.'); }
  if (payload.version !== 1 || !payload.userId || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now) throw new Error('OAuth state is expired or invalid.');
  return { userId: payload.userId };
}

function encryptionKey(rawKey: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(rawKey)) throw new Error('Google OAuth credential encryption key is invalid.');
  return Buffer.from(rawKey, 'hex');
}

export function encryptGoogleDriveRefreshToken(refreshToken: string, rawKey: string): string {
  if (!refreshToken) throw new Error('Google OAuth refresh token is missing.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  return ['v1', base64Url(iv), base64Url(cipher.getAuthTag()), base64Url(ciphertext)].join('.');
}

export function decryptGoogleDriveRefreshToken(storedCredential: string, rawKey: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = storedCredential.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) throw new Error('Google OAuth credential is invalid.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(rawKey), decodeBase64Url(encodedIv));
    decipher.setAuthTag(decodeBase64Url(encodedTag));
    return Buffer.concat([decipher.update(decodeBase64Url(encodedCiphertext)), decipher.final()]).toString('utf8');
  } catch { throw new Error('Google OAuth credential cannot be decrypted.'); }
}

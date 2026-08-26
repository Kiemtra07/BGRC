import crypto from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

interface GoogleOidcStatePayload {
  version: 1;
  returnTo: string;
  expiresAt: number;
  nonce: string;
}

export interface GoogleOidcTokenPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  iss?: string;
  aud?: string | string[];
  name?: string;
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function requireSecret(value: string): void {
  if (!value || value.length < 16) throw new Error('Google OIDC state secret is not configured.');
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireSafeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) throw new Error('Google OIDC return path is invalid.');
  return value;
}

export function createGoogleOidcState({ secret, returnTo, now = Date.now() }: { secret: string; returnTo: string; now?: number }): string {
  requireSecret(secret);
  const payload: GoogleOidcStatePayload = {
    version: 1,
    returnTo: requireSafeReturnTo(returnTo),
    expiresAt: now + STATE_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
  return `${encodedPayload}.${base64Url(signature)}`;
}

export function verifyGoogleOidcState({ state, secret, now = Date.now() }: { state: string; secret: string; now?: number }): { returnTo: string } {
  requireSecret(secret);
  const [encodedPayload, encodedSignature, ...extra] = state.split('.');
  if (!encodedPayload || !encodedSignature || extra.length) throw new Error('Google OIDC state is invalid.');
  const expected = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
  if (!safeEqual(expected, decodeBase64Url(encodedSignature))) throw new Error('Google OIDC state signature is invalid.');

  let payload: GoogleOidcStatePayload;
  try { payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as GoogleOidcStatePayload; }
  catch { throw new Error('Google OIDC state is invalid.'); }
  if (payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now) throw new Error('Google OIDC state is expired or invalid.');
  return { returnTo: requireSafeReturnTo(payload.returnTo) };
}

export function validateGoogleOidcIdentity({
  payload,
  audience,
  issuer,
}: {
  payload: GoogleOidcTokenPayload;
  audience: string;
  issuer: string;
}): { subject: string; email: string; fullName: string } {
  const tokenAudience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error('Google OIDC email is not verified.');
  const acceptedIssuers = issuer === 'https://accounts.google.com'
    ? new Set(['https://accounts.google.com', 'accounts.google.com'])
    : new Set([issuer]);
  if (!acceptedIssuers.has(payload.iss ?? '')) throw new Error('Google OIDC issuer is invalid.');
  if (!tokenAudience.includes(audience)) throw new Error('Google OIDC audience is invalid.');
  return {
    subject: payload.sub,
    email: payload.email.trim().toLocaleLowerCase('en-US'),
    fullName: payload.name?.trim() || payload.email,
  };
}

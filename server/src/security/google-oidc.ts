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
  nonce?: string;
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

/**
 * Chỉ chấp nhận đường dẫn tuyệt đối nằm trong chính site này.
 *
 * Kiểm tra "bắt đầu bằng / và không bắt đầu bằng //" là chưa đủ: khi phân giải URL cho scheme
 * đặc biệt (http/https), trình duyệt coi dấu gạch ngược tương đương "/" và loại bỏ ký tự điều
 * khiển khỏi URL. Vì vậy "/\evil.com" hay "/<TAB>/evil.com" tuy vượt qua kiểm tra tiền tố vẫn
 * được phân giải thành "https://evil.com/" — đủ để biến luồng đăng nhập Google thành bàn đạp
 * phishing. Ở đây chặn thẳng các ký tự đó rồi đối chiếu lại bằng chính bộ phân giải URL.
 */
const INTERNAL_ORIGIN = 'https://audit-bgs.invalid';

function requireSafeReturnTo(value: string): string {
  const invalid = () => new Error('Google OIDC return path is invalid.');
  if (!value.startsWith('/')) throw invalid();
  if (/[\\\u0000-\u001f\u007f]/.test(value)) throw invalid();
  if (/^\/[/\\]/.test(value)) throw invalid();

  let resolved: URL;
  try { resolved = new URL(value, INTERNAL_ORIGIN); }
  catch { throw invalid(); }
  if (resolved.origin !== INTERNAL_ORIGIN) throw invalid();
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
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

export function verifyGoogleOidcState({ state, secret, now = Date.now() }: { state: string; secret: string; now?: number }): { returnTo: string; nonce: string } {
  requireSecret(secret);
  const [encodedPayload, encodedSignature, ...extra] = state.split('.');
  if (!encodedPayload || !encodedSignature || extra.length) throw new Error('Google OIDC state is invalid.');
  const expected = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest();
  if (!safeEqual(expected, decodeBase64Url(encodedSignature))) throw new Error('Google OIDC state signature is invalid.');

  let payload: GoogleOidcStatePayload;
  try { payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as GoogleOidcStatePayload; }
  catch { throw new Error('Google OIDC state is invalid.'); }
  if (payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now || typeof payload.nonce !== 'string' || payload.nonce.length < 16) throw new Error('Google OIDC state is expired or invalid.');
  return { returnTo: requireSafeReturnTo(payload.returnTo), nonce: payload.nonce };
}

export function validateGoogleOidcIdentity({
  payload,
  audience,
  issuer,
  expectedNonce,
}: {
  payload: GoogleOidcTokenPayload;
  audience: string;
  issuer: string;
  expectedNonce?: string;
}): { subject: string; email: string; fullName: string } {
  const tokenAudience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error('Google OIDC email is not verified.');
  const acceptedIssuers = issuer === 'https://accounts.google.com'
    ? new Set(['https://accounts.google.com', 'accounts.google.com'])
    : new Set([issuer]);
  if (!acceptedIssuers.has(payload.iss ?? '')) throw new Error('Google OIDC issuer is invalid.');
  if (!tokenAudience.includes(audience)) throw new Error('Google OIDC audience is invalid.');
  if (expectedNonce !== undefined && payload.nonce !== expectedNonce) throw new Error('Google OIDC nonce is invalid.');
  return {
    subject: payload.sub,
    email: payload.email.trim().toLocaleLowerCase('en-US'),
    fullName: payload.name?.trim() || payload.email,
  };
}

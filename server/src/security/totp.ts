import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function decodeBase32(value: string): Buffer {
  const normalized = value.replace(/[=\s-]/g, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('Invalid TOTP secret.');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function counterBuffer(counter: number): Buffer {
  const result = Buffer.alloc(8);
  result.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  result.writeUInt32BE(counter >>> 0, 4);
  return result;
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

/** Return a TOTP token. Google Authenticator uses six digits; other widths are useful for RFC tests. */
export function generateTotpCode(secret: string, timestampMs = Date.now(), digits = TOTP_DIGITS): string {
  if (![6, 8].includes(digits)) throw new Error('TOTP digits must be 6 or 8.');
  const counter = Math.floor(timestampMs / 1_000 / TOTP_PERIOD_SECONDS);
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

export function verifyTotpCode(secret: string, submittedCode: string, timestampMs = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(submittedCode) || !Number.isInteger(window) || window < 0 || window > 2) return false;
  try {
    for (let offset = -window; offset <= window; offset += 1) {
      const expected = Buffer.from(generateTotpCode(secret, timestampMs + offset * TOTP_PERIOD_SECONDS * 1_000));
      const actual = Buffer.from(submittedCode);
      if (timingSafeEqual(expected, actual)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function buildOtpAuthUri(secret: string, accountName: string, issuer = 'Audit Monitoring'): string {
  const normalizedSecret = secret.replace(/[=\s-]/g, '').toUpperCase();
  decodeBase32(normalizedSecret);
  const label = `${issuer}:${accountName}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(normalizedSecret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function encryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('TOTP encryption key must be 32 bytes.');
  return key;
}

/** AES-256-GCM envelope: v1.iv.tag.ciphertext, all base64url encoded. */
export function encryptTotpSecret(secret: string, key: string): string {
  decodeBase32(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptTotpSecret(payload: string, key: string): string {
  const [version, ivEncoded, tagEncoded, dataEncoded] = payload.split('.');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !dataEncoded) throw new Error('Invalid encrypted TOTP secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataEncoded, 'base64url')), decipher.final()]).toString('utf8');
  decodeBase32(plaintext);
  return plaintext;
}


import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function newSecret(prefix = '') {
  return prefix + randomBytes(32).toString('base64url');
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string) {
  const salt = randomBytes(24).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password: string, stored: { salt: string; hash: string }) {
  const calculated = await scrypt(password, stored.salt, 64) as Buffer;
  const expected = Buffer.from(stored.hash, 'hex');
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}

export function tokenEquals(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

export function redact(text: string, secrets: string[]) {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  }
  return out;
}

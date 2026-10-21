// Encrypted cookie (AES-256-GCM). Strava tokens live only in the customer's browser cookie,
// so nothing is stored on our side and disconnecting simply clears it.
import crypto from 'node:crypto';

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ random characters)');
  return crypto.createHash('sha256').update(s).digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

export function unseal(str) {
  if (!str) return null;
  try {
    const b = Buffer.from(str, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}

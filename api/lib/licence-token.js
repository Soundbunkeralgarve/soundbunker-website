// SoundBunker licence tokens: the website side of src/sb_licensing.cpp (verifyToken).
// The website keeps a copy of this file at api/lib/licence-token.js; LICENSING/sync.sh refreshes it.
//
// token = base64url(JSON payload) + "." + base64url(RSA-PKCS#1 v1.5 SHA-256 signature of the first part)
// payload: { v: 1, typ: "licence" | "trial", pid, lic, lid, em, mid, iat, chk, exp }   (times in unix seconds)
// lid is the website's licence id (the key itself is masked in the token); the plug-in ignores it.
import crypto from 'node:crypto';

const DAY = 24 * 60 * 60;
export const LICENCE_CHECK_DAYS = 30;   // plug-ins ask again after this; they keep working 60 more days offline
export const TRIAL_DAYS = 14;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function signToken(payload, privateKeyPem) {
  const body = b64url(JSON.stringify({ v: 1, ...payload }));
  const sig = crypto.sign('sha256', Buffer.from(body), { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING });
  return `${body}.${b64url(sig)}`;
}

export function verifyToken(token, publicKeyPem) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const ok = crypto.verify('sha256', Buffer.from(body), { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  if (!ok) return null;
  try {
    const claims = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return claims.v === 1 ? claims : null;
  } catch { return null; }
}

export const maskEmail = (email) => {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
};

export const maskKey = (key) => {
  const parts = String(key || '').split('-');
  return parts.length === 5 ? `${parts[0]}-${parts[1]}-*****-*****-${parts[4]}` : '';
};

export function licenceToken({ product, key, licenceId = '', email, machine }, privateKeyPem, now = Math.floor(Date.now() / 1000)) {
  return signToken({ typ: 'licence', pid: product, lic: maskKey(key), lid: licenceId, em: maskEmail(email), mid: machine,
    iat: now, chk: now + LICENCE_CHECK_DAYS * DAY, exp: 0 }, privateKeyPem);
}

export function trialToken({ product, machine, startedAt }, privateKeyPem, now = Math.floor(Date.now() / 1000)) {
  const start = startedAt || now;
  return signToken({ typ: 'trial', pid: product, lic: '', em: '', mid: machine,
    iat: now, chk: 0, exp: start + TRIAL_DAYS * DAY }, privateKeyPem);
}

// Licence keys: SB-XXXXX-XXXXX-XXXXX-XXXXX, Crockford base32 (no I, L, O, U), 100 random bits.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newLicenceKey() {
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % 32];
  return `SB-${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

export const normaliseKey = (key) => String(key || '').trim().toUpperCase().replace(/[^0-9A-Z-]/g, '')
  .replace(/O/g, '0').replace(/[IL]/g, '1');

// Tiny helpers that work on plain Node req/res (local dev) and on Vercel functions.
export const query = req => Object.fromEntries(new URL(req.url, 'http://x').searchParams);

export function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

export function setCookie(res, name, value, maxAge, path = '/api/strava') {
  const secure = site().startsWith('https://') ? '; Secure' : '';
  const c = `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : [c]);
}
export const clearCookie = (res, name, path) => setCookie(res, name, '', 0, path);

// Raw request body (Stripe needs the exact bytes to check its signature). Capped so nobody can flood a function.
export async function readBody(req, limit = 4_000_000) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = []; let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new HttpError(413, 'That upload is too big.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const b = await readBody(req, limit);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Bad request.'); }
}

// The site's address. PUBLIC_URL wins if set; on Vercel it otherwise comes from the project's production domain automatically.
export const site = () => {
  const u = process.env.PUBLIC_URL || process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '');
  return u.trim().replace(/\/+$/, '');
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap a handler so thrown HttpErrors become JSON and anything else becomes a plain 500.
export const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    json(res, e instanceof HttpError ? e.status : 500, { error: e instanceof HttpError ? e.message : 'Something went wrong. Try again.' });
  }
};

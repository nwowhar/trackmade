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

export function setCookie(res, name, value, maxAge) {
  const secure = (process.env.PUBLIC_URL || '').startsWith('https://') ? '; Secure' : '';
  const c = `${name}=${encodeURIComponent(value)}; Path=/api/strava; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : [c]);
}
export const clearCookie = (res, name) => setCookie(res, name, '', 0);

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

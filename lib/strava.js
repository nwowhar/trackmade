import { cookies, setCookie, clearCookie, HttpError } from './http.js';
import { seal, unseal } from './session.js';

export const SESSION = 'tm_strava';
export const STATE = 'tm_strava_state';
const SESSION_AGE = 24 * 3600;           // customer stays connected for a day

// STRAVA_BASE is only overridden for local testing against dev/mock-strava.js
export const base = () => (process.env.STRAVA_BASE || 'https://www.strava.com').replace(/\/$/, '');
export const config = () => ({
  id: process.env.STRAVA_CLIENT_ID,
  secret: process.env.STRAVA_CLIENT_SECRET,
  site: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
});
export const configured = () => { const c = config(); return !!(c.id && c.secret && c.site && process.env.SESSION_SECRET); };

export async function tokenRequest(params) {
  const { id, secret } = config();
  const r = await fetch(base() + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 401, 'Strava sign-in failed. Connect again.');
  return j;
}

export const saveSession = (res, s) => setCookie(res, SESSION, seal(s), SESSION_AGE);
export const clearSession = res => clearCookie(res, SESSION);

// Returns the session with a fresh access token (refreshing it if it expires within a minute), or null.
export async function getSession(req, res) {
  const s = unseal(cookies(req)[SESSION]);
  if (!s) return null;
  if (s.exp - 60 < Date.now() / 1000) {
    try {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.rt });
      Object.assign(s, { at: t.access_token, rt: t.refresh_token, exp: t.expires_at });
      saveSession(res, s);
    } catch { clearSession(res); return null; }
  }
  return s;
}

export async function stravaGet(req, res, s, path) {
  const r = await fetch(base() + '/api/v3' + path, { headers: { Authorization: 'Bearer ' + s.at } });
  if (r.ok) return r.json();
  if (r.status === 401) { clearSession(res); throw new HttpError(401, 'Your Strava connection expired. Connect again.'); }
  if (r.status === 429) throw new HttpError(429, 'Strava is busy right now. Try again in 15 minutes, or upload the GPX file instead.');
  if (r.status === 404) throw new HttpError(404, 'That activity isn’t available. It may have been deleted.');
  throw new HttpError(502, `Strava didn’t respond properly (${r.status}). Try again shortly.`);
}

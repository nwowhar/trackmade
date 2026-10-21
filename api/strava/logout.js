// POST /api/strava/logout  ->  revoke our access at Strava and clear the cookie
import { handle, json } from '../../lib/http.js';
import { getSession, clearSession, base } from '../../lib/strava.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const s = await getSession(req, res);
  if (s) {
    // Strava is replacing /oauth/deauthorize with /oauth/revoke by June 2027; try the new one first.
    const body = new URLSearchParams({ access_token: s.at, token: s.at });
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer ' + s.at }, body };
    const r = await fetch(base() + '/oauth/revoke', opts).catch(() => null);
    if (!r || !r.ok) await fetch(base() + '/oauth/deauthorize', opts).catch(() => null);
  }
  clearSession(res);
  json(res, 200, { ok: true });
});

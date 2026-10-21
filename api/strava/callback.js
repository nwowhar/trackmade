// GET /api/strava/callback?code=…&scope=…&state=…  (Strava sends the customer back here)
import { handle, query, redirect, cookies, clearCookie } from '../../lib/http.js';
import { unseal } from '../../lib/session.js';
import { tokenRequest, saveSession, STATE } from '../../lib/strava.js';

export default handle(async (req, res) => {
  const q = query(req);
  const st = unseal(cookies(req)[STATE]);
  clearCookie(res, STATE);
  const back = tag => redirect(res, (st?.ret || '/').split('#')[0] + '#' + tag);
  if (!st || !q.state || q.state !== st.state) return back('strava-error');
  if (q.error || !q.code) return back('strava-denied');
  const scopes = (q.scope || '').split(',');
  if (!scopes.includes('activity:read') && !scopes.includes('activity:read_all')) return back('strava-noscope');
  let t;
  try { t = await tokenRequest({ code: q.code, grant_type: 'authorization_code' }); }
  catch { return back('strava-error'); }
  saveSession(res, {
    at: t.access_token, rt: t.refresh_token, exp: t.expires_at,
    ath: { id: t.athlete?.id, name: t.athlete?.firstname || '', img: t.athlete?.profile_medium || '' },
  });
  back('strava');
});

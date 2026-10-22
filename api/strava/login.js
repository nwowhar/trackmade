// GET /api/strava/login?return=/path  ->  Strava's "Authorize TrackMade" page
import crypto from 'node:crypto';
import { handle, query, redirect, setCookie, json } from '../../lib/http.js';
import { seal } from '../../lib/session.js';
import { base, config, configured, STATE } from '../../lib/strava.js';

export default handle(async (req, res) => {
  // ?check=1 -> is the Strava button switched on? (the order form hides it until Strava is set up and approved)
  if (query(req).check) return json(res, 200, { on: configured() && process.env.STRAVA_PUBLIC === '1' });
  let ret = query(req).return || '/';
  if (!ret.startsWith('/') || ret.startsWith('//')) ret = '/';          // only ever send people back to our own site
  if (!configured()) return redirect(res, ret + '#strava-config');
  const { id, site } = config();
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, STATE, seal({ state, ret }), 600);
  const u = new URL(base() + '/oauth/authorize');
  u.search = new URLSearchParams({
    client_id: id,
    redirect_uri: site + '/api/strava/callback',
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',     // read_all so private / "only me" activities can be ordered too
    state,
  });
  redirect(res, u.toString());
});

// GET /api/strava/streams?id=123  ->  {points: [[lat, lon, ele, secondsFromStart], …]}
import { handle, query, json, HttpError } from '../../lib/http.js';
import { getSession, stravaGet } from '../../lib/strava.js';

export default handle(async (req, res) => {
  const s = await getSession(req, res);
  if (!s) return json(res, 401, { error: 'Your Strava connection expired. Connect again.' });
  const id = String(query(req).id || '');
  if (!/^\d{1,20}$/.test(id)) throw new HttpError(400, 'Bad activity id');
  const st = await stravaGet(req, res, s, `/activities/${id}/streams?keys=latlng,altitude,time&key_by_type=true`);
  const ll = st.latlng?.data || [], al = st.altitude?.data || [], tm = st.time?.data || [];
  if (ll.length < 2) throw new HttpError(422, 'That activity has no GPS track (indoor or manual). Pick one recorded outdoors.');
  json(res, 200, {
    id,
    points: ll.map((p, i) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6, al[i] != null ? Math.round(al[i] * 10) / 10 : null, tm[i] ?? null]),
  });
});

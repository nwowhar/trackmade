// GET /api/strava/activities?page=1  ->  the customer's recent activities, 30 per page
import { handle, query, json } from '../../lib/http.js';
import { getSession, stravaGet } from '../../lib/strava.js';

export default handle(async (req, res) => {
  const s = await getSession(req, res);
  if (!s) return json(res, 401, { error: 'Not connected to Strava' });
  const q = query(req);
  const page = Math.min(50, Math.max(1, parseInt(q.page, 10) || 1));
  const per = Math.min(100, Math.max(1, parseInt(q.per_page, 10) || 30));
  const range = ['after', 'before'].filter(k => /^\d{9,11}$/.test(q[k] || '')).map(k => `&${k}=${q[k]}`).join('');   // multi-day trips: date window
  const list = await stravaGet(req, res, s, `/athlete/activities?per_page=${per}&page=${page}${range}`);
  json(res, 200, {
    athlete: { name: s.ath?.name || '', img: s.ath?.img || '' },
    more: list.length === per,
    activities: list.map(a => ({
      id: String(a.id),
      name: a.name,
      type: (a.sport_type || a.type || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2'),
      start: a.start_date,
      local: (a.start_date_local || a.start_date || '').replace(/Z$/, ''),
      km: Math.round((a.distance || 0) / 10) / 100,
      gain: Math.round(a.total_elevation_gain || 0),
      secs: a.elapsed_time || 0,
      gps: !!(a.map?.summary_polyline || a.start_latlng?.length),
      line: a.map?.summary_polyline || '',
    })),
  });
});

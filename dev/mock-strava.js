// Fake Strava for offline testing (no real account needed). Point STRAVA_BASE at it:
//   STRAVA_BASE=http://localhost:3999 node dev/server.js   +   node dev/mock-strava.js
// Activities are the Everest Base Camp sample split into days, plus one indoor ride with no GPS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { route, stops } = JSON.parse(fs.readFileSync(path.join(HERE, 'ebc_sample.json'), 'utf8'));
const near = p => route.reduce((b, q, i) => { const d = (q[0] - p.lat) ** 2 + (q[1] - p.lon) ** 2; return d < b.d ? { d, i } : b; }, { d: 1e9, i: 0 }).i;
const cut = stops.map(near);
const enc = pts => { let out = '', pl = 0, pn = 0; const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, lo] of pts) { const a = Math.round(la * 1e5), b = Math.round(lo * 1e5); out += e(a - pl) + e(b - pn); pl = a; pn = b; } return out; };
const acts = [];
for (let d = 0; d < cut.length - 1; d++) {
  const seg = route.slice(cut[d], cut[d + 1] + 1);
  if (seg.length < 2) continue;
  const start = new Date(Date.UTC(2025, 9, 6 + acts.length, 1, 30));
  acts.push({ id: 16000000000 + d, name: `${stops[d].n} to ${stops[d + 1].n}`, sport_type: 'Hike', start_date: start.toISOString(),
    start_date_local: new Date(start.getTime() + 5.75 * 3600e3).toISOString(), distance: seg.length * 75, total_elevation_gain: 400 + 50 * d,
    start_latlng: seg[0], map: { summary_polyline: enc(seg) }, seg });
}
acts.reverse();
acts.push({ id: 15999999999, name: 'Zwift ride', sport_type: 'VirtualRide', start_date: '2025-10-01T22:00:00Z', start_date_local: '2025-10-02T06:00:00Z', distance: 24100, total_elevation_gain: 210, start_latlng: [], map: { summary_polyline: '' } });

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
let calls = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  calls++;
  if (u.pathname === '/oauth/authorize') {
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.search = new URLSearchParams({ state: u.searchParams.get('state'), code: 'mockcode', scope: u.searchParams.get('scope') });
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (u.pathname === '/oauth/token') return send(res, 200, { access_token: 'AT' + Date.now(), refresh_token: 'RT', expires_at: Math.floor(Date.now() / 1000) + 21600,
    athlete: { id: 1, firstname: 'Nic', profile_medium: '' } });
  if (u.pathname === '/oauth/revoke' || u.pathname === '/oauth/deauthorize') return send(res, 200, {});
  if (!/^Bearer AT/.test(req.headers.authorization || '')) return send(res, 401, { message: 'Authorization Error' });
  if (u.pathname === '/api/v3/athlete/activities') {
    const page = +u.searchParams.get('page') || 1, after = +u.searchParams.get('after') || 0, before = +u.searchParams.get('before') || 9e9;
    const hit = acts.filter(a => { const t = Date.parse(a.start_date) / 1000; return t > after && t < before; });
    return send(res, 200, page === 1 ? hit.map(({ seg, ...a }) => ({ ...a, elapsed_time: 6 * 3600 })) : []);
  }
  const m = u.pathname.match(/^\/api\/v3\/activities\/(\d+)\/streams$/);
  if (m) {
    const a = acts.find(x => String(x.id) === m[1]);
    if (!a) return send(res, 404, { message: 'Record Not Found' });
    if (!a.seg) return send(res, 200, { time: { data: [0, 1] } });
    const n = a.seg.length;
    return send(res, 200, { latlng: { data: a.seg }, altitude: { data: a.seg.map((_, i) => 2800 + i * 2) }, time: { data: a.seg.map((_, i) => Math.round(i / (n - 1) * 6 * 3600)) } });
  }
  send(res, 404, { message: 'Not found' });
}).listen(3999, () => console.log('mock Strava on http://localhost:3999'));

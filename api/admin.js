// Your side: the dashboard (password login, cookie) and TrackMade Studio (Authorization: Bearer ADMIN_API_KEY).
//   POST login {password} · POST logout · GET me
//   GET  list[&status=new,approved]   GET get&ref=TM-1001 (includes a 1-hour download link for the GPS track)
//   POST status {ref,status,tracking_number} · POST note {ref,note} · POST preview {ref,image(base64),type,note}
//   POST production {ref, plate:'terrain'|'route', state:'queued'|'printing'|'printed'}  (print tracking, from Studio)
import crypto from 'node:crypto';
import { handle, query, json, readJson, cookies, setCookie, clearCookie, HttpError } from '../lib/http.js';
import { seal, unseal } from '../lib/session.js';
import * as db from '../lib/db.js';
import * as orders from '../lib/orders.js';
import { STATUSES } from '../lib/config.js';

const COOKIE = 'tm_admin', PATH = '/api/admin', AGE = 12 * 3600;
const same = (a, b) => { const h = s => crypto.createHash('sha256').update(String(s)).digest(); return crypto.timingSafeEqual(h(a), h(b)); };

function authed(req) {
  const key = process.env.ADMIN_API_KEY, auth = req.headers.authorization || '';
  if (key && key.length >= 24 && auth.startsWith('Bearer ') && same(auth.slice(7), key)) return 'studio';
  const s = unseal(cookies(req)[COOKIE]);
  return s && s.exp > Date.now() / 1000 ? 'dashboard' : null;
}

async function find(ref) {
  const o = await db.getOrder({ ref: String(ref || '').slice(0, 20) });
  if (!o) throw new HttpError(404, 'Order not found');
  return o;
}

export default handle(async (req, res) => {
  const a = query(req).a;
  if (a === 'login' && req.method === 'POST') {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw || pw.length < 10) throw new HttpError(503, 'Set ADMIN_PASSWORD (10+ characters) in Vercel first.');
    const b = await readJson(req, 2000);
    if (!same(b.password || '', pw)) { await new Promise(r => setTimeout(r, 800)); throw new HttpError(401, 'Wrong password'); }
    setCookie(res, COOKIE, seal({ exp: Math.floor(Date.now() / 1000) + AGE }), AGE, PATH);
    return json(res, 200, { ok: true });
  }
  if (a === 'logout') { clearCookie(res, COOKIE, PATH); return json(res, 200, { ok: true }); }
  const who = authed(req);
  if (!who) throw new HttpError(401, 'Log in');
  if (a === 'me') return json(res, 200, { ok: true, who, statuses: STATUSES, live: { db: db.live(), stripe: !!process.env.STRIPE_SECRET_KEY, email: !!process.env.RESEND_API_KEY } });

  if (req.method === 'GET' && a === 'list') {
    const list = await db.listOrders({ status: query(req).status });
    const out = [];
    for (const o of list) out.push(await orders.autoApprove(o));
    return json(res, 200, { orders: out.map(({ token, ...o }) => o) });
  }
  if (req.method === 'GET' && a === 'get') {
    const o = await orders.autoApprove(await find(query(req).ref));
    const { token, ...rest } = o;
    return json(res, 200, { order: rest, track_url: o.track_path ? await db.signedUrl('tracks', o.track_path, 3600) : null,
                            customer_link: `/order/${o.ref}?t=${o.token}` });
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const b = await readJson(req, 4_200_000);
  const o = await find(b.ref);
  let done;
  if (a === 'status') done = await orders.setStatus(o, b.status, b);
  else if (a === 'note') done = await orders.saveNote(o, b.note);
  else if (a === 'production') done = await orders.setProduction(o, b.plate, b.state);
  else if (a === 'preview') {
    const m = /^data:(image\/(?:jpeg|png));base64,/.exec(b.image || '');
    const buf = Buffer.from(String(b.image || '').replace(/^data:[^,]+,/, ''), 'base64');
    done = await orders.sendPreview(o, buf, m ? m[1] : (b.type || 'image/jpeg'), b.note);
  } else throw new HttpError(404, 'Not found');
  const { token, ...rest } = done;
  json(res, 200, { order: rest });
});

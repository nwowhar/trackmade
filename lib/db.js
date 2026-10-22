// Orders database and file storage.
// Live: Supabase (Postgres REST + Storage) with the service key, which never leaves the server.
// Local testing (no SUPABASE_URL, not on Vercel): a JSON file and a folder under dev/data/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';

const SB = () => (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');   // accepts the URL with or without /rest/v1/
const KEY = () => process.env.SUPABASE_SERVICE_KEY || '';
export const live = () => !!(SB() && KEY());
// New-style Supabase secret keys (sb_secret_…) go in the apikey header only; old service_role keys are JWTs and also go in Authorization.
const auth = () => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY() } : {}) });
const local = () => !live() && !process.env.VERCEL;

function need() {
  if (!live() && !local()) throw new HttpError(503, 'Orders aren’t switched on yet. Please try again soon.');
}

// ---------------------------------------------------------------- Supabase REST
async function sb(method, p, body, extra = {}) {
  const r = await fetch(SB() + p, {
    method,
    headers: { ...auth(), 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) { console.error('supabase', method, p, r.status, text.slice(0, 300)); throw new HttpError(502, 'The order database didn’t respond. Try again.'); }
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- local JSON stand-in
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dev', 'data');
const DBF = path.join(DATA, 'orders.json');
const readLocal = () => { try { return JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch { return []; } };
const writeLocal = rows => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(DBF, JSON.stringify(rows, null, 1)); };

// ---------------------------------------------------------------- orders
export async function insertOrder(o) {
  need();
  if (live()) return (await sb('POST', '/rest/v1/orders', o))[0];
  const rows = readLocal();
  const row = { id: crypto.randomUUID(), ref: 'TM-' + (1001 + rows.length), created_at: new Date().toISOString(), history: [], ...o };
  rows.push(row); writeLocal(rows); return row;
}

export async function getOrder({ id, ref }) {
  need();
  if (live()) {
    const q = id ? `id=eq.${encodeURIComponent(id)}` : `ref=eq.${encodeURIComponent(ref)}`;
    return (await sb('GET', `/rest/v1/orders?${q}&select=*`))[0] || null;
  }
  return readLocal().find(r => (id && r.id === id) || (ref && r.ref === ref)) || null;
}

export async function updateOrder(id, patch) {
  need();
  if (live()) return (await sb('PATCH', `/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, patch))[0];
  const rows = readLocal(); const i = rows.findIndex(r => r.id === id);
  if (i < 0) throw new HttpError(404, 'Order not found');
  rows[i] = { ...rows[i], ...patch }; writeLocal(rows); return rows[i];
}

export async function listOrders({ status, limit = 200 } = {}) {
  need();
  if (live()) {
    const f = status ? `status=in.(${status.split(',').map(encodeURIComponent).join(',')})&` : 'status=neq.pending_payment&';
    return sb('GET', `/rest/v1/orders?${f}select=*&order=created_at.asc&limit=${limit}`);
  }
  const st = status ? status.split(',') : null;
  return readLocal().filter(r => st ? st.includes(r.status) : r.status !== 'pending_payment')
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, limit);
}

// ---------------------------------------------------------------- files
// buckets: "tracks" (private: customers' GPS files) and "previews" (public, random file names: confirmation photos)
export async function putFile(bucket, name, buf, type) {
  need();
  if (live()) {
    const r = await fetch(`${SB()}/storage/v1/object/${bucket}/${name}`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': type, 'x-upsert': 'true' }, body: buf,
    });
    if (!r.ok) { console.error('storage', r.status, (await r.text()).slice(0, 300)); throw new HttpError(502, 'Saving the file failed. Try again.'); }
    return name;
  }
  const f = path.join(DATA, 'storage', bucket, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return name;
}

export const publicUrl = (bucket, name) =>
  live() ? `${SB()}/storage/v1/object/public/${bucket}/${name}` : `/dev-storage/${bucket}/${name}`;

// a short-lived download link for a private file (the customer's GPS track)
export async function signedUrl(bucket, name, seconds = 3600) {
  need();
  if (!live()) return `/dev-storage/${bucket}/${name}`;
  const r = await fetch(`${SB()}/storage/v1/object/sign/${bucket}/${name}`, {
    method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.signedURL) throw new HttpError(502, 'Couldn’t make a download link.');
  return `${SB()}/storage/v1${j.signedURL}`;
}

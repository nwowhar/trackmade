// Everything that happens to an order, in one place. The API routes only check who's asking and call these.
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { SIZES, SHIPPING, MAKE_DAYS, AUTO_APPROVE_DAYS, FONTS, STATUSES } from './config.js';
import * as db from './db.js';
import { createCheckout } from './stripe.js';
import { send, templates, ADMIN } from './mail.js';

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const now = () => new Date().toISOString();
const event = (o, what, by = 'system') => [...(o.history || []), { at: now(), what, by }];

// A customer's GPS file is only ever stored and handed to Studio as data. We still check it's plain GPX:
// no DTD/entity declarations (XML attacks), a size cap, and real coordinates.
export function checkGpx(text) {
  if (typeof text !== 'string' || !text) return null;
  if (text.length > 3_500_000) throw new HttpError(413, 'That track is too big. Try a shorter date range, or email us the file.');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new HttpError(400, 'That file doesn’t look like a normal GPS file.');
  if (!/<gpx[\s>]/i.test(text)) throw new HttpError(400, 'That file isn’t a GPX file.');
  let n = 0;
  for (const m of text.matchAll(/<(?:trkpt|rtept)\s+[^>]*?lat="(-?[\d.]+)"[^>]*?lon="(-?[\d.]+)"/g)) {
    const la = +m[1], lo = +m[2];
    if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) n++;
  }
  if (n < 2) throw new HttpError(400, 'That GPS file has no track points.');
  return n;
}

// ------------------------------------------------------------------ checkout
export async function createOrder(p) {
  const size = SIZES[p.size];
  if (!size) throw new HttpError(400, 'Pick a size.');
  const email = clean(p.email, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'Add your email so we can send your order confirmation.');
  const source = clean(p.source, 80);
  if (!source || source === 'example') throw new HttpError(400, 'Add your track first.');
  const gpx = typeof p.gpx === 'string' && p.gpx ? p.gpx : null;
  const points = gpx ? checkGpx(gpx) : 0;
  if ((source === 'file' || source === 'strava') && !gpx) throw new HttpError(400, 'Your track didn’t come through. Add it again.');
  const order = await db.insertOrder({
    status: 'pending_payment',
    token: crypto.randomBytes(18).toString('base64url'),
    email, size: p.size, price_aud: size.price,
    title: clean(p.title, 32).toUpperCase(), subtitle: clean(p.subtitle, 70).toUpperCase(),
    font: FONTS.includes(p.font) ? p.font : 'Sora',
    source, link: String(p.link ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 2000) || null,
    strava_ids: Array.isArray(p.strava) ? p.strava.slice(0, 200).map(x => clean(x, 24)) : null,
    track_points: points || null,
    customer_note: clean(p.note, 1000) || null,
    history: [{ at: now(), what: 'Checkout started', by: 'customer' }],
  });
  if (gpx) {
    const name = `${order.id}.gpx`;
    await db.putFile('tracks', name, Buffer.from(gpx, 'utf8'), 'application/gpx+xml');
    await db.updateOrder(order.id, { track_path: name });
  }
  const s = await createCheckout(order, size, SHIPPING);
  await db.updateOrder(order.id, { stripe_session: s.id });
  return { url: s.url, ref: order.ref };
}

// Stripe says it's paid (webhook). Safe to run twice.
export async function markPaid(orderId, session = {}) {
  const o = await db.getOrder({ id: orderId });
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.status !== 'pending_payment') return o;
  const ship = session.shipping_details || session.collected_information?.shipping_details || {};
  const cust = session.customer_details || {};
  const shipAmt = (session.total_details?.amount_shipping ?? session.shipping_cost?.amount_total ?? 0) / 100;
  const opt = SHIPPING.find(s => s.amount === shipAmt);
  const patch = {
    status: 'new', paid_at: now(),
    amount_total: (session.amount_total ?? o.price_aud * 100) / 100,
    shipping_aud: shipAmt, shipping_name: opt ? opt.name : null,
    customer_name: ship.name || cust.name || null, phone: cust.phone || null,
    shipping_address: ship.address || cust.address || null,
    stripe_payment_intent: session.payment_intent || null,
    ship_by: new Date(Date.now() + MAKE_DAYS * 86400e3).toISOString(),
  };
  patch.history = event(o, `Paid ${patch.amount_total ? 'A$' + patch.amount_total : ''}`.trim(), 'stripe');
  const done = await db.updateOrder(o.id, patch);
  await send({ to: done.email, ...templates.paid(done) });
  await send({ to: ADMIN(), ...templates.admin_new(done) });
  return done;
}

// "Fully custom" form: no payment yet, just an idea to quote.
export async function createRequest(p) {
  const email = clean(p.email, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'Add your email so we can send your preview and quote.');
  const text = clean(p.what, 2000);
  if (text.length < 8) throw new HttpError(400, 'Tell us a little about what you’d like made.');
  const o = await db.insertOrder({
    status: 'request', token: crypto.randomBytes(18).toString('base64url'), email, size: 'custom', price_aud: 0,
    source: 'custom', link: clean(p.link, 500) || null, request_text: text,
    history: [{ at: now(), what: 'Custom request', by: 'customer' }],
  });
  await send({ to: email, ...templates.request(o) });
  await send({ to: ADMIN(), ...templates.admin_request(o) });
  return { ref: o.ref };
}

// ------------------------------------------------------------------ customer
export async function forCustomer(ref, token) {
  let o = ref && await db.getOrder({ ref: clean(ref, 20) });
  const ok = o && token && o.token.length === String(token).length && crypto.timingSafeEqual(Buffer.from(o.token), Buffer.from(String(token)));
  if (!ok) throw new HttpError(404, 'We couldn’t find that order. Use the link in your email.');
  o = await autoApprove(o);
  return o;
}

export function publicView(o) {
  const size = SIZES[o.size] || {};
  return {
    ref: o.ref, status: o.status, statusLabel: (STATUSES[o.status] || {}).label || o.status,
    size: size.name ? `${size.name}, ${size.mm} mm` : o.size, title: o.title, subtitle: o.subtitle, font: o.font,
    preview_url: o.preview_url || null, preview_note: o.preview_note || null,
    tracking_number: o.status === 'shipped' || o.status === 'delivered' ? o.tracking_number : null,
    created_at: o.created_at, paid_at: o.paid_at, ship_by: o.ship_by,
    auto_approve_at: o.preview_sent_at ? new Date(Date.parse(o.preview_sent_at) + AUTO_APPROVE_DAYS * 86400e3).toISOString() : null,
  };
}

export async function respond(o, action, note) {
  if (o.status !== 'preview_sent' && o.status !== 'changes_requested') throw new HttpError(409, 'This order isn’t waiting on you right now.');
  const text = clean(note, 1500);
  if (action === 'changes' && text.length < 3) throw new HttpError(400, 'Tell us what you’d like changed.');
  const status = action === 'approve' ? 'approved' : 'changes_requested';
  const done = await db.updateOrder(o.id, {
    status, customer_note: text || o.customer_note, ...(status === 'approved' ? { approved_at: now() } : {}),
    history: event(o, status === 'approved' ? 'Customer approved' : `Customer asked for changes: ${text}`, 'customer'),
  });
  await send({ to: ADMIN(), ...templates.admin_reply(done) });
  return done;
}

// No reply 3 days after the confirmation = approved (the email says so).
export async function autoApprove(o) {
  if (o.status === 'preview_sent' && o.preview_sent_at && Date.now() - Date.parse(o.preview_sent_at) > AUTO_APPROVE_DAYS * 86400e3) {
    return db.updateOrder(o.id, { status: 'approved', approved_at: now(), history: event(o, `Auto-approved after ${AUTO_APPROVE_DAYS} days`) });
  }
  return o;
}

// ------------------------------------------------------------------ you (dashboard / Studio)
export async function sendPreview(o, image, type, note) {
  if (!['new', 'changes_requested', 'preview_sent', 'request'].includes(o.status)) throw new HttpError(409, `Can’t send a preview while the order is ${o.status}.`);
  if (!image || image.length < 1000) throw new HttpError(400, 'No image.');
  if (image.length > 3_000_000) throw new HttpError(413, 'Image too big (max 3 MB). Save it as JPEG.');
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const name = `${o.id}/${crypto.randomBytes(8).toString('hex')}.${ext}`;   // unguessable name in the public bucket
  await db.putFile('previews', name, image, type === 'image/png' ? 'image/png' : 'image/jpeg');
  const done = await db.updateOrder(o.id, {
    status: 'preview_sent', preview_url: db.publicUrl('previews', name), preview_note: clean(note, 1000) || null, preview_sent_at: now(),
    history: event(o, 'Order confirmation sent', 'you'),
  });
  await send({ to: done.email, ...templates.preview_sent(done) });
  return done;
}

const MOVES = ['approved', 'printing', 'packed', 'shipped', 'delivered', 'cancelled', 'new'];
export async function setStatus(o, status, extra = {}) {
  if (!MOVES.includes(status)) throw new HttpError(400, 'Unknown status');
  const patch = { status, history: event(o, `Status → ${(STATUSES[status] || {}).label || status}`, 'you') };
  if (status === 'shipped') {
    const t = clean(extra.tracking_number, 40);
    if (!t) throw new HttpError(400, 'Add the tracking number.');
    Object.assign(patch, { tracking_number: t, shipped_at: now() });
  }
  if (status === 'approved' && !o.approved_at) patch.approved_at = now();
  const done = await db.updateOrder(o.id, patch);
  if (status === 'printing' && o.status !== 'printing') await send({ to: done.email, ...templates.printing(done) });
  if (status === 'shipped' && o.status !== 'shipped') await send({ to: done.email, ...templates.shipped(done) });
  return done;
}

// Print tracking per plate: Studio (or the dashboard) reports each plate as printing / printed.
// The first plate starting moves an approved order to Printing (customer gets "being made");
// both plates printed adds "Printed, ready to pack" to the history.
const PLATES = ['terrain', 'route'], PSTATES = ['queued', 'printing', 'printed'];
export async function setProduction(o, plate, state) {
  if (!PLATES.includes(plate) || !PSTATES.includes(state)) throw new HttpError(400, 'Unknown plate or state');
  const production = { ...(o.production || {}), [plate]: state, [`${plate}_at`]: now() };
  let history = event(o, `${plate === 'terrain' ? 'Terrain' : 'Route'} plate ${state}`, 'studio');
  const both = PLATES.every(p => production[p] === 'printed');
  if (both && !PLATES.every(p => (o.production || {})[p] === 'printed')) history = [...history, { at: now(), what: 'Printed, ready to pack', by: 'studio' }];
  let done = await db.updateOrder(o.id, { production, history });
  if (state !== 'queued' && ['approved', 'new'].includes(done.status)) done = await setStatus(done, 'printing');
  return done;
}

export async function saveNote(o, note) {
  return db.updateOrder(o.id, { admin_note: clean(note, 4000) });
}

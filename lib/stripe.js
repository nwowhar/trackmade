// Stripe Checkout without the Stripe library: two REST calls and the webhook signature check.
// Stripe hosts the payment page, so card details never touch our site.
import crypto from 'node:crypto';
import { HttpError, site } from './http.js';

export const live = () => !!process.env.STRIPE_SECRET_KEY;

// Stripe wants nested form fields: line_items[0][price_data][currency]=aud
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

async function call(method, p, params) {
  const r = await fetch('https://api.stripe.com/v1' + p, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: params ? form(params) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('stripe', p, r.status, JSON.stringify(j).slice(0, 400)); throw new HttpError(502, 'Payment couldn’t be started. Try again in a moment.'); }
  return j;
}

/** order: our row. size: from config. shipping: list of {id,name,amount,min_days,max_days}. */
export async function createCheckout(order, size, shipping) {
  if (!live()) {
    if (process.env.VERCEL) throw new HttpError(503, 'Payments aren’t switched on yet. Please try again soon.');
    return { id: 'cs_test_local_' + order.id.slice(0, 8), url: `/dev-pay.html?order=${order.id}` };   // local stand-in page
  }
  const s = await call('POST', '/checkout/sessions', {
    mode: 'payment',
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { order_id: order.id, ref: order.ref },
    payment_intent_data: { metadata: { order_id: order.id, ref: order.ref }, description: `TrackMade ${order.ref}` },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'aud', unit_amount: Math.round(size.price * 100),
        product_data: { name: `TrackMade ${size.name} (${size.mm} mm)`, description: (order.title || 'Your terrain model').slice(0, 200) },
      },
    }],
    shipping_address_collection: { allowed_countries: ['AU'] },
    phone_number_collection: { enabled: true },
    shipping_options: shipping.map(o => ({
      shipping_rate_data: {
        type: 'fixed_amount', display_name: o.name, fixed_amount: { amount: Math.round(o.amount * 100), currency: 'aud' },
        delivery_estimate: { minimum: { unit: 'business_day', value: o.min_days }, maximum: { unit: 'business_day', value: o.max_days } },
      },
    })),
    allow_promotion_codes: true,
    success_url: `${site()}/order/${order.ref}?t=${order.token}&paid=1`,
    cancel_url: `${site()}/#build`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return { id: s.id, url: s.url };
}

// Stripe signs every webhook: "t=timestamp,v1=hmac". Reject anything unsigned, forged or older than 5 minutes.
export function verifyWebhook(raw, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret) throw new HttpError(503, 'Webhook secret not set');
  const parts = Object.fromEntries((header || '').split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = (header || '').split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const t = +parts.t;
  if (!t || !sigs.length) throw new HttpError(400, 'Missing signature');
  if (Math.abs(Date.now() / 1000 - t) > 300) throw new HttpError(400, 'Signature too old');
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  const ok = sigs.some(s => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
  if (!ok) throw new HttpError(400, 'Bad signature');
  return JSON.parse(raw.toString('utf8'));
}

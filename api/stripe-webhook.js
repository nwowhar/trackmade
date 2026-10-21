// POST /api/stripe-webhook: Stripe tells us a checkout was paid. Signed by Stripe; anything else is rejected.
// In Stripe: Developers → Webhooks → Add endpoint https://<site>/api/stripe-webhook, event checkout.session.completed.
import { handle, json, readBody, HttpError } from '../lib/http.js';
import { verifyWebhook } from '../lib/stripe.js';
import { markPaid } from '../lib/orders.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const raw = await readBody(req, 1_000_000);
  const ev = verifyWebhook(raw, req.headers['stripe-signature']);
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    const s = ev.data.object;
    const id = s.metadata?.order_id || s.client_reference_id;
    if (id && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required')) await markPaid(id, s);
  }
  json(res, 200, { received: true });
});

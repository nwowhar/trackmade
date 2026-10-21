// Customer-facing order API (one function so we stay well under Vercel's function limit).
//   POST /api/order?a=create   {size,email,title,subtitle,font,source,link,strava,gpx,note} -> {url} (Stripe Checkout)
//   POST /api/order?a=request  {email,what,link}                                       -> {ref}  (fully custom idea)
//   GET  /api/order?a=view&ref=TM-1001&t=TOKEN                                         -> the order, for the order page
//   POST /api/order?a=respond  {ref,t,action:'approve'|'changes',note}                 -> the order
import { handle, query, json, readJson, HttpError } from '../lib/http.js';
import * as orders from '../lib/orders.js';

export default handle(async (req, res) => {
  const a = query(req).a;
  if (a === 'view' && req.method === 'GET') {
    const q = query(req);
    return json(res, 200, orders.publicView(await orders.forCustomer(q.ref, q.t)));
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  if (a === 'create') return json(res, 200, await orders.createOrder(await readJson(req, 4_000_000)));
  if (a === 'request') return json(res, 200, await orders.createRequest(await readJson(req, 20_000)));
  if (a === 'respond') {
    const b = await readJson(req, 20_000);
    const o = await orders.forCustomer(b.ref, b.t);
    return json(res, 200, orders.publicView(await orders.respond(o, b.action === 'approve' ? 'approve' : 'changes', b.note)));
  }
  throw new HttpError(404, 'Not found');
});

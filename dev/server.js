// Local test server: serves public/ and runs api/*.js the same way Vercel would, with stand-ins for Stripe and Supabase.
//   node dev/server.js        (reads .env in the web folder)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PORT = +(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.gpx': 'application/gpx+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // same routes as vercel.json
  if (/^\/order\/[A-Za-z0-9-]+$/.test(url.pathname)) url.pathname = '/order.html';
  if (url.pathname === '/admin') url.pathname = '/admin.html';
  // stand-ins for Stripe's payment page and Supabase storage while there are no accounts
  if (url.pathname === '/dev-pay.html') return send(res, path.join(ROOT, 'dev', 'pay.html'));
  if (url.pathname === '/dev-api/pay' && req.method === 'POST') {
    const { markPaid } = await import(pathToFileURL(path.join(ROOT, 'lib', 'orders.js')).href);
    const id = url.searchParams.get('order'), ship = +(url.searchParams.get('ship') || 15);
    const { getOrder } = await import(pathToFileURL(path.join(ROOT, 'lib', 'db.js')).href);
    const o = await getOrder({ id });
    await markPaid(id, { amount_total: (o.price_aud + ship) * 100, total_details: { amount_shipping: ship * 100 }, payment_intent: 'pi_local',
      customer_details: { name: 'Test Customer', phone: '+61400000000' }, shipping_details: { name: 'Test Customer', address: { line1: '1 Test St', city: 'Perth', state: 'WA', postal_code: '6000', country: 'AU' } } });
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ next: `/order/${o.ref}?t=${o.token}&paid=1` }));
  }
  if (url.pathname.startsWith('/dev-storage/')) {
    const p = path.normalize(path.join(ROOT, 'dev', 'data', 'storage', decodeURIComponent(url.pathname.slice(13))));
    if (!p.startsWith(path.join(ROOT, 'dev', 'data', 'storage'))) { res.statusCode = 403; return res.end(); }
    return send(res, p);
  }
  const m = url.pathname.match(/^\/api\/([a-z-]+(?:\/[a-z-]+)?)$/);
  if (m) {
    const f = path.join(ROOT, 'api', m[1] + '.js');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
    const mod = await import(pathToFileURL(f).href);
    return mod.default(req, res);
  }
  let p = path.normalize(path.join(ROOT, 'public', decodeURIComponent(url.pathname)));
  if (!p.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  send(res, p);
}).listen(PORT, () => console.log(`TrackMade dev server on http://localhost:${PORT}`));

function send(res, p) {
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}

// Local test server: serves public/ and runs api/strava/*.js the same way Vercel would.
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/api\/strava\/([a-z]+)$/);
  if (m) {
    const f = path.join(ROOT, 'api', 'strava', m[1] + '.js');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
    const mod = await import(pathToFileURL(f).href);
    return mod.default(req, res);
  }
  let p = path.normalize(path.join(ROOT, 'public', decodeURIComponent(url.pathname)));
  if (!p.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`TrackMade dev server on http://localhost:${PORT}`));

// Check the activity links a customer pastes, while they're still on the page: can we actually see the track?
// Garmin shows a preview (title, distance) for activities set to Everyone and nothing for private ones, so we can tell
// exactly. Ride with GPS shows a preview for public trips. Strava hides everything from logged-out visitors and Komoot
// and AllTrails turn automatic checks away, so those we check by hand.
// Only these sites are ever fetched (no open proxy): https, fixed hosts, short timeout, small read.
const HOSTS = /(^|\.)(garmin\.com|strava\.com|strava\.app\.link|komoot\.com|komoot\.de|ridewithgps\.com|alltrails\.com|wikiloc\.com)$/i;
const UA = 'Mozilla/5.0 (compatible; TrackMadeLinkCheck/1.0; +https://trackmade.vercel.app)';

const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return m && m[1] ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : '';
};

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctl.signal });
    const host = new URL(r.url).hostname;
    if (!HOSTS.test(host)) return { status: 0, html: '', url: r.url };   // redirected somewhere we don't check
    const reader = r.body.getReader(); let html = '', n = 0;
    while (n < 400_000) { const { done, value } = await reader.read(); if (done) break; n += value.length; html += Buffer.from(value).toString('utf8'); }
    reader.cancel().catch(() => {});
    return { status: r.status, html, url: r.url };
  } catch { return { status: 0, html: '', url }; } finally { clearTimeout(t); }
}

async function garmin(u) {
  let id = (u.match(/activity\/(\d{6,})/) || [])[1];
  if (!id) { const r = await get(u); id = (r.url.match(/activity\/(\d{6,})/) || [])[1]; }   // short share links
  if (!id) return { site: 'Garmin', state: 'unknown' };
  const r = await get(`https://connect.garmin.com/app/activity/${id}`);
  if (r.status !== 200) return { site: 'Garmin', state: 'unknown' };
  const title = meta(r.html, 'og:title'), desc = meta(r.html, 'og:description');
  if (!title && !desc) return { site: 'Garmin', state: 'private' };
  const km = parseFloat(((desc.match(/Distance\s+([\d.,]+)\s*km/i) || [])[1] || '').replace(/,/g, ''));
  if (km === 0) return { site: 'Garmin', state: 'nogps', title };
  return { site: 'Garmin', state: 'ok', title, km: Number.isFinite(km) ? km : null };
}

async function other(u, site) {
  const r = await get(u);
  if (r.status === 404 || r.status === 410 || r.status === 401) return { site, state: 'private' };
  const title = r.status === 200 ? meta(r.html, 'og:title') : '';
  if (title && !/log ?in|sign ?in|register/i.test(title)) return { site, state: 'ok', title };
  return { site, state: 'unknown' };
}

export async function checkLinks(text) {
  const urls = [...new Set(String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [])].slice(0, 12);
  return Promise.all(urls.map(async u => {
    let host = '';
    try { const p = new URL(u); host = p.protocol === 'https:' ? p.hostname : ''; } catch {}
    let r;
    if (!host || !HOSTS.test(host)) r = { site: host || 'link', state: 'unknown' };
    else if (/garmin\.com$/i.test(host)) r = await garmin(u);
    else if (/strava/i.test(host)) r = { site: 'Strava', state: 'strava' };
    else if (/alltrails/i.test(host)) r = { site: 'AllTrails', state: 'unknown' };
    else r = await other(u, /komoot/i.test(host) ? 'Komoot' : /ridewithgps/i.test(host) ? 'Ride with GPS' : 'Wikiloc');
    return { url: u, ...r, title: (r.title || '').slice(0, 80) };
  }));
}

// Order emails through Resend. Locally (no RESEND_API_KEY, not on Vercel) they're written to dev/data/outbox/ instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from './http.js';
import { SIZES, STATUSES, MAKE_DAYS, AUTO_APPROVE_DAYS } from './config.js';

const OUTBOX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dev', 'data', 'outbox');
const FROM = () => process.env.MAIL_FROM || 'TrackMade <onboarding@resend.dev>';
export const ADMIN = () => process.env.ADMIN_EMAIL || '';

export async function send({ to, subject, html, text, replyTo }) {
  if (!to) return { skipped: true };
  if (!process.env.RESEND_API_KEY) {
    if (process.env.VERCEL) { console.warn('email not sent (RESEND_API_KEY missing):', subject); return { skipped: true }; }
    fs.mkdirSync(OUTBOX, { recursive: true });
    const f = path.join(OUTBOX, `${Date.now()}_${to.replace(/[^a-z0-9]+/gi, '_')}.html`);
    fs.writeFileSync(f, `<!-- to: ${to}\nsubject: ${subject} -->\n${html}`);
    return { local: f };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text, reply_to: replyTo || ADMIN() || undefined }),
  });
  if (!r.ok) console.error('resend', r.status, (await r.text()).slice(0, 300));   // an email failing never breaks the order
  return { ok: r.ok };
}

// ---------------------------------------------------------------- templates
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'A$' + Number(n || 0).toFixed(2).replace(/\.00$/, '');
export const orderLink = o => `${site()}/order/${o.ref}?t=${o.token}`;

function layout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f1efea;font-family:Helvetica,Arial,sans-serif;color:#1d2125">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1efea;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px 6px"><img src="${site()}/email-logo.png" alt="TrackMade" width="150" style="display:block;border:0"></td></tr>
<tr><td style="padding:10px 28px 28px;font-size:16px;line-height:1.55">
<h1 style="font-size:22px;line-height:1.25;margin:8px 0 14px">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px;background:#f7f6f3;font-size:12px;color:#6b7782;line-height:1.5">TrackMade · Made to order in Australia · @trackmade.co<br>Questions? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label, color = '#c8302a') =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px;margin:6px 8px 6px 0">${esc(label)}</a>`;
const rows = pairs => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:15px">${pairs.filter(p => p[1]).map(([k, v]) =>
  `<tr><td style="padding:6px 0;color:#6b7782;width:38%">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>`;

function summary(o) {
  const s = SIZES[o.size] || {};
  return rows([['Order', o.ref], ['Model', s.name ? `${s.name}, ${s.mm} mm` : o.size], ['Title', o.title], ['Details', o.subtitle], ['Lettering', o.font],
    ['Shipping', o.shipping_name], ['Total paid', o.amount_total ? money(o.amount_total) : null]]);
}

export const templates = {
  paid: o => ({
    subject: `Order ${o.ref} received: thanks!`,
    html: layout('Thanks, your order is in', `<p>We've got everything we need to make your TrackMade.</p>${summary(o)}
<p><b>What happens next.</b> Within 2 days we'll email you an order confirmation with your final 3D model. Check the crop, stops and lettering, then approve it or ask for changes (free). We only start making it once you approve.</p>
<p>Made to order in Australia and shipped within ${MAKE_DAYS} days of your approval.</p>${button(orderLink(o), 'View your order', '#1d2125')}`),
  }),
  preview_sent: o => ({
    subject: `Your TrackMade is ready to check (${o.ref})`,
    html: layout('Your model is ready to check', `<p>Here's your final model. Have a look at the crop, the numbered stops and the lettering.</p>
${o.preview_url ? `<img src="${o.preview_url}" alt="Your TrackMade model" width="504" style="display:block;width:100%;max-width:504px;border-radius:10px;margin:12px 0">` : ''}
${o.preview_note ? `<p style="background:#f7f6f3;border-radius:10px;padding:12px 14px">${esc(o.preview_note)}</p>` : ''}
${button(orderLink(o) + '&do=approve', 'Looks great, make it')}${button(orderLink(o) + '&do=changes', 'Request a change', '#1d2125')}
<p style="font-size:14px;color:#6b7782">No reply within ${AUTO_APPROVE_DAYS} days and we'll go ahead and make it as shown.</p>`),
  }),
  printing: o => ({
    subject: `Your TrackMade is being made (${o.ref})`,
    html: layout('Your model is being made', `<p>Thanks for approving. Your ${esc((SIZES[o.size] || {}).name || '')} model is now being made. We'll email you the tracking number as soon as it ships.</p>${button(orderLink(o), 'View your order', '#1d2125')}`),
  }),
  shipped: o => ({
    subject: `Your TrackMade has shipped (${o.ref})`,
    html: layout('It’s on its way', `<p>Your model is packed in foam and with Australia Post.</p>${rows([['Tracking number', o.tracking_number]])}
${o.tracking_number ? button(`https://auspost.com.au/mypost/track/details/${encodeURIComponent(o.tracking_number)}`, 'Track your parcel') : ''}
<p>When it arrives, we'd love a photo of it on your shelf. Tag <b>@trackmade.co</b>.</p>`),
  }),
  request: o => ({
    subject: 'We’ve got your idea',
    html: layout('Thanks, we’ve got your idea', `<p>We'll look at what you'd like made and reply within 2 days with a 3D preview and a price.</p>
<p style="background:#f7f6f3;border-radius:10px;padding:12px 14px">${esc(o.request_text)}</p>`),
  }),
  // to Nic
  admin_new: o => ({
    subject: `New order ${o.ref}: ${(SIZES[o.size] || {}).name || o.size} · ${o.title || 'no title'}`,
    html: layout(`New order ${o.ref}`, `${summary(o)}${rows([['Customer', [o.customer_name, o.email].filter(Boolean).join(' · ')], ['Track', sourceText(o)],
      ['Ship by', o.ship_by ? new Date(o.ship_by).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null]])}${button(`${site()}/admin#${o.ref}`, 'Open in dashboard', '#1d2125')}`),
  }),
  admin_request: o => ({
    subject: `Custom request from ${o.email}`,
    html: layout('New custom request', `<p style="background:#f7f6f3;border-radius:10px;padding:12px 14px">${esc(o.request_text)}</p>${rows([['From', o.email], ['Link', o.link]])}${button(`${site()}/admin#${o.ref}`, 'Open in dashboard', '#1d2125')}`),
  }),
  admin_reply: o => ({
    subject: `${o.ref} ${o.status === 'approved' ? 'approved ✓' : 'needs changes'}: ${o.title || ''}`,
    html: layout(o.status === 'approved' ? `${o.ref} approved` : `${o.ref}: changes requested`,
      `${o.customer_note ? `<p style="background:#f7f6f3;border-radius:10px;padding:12px 14px">${esc(o.customer_note)}</p>` : ''}${summary(o)}${button(`${site()}/admin#${o.ref}`, 'Open in dashboard', '#1d2125')}`),
  }),
};

export function sourceText(o) {
  if (o.source === 'strava') return `Strava (${(o.strava_ids || []).length} activities)`;
  if (o.source === 'file') return 'GPX file';
  if (o.source === 'link') return o.link || 'Link';
  if ((o.source || '').startsWith('famous:')) return 'Route library: ' + o.source.slice(7);
  return o.source || '';
}

export const statusLabel = s => (STATUSES[s] || {}).label || s;

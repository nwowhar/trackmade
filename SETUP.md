# Switching on orders: step by step

Everything below is clicking in websites. No code. Each service is optional until you add its keys:
the site shows a polite "not switched on yet" message instead of failing.

All keys go in **Vercel → trackmade → Settings → Environment Variables** (tick Production, Preview and Development),
then **Deployments → ⋯ → Redeploy** so the site picks them up. Never paste secret keys into chats or emails.

## 1. Your settings (2 minutes)
Add these four in Vercel:

| Name | Value |
|---|---|
| `PUBLIC_URL` | `https://trackmade.vercel.app` for now; `https://trackmade.com.au` once the domain is connected |
| `SESSION_SECRET` | a long random string, e.g. from passwordsgenerator.net, 40+ characters |
| `ADMIN_EMAIL` | the email that gets new-order alerts |
| `ADMIN_PASSWORD` | your dashboard password, 10+ characters |
| `ADMIN_API_KEY` | another long random string (TrackMade Studio uses it to load orders) |

Your dashboard is then at **/admin**.

## 2. Supabase: the orders database (5 minutes)
1. supabase.com → New project → name `trackmade`, region **Sydney**, make a strong database password (save it in your password manager).
2. Left menu → **SQL Editor** → New query → paste everything in `supabase/schema.sql` → **Run**. You should see "Success".
3. Project Settings → **API Keys**: copy the **Project URL** and the **secret** key (or the `service_role` key on older projects).
4. In Vercel add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

Free Supabase projects pause after a week with no visits. A paying site gets visits, but if it does pause, one click in Supabase wakes it.

## 3. Stripe: payments (10 minutes, test mode first)
1. stripe.com → create the account. Add your ABN and bank account under **Settings → Business** so payouts work.
2. Stay in **Test mode** (toggle top right) until you've done a test order.
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…`) into Vercel as `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://trackmade.vercel.app/api/stripe-webhook` (later `https://trackmade.com.au/api/stripe-webhook`)
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy the **Signing secret** (`whsec_…`) into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Redeploy, then place a test order with card `4242 4242 4242 4242`, any future date, any CVC.
6. When it all works: switch Stripe to **Live mode**, make a live webhook the same way, and swap both keys in Vercel for the live ones.

Discount codes: Stripe → Product catalogue → Coupons → create one, then add a promotion code (e.g. `BIBB10`). The checkout already has a box for codes.

## 4. Resend: order emails (after the domain)
1. resend.com → sign up → **Domains → Add domain** → `trackmade.com.au`. It shows 3–4 DNS records: add them at your domain registrar (Claude can walk you through it).
2. **API Keys → Create** → copy into Vercel as `RESEND_API_KEY`.
3. Add `MAIL_FROM` = `TrackMade <hello@trackmade.com.au>`.

Before the domain is verified, Resend can only send to your own email address, which is fine for testing.

## 5. Test the whole thing (test mode)
1. On the site: add a GPX, pick a size and font, enter your email, **Continue to secure checkout**, pay with 4242….
2. You should land on your order page and get two emails (receipt + "New order").
3. /admin → open the order → **Download GPX** → build it in TrackMade Studio → render the photo.
4. Back in /admin: upload `preview.png` → **Send order confirmation**. The customer email arrives with the photo.
5. Open the link in that email → **Looks great, make it**. You get an "approved" email.
6. /admin → Printing → Packed → Shipped (tracking number). The customer gets the tracking email.

## What each status does
| Status | Who's waiting | Email to customer |
|---|---|---|
| New | you (build + send confirmation) | receipt |
| Preview sent | customer (3 days, then auto-approved) | photo + Approve / Request a change |
| Changes requested | you | none (you get their note) |
| Approved | you | none |
| Printing | you | "being made" |
| Packed | you | none |
| Shipped | Australia Post | tracking link |
| Delivered | nobody | none |
| Custom request | you (quote by email) | "we've got your idea" |

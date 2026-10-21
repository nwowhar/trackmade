# TrackMade website

**Switching on orders (Supabase, Stripe, Resend): see [SETUP.md](SETUP.md).**

```
public/index.html        the shop (built from site-src/ by: python3 site-src/build.py)
public/order.html        the customer's order page (/order/TM-1001?t=…): status, photo, approve / request a change
public/admin.html        your dashboard (/admin): orders by status, GPX download, send confirmation, ship
api/order.js             checkout, custom requests, the order page's data, approve / changes
api/stripe-webhook.js    Stripe confirms payment -> order becomes "New", emails go out
api/admin.js             dashboard + TrackMade Studio API (password cookie or Bearer ADMIN_API_KEY)
api/strava/*.js          Strava connect
lib/                     orders, database, Stripe, emails, prices and shipping (lib/config.js)
supabase/schema.sql      the database, paste into Supabase's SQL editor once
dev/server.js            run it all on your PC with stand-ins for Stripe, Supabase and email
```

## Strava connect

The shop page (`public/index.html`) plus four small server functions that let a customer tap
**Connect with Strava**, tick their activities (private ones too, multi-day trips as several ticks), and load the
full GPS track (lat/lon, elevation, timestamps) straight into the 3D preview. The track is attached to the order as a GPX.

Nothing is stored on our side: the Strava login lives in an encrypted cookie in the customer's browser for 24 hours,
and **Disconnect** revokes it at Strava.

```
api/strava/login.js       → sends the customer to Strava's "Authorize TrackMade" page
api/strava/callback.js    → Strava sends them back here; we swap the code for a token
api/strava/activities.js  → their recent activities (30 per page, with route thumbnails)
api/strava/streams.js     → the full GPS track for one activity
api/strava/logout.js      → revoke + clear
lib/                      → cookie encryption, token refresh, error handling
dev/server.js             → run it all on your PC
dev/mock-strava.js        → a fake Strava for testing without an account
```

## 1. Register the Strava app (5 minutes, free)

1. Log in to Strava on a computer, go to **strava.com/settings/api**.
2. Fill in:
   - **Application name:** TrackMade
   - **Category:** Visualizer
   - **Website:** https://trackmade.com.au (or whatever the shop's address is)
   - **Authorization Callback Domain:** `localhost` while testing, then change it to `trackmade.com.au` when the site is live (domain only, no https://, no path)
   - Upload the TrackMade icon as the app icon.
3. Strava shows a **Client ID** and **Client Secret**. Keep the secret private (never put it in the page).

## 2. Test on your PC

Needs Node 18 or newer (`node -v`).

```
copy .env.example .env        (Mac: cp .env.example .env)
```
Edit `.env`: put in the Client ID and Secret, `PUBLIC_URL=http://localhost:3000`, and a long random `SESSION_SECRET`.
Then `npm run dev`, open http://localhost:3000, tap **Connect with Strava** and sign in with your own account.

No Strava account handy? Set `STRAVA_BASE=http://localhost:3999` in `.env`, run `npm run mock` in a second window,
and the page will connect to a fake Strava with the Everest trek split into days.

## 3. Put it live on Vercel

1. At vercel.com → Add New → Project, import the `nwowhar/trackmade` GitHub repo. Framework preset: Other. No build settings needed (the site is served from `public/`).
2. In Vercel → Settings → Environment Variables add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`,
   and `PUBLIC_URL=https://trackmade.com.au`.
3. Vercel → Settings → Domains → add `trackmade.com.au` and follow its DNS steps at your domain registrar.
4. Back on strava.com/settings/api change the callback domain to `trackmade.com.au`.

To update the page: edit `site-src/shop_template.html`, run `python3 site-src/build.py` (rebuilds `public/index.html`), commit and push. Vercel redeploys on every push to `main`.

## Strava rules that matter for us

- **Athlete limit.** A new Strava app works for **1 athlete (you)**, and you can raise it to **10 without review**.
  Before the ads go live, submit the app for review (from the same settings page) to lift the cap. Plan on a few
  weeks; Strava doesn't promise timelines. Until then, the GPX upload and paste-a-link options cover everyone else.
- **Subscription.** Since June 2026 Strava requires new Standard-tier developers to hold a Strava subscription.
- **Rate limits.** 100 reads per 15 minutes / 1,000 a day across all customers. One customer ordering a 7-day trek uses
  about 9 (activity list + one per day), so this is plenty for now.
- **Branding.** Strava requires its official "Connect with Strava" button and a "Powered by Strava" logo where its
  data is shown. The page has placeholders in the right spots (orange button, "Powered by Strava" text): download
  the official assets from Strava's brand guidelines page and swap them in before submitting for review.
  Every activity already links back with "View on Strava".
- **Privacy.** Only show a customer's Strava data to that customer, don't keep it longer than needed for the order,
  and don't feed it to any AI tools. Add a short privacy policy page saying the GPS track is used only to make their
  model and is deleted once the order ships; Strava asks for one during review.
- **Coming changes.** Strava is moving the API to `api-v3.strava.com` (from January 2027) and retiring
  `/oauth/deauthorize` (June 2027). `lib/strava.js` has the base URL in one place and logout already tries the new
  `/oauth/revoke` first.

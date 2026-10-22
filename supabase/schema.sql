-- TrackMade orders database. Paste all of this into Supabase → SQL Editor → New query → Run. Safe to run once.

create sequence if not exists order_ref_seq start 1001;

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text unique not null default ('TM-' || nextval('order_ref_seq')),
  created_at            timestamptz not null default now(),
  status                text not null default 'pending_payment',
  token                 text not null,                 -- secret in the customer's order link
  email                 text not null,
  customer_name         text,
  phone                 text,
  shipping_address      jsonb,
  size                  text not null,
  price_aud             numeric not null default 0,
  amount_total          numeric,
  shipping_aud          numeric,
  shipping_name         text,
  title                 text,
  subtitle              text,
  font                  text,
  source                text,
  link                  text,
  strava_ids            jsonb,
  track_path            text,
  track_points          integer,
  request_text          text,
  customer_note         text,
  admin_note            text,
  stripe_session        text,
  stripe_payment_intent text,
  paid_at               timestamptz,
  ship_by               timestamptz,
  preview_url           text,
  preview_note          text,
  preview_sent_at       timestamptz,
  approved_at           timestamptz,
  tracking_number       text,
  shipped_at            timestamptz,
  history               jsonb not null default '[]'::jsonb
);
create index if not exists orders_status_idx on public.orders (status, created_at);

-- Lock the table: only the website's server (service key) can read or write orders. No public access at all.
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select, insert, update, delete on public.orders to service_role;
grant usage, select on sequence order_ref_seq to service_role;

-- File storage: customers' GPS tracks are private; confirmation photos are public under random names (for the emails).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracks', 'tracks', false, 5242880, array['application/gpx+xml', 'application/octet-stream', 'text/xml']),
       ('previews', 'previews', true, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

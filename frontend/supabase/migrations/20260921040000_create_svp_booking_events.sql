-- Durable operational history for every booking/payment/reservation request.
-- The live SVP API remains the source of current state; this table preserves the
-- portal's own request outcome so admins can audit success and failure over time.
create table if not exists public.svp_booking_events (
  id uuid primary key default gen_random_uuid(),
  account_id text null references public.accounts(id) on delete set null,
  operation text not null,
  route text not null,
  reservation_id text null,
  outcome text not null check (outcome in ('success', 'failure')),
  http_status integer null,
  error_code text null,
  status text null,
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists svp_booking_events_created_at_idx
  on public.svp_booking_events (created_at desc);
create index if not exists svp_booking_events_account_created_idx
  on public.svp_booking_events (account_id, created_at desc);
create index if not exists svp_booking_events_outcome_created_idx
  on public.svp_booking_events (outcome, created_at desc);
create index if not exists svp_booking_events_reservation_idx
  on public.svp_booking_events (reservation_id)
  where reservation_id is not null;

alter table public.svp_booking_events enable row level security;

revoke all on public.svp_booking_events from anon, authenticated;

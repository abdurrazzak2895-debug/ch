-- T2Hub multi-account session vault
-- Session credentials/cookies are encrypted by the Edge Function before insert.
-- This migration intentionally stores only ciphertext in the database.

create extension if not exists pgcrypto;

create table if not exists public.t2hub_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  login_identifier text not null unique,
  encrypted_password text,
  base_url text not null default 'https://takamol.t2hub.app',
  login_url text not null default 'https://t2hub.app/takamol/agent/login',
  enabled boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'error', 'disabled')),
  last_login_at timestamptz,
  last_refresh_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.t2hub_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.t2hub_accounts(id) on delete cascade,
  encrypted_cookie text not null,
  encrypted_session_key text,
  encrypted_csrf text,
  expires_at timestamptz,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id)
);

create index if not exists t2hub_accounts_enabled_idx
  on public.t2hub_accounts (enabled, status);

create index if not exists t2hub_sessions_expiry_idx
  on public.t2hub_sessions (expires_at);

create or replace function public.t2hub_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists t2hub_accounts_set_updated_at on public.t2hub_accounts;
create trigger t2hub_accounts_set_updated_at
before update on public.t2hub_accounts
for each row execute function public.t2hub_set_updated_at();

alter table public.t2hub_accounts enable row level security;
alter table public.t2hub_sessions enable row level security;

-- No client-side role may read or write credentials/session ciphertext.
-- Edge Functions use the service role, which bypasses RLS.
revoke all on table public.t2hub_accounts from anon, authenticated;
revoke all on table public.t2hub_sessions from anon, authenticated;

comment on table public.t2hub_accounts is
  'T2Hub account metadata; encrypted_password is ciphertext produced by the Edge Function.';
comment on table public.t2hub_sessions is
  'Encrypted T2Hub cookies, session key, and CSRF token. Never store plaintext secrets here.';
comment on column public.t2hub_accounts.encrypted_password is
  'AES-GCM ciphertext; the encryption key must remain an Edge Function secret.';
comment on column public.t2hub_sessions.encrypted_cookie is
  'AES-GCM ciphertext for the complete Cookie header.';
comment on column public.t2hub_sessions.encrypted_session_key is
  'AES-GCM ciphertext for the T2Hub window.__sk value.';
comment on column public.t2hub_sessions.encrypted_csrf is
  'AES-GCM ciphertext for the XSRF-TOKEN value.';

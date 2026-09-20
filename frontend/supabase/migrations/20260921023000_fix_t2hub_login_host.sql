-- Use the Takamol application host for server-side login and __sk capture.
-- The gateway URL can render the login form but does not reliably establish the
-- application context that emits window.__sk after authentication.
alter table public.t2hub_accounts
  alter column login_url set default 'https://takamol.t2hub.app/takamol/agent/login';

update public.t2hub_accounts
set login_url = 'https://takamol.t2hub.app/takamol/agent/login'
where login_url = 'https://t2hub.app/takamol/agent/login';

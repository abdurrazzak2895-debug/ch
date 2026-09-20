-- The two-account browserless refresh can take longer than pg_net's default.
-- Keep the cron job idempotent while allowing the Edge Function to finish.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'refresh-t2hub-all-accounts'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'refresh-t2hub-all-accounts',
  '0 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 't2hub_project_url') || '/functions/v1/t2hub-session-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-session-refresh-token', (select decrypted_secret from vault.decrypted_secrets where name = 't2hub_refresh_token')
      ),
      body := '{"refresh_all_active":true}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

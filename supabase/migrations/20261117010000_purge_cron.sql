-- 9.2 Daily pg_cron job that calls the purge-inactive Edge Function.
-- See ARCHITECTURE.md section 7, SECURITY.md section 9.
--
-- The project URL and the cron shared secret live in Vault, never in this file.
-- Task 9.4 sets them once per environment:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random 32+ bytes>', 'purge_cron_secret');
-- and the same secret as the Edge Function secret CRON_SECRET.
-- Until both exist the job does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.call_purge_inactive()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'project_url');
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'purge_cron_secret');
begin
  if v_url is null or v_secret is null then
    raise warning 'purge-inactive skipped: project_url or purge_cron_secret missing from vault';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/purge-inactive',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function private.call_purge_inactive() from public;

-- Daily at 03:17 UTC. Scheduling by name replaces an existing job of that name.
select cron.schedule('purge-inactive', '17 3 * * *', $$ select private.call_purge_inactive() $$);

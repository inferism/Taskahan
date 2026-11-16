-- 9.3 Weekly orphan avatar sweep.
-- See ARCHITECTURE.md section 8, SECURITY.md section 7.
--
-- orphan_avatars lists objects in the avatars bucket that no profile points at.
-- Objects younger than an hour are skipped: set-avatar runs after the upload,
-- so a fresh object may be about to be referenced. The sweep-avatars Edge
-- Function deletes the listed objects through the Storage API.
-- The weekly cron job reuses the vault secrets set in 9.4 (project_url,
-- purge_cron_secret) and the Edge Function secret CRON_SECRET.

create function public.orphan_avatars(p_limit int default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and o.created_at < now() - interval '1 hour'
     and not exists (select 1 from public.profiles p where p.avatar_path = o.name)
   order by o.created_at, o.name
   limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

revoke all on function public.orphan_avatars(int) from public, anon, authenticated;
grant execute on function public.orphan_avatars(int) to service_role;

create function private.call_sweep_avatars()
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
    raise warning 'sweep-avatars skipped: project_url or purge_cron_secret missing from vault';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/sweep-avatars',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function private.call_sweep_avatars() from public;

-- Sundays at 04:23 UTC.
select cron.schedule('sweep-avatars', '23 4 * * 0', $$ select private.call_sweep_avatars() $$);

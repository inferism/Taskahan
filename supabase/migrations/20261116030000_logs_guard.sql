-- 2.3 Logs are append-only, and the shared private.log() helper.
-- See ARCHITECTURE.md section 3 (logs), SECURITY.md section 5.
--
-- The guard applies to every role, the service role included. DELETE is
-- allowed only once the parent group row is gone, so deleting a group still
-- cascades to its logs.

create function private.logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'logs are append-only' using errcode = 'insufficient_privilege';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'logs cannot be truncated' using errcode = 'insufficient_privilege';
  end if;

  -- DELETE: only as part of deleting the group itself.
  if exists (select 1 from public.groups g where g.id = old.group_id) then
    raise exception 'logs are append-only' using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

create trigger logs_guard
  before update or delete on public.logs
  for each row execute function private.logs_guard();

create trigger logs_guard_truncate
  before truncate on public.logs
  for each statement execute function private.logs_guard();

-- Write functions call this in the same transaction as the change it records.
create function private.log(
  p_group_id uuid,
  p_actor_id uuid,
  p_action public.log_action,
  p_task_id uuid default null,
  p_target_member_id uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.logs (group_id, actor_id, action, task_id, target_member_id, meta)
  values (p_group_id, p_actor_id, p_action, p_task_id, p_target_member_id, coalesce(p_meta, '{}'::jsonb));
$$;

revoke all on function private.logs_guard() from public;
revoke all on function private.log(uuid, uuid, public.log_action, uuid, uuid, jsonb) from public;

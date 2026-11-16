-- 2.6 Task write functions. See ARCHITECTURE.md section 5, SECURITY.md
-- sections 3 and 5. Error keys follow 20261116050000_group_functions.sql,
-- plus task_limit (54000) for the 500 live tasks per group cap.
--
-- Task numbers come from groups.next_task_number, which only ever increases
-- under the group row lock. Tasks are soft deleted, so a number is never
-- reused.

-- Validates and cleans title and details. Raises invalid_input.
create function private.check_task_text(
  p_title text,
  p_details text,
  out title text,
  out details text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  title := private.clean_line(p_title);
  if title is null or char_length(title) not between 1 and 120 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'title';
  end if;
  details := coalesce(private.clean_block(p_details), '');
  if char_length(details) > 2000 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'details';
  end if;
end;
$$;

-- Raises invalid_input unless the membership is an active seat in the group.
create function private.check_assignee(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.memberships m
                  where m.id = p_member_id and m.group_id = p_group_id and m.status = 'active') then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'assignee_id';
  end if;
end;
$$;

-- The live task's group, or 'forbidden' (unknown and deleted look the same).
create function private.live_task_group(p_task_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select t.group_id into v_group_id from public.tasks t
   where t.id = p_task_id and t.deleted_at is null;
  if v_group_id is null then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return v_group_id;
end;
$$;

revoke all on function private.check_task_text(text, text) from public;
revoke all on function private.check_assignee(uuid, uuid) from public;
revoke all on function private.live_task_group(uuid) from public;

-- ---------------------------------------------------------------------------
-- create_task: leader only. Allocates the next number.
-- ---------------------------------------------------------------------------

create function public.create_task(
  p_group_id uuid,
  p_title text,
  p_details text,
  p_assignee_id uuid,
  p_deadline timestamptz
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_leader_seat(p_group_id);
  v_text record;
  v_number int;
  v_task public.tasks;
begin
  select * into v_text from private.check_task_text(p_title, p_details);
  perform private.check_assignee(p_group_id, p_assignee_id);

  if (select count(*) from public.tasks t
       where t.group_id = p_group_id and t.deleted_at is null) >= 500 then
    raise exception 'task_limit' using errcode = 'program_limit_exceeded';
  end if;

  update public.groups g set next_task_number = g.next_task_number + 1
   where g.id = p_group_id
  returning g.next_task_number - 1 into v_number;

  insert into public.tasks (group_id, number, title, details, assignee_id, deadline, created_by)
  values (p_group_id, v_number, v_text.title, v_text.details, p_assignee_id, p_deadline, v_me.id)
  returning * into v_task;

  perform private.log(p_group_id, v_me.id, 'task_created', v_task.id, p_assignee_id,
    jsonb_build_object('number', v_number, 'title', v_task.title));
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_task: leader edits and reassigns. A new assignee must be active;
-- keeping a former member's assignment is allowed.
-- ---------------------------------------------------------------------------

create function public.update_task(
  p_task_id uuid,
  p_title text,
  p_details text,
  p_assignee_id uuid,
  p_deadline timestamptz
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_task_group(p_task_id);
  v_me public.memberships := private.caller_leader_seat(v_group_id);
  v_text record;
  v_old public.tasks;
  v_task public.tasks;
  v_fields text[] := array[]::text[];
begin
  select t.* into v_old from public.tasks t
   where t.id = p_task_id and t.deleted_at is null
     for update;
  if not found then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into v_text from private.check_task_text(p_title, p_details);
  if p_assignee_id is distinct from v_old.assignee_id then
    perform private.check_assignee(v_group_id, p_assignee_id);
  end if;

  if v_text.title <> v_old.title then v_fields := v_fields || 'title'::text; end if;
  if v_text.details <> v_old.details then v_fields := v_fields || 'details'::text; end if;
  if p_deadline is distinct from v_old.deadline then v_fields := v_fields || 'deadline'::text; end if;

  if cardinality(v_fields) = 0 and p_assignee_id = v_old.assignee_id then
    return v_old;
  end if;

  update public.tasks t
     set title = v_text.title,
         details = v_text.details,
         assignee_id = p_assignee_id,
         deadline = p_deadline,
         updated_at = now()
   where t.id = p_task_id
  returning * into v_task;

  if cardinality(v_fields) > 0 then
    perform private.log(v_group_id, v_me.id, 'task_edited', v_task.id, null,
      jsonb_build_object('number', v_task.number, 'fields', to_jsonb(v_fields)));
  end if;
  if p_assignee_id <> v_old.assignee_id then
    perform private.log(v_group_id, v_me.id, 'task_reassigned', v_task.id, p_assignee_id,
      jsonb_build_object('number', v_task.number, 'from', v_old.assignee_id));
  end if;
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_task: leader only, soft delete.
-- ---------------------------------------------------------------------------

create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_task_group(p_task_id);
  v_me public.memberships := private.caller_leader_seat(v_group_id);
  v_task public.tasks;
begin
  update public.tasks t
     set deleted_at = now(), updated_at = now()
   where t.id = p_task_id and t.deleted_at is null
  returning * into v_task;
  if not found then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  perform private.log(v_group_id, v_me.id, 'task_deleted', v_task.id, null,
    jsonb_build_object('number', v_task.number, 'title', v_task.title));
end;
$$;

-- ---------------------------------------------------------------------------
-- set_task_status: the assignee or the leader.
-- ---------------------------------------------------------------------------

create function public.set_task_status(p_task_id uuid, p_status public.task_status)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_task_group(p_task_id);
  v_me public.memberships := private.caller_seat(v_group_id);
  v_old public.tasks;
  v_task public.tasks;
begin
  if p_status is null then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'status';
  end if;

  select t.* into v_old from public.tasks t
   where t.id = p_task_id and t.deleted_at is null
     for update;
  if not found or (v_me.role <> 'leader' and v_old.assignee_id <> v_me.id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if v_old.status = p_status then
    return v_old;
  end if;

  update public.tasks t
     set status = p_status,
         completed_at = case when p_status = 'done' then now() end,
         updated_at = now()
   where t.id = p_task_id
  returning * into v_task;

  perform private.log(v_group_id, v_me.id, 'status_changed', v_task.id, null,
    jsonb_build_object('number', v_task.number, 'from', v_old.status, 'to', p_status));
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- take_over_tasks: any active member claims tasks of a former member.
-- Returns the task numbers moved.
-- ---------------------------------------------------------------------------

create function public.take_over_tasks(p_from_member_id uuid, p_task_ids uuid[])
returns int[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.memberships;
  v_me public.memberships;
  v_ids uuid[] := array(select distinct x from unnest(p_task_ids) x where x is not null);
  v_numbers int[];
begin
  select m.* into v_from from public.memberships m where m.id = p_from_member_id;
  if not found then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  v_me := private.caller_seat(v_from.group_id);

  if v_from.status <> 'former' then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'from_member_id';
  end if;
  if cardinality(v_ids) = 0 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'task_ids';
  end if;

  -- Row locks: a second caller waits, then no longer matches the assignee.
  select array_agg(l.number order by l.number) into v_numbers
    from (select t.number
            from public.tasks t
           where t.id = any (v_ids)
             and t.group_id = v_from.group_id
             and t.assignee_id = v_from.id
             and t.deleted_at is null
             for update) l;

  if coalesce(cardinality(v_numbers), 0) <> cardinality(v_ids) then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'task_ids';
  end if;

  update public.tasks t
     set assignee_id = v_me.id, updated_at = now()
   where t.id = any (v_ids);

  perform private.log(v_from.group_id, v_me.id, 'tasks_taken_over', null, v_from.id,
    jsonb_build_object('numbers', to_jsonb(v_numbers)));
  return v_numbers;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only
-- ---------------------------------------------------------------------------

revoke all on function public.create_task(uuid, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.update_task(uuid, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
revoke all on function public.set_task_status(uuid, public.task_status) from public, anon;
revoke all on function public.take_over_tasks(uuid, uuid[]) from public, anon;

grant execute on function public.create_task(uuid, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.update_task(uuid, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.set_task_status(uuid, public.task_status) to authenticated;
grant execute on function public.take_over_tasks(uuid, uuid[]) to authenticated;

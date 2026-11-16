-- 2.7 Question thread and chat functions, plus the open_questions trigger.
-- See ARCHITECTURE.md sections 3 and 5, SECURITY.md sections 3 and 10.
-- Error keys follow 20261116050000_group_functions.sql.
--
-- Rate limits: questions and replies share the 'question' bucket (20 per
-- minute), chat uses 'message' (30 per minute).

-- ---------------------------------------------------------------------------
-- open_questions: tasks.open_questions follows the open threads of the task
-- ---------------------------------------------------------------------------

create function private.sync_open_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'open' then
      update public.tasks t set open_questions = t.open_questions + 1 where t.id = new.task_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'open' and new.status <> 'open' then
      update public.tasks t set open_questions = greatest(t.open_questions - 1, 0) where t.id = new.task_id;
    elsif old.status <> 'open' and new.status = 'open' then
      update public.tasks t set open_questions = t.open_questions + 1 where t.id = new.task_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'open' then
      update public.tasks t set open_questions = greatest(t.open_questions - 1, 0) where t.id = old.task_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger threads_sync_open_questions
  after insert or delete or update of status on public.threads
  for each row execute function private.sync_open_questions();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Validates and cleans a question, reply or chat body (1 to 1000 characters).
create function private.check_body(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_body text := private.clean_block(p_body);
begin
  if v_body is null or char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'body';
  end if;
  return v_body;
end;
$$;

-- The group of a thread whose task is still live, or 'forbidden' (unknown and
-- deleted look the same).
create function private.live_thread_group(p_thread_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select th.group_id into v_group_id
    from public.threads th
    join public.tasks t on t.id = th.task_id and t.group_id = th.group_id
   where th.id = p_thread_id and t.deleted_at is null;
  if v_group_id is null then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return v_group_id;
end;
$$;

revoke all on function private.sync_open_questions() from public;
revoke all on function private.check_body(text) from public;
revoke all on function private.live_thread_group(uuid) from public;

-- ---------------------------------------------------------------------------
-- open_question: the assignee, on their own task. The leader replies instead,
-- even on a task assigned to themselves (SECURITY.md section 3).
-- ---------------------------------------------------------------------------

create function public.open_question(p_task_id uuid, p_body text)
returns public.threads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_task_group(p_task_id);
  v_me public.memberships := private.caller_seat(v_group_id, true);
  v_body text := private.check_body(p_body);
  v_task public.tasks;
  v_thread public.threads;
begin
  -- Lock the task so the assignee check and the insert see the same row.
  select t.* into v_task from public.tasks t
   where t.id = p_task_id and t.deleted_at is null
     for no key update;
  if not found or v_me.role = 'leader' or v_task.assignee_id <> v_me.id then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  perform private.rate_limit_take('question', 20, interval '1 minute');

  insert into public.threads (group_id, task_id, opened_by, body)
  values (v_group_id, p_task_id, v_me.id, v_body)
  returning * into v_thread;

  perform private.log(v_group_id, v_me.id, 'question_asked', p_task_id, null,
    jsonb_build_object('number', v_task.number, 'thread_id', v_thread.id));
  return v_thread;
end;
$$;

-- ---------------------------------------------------------------------------
-- reply_to_question: any active member
-- ---------------------------------------------------------------------------

create function public.reply_to_question(p_thread_id uuid, p_body text)
returns public.thread_replies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_thread_group(p_thread_id);
  v_me public.memberships := private.caller_seat(v_group_id, true);
  v_body text := private.check_body(p_body);
  v_thread public.threads;
  v_number int;
  v_reply public.thread_replies;
begin
  -- Again under the group lock: the task may have been deleted while we waited.
  perform private.live_thread_group(p_thread_id);

  select th.* into v_thread from public.threads th where th.id = p_thread_id;
  select t.number into v_number from public.tasks t where t.id = v_thread.task_id;

  perform private.rate_limit_take('question', 20, interval '1 minute');

  insert into public.thread_replies (group_id, thread_id, author_id, body)
  values (v_group_id, p_thread_id, v_me.id, v_body)
  returning * into v_reply;

  perform private.log(v_group_id, v_me.id, 'question_replied', v_thread.task_id, null,
    jsonb_build_object('number', v_number, 'thread_id', p_thread_id));
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_question_resolved: the opener or the leader. Resolving a resolved
-- thread, or reopening an open one, changes nothing and logs nothing.
-- ---------------------------------------------------------------------------

create function public.set_question_resolved(p_thread_id uuid, p_resolved boolean)
returns public.threads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := private.live_thread_group(p_thread_id);
  v_me public.memberships := private.caller_seat(v_group_id, true);
  v_old public.threads;
  v_thread public.threads;
  v_number int;
begin
  -- Again under the group lock: the task may have been deleted while we waited.
  perform private.live_thread_group(p_thread_id);

  if p_resolved is null then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'resolved';
  end if;

  select th.* into v_old from public.threads th where th.id = p_thread_id for no key update;
  if not found or (v_me.role <> 'leader' and v_old.opened_by <> v_me.id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if (v_old.status = 'resolved') = p_resolved then
    return v_old;
  end if;

  if p_resolved then
    update public.threads th
       set status = 'resolved', resolved_by = v_me.id, resolved_at = now()
     where th.id = p_thread_id
    returning * into v_thread;
  else
    update public.threads th
       set status = 'open', resolved_by = null, resolved_at = null
     where th.id = p_thread_id
    returning * into v_thread;
  end if;

  select t.number into v_number from public.tasks t where t.id = v_thread.task_id;
  perform private.log(v_group_id, v_me.id,
    case when p_resolved then 'question_resolved' else 'question_reopened' end::public.log_action,
    v_thread.task_id, null,
    jsonb_build_object('number', v_number, 'thread_id', p_thread_id));
  return v_thread;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_message: any active member. Chat is not logged.
-- ---------------------------------------------------------------------------

create function public.send_message(p_group_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_seat(p_group_id, true);
  v_body text := private.check_body(p_body);
  v_message public.messages;
begin
  perform private.rate_limit_take('message', 30, interval '1 minute');

  insert into public.messages (group_id, author_id, body)
  values (p_group_id, v_me.id, v_body)
  returning * into v_message;
  return v_message;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only
-- ---------------------------------------------------------------------------

revoke all on function public.open_question(uuid, text) from public, anon;
revoke all on function public.reply_to_question(uuid, text) from public, anon;
revoke all on function public.set_question_resolved(uuid, boolean) from public, anon;
revoke all on function public.send_message(uuid, text) from public, anon;

grant execute on function public.open_question(uuid, text) to authenticated;
grant execute on function public.reply_to_question(uuid, text) to authenticated;
grant execute on function public.set_question_resolved(uuid, boolean) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;

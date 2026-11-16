-- 2.5 Group write functions and the shared helpers they use.
-- See ARCHITECTURE.md section 5, SECURITY.md sections 3 and 4.
--
-- Errors carry a stable key as the message, for the client to map:
--   not_authenticated, forbidden (42501)    caller not signed in / not allowed
--   invalid_input (22023, detail = field)   bad argument
--   member_limit_below_active (22023)
--   join_code_taken (23505)
--   membership_limit (54000)                20 active groups per account
--   leader_must_transfer (55000)
--   rate_limited (P0001)
-- join_group returns null for every refusal that must look the same
-- (wrong code, full group, blocked account), see SECURITY.md section 4.
--
-- Row locks in every write function are FOR NO KEY UPDATE. No function
-- changes a referenced key, and this mode does not conflict with the FOR KEY
-- SHARE locks that foreign key checks take when rows are inserted (logs,
-- tasks, messages...). FOR UPDATE does: a leader holding the group while an
-- assignee's log insert waits on it, each holding what the other needs, is a
-- deadlock.
--
-- Every write function locks the group row first (caller_seat(..., true) or
-- caller_leader_seat), then memberships or tasks, then threads. Deleting the
-- group (the last member leaving) takes the group lock first too, so it waits
-- for any write in flight instead of deadlocking on that write's task locks.
-- Writes are serialized per group, which is cheap at 30 members.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

-- Single-line text: control characters (newlines included) removed, trimmed.
create function private.clean_line(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(p_text, '[\u0001-\u001F\u007F]', '', 'g'));
$$;

-- Multi-line text: line endings normalized to \n, tabs and other control
-- characters removed, then surrounding whitespace (newlines included)
-- trimmed. Line breaks inside the text are kept.
create function private.clean_block(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(p_text, '\r\n?', E'\n', 'g'),
      '[\u0001-\u0009\u000B-\u001F\u007F]', '', 'g'),
    '^\s+|\s+$', '', 'g');
$$;

create function private.normalize_join_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(p_code, '\s', '', 'g'));
$$;

-- The caller's active seat in a group, or 'forbidden'. With p_lock_group the
-- group row is locked first, which serializes membership changes per group.
create function private.caller_seat(p_group_id uuid, p_lock_group boolean default false)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_me public.memberships;
begin
  if p_lock_group then
    perform 1 from public.groups g where g.id = p_group_id for no key update;
  end if;

  select m.* into v_me
    from public.memberships m
   where m.group_id = p_group_id
     and m.user_id = v_uid
     and m.status = 'active';
  if not found then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return v_me;
end;
$$;

-- The caller's leader seat in a group (group row locked), or 'forbidden'.
create function private.caller_leader_seat(p_group_id uuid)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_seat(p_group_id, true);
begin
  if v_me.role <> 'leader' then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return v_me;
end;
$$;

-- Refuses a 21st active membership. Locks the profile row so two calls from
-- the same account cannot both pass at 19.
create function private.check_membership_cap(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles p where p.id = p_user_id for no key update;
  if not found then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.memberships m
       where m.user_id = p_user_id and m.status = 'active') >= 20 then
    raise exception 'membership_limit' using errcode = 'program_limit_exceeded';
  end if;
end;
$$;

-- Validates group settings, returns them cleaned. Raises invalid_input.
create function private.check_group_settings(
  p_name text,
  p_purpose public.group_purpose,
  p_purpose_note text,
  p_member_limit int,
  p_join_code text,
  out name text,
  out purpose public.group_purpose,
  out purpose_note text,
  out member_limit int,
  out join_code text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  name := private.clean_line(p_name);
  if name is null or char_length(name) not between 1 and 40 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'name';
  end if;

  purpose := p_purpose;
  if purpose is null then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'purpose';
  end if;

  -- The note only describes "other"; anything sent with another purpose is dropped.
  purpose_note := case when purpose = 'other' then nullif(private.clean_line(p_purpose_note), '') end;
  if char_length(purpose_note) > 40 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'purpose_note';
  end if;

  member_limit := p_member_limit;
  if member_limit is null or member_limit not between 2 and 30 then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'member_limit';
  end if;

  join_code := private.normalize_join_code(p_join_code);
  if join_code is null or join_code !~ '^[A-Z]{8}$' then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'join_code';
  end if;
end;
$$;

revoke all on function private.require_uid() from public;
revoke all on function private.clean_line(text) from public;
revoke all on function private.clean_block(text) from public;
revoke all on function private.normalize_join_code(text) from public;
revoke all on function private.caller_seat(uuid, boolean) from public;
revoke all on function private.caller_leader_seat(uuid) from public;
revoke all on function private.check_membership_cap(uuid) from public;
revoke all on function private.check_group_settings(text, public.group_purpose, text, int, text) from public;

-- ---------------------------------------------------------------------------
-- create_group: the group and the caller's leader seat
-- ---------------------------------------------------------------------------

create function public.create_group(
  p_name text,
  p_purpose public.group_purpose,
  p_purpose_note text,
  p_member_limit int,
  p_join_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_set record;
  v_username text;
  v_group_id uuid;
  v_member_id uuid;
begin
  select * into v_set from private.check_group_settings(p_name, p_purpose, p_purpose_note, p_member_limit, p_join_code);
  perform private.check_membership_cap(v_uid);

  select p.username::text into v_username from public.profiles p where p.id = v_uid;

  begin
    insert into public.groups (name, purpose, purpose_note, member_limit, join_code, next_seat)
    values (v_set.name, v_set.purpose, v_set.purpose_note, v_set.member_limit, v_set.join_code, 2)
    returning id into v_group_id;
  exception when unique_violation then
    raise exception 'join_code_taken' using errcode = 'unique_violation';
  end;

  insert into public.memberships (group_id, user_id, display_name, seat, role)
  values (v_group_id, v_uid, v_username, 1, 'leader')
  returning id into v_member_id;

  perform private.log(v_group_id, v_member_id, 'group_created', null, null,
    jsonb_build_object('name', v_set.name));
  return v_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_group: returns the group id, or null for any refusal that must not
-- reveal whether the code exists. Ten failures an hour lock the account out.
-- ---------------------------------------------------------------------------

create function public.join_group(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := private.normalize_join_code(p_join_code);
  v_group public.groups;
  v_existing uuid;
  v_username text;
  v_seat int;
  v_member_id uuid;
begin
  -- Locks the caller's profile row, which serializes this account's joins.
  -- Before the code lookup, so this error cannot be used to probe codes.
  perform private.check_membership_cap(v_uid);

  -- After that lock, so parallel attempts each see the failures committed
  -- before them and cannot all pass at nine.
  if private.rate_limit_used('join_failed', interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_code ~ '^[A-Z]{8}$' then
    -- The lock serializes joins, so two callers cannot both take the last seat.
    select g.* into v_group from public.groups g where g.join_code = v_code for no key update;
  end if;

  if v_group.id is not null then
    select m.id into v_existing
      from public.memberships m
     where m.group_id = v_group.id and m.user_id = v_uid and m.status = 'active';
    if v_existing is not null then
      return v_group.id;
    end if;

    if not exists (select 1 from public.group_blocks b
                    where b.group_id = v_group.id and b.user_id = v_uid)
       and (select count(*) from public.memberships m
             where m.group_id = v_group.id and m.status = 'active') < v_group.member_limit then
      update public.groups g set next_seat = g.next_seat + 1
       where g.id = v_group.id
      returning g.next_seat - 1 into v_seat;

      select p.username::text into v_username from public.profiles p where p.id = v_uid;

      insert into public.memberships (group_id, user_id, display_name, seat, role)
      values (v_group.id, v_uid, v_username, v_seat, 'member')
      returning id into v_member_id;

      perform private.log(v_group.id, v_member_id, 'member_joined', null, v_member_id);
      return v_group.id;
    end if;
  end if;

  -- Wrong code, full group or blocked: the same answer. Returning (not
  -- raising) keeps the failure count.
  perform private.rate_limit_record('join_failed', interval '1 hour');
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_group: own seat to former. A leader must transfer first, unless they
-- are the last active member, in which case the group is deleted.
-- ---------------------------------------------------------------------------

create function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_seat(p_group_id, true);
begin
  if v_me.role = 'leader' then
    if exists (select 1 from public.memberships m
                where m.group_id = p_group_id and m.status = 'active' and m.id <> v_me.id) then
      raise exception 'leader_must_transfer' using errcode = 'object_not_in_prerequisite_state';
    end if;
    delete from public.groups g where g.id = p_group_id;
    return;
  end if;

  update public.memberships m
     set status = 'former', left_at = now(), left_reason = 'left'
   where m.id = v_me.id;

  perform private.log(p_group_id, v_me.id, 'member_left', null, v_me.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_group: leader edits settings. The limit cannot go below the
-- current active count.
-- ---------------------------------------------------------------------------

create function public.update_group(
  p_group_id uuid,
  p_name text,
  p_purpose public.group_purpose,
  p_purpose_note text,
  p_member_limit int,
  p_join_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_leader_seat(p_group_id);
  v_set record;
  v_old_code text;
begin
  select * into v_set from private.check_group_settings(p_name, p_purpose, p_purpose_note, p_member_limit, p_join_code);

  if v_set.member_limit < (select count(*) from public.memberships m
                            where m.group_id = p_group_id and m.status = 'active') then
    raise exception 'member_limit_below_active' using errcode = 'invalid_parameter_value';
  end if;

  select g.join_code::text into v_old_code from public.groups g where g.id = p_group_id;

  begin
    update public.groups g
       set name = v_set.name,
           purpose = v_set.purpose,
           purpose_note = v_set.purpose_note,
           member_limit = v_set.member_limit,
           join_code = v_set.join_code
     where g.id = p_group_id;
  exception when unique_violation then
    raise exception 'join_code_taken' using errcode = 'unique_violation';
  end;

  if v_set.join_code <> v_old_code then
    perform private.log(p_group_id, v_me.id, 'join_code_changed');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_member: leader flips a member to former, blocks the account, and
-- optionally sets a new join code in the same transaction.
-- ---------------------------------------------------------------------------

create function public.remove_member(p_member_id uuid, p_new_join_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := (select m.group_id from public.memberships m where m.id = p_member_id);
  v_me public.memberships;
  v_target public.memberships;
  v_code text;
begin
  if v_group_id is null then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  v_me := private.caller_leader_seat(v_group_id);

  select m.* into v_target from public.memberships m where m.id = p_member_id for no key update;
  if v_target.status <> 'active' or v_target.id = v_me.id then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'member_id';
  end if;

  update public.memberships m
     set status = 'former', left_at = now(), left_reason = 'removed'
   where m.id = v_target.id;

  insert into public.group_blocks (group_id, user_id)
  values (v_group_id, v_target.user_id)
  on conflict do nothing;

  perform private.log(v_group_id, v_me.id, 'member_removed', null, v_target.id);

  if p_new_join_code is not null then
    v_code := private.normalize_join_code(p_new_join_code);
    if v_code !~ '^[A-Z]{8}$' then
      raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'join_code';
    end if;
    if v_code <> (select g.join_code::text from public.groups g where g.id = v_group_id) then
      begin
        update public.groups g set join_code = v_code where g.id = v_group_id;
      exception when unique_violation then
        raise exception 'join_code_taken' using errcode = 'unique_violation';
      end;
      perform private.log(v_group_id, v_me.id, 'join_code_changed');
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- transfer_leadership: swaps roles atomically.
-- ---------------------------------------------------------------------------

create function public.transfer_leadership(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := (select m.group_id from public.memberships m where m.id = p_member_id);
  v_me public.memberships;
  v_target public.memberships;
begin
  if v_group_id is null then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  v_me := private.caller_leader_seat(v_group_id);

  select m.* into v_target from public.memberships m where m.id = p_member_id for no key update;
  if v_target.status <> 'active' or v_target.id = v_me.id then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'member_id';
  end if;

  -- Demote first: the one-leader index is checked row by row.
  update public.memberships m set role = 'member' where m.id = v_me.id;
  update public.memberships m set role = 'leader' where m.id = v_target.id;

  perform private.log(v_group_id, v_me.id, 'leadership_transferred', null, v_target.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only
-- ---------------------------------------------------------------------------

revoke all on function public.create_group(text, public.group_purpose, text, int, text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.update_group(uuid, text, public.group_purpose, text, int, text) from public, anon;
revoke all on function public.remove_member(uuid, text) from public, anon;
revoke all on function public.transfer_leadership(uuid) from public, anon;

grant execute on function public.create_group(text, public.group_purpose, text, int, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.update_group(uuid, text, public.group_purpose, text, int, text) to authenticated;
grant execute on function public.remove_member(uuid, text) to authenticated;
grant execute on function public.transfer_leadership(uuid) to authenticated;

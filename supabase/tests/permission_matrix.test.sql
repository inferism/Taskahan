-- 2.10 The permission matrix of SECURITY.md section 3, cell by cell.
--
-- Actors: lead, assignee (owns task #1), member (any other active member),
-- former (removed by the leader), outsider (member of a different group only),
-- and anon. Every table and every public function is exercised by each actor.
-- Each attempt runs in a sub-transaction that is rolled back, so cells are
-- independent of each other and of the order they run in.
--
-- Result encoding: the scalar a query returns (scalar rows), otherwise 'ok'
-- when the statement succeeds, or the SQLSTATE it failed with (42501 = refused or no
-- privilege, 22023 = invalid input, 55000 = leader must transfer).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(459);

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;

create temp table actors (ord int primary key, actor text unique, uid uuid);
insert into actors values
  (1, 'lead',     '00000000-0000-0000-0000-000000000301'),
  (2, 'assignee', '00000000-0000-0000-0000-000000000302'),
  (3, 'member',   '00000000-0000-0000-0000-000000000303'),
  (4, 'former',   '00000000-0000-0000-0000-000000000304'),
  (5, 'outsider', '00000000-0000-0000-0000-000000000305'),
  (6, 'anon',     null);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;

-- {key} placeholders become quoted ids from the fixture.
create function pg_temp.sub(p_sql text) returns text language plpgsql as $$
declare
  r record;
  v_sql text := p_sql;
begin
  for r in select k, v from ids loop
    v_sql := replace(v_sql, '{' || r.k || '}', quote_literal(r.v::text));
  end loop;
  return v_sql;
end;
$$;

-- Runs p_sql as the actor and always rolls back.
create function pg_temp.attempt(p_actor text, p_sql text, p_scalar boolean default false)
returns text language plpgsql as $$
declare
  v_uid uuid := (select uid from actors where actor = p_actor);
  v_out text;
  v_res text;
begin
  begin
    if p_actor = 'anon' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    if p_scalar then
      execute pg_temp.sub(p_sql) into v_out;
      v_res := v_out;
    else
      execute pg_temp.sub(p_sql);
      v_res := 'ok';
    end if;
    raise exception 'rollback' using errcode = 'P9999';
  exception
    when sqlstate 'P9999' then null;
    when others then v_res := sqlstate;
  end;
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture. G: lead L, assignee A, member M, former F (removed). G2: outsider O.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
select uid, 'pm_' || actor || '@users.taskahan.pages.dev' from actors where uid is not null;

select pg_temp.as_user((select uid from actors where actor = 'lead'));
insert into ids values ('g', public.create_group('Matrix', 'work_team', null, 10, 'MATRIXAA'));
select pg_temp.as_user((select uid from actors where actor = 'assignee'));
select public.join_group('MATRIXAA');
select pg_temp.as_user((select uid from actors where actor = 'member'));
select public.join_group('MATRIXAA');
select pg_temp.as_user((select uid from actors where actor = 'former'));
select public.join_group('MATRIXAA');
select pg_temp.as_user((select uid from actors where actor = 'outsider'));
insert into ids values ('g2', public.create_group('Elsewhere', 'other', null, 5, 'ELSEWHER'));

insert into ids
select case m.user_id
         when (select uid from actors where actor = 'lead') then 'mL'
         when (select uid from actors where actor = 'assignee') then 'mA'
         when (select uid from actors where actor = 'member') then 'mM'
         when (select uid from actors where actor = 'former') then 'mF'
         when (select uid from actors where actor = 'outsider') then 'mO'
       end, m.id
  from public.memberships m;

-- Tasks: #1 A, #2 M, #3 F (before F is removed). The other group has one task.
select pg_temp.as_user((select uid from actors where actor = 'lead'));
select public.create_task(pg_temp.id('g'), 'One', '', pg_temp.id('mA'), null);
select public.create_task(pg_temp.id('g'), 'Two', '', pg_temp.id('mM'), null);
select public.create_task(pg_temp.id('g'), 'Three', '', pg_temp.id('mF'), null);
insert into ids select 't' || number, id from public.tasks where group_id = pg_temp.id('g');

select pg_temp.as_user((select uid from actors where actor = 'outsider'));
select public.create_task(pg_temp.id('g2'), 'Far', '', pg_temp.id('mO'), null);
insert into ids select 'tx', id from public.tasks where group_id = pg_temp.id('g2');

-- A question on #1 from its assignee, a reply from the leader, a chat message.
select pg_temp.as_user((select uid from actors where actor = 'assignee'));
insert into ids select 'th1', id from public.open_question(pg_temp.id('t1'), 'Which API?');
select pg_temp.as_user((select uid from actors where actor = 'lead'));
select public.reply_to_question(pg_temp.id('th1'), 'The new one');
select public.send_message(pg_temp.id('g'), 'Welcome');

-- F is removed: a former member, blocked from rejoining.
select public.remove_member(pg_temp.id('mF'));
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- The matrix: what, SQL, then the result for lead|assignee|member|former|outsider|anon
-- ---------------------------------------------------------------------------

create temp table matrix (n serial primary key, what text, sql text, spec text, scalar boolean not null default false);

-- Reads: what each actor sees of group G (outsider and former see nothing).
insert into matrix (what, sql, spec) values
  ('select groups',
   $$ select count(*) from public.groups where id = {g} $$,
   '1|1|1|0|0|42501'),
  ('select memberships (a former member still sees their own row)',
   $$ select count(*) from public.memberships where group_id = {g} $$,
   '4|4|4|1|0|42501'),
  ('select tasks',
   $$ select count(*) from public.tasks where group_id = {g} $$,
   '3|3|3|0|0|42501'),
  ('select threads',
   $$ select count(*) from public.threads where group_id = {g} $$,
   '1|1|1|0|0|42501'),
  ('select thread_replies',
   $$ select count(*) from public.thread_replies where group_id = {g} $$,
   '1|1|1|0|0|42501'),
  ('select messages',
   $$ select count(*) from public.messages where group_id = {g} $$,
   '1|1|1|0|0|42501'),
  ('select logs (leader only)',
   $$ select count(*) > 0 from public.logs where group_id = {g} $$,
   'true|false|false|false|false|42501'),
  ('select group_blocks',
   $$ select count(*) from public.group_blocks $$,
   '42501|42501|42501|42501|42501|42501'),
  ('select rate_limits',
   $$ select count(*) from public.rate_limits $$,
   '42501|42501|42501|42501|42501|42501'),
  ('select profiles (own row only)',
   $$ select count(*) from public.profiles $$,
   '1|1|1|1|1|42501'),
  ('select member_profiles (self and active group mates)',
   $$ select count(*) from public.member_profiles $$,
   '3|3|3|1|1|42501');

-- Everything inserted so far returns a value to compare.
update matrix set scalar = true;

-- Direct writes: no insert, update or delete for anyone, on any table.
insert into matrix (what, sql, spec)
select op || ' ' || t,
       case op
         when 'insert' then format('insert into public.%I default values', t)
         when 'update' then format('update public.%I set %I = %I', t, c.name, c.name)
         else format('delete from public.%I', t)
       end,
       '42501|42501|42501|42501|42501|42501'
  from unnest(array['groups', 'memberships', 'group_blocks', 'tasks', 'threads',
                    'thread_replies', 'messages', 'logs', 'rate_limits', 'profiles']) t
 cross join unnest(array['insert', 'update', 'delete']) op
 cross join lateral (
   select column_name::text as name from information_schema.columns
    where table_schema = 'public' and table_name = t and ordinal_position = 2) c;

-- Write functions. Order of the spec: lead|assignee|member|former|outsider|anon.
insert into matrix (what, sql, spec) values
  ('create_group',
   $$ select public.create_group('Fresh', 'club_org', null, 5, 'FRESHONE') $$,
   'ok|ok|ok|ok|ok|42501'),
  ('join_group with the right code (a removed member is refused quietly)',
   $$ select public.join_group('MATRIXAA') is not null $$,
   'true|true|true|false|true|42501'),
  ('join_group with a wrong code is refused the same way for everyone',
   $$ select public.join_group('NOSUCHXX') is not null $$,
   'false|false|false|false|false|42501'),
  ('leave_group (the leader must transfer first)',
   $$ select public.leave_group({g}) $$,
   '55000|ok|ok|42501|42501|42501'),
  ('update_group',
   $$ select public.update_group({g}, 'Renamed', 'work_team', null, 10, 'MATRIXAA') $$,
   'ok|42501|42501|42501|42501|42501'),
  ('remove_member',
   $$ select public.remove_member({mM}) $$,
   'ok|42501|42501|42501|42501|42501'),
  ('transfer_leadership',
   $$ select public.transfer_leadership({mM}) $$,
   'ok|42501|42501|42501|42501|42501'),
  ('create_task',
   $$ select public.create_task({g}, 'New', '', {mA}, null) $$,
   'ok|42501|42501|42501|42501|42501'),
  ('create_task in another group with an assignee from this one',
   $$ select public.create_task({g2}, 'New', '', {mA}, null) $$,
   '42501|42501|42501|42501|22023|42501'),
  ('update_task',
   $$ select public.update_task({t1}, 'Edited', '', {mA}, null) $$,
   'ok|42501|42501|42501|42501|42501'),
  ('update_task, reassigned to a member of another group',
   $$ select public.update_task({t1}, 'One', '', {mO}, null) $$,
   '22023|42501|42501|42501|42501|42501'),
  ('update_task on another group''s task',
   $$ select public.update_task({tx}, 'Edited', '', {mO}, null) $$,
   '42501|42501|42501|42501|ok|42501'),
  ('delete_task',
   $$ select public.delete_task({t1}) $$,
   'ok|42501|42501|42501|42501|42501'),
  ('delete_task on another group''s task',
   $$ select public.delete_task({tx}) $$,
   '42501|42501|42501|42501|ok|42501'),
  ('set_task_status on the assignee''s task',
   $$ select public.set_task_status({t1}, 'done') $$,
   'ok|ok|42501|42501|42501|42501'),
  ('set_task_status on someone else''s task',
   $$ select public.set_task_status({t2}, 'done') $$,
   'ok|42501|ok|42501|42501|42501'),
  ('take_over_tasks from a former member',
   $$ select array_length(public.take_over_tasks({mF}, array[{t3}]::uuid[]), 1) $$,
   '1|1|1|42501|42501|42501'),
  ('take_over_tasks from an active member is refused',
   $$ select public.take_over_tasks({mA}, array[{t1}]::uuid[]) $$,
   '22023|22023|22023|42501|42501|42501'),
  ('open_question on the assignee''s own task',
   $$ select public.open_question({t1}, 'Another question') $$,
   '42501|ok|42501|42501|42501|42501'),
  ('open_question on someone else''s task',
   $$ select public.open_question({t2}, 'Not mine') $$,
   '42501|42501|ok|42501|42501|42501'),
  ('reply_to_question',
   $$ select public.reply_to_question({th1}, 'A reply') $$,
   'ok|ok|ok|42501|42501|42501'),
  ('set_question_resolved (leader, or whoever opened it)',
   $$ select public.set_question_resolved({th1}, true) $$,
   'ok|ok|42501|42501|42501|42501'),
  ('send_message',
   $$ select public.send_message({g}, 'Hello') $$,
   'ok|ok|ok|42501|42501|42501'),
  ('get_group_snapshot',
   $$ select public.get_group_snapshot({g}) is not null $$,
   'true|true|true|42501|42501|42501'),
  ('touch_activity',
   $$ select public.touch_activity() $$,
   'ok|ok|ok|ok|ok|42501'),
  ('set_theme',
   $$ select public.set_theme('dark') $$,
   'ok|ok|ok|ok|ok|42501');

update matrix set scalar = true
 where what in ('join_group with the right code (a removed member is refused quietly)',
                'join_group with a wrong code is refused the same way for everyone',
                'take_over_tasks from a former member',
                'get_group_snapshot');

-- Helpers live in private and are not callable by anyone, whatever the role.
insert into matrix (what, sql, spec) values
  ('private.log is not callable',
   $$ select private.log({g}, {mL}, 'task_created') $$,
   '42501|42501|42501|42501|42501|42501'),
  ('private.caller_seat is not callable',
   $$ select private.caller_seat({g}, false) $$,
   '42501|42501|42501|42501|42501|42501'),
  ('private.caller_leader_seat is not callable',
   $$ select private.caller_leader_seat({g}) $$,
   '42501|42501|42501|42501|42501|42501'),
  ('private.rate_limit_take is not callable',
   $$ select private.rate_limit_take('message', 30, interval '1 minute') $$,
   '42501|42501|42501|42501|42501|42501'),
  -- Only the set-avatar Edge Function, as service role, may call it.
  ('swap_avatar_path is not callable',
   $$ select public.swap_avatar_path({mL}, 'x/y.webp') $$,
   '42501|42501|42501|42501|42501|42501'),
  -- Only the purge-inactive Edge Function, as service role, may call these.
  ('inactive_accounts is not callable',
   $$ select public.inactive_accounts(10) $$,
   '42501|42501|42501|42501|42501|42501'),
  ('release_inactive_account is not callable',
   $$ select public.release_inactive_account({mL}) $$,
   '42501|42501|42501|42501|42501|42501'),
  ('private.release_account is not callable',
   $$ select private.release_account({mL}) $$,
   '42501|42501|42501|42501|42501|42501');

-- One test per cell.
select is(
  pg_temp.attempt(a.actor, m.sql, m.scalar),
  (regexp_split_to_array(m.spec, '\|'))[a.ord],
  m.what || ' / ' || a.actor)
  from matrix m
 cross join actors a
 order by m.n, a.ord;

-- ---------------------------------------------------------------------------
-- Cells that need their effect checked, not just the refusal
-- ---------------------------------------------------------------------------

-- Taking over really moves the task to the caller, and nobody else's.
select pg_temp.as_user((select uid from actors where actor = 'member'));
set local role authenticated;
select public.take_over_tasks(pg_temp.id('mF'), array[pg_temp.id('t3')]);
reset role;
select is(
  (select assignee_id from public.tasks where id = pg_temp.id('t3')),
  pg_temp.id('mM'), 'take_over_tasks moves the task to the caller');

-- A former member's writes leave no trace.
select pg_temp.as_user((select uid from actors where actor = 'former'));
set local role authenticated;
select throws_ok(
  format($$ select public.send_message(%L, 'Still here?') $$, pg_temp.id('g')),
  '42501', 'forbidden', 'a former member cannot send a message');
reset role;
select is(
  (select count(*)::int from public.messages where group_id = pg_temp.id('g')),
  1, 'the refused message was not stored');

-- ---------------------------------------------------------------------------
-- Structure: the matrix above must keep covering everything that exists
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')),
  array['group_blocks', 'groups', 'logs', 'member_profiles', 'memberships', 'messages',
        'profiles', 'rate_limits', 'tasks', 'thread_replies', 'threads'],
  'the matrix covers every table and view in public');

select is(
  (select array_agg(distinct p.proname::text order by p.proname::text)
     from pg_proc p where p.pronamespace = 'public'::regnamespace),
  array['create_group', 'create_task', 'delete_task', 'get_group_snapshot', 'inactive_accounts',
        'join_group', 'leave_group', 'open_question', 'release_inactive_account', 'remove_member', 'reply_to_question', 'send_message',
        'set_question_resolved', 'set_task_status', 'set_theme', 'swap_avatar_path', 'take_over_tasks',
        'touch_activity', 'transfer_leadership', 'update_group', 'update_task'],
  'the matrix covers every function in public');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  0, 'row level security is on for every table in public');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and (cmd <> 'SELECT' or roles && array['anon', 'public']::name[])),
  0, 'no policy exists for insert, update or delete, nor for anon');

select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'public' and grantee in ('PUBLIC', 'anon')),
  0, 'no function in public is executable by anon or public');

select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'private' and grantee in ('PUBLIC', 'anon', 'authenticated')
      and routine_name not in ('is_active_member', 'is_leader', 'group_topic_id',
                               'is_own_avatar_path')),
  0, 'private helpers are executable by nobody but the policy checks');

select * from finish();
rollback;

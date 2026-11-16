-- Concurrency regressions from the Phase 2 review:
--   1. Two parallel failed joins at nine failures cannot both get through.
--   2. A leader editing a task and an assignee changing a status at the same
--      time do not deadlock.
--
-- Same approach as join_concurrency.test.sql: real sessions over dblink,
-- fixtures committed through a setup connection and deleted at the end.
-- Sessions use a 5s lock timeout, so a regression fails instead of hanging.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(10);

create function pg_temp.connstr() returns text language sql as $$
  select format('host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), inet_server_port(), current_database());
$$;
create function pg_temp.connect_as(p_conn text, p_user uuid) returns void language plpgsql as $$
begin
  perform dblink_connect(p_conn, pg_temp.connstr());
  perform dblink_exec(p_conn, format($q$ select set_config('request.jwt.claims',
    json_build_object('sub', %L, 'role', 'authenticated')::text, false); set role authenticated;
    set lock_timeout = '5s' $q$, p_user));
end;
$$;

select dblink_connect('setup', pg_temp.connstr());

-- Committed fixtures: leader E1 and member E2 in group "Lock" with tasks #1
-- and #2 for E2. E3 has nine failed joins this hour.
select dblink_exec('setup', $$
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000e1', 'lock_lead@users.taskahan.pages.dev'),
    ('00000000-0000-0000-0000-0000000000e2', 'lock_member@users.taskahan.pages.dev'),
    ('00000000-0000-0000-0000-0000000000e3', 'lock_guesser@users.taskahan.pages.dev');
  insert into public.groups (id, name, purpose, member_limit, join_code, next_seat, next_task_number) values
    ('10000000-0000-0000-0000-0000000000e1', 'Lock', 'other', 5, 'LOCKKKKK', 3, 3);
  insert into public.memberships (id, group_id, user_id, display_name, seat, role) values
    ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1',
     '00000000-0000-0000-0000-0000000000e1', 'lock_lead', 1, 'leader'),
    ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1',
     '00000000-0000-0000-0000-0000000000e2', 'lock_member', 2, 'member');
  insert into public.tasks (id, group_id, number, title, assignee_id, created_by) values
    ('30000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 1, 'One',
     '20000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1'),
    ('30000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', 2, 'Two',
     '20000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e1');
  insert into public.rate_limits (user_id, bucket, window_start, count) values
    ('00000000-0000-0000-0000-0000000000e3', 'join_failed', now(), 9);
$$);

-- ---------------------------------------------------------------------------
-- 1. Parallel failed joins
-- ---------------------------------------------------------------------------

select pg_temp.connect_as('a', '00000000-0000-0000-0000-0000000000e3');
select pg_temp.connect_as('b', '00000000-0000-0000-0000-0000000000e3');

select dblink_exec('a', 'begin');
select is(
  (select r from dblink('a', $$ select public.join_group('WRONGXXX')::text $$) as t(r text)),
  null, 'the tenth failed join is refused normally');

select dblink_send_query('b', $$ select public.join_group('WRONGXXX')::text $$);
select pg_sleep(0.5);
select is(dblink_is_busy('b'), 1, 'a parallel join from the same account waits');

select dblink_exec('a', 'commit');
select * from dblink_get_result('b', false) as t(r text);
select ok(dblink_error_message('b') like '%rate_limited%',
  'after the first commits, the parallel join sees ten failures and is rate limited');
select * from dblink_get_result('b', false) as t(r text);

select is(
  (select r::int from dblink('setup', $$
     select count::text from public.rate_limits
      where user_id = '00000000-0000-0000-0000-0000000000e3' and bucket = 'join_failed' $$) as t(r text)),
  10, 'the failure count stops at ten');

-- ---------------------------------------------------------------------------
-- 2. Leader edit and assignee status change at the same time
-- ---------------------------------------------------------------------------

select pg_temp.connect_as('c', '00000000-0000-0000-0000-0000000000e1');
select pg_temp.connect_as('d', '00000000-0000-0000-0000-0000000000e2');

-- The leader edits #2 and keeps the transaction open: group and #2 locked.
select dblink_exec('c', 'begin');
select is(
  (select r from dblink('c', $$ select (public.update_task('30000000-0000-0000-0000-0000000000e2',
     'Two edited', '', '20000000-0000-0000-0000-0000000000e2', null)).title $$) as t(r text)),
  'Two edited', 'the leader edits one task');

-- The assignee changes #1. Its log insert must not wait on the group lock.
select dblink_exec('d', 'begin');
select dblink_send_query('d', $$ select (public.set_task_status('30000000-0000-0000-0000-0000000000e1',
  'in_progress')).status::text $$);
select pg_sleep(0.5);
select is(dblink_is_busy('d'), 0, 'a status change does not wait on the leader''s group lock');
select is((select r from dblink_get_result('d') as t(r text)), 'in_progress', 'the status change completes');
select * from dblink_get_result('d') as t(r text);

-- Now the leader edits #1, which the assignee still holds: a plain wait.
select dblink_send_query('c', $$ select (public.update_task('30000000-0000-0000-0000-0000000000e1',
  'One edited', '', '20000000-0000-0000-0000-0000000000e2', null)).title $$);
select pg_sleep(0.5);
select is(dblink_is_busy('c'), 1, 'the leader waits for the assignee''s task lock');

select dblink_exec('d', 'commit');
select is((select r from dblink_get_result('c') as t(r text)), 'One edited',
  'once the assignee commits, the leader''s edit goes through with no deadlock');
select * from dblink_get_result('c') as t(r text);
select dblink_exec('c', 'commit');

select is(
  (select r from dblink('setup', $$
     select title || '/' || status from public.tasks
      where id = '30000000-0000-0000-0000-0000000000e1' $$) as t(r text)),
  'One edited/in_progress', 'both changes to #1 are kept');

-- Clean up the committed fixtures.
select dblink_exec('setup', $$
  delete from public.groups where id = '10000000-0000-0000-0000-0000000000e1';
  delete from auth.users where id in ('00000000-0000-0000-0000-0000000000e1',
    '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');
$$);
select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select dblink_disconnect('d');
select dblink_disconnect('setup');

select * from finish();
rollback;

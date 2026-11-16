-- 2.5 Two people join at the same time for the last seat. Only one gets it.
--
-- Needs real concurrent sessions, so this file opens two extra connections
-- with dblink. Those sessions cannot see this file's uncommitted rows, so the
-- fixtures are committed through a third connection and deleted at the end.
-- The connections use the local stack's default postgres password over the
-- container's network address (loopback is trust-only and dblink refuses it).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(5);

create function pg_temp.connstr() returns text language sql as $$
  select format('host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), inet_server_port(), current_database());
$$;

select dblink_connect('setup', pg_temp.connstr());
select dblink_connect('a', pg_temp.connstr());
select dblink_connect('b', pg_temp.connstr());

-- Committed fixtures: a group with limit 2, its leader, and two joiners.
select dblink_exec('setup', $$
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'race_lead@users.taskahan.pages.dev'),
    ('00000000-0000-0000-0000-0000000000f2', 'race_a@users.taskahan.pages.dev'),
    ('00000000-0000-0000-0000-0000000000f3', 'race_b@users.taskahan.pages.dev');
  insert into public.groups (id, name, purpose, member_limit, join_code, next_seat) values
    ('10000000-0000-0000-0000-0000000000f1', 'Race', 'other', 2, 'RACERRRR', 2);
  insert into public.memberships (group_id, user_id, display_name, seat, role) values
    ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'race_lead', 1, 'leader');
$$);

select dblink_exec('a', $$ select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', false); set role authenticated $$);
select dblink_exec('b', $$ select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', false); set role authenticated $$);

-- A joins inside an open transaction and holds the group lock.
select dblink_exec('a', 'begin');
select is(
  (select r from dblink('a', $$ select public.join_group('RACERRRR')::text $$) as t(r text)),
  '10000000-0000-0000-0000-0000000000f1', 'the first caller gets the seat');

-- B starts joining while A is still open, and must wait.
select dblink_send_query('b', $$ select public.join_group('RACERRRR')::text $$);
select pg_sleep(0.5);
select is(dblink_is_busy('b'), 1, 'the second caller waits on the group lock');

select dblink_exec('a', 'commit');
select is(
  (select r from dblink_get_result('b') as t(r text)),
  null, 'after the first commits, the second finds the group full');
select * from dblink_get_result('b') as t(r text);

select is(
  (select r::int from dblink('setup', $$
     select count(*)::text from public.memberships
      where group_id = '10000000-0000-0000-0000-0000000000f1' and status = 'active' $$) as t(r text)),
  2, 'the group holds exactly its limit');
select is(
  (select r::int from dblink('setup', $$
     select count(*)::text from public.rate_limits
      where user_id = '00000000-0000-0000-0000-0000000000f3' and bucket = 'join_failed' $$) as t(r text)),
  1, 'the refused join counts as a failure');

-- Clean up the committed fixtures. Deleting the group cascades to its logs;
-- deleting the users cascades to profiles and rate_limits.
select dblink_exec('setup', $$
  delete from public.groups where id = '10000000-0000-0000-0000-0000000000f1';
  delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3');
$$);
select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('setup');

select * from finish();
rollback;

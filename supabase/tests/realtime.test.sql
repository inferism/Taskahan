-- 5.1 Realtime authorization on group:{id} channels and the change publication.
-- Realtime checks access by setting realtime.topic and reading or inserting
-- realtime.messages as the caller; these tests do the same.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

delete from public.groups;
delete from auth.users;

select plan(15);

create function pg_temp.as_user(p_id uuid, p_topic text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true),
         set_config('realtime.topic', p_topic, true);
$$;

-- What Realtime asks on join: can the caller see a presence row on this topic?
create function pg_temp.can_join() returns boolean language sql as $$
  select exists (select 1 from realtime.messages
                  where topic = realtime.topic() and extension = 'presence');
$$;

-- What Realtime asks on track: can the caller insert a presence row?
create function pg_temp.can_track() returns boolean language plpgsql as $$
begin
  insert into realtime.messages (topic, extension, payload, private)
  values (realtime.topic(), 'presence', '{}', true);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

create function pg_temp.can_broadcast() returns boolean language plpgsql as $$
begin
  insert into realtime.messages (topic, extension, event, payload, private)
  values (realtime.topic(), 'broadcast', 'x', '{}', true);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

-- Fixtures: group G with leader L, member M, former member F; outsider O; group H.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'lead_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e2', 'mem_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e3', 'former_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e4', 'outsider_e@users.taskahan.pages.dev');

insert into public.groups (id, name, purpose, member_limit, join_code) values
  ('10000000-0000-0000-0000-0000000000e1', 'Epsilon', 'club_org', 5, 'EPSILONE'),
  ('10000000-0000-0000-0000-0000000000e2', 'Other', 'club_org', 5, 'OTHEROTH');

insert into public.memberships (id, group_id, user_id, display_name, seat, role, status, left_at, left_reason) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e1', 'lead_e', 1, 'leader', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e2', 'mem_e', 2, 'member', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e3', 'former_e', 3, 'member', 'former', now(), 'removed'),
  ('20000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-0000000000e4', 'outsider_e', 1, 'leader', 'active', null, null);

-- A presence row on each topic for the select checks to find.
insert into realtime.messages (topic, extension, payload, private) values
  ('group:10000000-0000-0000-0000-0000000000e1', 'presence', '{}', true),
  ('group:10000000-0000-0000-0000-0000000000e2', 'presence', '{}', true),
  ('group:not-a-uuid', 'presence', '{}', true);

set local role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'group:10000000-0000-0000-0000-0000000000e1');
select ok(pg_temp.can_join(), 'leader can join the group channel');
select ok(pg_temp.can_track(), 'leader can track presence');
select ok(not pg_temp.can_broadcast(), 'leader cannot send a broadcast');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2', 'group:10000000-0000-0000-0000-0000000000e1');
select ok(pg_temp.can_join(), 'member can join the group channel');
select ok(pg_temp.can_track(), 'member can track presence');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3', 'group:10000000-0000-0000-0000-0000000000e1');
select ok(not pg_temp.can_join(), 'former member cannot join');
select ok(not pg_temp.can_track(), 'former member cannot track presence');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4', 'group:10000000-0000-0000-0000-0000000000e1');
select ok(not pg_temp.can_join(), 'non-member cannot join');
select ok(not pg_temp.can_track(), 'non-member cannot track presence');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4', 'group:not-a-uuid');
select ok(not pg_temp.can_join(), 'a malformed topic is refused, not an error');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'group:10000000-0000-0000-0000-0000000000e2');
select ok(not pg_temp.can_join(), 'membership in one group does not open another');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select set_config('realtime.topic', 'group:10000000-0000-0000-0000-0000000000e1', true);
select ok(not pg_temp.can_join(), 'anonymous cannot join');
reset role;

-- Publication: the six board tables, and not logs.
select set_eq(
  $$ select tablename::text from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['groups', 'memberships', 'tasks', 'threads', 'thread_replies', 'messages'],
  'the board tables are published');
select ok(
  not exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and tablename = 'logs'),
  'logs are not published');
select is(private.group_topic_id('group:10000000-0000-0000-0000-0000000000e1'),
  '10000000-0000-0000-0000-0000000000e1'::uuid, 'topic parses to its group id');

select * from finish();
rollback;

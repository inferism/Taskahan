-- 2.2 Select policies: who can read what (ARCHITECTURE.md section 4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(30);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- No write policies exist at all.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0, 'no insert, update or delete policy exists');

-- Fixtures: group G with leader L, member M, former member F; outsider O.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'lead_b@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'mem_b@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'former_b@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000b4', 'outsider_b@users.taskahan.pages.dev');

insert into public.groups (id, name, purpose, member_limit, join_code) values
  ('10000000-0000-0000-0000-0000000000b1', 'Gamma', 'club_org', 5, 'GAMMAGGG');

insert into public.memberships (id, group_id, user_id, display_name, seat, role, status, left_at, left_reason) values
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000b1', 'lead_b', 1, 'leader', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000b2', 'mem_b', 2, 'member', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000b3', '10000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000b3', 'former_b', 3, 'member', 'former', now(), 'removed');

insert into public.tasks (id, group_id, number, title, assignee_id, created_by) values
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 1, 'Task',
   '20000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-0000000000b1');
insert into public.threads (id, group_id, task_id, opened_by, body) values
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   '30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b2', 'Q?');
insert into public.thread_replies (group_id, thread_id, author_id, body) values
  ('10000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b1',
   '20000000-0000-0000-0000-0000000000b1', 'A.');
insert into public.messages (group_id, author_id, body) values
  ('10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b2', 'Hi');
insert into public.logs (group_id, actor_id, action) values
  ('10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'group_created');
insert into public.group_blocks (group_id, user_id) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3');
insert into public.rate_limits (user_id, bucket, count) values
  ('00000000-0000-0000-0000-0000000000b4', 'join_failed', 1);

set local role authenticated;

-- Leader
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.groups), 1, 'leader reads the group');
select is((select count(*)::int from public.memberships), 3, 'leader reads all memberships');
select is((select count(*)::int from public.tasks), 1, 'leader reads tasks');
select is((select count(*)::int from public.threads), 1, 'leader reads threads');
select is((select count(*)::int from public.thread_replies), 1, 'leader reads replies');
select is((select count(*)::int from public.messages), 1, 'leader reads messages');
select is((select count(*)::int from public.logs), 1, 'leader reads logs');
select is((select count(*)::int from public.member_profiles), 2, 'leader sees profiles of active co-members');

-- Member
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.groups), 1, 'member reads the group');
select is((select join_code::text from public.groups), 'GAMMAGGG', 'member sees the join code');
select is((select count(*)::int from public.memberships), 3, 'member reads all memberships');
select is((select count(*)::int from public.tasks), 1, 'member reads tasks');
select is((select count(*)::int from public.threads), 1, 'member reads threads');
select is((select count(*)::int from public.thread_replies), 1, 'member reads replies');
select is((select count(*)::int from public.messages), 1, 'member reads messages');
select is((select count(*)::int from public.logs), 0, 'member cannot read logs');

-- Former member
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.groups), 0, 'former member cannot read the group');
select is((select count(*)::int from public.memberships), 1, 'former member reads only their own row');
select is((select count(*)::int from public.tasks), 0, 'former member cannot read tasks');
select is((select count(*)::int from public.messages), 0, 'former member cannot read messages');
select is((select count(*)::int from public.member_profiles), 1, 'former member sees only their own profile');

-- Outsider
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select is((select count(*)::int from public.groups), 0, 'outsider cannot read the group');
select is((select count(*)::int from public.memberships), 0, 'outsider cannot read memberships');
select is((select count(*)::int from public.threads), 0, 'outsider cannot read threads');
select is((select count(*)::int from public.thread_replies), 0, 'outsider cannot read replies');
select is((select count(*)::int from public.logs), 0, 'outsider cannot read logs');

-- Function-only tables
select throws_ok($$ select * from public.group_blocks $$, '42501', null, 'group_blocks is unreadable');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'rate_limits is unreadable');

-- Leadership moves: the old leader loses logs at once.
reset role;
update public.memberships set role = 'member' where id = '20000000-0000-0000-0000-0000000000b1';
update public.memberships set role = 'leader' where id = '20000000-0000-0000-0000-0000000000b2';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.logs), 0, 'a former leader loses log access');

select * from finish();
rollback;

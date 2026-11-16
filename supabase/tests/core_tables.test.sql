-- 2.1 Tables, constraints and indexes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

select has_table('public', t, format('table %s exists', t))
  from unnest(array['groups', 'memberships', 'group_blocks', 'tasks', 'threads',
                    'thread_replies', 'messages', 'logs', 'rate_limits']) as t;

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has row level security enabled');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'anon and authenticated have no write grants on any public table');

-- Fixtures, as the migration owner.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'lead_a@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'mem_a@users.taskahan.pages.dev');

insert into public.groups (id, name, purpose, member_limit, join_code) values
  ('10000000-0000-0000-0000-000000000001', 'Alpha', 'work_team', 5, 'ALPHAAAA'),
  ('10000000-0000-0000-0000-000000000002', 'Beta', 'other', 5, 'BETABBBB');

insert into public.memberships (id, group_id, user_id, display_name, seat, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'lead_a', 1, 'leader'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a2', 'mem_a', 2, 'member'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000a2', 'mem_a', 1, 'leader');

-- groups
select throws_ok(
  $$ insert into public.groups (name, purpose, member_limit, join_code)
     values ('X', 'work_team', 5, 'abcdefgh') $$,
  '23514', null, 'join code must be uppercase letters');
select throws_ok(
  $$ insert into public.groups (name, purpose, member_limit, join_code)
     values ('X', 'work_team', 5, 'ALPHAAAA') $$,
  '23505', null, 'join code is unique');
select throws_ok(
  $$ insert into public.groups (name, purpose, member_limit, join_code)
     values ('X', 'work_team', 31, 'GAMMAAAA') $$,
  '23514', null, 'member limit is at most 30');
select throws_ok(
  $$ insert into public.groups (name, purpose, purpose_note, member_limit, join_code)
     values ('X', 'work_team', 'note', 5, 'GAMMAAAA') $$,
  '23514', null, 'purpose note only with purpose other');

-- memberships
select throws_ok(
  $$ insert into public.memberships (group_id, user_id, display_name, seat, role)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'x', 3, 'leader') $$,
  '23505', null, 'only one active leader per group');
select throws_ok(
  $$ insert into public.memberships (group_id, user_id, display_name, seat)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'x', 3) $$,
  '23505', null, 'only one active seat per account per group');
select throws_ok(
  $$ insert into public.memberships (group_id, user_id, display_name, seat, status, left_at, left_reason)
     values ('10000000-0000-0000-0000-000000000001', null, 'x', 2, 'former', now(), 'left') $$,
  '23505', null, 'seat numbers are unique per group');
select throws_ok(
  $$ update public.memberships set status = 'former', left_at = now(), left_reason = 'left'
     where id = '20000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a former membership cannot be a leader');
select throws_ok(
  $$ update public.memberships set status = 'former'
     where id = '20000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a former membership needs left_at and left_reason');
select lives_ok(
  $$ update public.memberships set status = 'former', left_at = now(), left_reason = 'left'
     where id = '20000000-0000-0000-0000-000000000002' $$,
  'a member can become former');

-- tasks
insert into public.tasks (id, group_id, number, title, assignee_id, created_by) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'First',
   '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.tasks (group_id, number, title, assignee_id, created_by)
     values ('10000000-0000-0000-0000-000000000001', 1, 'Dup',
             '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') $$,
  '23505', null, 'task numbers are unique per group');
select throws_ok(
  $$ insert into public.tasks (group_id, number, title, assignee_id, created_by)
     values ('10000000-0000-0000-0000-000000000001', 2, 'Cross',
             '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001') $$,
  '23503', null, 'the assignee must be a seat in the same group');
select throws_ok(
  $$ update public.tasks set status = 'done' where id = '30000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a done task needs completed_at');
select throws_ok(
  $$ insert into public.tasks (group_id, number, title, assignee_id, created_by)
     values ('10000000-0000-0000-0000-000000000001', 2, '',
             '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'a task title cannot be empty');

-- threads: same-group references
select throws_ok(
  $$ insert into public.threads (group_id, task_id, opened_by, body)
     values ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000003', 'Why?') $$,
  '23503', null, 'a thread must be on a task in its own group');

-- Deleting a group removes everything in it.
delete from public.groups where id = '10000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.memberships where group_id = '10000000-0000-0000-0000-000000000002'),
  0, 'deleting a group cascades to its memberships');

select * from finish();
rollback;

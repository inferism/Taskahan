-- 2.3 Logs are append-only for every role; deleting the group still cascades.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'lead_c@users.taskahan.pages.dev');
insert into public.groups (id, name, purpose, member_limit, join_code) values
  ('10000000-0000-0000-0000-0000000000c1', 'Delta', 'other', 5, 'DELTADDD');
insert into public.memberships (id, group_id, user_id, display_name, seat, role) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000c1', 'lead_c', 1, 'leader');

select lives_ok(
  $$ select private.log('10000000-0000-0000-0000-0000000000c1',
       '20000000-0000-0000-0000-0000000000c1', 'group_created', null, null, '{"name":"Delta"}') $$,
  'private.log inserts a row');
select is(
  (select meta ->> 'name' from public.logs where group_id = '10000000-0000-0000-0000-0000000000c1'),
  'Delta', 'the row carries its meta');

select throws_ok(
  $$ update public.logs set meta = '{}' $$,
  '42501', null, 'update fails as the owner');
select throws_ok(
  $$ delete from public.logs $$,
  '42501', null, 'delete fails while the group exists');

set local role service_role;
select throws_ok(
  $$ update public.logs set action = 'task_created' $$,
  '42501', null, 'update fails as service role');
select throws_ok(
  $$ delete from public.logs $$,
  '42501', null, 'delete fails as service role');
reset role;

select throws_ok(
  $$ truncate public.logs $$,
  '42501', null, 'truncate fails');

delete from public.groups where id = '10000000-0000-0000-0000-0000000000c1';
select is(
  (select count(*)::int from public.logs where group_id = '10000000-0000-0000-0000-0000000000c1'),
  0, 'deleting the group cascades to its logs');

select * from finish();
rollback;

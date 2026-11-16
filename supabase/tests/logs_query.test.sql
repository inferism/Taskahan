-- 6.4 A member calling the Logs pane's query directly gets nothing (SECURITY.md section 5).
-- Runs the same query src/features/logs/api.ts sends, with and without its filters, as every
-- role that is not the current leader. The leader runs it too, so an empty result means the
-- policy hid the rows, not that the query was wrong.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(17);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- The pane's query: one group, optional member and action filters, newest first, one page.
create function pg_temp.logs_page(p_group uuid, p_member uuid, p_action public.log_action)
returns int language sql as $$
  select count(*)::int from (
    select id, actor_id, action, task_id, target_member_id, meta, created_at
      from public.logs
     where group_id = p_group
       and (p_member is null or actor_id = p_member)
       and (p_action is null or action = p_action)
     order by created_at desc, id desc
     limit 50 offset 0
  ) page;
$$;

-- Fixtures: group G with leader L, member M, former member F; outsider O.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'lead_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e2', 'mem_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e3', 'former_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e4', 'outsider_e@users.taskahan.pages.dev');

insert into public.groups (id, name, purpose, member_limit, join_code) values
  ('10000000-0000-0000-0000-0000000000e1', 'Epsilon', 'work_team', 5, 'EPSILONE');

insert into public.memberships (id, group_id, user_id, display_name, seat, role, status, left_at, left_reason) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e1', 'lead_e', 1, 'leader', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e2', 'mem_e', 2, 'member', 'active', null, null),
  ('20000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e3', 'former_e', 3, 'member', 'former', now(), 'removed');

-- Entries done by the leader and by the member, so the member's own actions are in the log too.
insert into public.logs (group_id, actor_id, action) values
  ('10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'group_created'),
  ('10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e2', 'member_joined'),
  ('10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e3', 'member_joined');

set local role authenticated;

-- Leader: the query itself works.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 3,
  'leader gets the whole page');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1',
  '20000000-0000-0000-0000-0000000000e2', null), 1, 'leader gets the member filter');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, 'member_joined'), 2,
  'leader gets the action filter');

-- Member: nothing, however the query is filtered, including for their own actions.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 0,
  'member gets no rows');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1',
  '20000000-0000-0000-0000-0000000000e2', null), 0, 'member gets none of their own actions');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, 'group_created'), 0,
  'member gets nothing with an action filter');
select is((select count(*)::int from public.logs where id > 0), 0,
  'member gets nothing without a group filter');
select is((select count(*)::int from public.logs
            where group_id = '10000000-0000-0000-0000-0000000000e1'
              and created_at > now() - interval '1 day'), 0,
  'member gets nothing with a time filter');

-- Former member: nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 0,
  'former member gets no rows');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1',
  '20000000-0000-0000-0000-0000000000e3', null), 0, 'former member gets none of their own actions');

-- Outsider: nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 0,
  'outsider gets no rows');

-- Signed out: no grant at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok(
  $$ select pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null) $$,
  '42501', null, 'signed-out caller is refused');

-- No function the client can call hands back log rows instead.
reset role;
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prorettype = 'public.logs'::regtype
           or 'public.logs'::regtype = any (coalesce(p.proallargtypes, p.proargtypes::oid[])))),
  0, 'no public function returns or takes a logs row');
select is(
  (select count(*)::int
     from information_schema.view_table_usage
    where table_schema = 'public' and table_name = 'logs' and view_schema = 'public'),
  0, 'no public view reads logs');

-- Leadership moves: the new leader sees the log, the old one gets nothing on the next call.
update public.memberships set role = 'member' where id = '20000000-0000-0000-0000-0000000000e1';
update public.memberships set role = 'leader' where id = '20000000-0000-0000-0000-0000000000e2';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 0,
  'former leader gets no rows');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1',
  '20000000-0000-0000-0000-0000000000e1', 'group_created'), 0,
  'former leader gets none of their own actions');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is(pg_temp.logs_page('10000000-0000-0000-0000-0000000000e1', null, null), 3,
  'the new leader gets the whole page');

select * from finish();
rollback;

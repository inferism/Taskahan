-- 9.1 private.release_account, 9.2 inactive_accounts / release_inactive_account
-- and the purge-inactive cron job.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

delete from public.groups;
delete from auth.users;

select plan(38);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table ids (k text primary key, v uuid);
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;
create function pg_temp.seat(p_group text, p_user uuid) returns uuid language sql as $$
  select m.id from public.memberships m
   where m.group_id = pg_temp.id(p_group) and m.user_id = p_user;
$$;

-- Accounts: lea leads Alpha (with mo and nia) and Solo (alone), and is a plain
-- member of Beta, which pia leads.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000901', 'lea@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000902', 'moe@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000903', 'nia@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000904', 'pia@users.taskahan.pages.dev');

select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
select public.create_group('Alpha', 'other', 'Thesis', 5, 'ALPHAAAA');
select public.create_group('Solo', 'other', 'Alone', 5, 'SOLOSOLO');
select pg_temp.as_user('00000000-0000-0000-0000-000000000904');
select public.create_group('Beta', 'other', 'Club', 5, 'BETABETA');
select pg_temp.as_user('00000000-0000-0000-0000-000000000902');
select public.join_group('ALPHAAAA');
select pg_temp.as_user('00000000-0000-0000-0000-000000000903');
select public.join_group('ALPHAAAA');
select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
select public.join_group('BETABETA');

insert into ids select 'alpha', id from public.groups where join_code = 'ALPHAAAA';
insert into ids select 'solo', id from public.groups where join_code = 'SOLOSOLO';
insert into ids select 'beta', id from public.groups where join_code = 'BETABETA';
insert into ids values
  ('lea', '00000000-0000-0000-0000-000000000901'),
  ('mo', '00000000-0000-0000-0000-000000000902'),
  ('nia', '00000000-0000-0000-0000-000000000903'),
  ('pia', '00000000-0000-0000-0000-000000000904');
insert into ids values
  ('lea_alpha', pg_temp.seat('alpha', pg_temp.id('lea'))),
  ('lea_beta', pg_temp.seat('beta', pg_temp.id('lea'))),
  ('mo_alpha', pg_temp.seat('alpha', pg_temp.id('mo'))),
  ('nia_alpha', pg_temp.seat('alpha', pg_temp.id('nia'))),
  ('pia_beta', pg_temp.seat('beta', pg_temp.id('pia')));

-- A task on lea's column, so we can see history survives.
select pg_temp.as_user(pg_temp.id('lea'));
select public.create_task(pg_temp.id('alpha'), 'Write intro', null, pg_temp.id('lea_alpha'), null);
reset role;

-- lea last opened the app 31 days ago, everyone else is active.
update public.profiles set last_active_at = now() - interval '31 days' where id = pg_temp.id('lea');
update public.profiles set avatar_path = pg_temp.id('lea') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
 where id = pg_temp.id('lea');
update public.profiles set last_active_at = now() - interval '29 days' where id = pg_temp.id('mo');

-- ---------------------------------------------------------------------------
-- inactive_accounts
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select user_id from public.inactive_accounts(100) $$,
  array[pg_temp.id('lea')],
  'only the account idle for more than 30 days is listed (29 days is not)');

-- ---------------------------------------------------------------------------
-- release_inactive_account skips an account that is still active
-- ---------------------------------------------------------------------------

select is_empty(
  format($$ select * from public.release_inactive_account(%L) $$, pg_temp.id('mo')),
  'an active account is skipped');
select is(
  (select status::text from public.memberships where id = pg_temp.id('mo_alpha')),
  'active', 'the skipped account keeps its seat');
select is_empty(
  $$ select * from public.release_inactive_account('00000000-0000-0000-0000-00000000dead') $$,
  'an unknown account is skipped');

-- ---------------------------------------------------------------------------
-- release lea: leader with members, leader alone, plain member
-- ---------------------------------------------------------------------------

select results_eq(
  format($$ select avatar_path from public.release_inactive_account(%L) $$, pg_temp.id('lea')),
  array[pg_temp.id('lea') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'],
  'releasing returns the avatar path to delete');

-- Leader with members.
select results_eq(
  format($$ select status::text, role::text, left_reason::text, left_at is not null
              from public.memberships where id = %L $$, pg_temp.id('lea_alpha')),
  $$ values ('former', 'member', 'account_deleted', true) $$,
  'leader with members: the seat becomes a former member, reason account_deleted');
select is(
  (select count(*)::int from public.memberships
    where group_id = pg_temp.id('alpha') and role = 'leader' and status = 'active'),
  1, 'leader with members: the group still has exactly one leader');
select ok(
  (select id from public.memberships
    where group_id = pg_temp.id('alpha') and role = 'leader' and status = 'active')
    in (pg_temp.id('mo_alpha'), pg_temp.id('nia_alpha')),
  'leader with members: leadership goes to an active member');
insert into ids select 'heir', id from public.memberships
 where group_id = pg_temp.id('alpha') and role = 'leader' and status = 'active';
select results_eq(
  format($$ select actor_id, target_member_id from public.logs
             where group_id = %L and action = 'account_deleted' $$, pg_temp.id('alpha')),
  format($$ values (null::uuid, %L::uuid) $$, pg_temp.id('lea_alpha')),
  'leader with members: account_deleted is logged as a system action');
select results_eq(
  format($$ select actor_id, target_member_id, meta->>'from_member_id' from public.logs
             where group_id = %L and action = 'leadership_auto_transferred' $$, pg_temp.id('alpha')),
  format($$ values (null::uuid, %L::uuid, %L::text) $$, pg_temp.id('heir'), pg_temp.id('lea_alpha')),
  'leader with members: leadership_auto_transferred names the heir and the old leader');
select ok(
  (select max(id) from public.logs where group_id = pg_temp.id('alpha') and action = 'account_deleted')
  < (select max(id) from public.logs where group_id = pg_temp.id('alpha') and action = 'leadership_auto_transferred'),
  'leader with members: the departure is logged before the handover');
select is(
  (select assignee_id from public.tasks where group_id = pg_temp.id('alpha') and title = 'Write intro'),
  pg_temp.id('lea_alpha'), 'leader with members: tasks stay on the former column');
select is(
  (select count(*)::int from public.memberships where group_id = pg_temp.id('alpha') and status = 'active'),
  2, 'leader with members: the other members keep their seats');

-- Leader alone.
select is_empty(
  format($$ select 1 from public.groups where id = %L $$, pg_temp.id('solo')),
  'leader alone: the group is deleted');
select is_empty(
  format($$ select 1 from public.memberships where group_id = %L $$, pg_temp.id('solo')),
  'leader alone: its memberships go with it');
select is_empty(
  format($$ select 1 from public.logs where group_id = %L $$, pg_temp.id('solo')),
  'leader alone: its logs go with it');

-- Plain member.
select results_eq(
  format($$ select status::text, role::text, left_reason::text
              from public.memberships where id = %L $$, pg_temp.id('lea_beta')),
  $$ values ('former', 'member', 'account_deleted') $$,
  'plain member: the seat becomes a former member, reason account_deleted');
select results_eq(
  format($$ select id, role::text from public.memberships
             where group_id = %L and status = 'active' $$, pg_temp.id('beta')),
  format($$ values (%L::uuid, 'leader') $$, pg_temp.id('pia_beta')),
  'plain member: the leader is untouched');
select is(
  (select count(*)::int from public.logs
    where group_id = pg_temp.id('beta') and action = 'account_deleted'
      and actor_id is null and target_member_id = pg_temp.id('lea_beta')),
  1, 'plain member: account_deleted is logged');
select is(
  (select count(*)::int from public.logs
    where group_id = pg_temp.id('beta') and action = 'leadership_auto_transferred'),
  0, 'plain member: no leadership change is logged');

-- ---------------------------------------------------------------------------
-- Idempotent, then the auth user goes
-- ---------------------------------------------------------------------------

select lives_ok(
  format($$ select private.release_account(%L) $$, pg_temp.id('lea')),
  'releasing again is a no-op');
select is(
  (select count(*)::int from public.logs where action = 'account_deleted'),
  2, 'releasing again logs nothing new');

select lives_ok(
  format($$ delete from auth.users where id = %L $$, pg_temp.id('lea')),
  'the released auth user can be deleted');
select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, pg_temp.id('lea')),
  'the profile cascades');
select results_eq(
  format($$ select user_id, status::text from public.memberships where id in (%L, %L) order by id $$,
    pg_temp.id('lea_alpha'), pg_temp.id('lea_beta')),
  $$ values (null::uuid, 'former'), (null::uuid, 'former') $$,
  'former seats stay on the board with no account behind them');
select is_empty(
  $$ select * from public.inactive_accounts(100) $$,
  'nothing is left to purge');

-- ---------------------------------------------------------------------------
-- Random handover only ever picks an active member
-- ---------------------------------------------------------------------------

-- The heir hands leadership to the other member and leaves, so Alpha has one active seat.
select pg_temp.as_user((select user_id from public.memberships where id = pg_temp.id('heir')));
select public.transfer_leadership(case when pg_temp.id('heir') = pg_temp.id('mo_alpha')
                                       then pg_temp.id('nia_alpha') else pg_temp.id('mo_alpha') end);
select pg_temp.as_user((select user_id from public.memberships where id = pg_temp.id('heir')));
select public.leave_group(pg_temp.id('alpha'));
reset role;
insert into ids select 'alpha_lead_user', user_id from public.memberships
 where group_id = pg_temp.id('alpha') and role = 'leader' and status = 'active';
select is(
  (select count(*)::int from public.memberships where group_id = pg_temp.id('alpha') and status = 'active'),
  1, 'setup: one active member left in Alpha');
select lives_ok(
  format($$ select private.release_account(%L) $$, pg_temp.id('alpha_lead_user')),
  'releasing the last leader, whose other seats are former, works');
select is_empty(
  format($$ select 1 from public.groups where id = %L $$, pg_temp.id('alpha')),
  'a group whose only active seat is released is deleted, former seats notwithstanding');

-- ---------------------------------------------------------------------------
-- Grants and the cron job
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role', 'public.inactive_accounts(int)', 'execute')
  and has_function_privilege('service_role', 'public.release_inactive_account(uuid)', 'execute'),
  'service role can call the purge helpers');
select ok(
  not has_function_privilege('authenticated', 'public.inactive_accounts(int)', 'execute')
  and not has_function_privilege('anon', 'public.inactive_accounts(int)', 'execute'),
  'inactive_accounts is not callable from the API roles');
select ok(
  not has_function_privilege('authenticated', 'public.release_inactive_account(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.release_inactive_account(uuid)', 'execute'),
  'release_inactive_account is not callable from the API roles');
select ok(
  not has_function_privilege('service_role', 'private.release_account(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.release_account(uuid)', 'execute'),
  'private.release_account is not callable from any API role');

select results_eq(
  $$ select schedule, command, active from cron.job where jobname = 'purge-inactive' $$,
  $$ values ('17 3 * * *'::text, ' select private.call_purge_inactive() '::text, true) $$,
  'the purge job runs daily');
select ok(
  not exists (select 1 from cron.job where jobname = 'purge-inactive' and command ~* 'secret|https?://'),
  'the job definition holds no secret or URL');

-- Without vault secrets the job does nothing rather than calling out.
delete from vault.secrets where name in ('project_url', 'purge_cron_secret');
select is(private.call_purge_inactive(), null::bigint, 'without vault secrets the call is skipped');

-- With them it queues one request with the secret header.
select vault.create_secret('http://example.test', 'project_url');
select vault.create_secret('test-secret-0123456789abcdef', 'purge_cron_secret');
select isnt(private.call_purge_inactive(), null::bigint, 'with vault secrets a request is queued');
select results_eq(
  $$ select url, headers->>'x-cron-secret' from net.http_request_queue order by id desc limit 1 $$,
  $$ values ('http://example.test/functions/v1/purge-inactive'::text, 'test-secret-0123456789abcdef'::text) $$,
  'the request targets purge-inactive and carries the secret');

select * from finish();
rollback;

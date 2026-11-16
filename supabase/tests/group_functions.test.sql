-- 2.5 create_group, join_group, update_group, transfer_leadership,
-- remove_member, leave_group. Calls run as postgres with JWT claims set, so
-- auth.uid() is the chosen user; grant checks switch role explicitly.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(46);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table ids (k text primary key, v uuid);
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'lead_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e2', 'mem_e1@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e3', 'mem_e2@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e4', 'outsider_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e5', 'guesser_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e6', 'busy_e@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000e7', 'other_lead_e@users.taskahan.pages.dev');

-- ---------------------------------------------------------------------------
-- create_group
-- ---------------------------------------------------------------------------

-- Through the API role, to prove the grant.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok(
  $$ select public.create_group(E'  Alpha\tTeam ', 'other', ' Thesis ', 3, 'alphaaaa') $$,
  'authenticated can create a group');
reset role;
insert into ids select 'g', id from public.groups where join_code = 'ALPHAAAA';

select is((select name from public.groups where id = pg_temp.id('g')), 'AlphaTeam',
  'name is trimmed and control characters stripped');
select is((select purpose_note from public.groups where id = pg_temp.id('g')), 'Thesis',
  'purpose note is kept for other');
select is((select next_seat from public.groups where id = pg_temp.id('g')), 2, 'next seat is 2');
select results_eq(
  $$ select seat, role::text, display_name from public.memberships where group_id = pg_temp.id('g') $$,
  $$ values (1, 'leader', 'lead_e') $$,
  'the creator holds seat 1 as leader');
insert into ids select 'lead', id from public.memberships where group_id = pg_temp.id('g');
select is(
  (select count(*)::int from public.logs where group_id = pg_temp.id('g') and action = 'group_created'
      and actor_id = pg_temp.id('lead')),
  1, 'group_created is logged');

select throws_ok(
  $$ select public.create_group('Again', 'work_team', null, 5, 'ALPHAAAA') $$,
  '23505', 'join_code_taken', 'a taken code is refused');
select throws_ok(
  $$ select public.create_group('   ', 'work_team', null, 5, 'BRAVOBBB') $$,
  '22023', 'invalid_input', 'an empty name is refused');
select throws_ok(
  $$ select public.create_group('X', 'work_team', null, 1, 'BRAVOBBB') $$,
  '22023', 'invalid_input', 'a member limit under 2 is refused');
select throws_ok(
  $$ select public.create_group('X', 'work_team', null, 5, 'ABC') $$,
  '22023', 'invalid_input', 'a short code is refused');
select is(
  (select purpose_note from public.groups
    where id = public.create_group('Notes', 'work_team', 'ignored', 5, 'NOTESNNN')),
  null, 'a note sent with another purpose is dropped');

set local role anon;
select throws_ok(
  $$ select public.create_group('X', 'work_team', null, 5, 'ANONAAAA') $$,
  '42501', null, 'anon cannot call create_group');
reset role;

select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.create_group('X', 'work_team', null, 5, 'NOUSERRR') $$,
  '42501', 'not_authenticated', 'a call without a user is refused');

-- 20 active memberships cap.
insert into public.groups (id, name, purpose, member_limit, join_code)
select gen_random_uuid(), 'Busy ' || i, 'other', 5,
       'BUSY' || chr(65 + i / 26) || chr(65 + i % 26) || 'ZZ'
  from generate_series(1, 20) i;
insert into public.memberships (group_id, user_id, display_name, seat, role)
select id, '00000000-0000-0000-0000-0000000000e6', 'busy_e', 1, 'leader'
  from public.groups where name like 'Busy %';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e6');
select throws_ok(
  $$ select public.create_group('One more', 'other', null, 5, 'ONEMOREE') $$,
  '54000', 'membership_limit', 'a 21st group cannot be created');
select throws_ok(
  $$ select public.join_group('ALPHAAAA') $$,
  '54000', 'membership_limit', 'a 21st group cannot be joined');

-- ---------------------------------------------------------------------------
-- join_group
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is(public.join_group(' alphaaaa '), pg_temp.id('g'), 'a member joins with the code in any case');
insert into ids select 'm1', id from public.memberships
 where group_id = pg_temp.id('g') and user_id = '00000000-0000-0000-0000-0000000000e2';
select results_eq(
  $$ select seat, role::text from public.memberships where id = pg_temp.id('m1') $$,
  $$ values (2, 'member') $$,
  'the new member takes the next seat as member');
select is(public.join_group('ALPHAAAA'), pg_temp.id('g'), 'joining again returns the same group');
select is(
  (select count(*)::int from public.memberships
    where group_id = pg_temp.id('g') and user_id = '00000000-0000-0000-0000-0000000000e2'),
  1, 'joining again does not add a seat');
select is(
  (select count(*)::int from public.logs where group_id = pg_temp.id('g') and action = 'member_joined'
      and target_member_id = pg_temp.id('m1')),
  1, 'member_joined is logged once');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is(public.join_group('ALPHAAAA'), pg_temp.id('g'), 'a second member joins');
insert into ids select 'm2', id from public.memberships
 where group_id = pg_temp.id('g') and user_id = '00000000-0000-0000-0000-0000000000e3';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select is(public.join_group('ALPHAAAA'), null, 'a full group answers like a wrong code');
select is(public.join_group('NOSUCHCO'), null, 'a wrong code returns null');

-- Ten failures in an hour, then even the right code is refused.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select is(
  (select count(*)::int from generate_series(1, 10) where public.join_group('WRONGCOD') is null),
  10, 'ten failed joins are answered');
select throws_ok(
  $$ select public.join_group('NOTESNNN') $$,
  'P0001', 'rate_limited', 'the eleventh failed join in an hour is refused');

-- ---------------------------------------------------------------------------
-- update_group
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format($$ select public.update_group(%L, 'X', 'other', null, 5, 'ALPHAAAA') $$, pg_temp.id('g')),
  '42501', 'forbidden', 'a member cannot edit the group');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok(
  format($$ select public.update_group(%L, 'Alpha', 'other', 'Thesis', 2, 'ALPHAAAA') $$, pg_temp.id('g')),
  '22023', 'member_limit_below_active', 'the limit cannot drop below the active count');
select throws_ok(
  format($$ select public.update_group(%L, 'Alpha', 'other', 'Thesis', 4, 'NOTESNNN') $$, pg_temp.id('g')),
  '23505', 'join_code_taken', 'another group''s code is refused');
select lives_ok(
  format($$ select public.update_group(%L, 'Alpha 2', 'student_project', null, 4, 'ALPHABBB') $$, pg_temp.id('g')),
  'the leader edits the group');
select results_eq(
  format($$ select name, member_limit, join_code::text from public.groups where id = %L $$, pg_temp.id('g')),
  $$ values ('Alpha 2', 4, 'ALPHABBB') $$,
  'the edit is saved');
select is(
  (select count(*)::int from public.logs where group_id = pg_temp.id('g') and action = 'join_code_changed'),
  1, 'join_code_changed is logged');

-- ---------------------------------------------------------------------------
-- transfer_leadership
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format($$ select public.transfer_leadership(%L) $$, pg_temp.id('m2')),
  '42501', 'forbidden', 'a member cannot transfer leadership');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok(
  format($$ select public.transfer_leadership(%L) $$, pg_temp.id('m1')),
  'the leader transfers to a member');
select results_eq(
  format($$ select id, role::text from public.memberships where group_id = %L and status = 'active' order by seat $$,
         pg_temp.id('g')),
  format($$ values (%L::uuid, 'member'), (%L::uuid, 'leader'), (%L::uuid, 'member') $$,
         pg_temp.id('lead'), pg_temp.id('m1'), pg_temp.id('m2')),
  'roles are swapped');
select is(
  (select count(*)::int from public.logs where group_id = pg_temp.id('g') and action = 'leadership_transferred'
      and actor_id = pg_temp.id('lead') and target_member_id = pg_temp.id('m1')),
  1, 'leadership_transferred is logged');

-- ---------------------------------------------------------------------------
-- remove_member (m1 now leads)
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok(
  format($$ select public.remove_member(%L) $$, pg_temp.id('m2')),
  '42501', 'forbidden', 'the old leader can no longer remove');

-- A leader of another group cannot reach into this one.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e7');
select public.create_group('Other', 'club_org', null, 5, 'OTHERGRP');
select throws_ok(
  format($$ select public.remove_member(%L) $$, pg_temp.id('m2')),
  '42501', 'forbidden', 'a leader of another group cannot remove');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format($$ select public.remove_member(%L) $$, pg_temp.id('m1')),
  '22023', 'invalid_input', 'a leader cannot remove themselves');
select lives_ok(
  format($$ select public.remove_member(%L, 'freshnew') $$, pg_temp.id('m2')),
  'the leader removes a member and changes the code');
select results_eq(
  format($$ select status::text, left_reason::text from public.memberships where id = %L $$, pg_temp.id('m2')),
  $$ values ('former', 'removed') $$,
  'the removed member is former');
select results_eq(
  format($$ select join_code::text, (select count(*)::int from public.group_blocks b where b.group_id = g.id)
             from public.groups g where id = %L $$, pg_temp.id('g')),
  $$ values ('FRESHNEW', 1) $$,
  'the account is blocked and the code changed');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is(public.join_group('FRESHNEW'), null, 'a removed account cannot rejoin with the new code');

-- ---------------------------------------------------------------------------
-- leave_group
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format($$ select public.leave_group(%L) $$, pg_temp.id('g')),
  '55000', 'leader_must_transfer', 'a leader with members must transfer first');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.leave_group(pg_temp.id('g'));
select results_eq(
  format($$ select status::text, left_reason::text,
                  (select count(*)::int from public.logs l where l.action = 'member_left' and l.actor_id = m.id)
             from public.memberships m where id = %L $$, pg_temp.id('lead')),
  $$ values ('former', 'left', 1) $$,
  'a member leaves as former and it is logged');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select throws_ok(
  format($$ select public.leave_group(%L) $$, pg_temp.id('g')),
  '42501', 'forbidden', 'an outsider cannot leave');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select public.leave_group(pg_temp.id('g'));
select is(
  (select count(*)::int from public.groups where id = pg_temp.id('g')),
  0, 'the last member leaving deletes the group');

select * from finish();
rollback;

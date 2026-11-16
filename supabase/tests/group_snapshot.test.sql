-- 2.9 get_group_snapshot.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;
create temp table snap (j jsonb);
grant all on snap to authenticated;

-- L leads G with M (active) and F (leaves). O leads another group.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000301', 'snap_lead@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000302', 'snap_m@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000303', 'snap_former@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000304', 'snap_other@users.taskahan.pages.dev');
update public.profiles set avatar_path = '303/old.webp' where id = '00000000-0000-0000-0000-000000000303';

select pg_temp.as_user('00000000-0000-0000-0000-000000000301');
insert into ids values ('g', public.create_group('Snap', 'other', 'Book club', 10, 'SNAPSHOT'));
select pg_temp.as_user('00000000-0000-0000-0000-000000000302');
select public.join_group('SNAPSHOT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000303');
select public.join_group('SNAPSHOT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000304');
insert into ids values ('g2', public.create_group('Other', 'other', null, 5, 'OTHERSNP'));

insert into ids
select case m.user_id
         when '00000000-0000-0000-0000-000000000301' then 'lead'
         when '00000000-0000-0000-0000-000000000302' then 'm'
         when '00000000-0000-0000-0000-000000000303' then 'f'
         when '00000000-0000-0000-0000-000000000304' then 'o'
       end, m.id
  from public.memberships m;

-- #1 and #2 for M, #3 for F (then F leaves), #4 deleted. M asks on #1.
select pg_temp.as_user('00000000-0000-0000-0000-000000000301');
select public.create_task(pg_temp.id('g'), 'One', 'Details', pg_temp.id('m'), null);
select public.create_task(pg_temp.id('g'), 'Two', '', pg_temp.id('m'), null);
select public.create_task(pg_temp.id('g'), 'Three', '', pg_temp.id('f'), null);
select public.delete_task((select id from public.create_task(pg_temp.id('g'), 'Four', '', pg_temp.id('m'), null)));
select pg_temp.as_user('00000000-0000-0000-0000-000000000302');
select public.open_question((select id from public.tasks where group_id = pg_temp.id('g') and number = 1), 'Why?');
select pg_temp.as_user('00000000-0000-0000-0000-000000000303');
select public.leave_group(pg_temp.id('g'));

-- ---------------------------------------------------------------------------
-- An active member gets the whole board in one call
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000302');
set local role authenticated;
insert into snap select public.get_group_snapshot(pg_temp.id('g'));
reset role;

select is((select j->'group'->>'id' from snap), pg_temp.id('g')::text, 'the group is returned');
select is((select j->'group'->>'join_code' from snap), 'SNAPSHOT', 'the join code is included');
select is((select j->'group'->>'purpose_note' from snap), 'Book club', 'the purpose note is included');
select ok((select not (j->'group' ? 'next_task_number') and not (j->'group' ? 'next_seat') from snap),
  'internal counters are left out');
select is((select j->>'me' from snap), pg_temp.id('m')::text, 'me is the caller''s membership');

select is((select jsonb_array_length(j->'memberships') from snap), 3,
  'every membership is returned, former included');
select is(
  (select array_agg(e->>'seat' order by ord) from snap, jsonb_array_elements(j->'memberships') with ordinality x(e, ord)),
  array['1', '2', '3'], 'memberships are ordered by seat');
select is(
  (select e->>'status' from snap, jsonb_array_elements(j->'memberships') e where e->>'id' = pg_temp.id('f')::text),
  'former', 'the former member is marked former');
select ok(
  (select e->'avatar_path' = 'null'::jsonb from snap, jsonb_array_elements(j->'memberships') e where e->>'id' = pg_temp.id('f')::text),
  'a former member''s avatar is not exposed');

select is(
  (select array_agg((e->>'number')::int order by ord) from snap, jsonb_array_elements(j->'tasks') with ordinality x(e, ord)),
  array[1, 2, 3], 'live tasks are returned by number; the deleted one is not');
select is(
  (select (e->>'open_questions')::int from snap, jsonb_array_elements(j->'tasks') e where e->>'number' = '1'),
  1, 'open question counts are included');
select is(
  (select e->>'assignee_id' from snap, jsonb_array_elements(j->'tasks') e where e->>'number' = '3'),
  pg_temp.id('f')::text, 'a former member''s task is still on the board');

-- ---------------------------------------------------------------------------
-- Nobody else gets in
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000303');
select throws_ok(
  format($$ select public.get_group_snapshot(%L) $$, pg_temp.id('g')),
  '42501', 'forbidden', 'a former member cannot read the snapshot');
select pg_temp.as_user('00000000-0000-0000-0000-000000000304');
select throws_ok(
  format($$ select public.get_group_snapshot(%L) $$, pg_temp.id('g')),
  '42501', 'forbidden', 'an outsider cannot read the snapshot');
select throws_ok(
  format($$ select public.get_group_snapshot(%L) $$, gen_random_uuid()),
  '42501', 'forbidden', 'an unknown group looks the same as a forbidden one');
set local role anon;
select throws_ok(
  format($$ select public.get_group_snapshot(%L) $$, pg_temp.id('g')),
  '42501', null, 'anon cannot call get_group_snapshot');
reset role;

select * from finish();
rollback;

-- 2.6 create_task, update_task, delete_task, set_task_status, take_over_tasks.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(41);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;
create function pg_temp.task(p_number int) returns uuid language sql as $$
  select id from public.tasks where group_id = pg_temp.id('g') and number = p_number;
$$;

-- L leads G with members M1, M2 and F (who leaves later). O leads another group.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'task_lead@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000102', 'task_m1@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000103', 'task_m2@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000104', 'task_former@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000105', 'task_other@users.taskahan.pages.dev');

select pg_temp.as_user('00000000-0000-0000-0000-000000000101');
insert into ids values ('g', public.create_group('Tasks', 'work_team', null, 10, 'TASKSTTT'));
select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select public.join_group('TASKSTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000103');
select public.join_group('TASKSTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000104');
select public.join_group('TASKSTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000105');
insert into ids values ('g2', public.create_group('Other', 'other', null, 5, 'OTHERTTT'));

insert into ids
select case m.user_id
         when '00000000-0000-0000-0000-000000000101' then 'lead'
         when '00000000-0000-0000-0000-000000000102' then 'm1'
         when '00000000-0000-0000-0000-000000000103' then 'm2'
         when '00000000-0000-0000-0000-000000000104' then 'f'
         when '00000000-0000-0000-0000-000000000105' then 'o'
       end, m.id
  from public.memberships m;

-- ---------------------------------------------------------------------------
-- create_task
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000101');
set local role authenticated;
select is(
  (select number from public.create_task(pg_temp.id('g'), '  Write intro ', E'Line one\r\nLine two\u0007',
                                         pg_temp.id('m1'), null)),
  1, 'the leader creates task #1');
reset role;
select results_eq(
  $$ select title, details, status::text, assignee_id, created_by from public.tasks where id = pg_temp.task(1) $$,
  $$ values ('Write intro', E'Line one\nLine two', 'todo', pg_temp.id('m1'), pg_temp.id('lead')) $$,
  'text is cleaned and the task starts as todo');
select is(
  (select number from public.create_task(pg_temp.id('g'), 'Second', null, pg_temp.id('m2'), now() + interval '1 day')),
  2, 'the next task is #2');
select is(
  (select count(*)::int from public.logs where group_id = pg_temp.id('g') and action = 'task_created'),
  2, 'task_created is logged');

select throws_ok(
  format($$ select public.create_task(%L, 'X', '', %L, null) $$, pg_temp.id('g'), pg_temp.id('o')),
  '22023', 'invalid_input', 'the assignee must be in the same group');
select throws_ok(
  format($$ select public.create_task(%L, '  ', '', %L, null) $$, pg_temp.id('g'), pg_temp.id('m1')),
  '22023', 'invalid_input', 'an empty title is refused');
select throws_ok(
  format($$ select public.create_task(%L, 'X', repeat('a', 2001), %L, null) $$, pg_temp.id('g'), pg_temp.id('m1')),
  '22023', 'invalid_input', 'details over 2000 characters are refused');

select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select throws_ok(
  format($$ select public.create_task(%L, 'X', '', %L, null) $$, pg_temp.id('g'), pg_temp.id('m1')),
  '42501', 'forbidden', 'a member cannot create a task');
select pg_temp.as_user('00000000-0000-0000-0000-000000000105');
select throws_ok(
  format($$ select public.create_task(%L, 'X', '', %L, null) $$, pg_temp.id('g'), pg_temp.id('m1')),
  '42501', 'forbidden', 'another group''s leader cannot create a task here');

set local role anon;
select throws_ok(
  format($$ select public.create_task(%L, 'X', '', %L, null) $$, pg_temp.id('g'), pg_temp.id('m1')),
  '42501', null, 'anon cannot call create_task');
reset role;

-- ---------------------------------------------------------------------------
-- update_task
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000101');
select is(
  (select title from public.update_task(pg_temp.task(1), 'Write the intro', 'Line one', pg_temp.id('m1'), null)),
  'Write the intro', 'the leader edits a task');
select is(
  (select meta -> 'fields' from public.logs where action = 'task_edited' and task_id = pg_temp.task(1)),
  '["title", "details"]'::jsonb, 'task_edited lists the changed fields');
select is(
  (select assignee_id from public.update_task(pg_temp.task(1), 'Write the intro', 'Line one', pg_temp.id('m2'), null)),
  pg_temp.id('m2'), 'the leader reassigns a task');
select results_eq(
  $$ select target_member_id, meta ->> 'from' from public.logs
      where action = 'task_reassigned' and task_id = pg_temp.task(1) $$,
  $$ values (pg_temp.id('m2'), pg_temp.id('m1')::text) $$,
  'task_reassigned records both members');
select is(
  (select count(*)::int from public.logs where action = 'task_edited' and task_id = pg_temp.task(1)),
  1, 'a pure reassign does not log an edit');
select lives_ok(
  format($$ select public.update_task(%L, 'Write the intro', 'Line one', %L, null) $$,
         pg_temp.task(1), pg_temp.id('m2')),
  'an unchanged update passes');
select is(
  (select count(*)::int from public.logs where task_id = pg_temp.task(1)),
  3, 'an unchanged update logs nothing');

select pg_temp.as_user('00000000-0000-0000-0000-000000000103');
select throws_ok(
  format($$ select public.update_task(%L, 'Mine now', '', %L, null) $$, pg_temp.task(1), pg_temp.id('m2')),
  '42501', 'forbidden', 'the assignee cannot edit');
select pg_temp.as_user('00000000-0000-0000-0000-000000000105');
select throws_ok(
  format($$ select public.update_task(%L, 'X', '', %L, null) $$, pg_temp.task(1), pg_temp.id('o')),
  '42501', 'forbidden', 'another group''s leader cannot edit');

-- ---------------------------------------------------------------------------
-- set_task_status
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000103');
set local role authenticated;
select results_eq(
  format($$ select status::text, completed_at is not null from public.set_task_status(%L, 'done') $$, pg_temp.task(1)),
  $$ values ('done', true) $$,
  'the assignee marks their task done');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select throws_ok(
  format($$ select public.set_task_status(%L, 'todo') $$, pg_temp.task(1)),
  '42501', 'forbidden', 'another member cannot change the status');

select pg_temp.as_user('00000000-0000-0000-0000-000000000101');
select results_eq(
  format($$ select status::text, completed_at is null from public.set_task_status(%L, 'in_progress') $$, pg_temp.task(1)),
  $$ values ('in_progress', true) $$,
  'the leader changes any status and completed_at clears');
select is(
  (select array_agg(meta ->> 'to' order by id) from public.logs
    where action = 'status_changed' and task_id = pg_temp.task(1)),
  array['done', 'in_progress'], 'status_changed is logged with the new status');
select lives_ok(
  format($$ select public.set_task_status(%L, 'in_progress') $$, pg_temp.task(1)),
  'setting the same status passes');
select is(
  (select count(*)::int from public.logs where action = 'status_changed' and task_id = pg_temp.task(1)),
  2, 'setting the same status logs nothing');

-- ---------------------------------------------------------------------------
-- delete_task, and numbers never repeat
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select throws_ok(
  format($$ select public.delete_task(%L) $$, pg_temp.task(2)),
  '42501', 'forbidden', 'a member cannot delete a task');

select pg_temp.as_user('00000000-0000-0000-0000-000000000101');
select public.delete_task(pg_temp.task(2));
select is(
  (select deleted_at is not null from public.tasks where id = pg_temp.task(2)),
  true, 'delete is a soft delete');
select is(
  (select meta ->> 'number' from public.logs where action = 'task_deleted'),
  '2', 'task_deleted is logged with the number');
select throws_ok(
  format($$ select public.delete_task(%L) $$, pg_temp.task(2)),
  '42501', 'forbidden', 'a deleted task cannot be deleted again');
select throws_ok(
  format($$ select public.set_task_status(%L, 'done') $$, pg_temp.task(2)),
  '42501', 'forbidden', 'a deleted task cannot change status');
select is(
  (select number from public.create_task(pg_temp.id('g'), 'Third', '', pg_temp.id('f'), null)),
  3, 'the number after a deleted task is not reused');
select public.create_task(pg_temp.id('g'), 'Fourth', '', pg_temp.id('f'), null);

-- ---------------------------------------------------------------------------
-- take_over_tasks: F leaves with #3 and #4
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select throws_ok(
  format($$ select public.take_over_tasks(%L, array[%L]::uuid[]) $$, pg_temp.id('m2'), pg_temp.task(1)),
  '22023', 'invalid_input', 'tasks cannot be taken from an active member');

select pg_temp.as_user('00000000-0000-0000-0000-000000000104');
select public.leave_group(pg_temp.id('g'));
select throws_ok(
  format($$ select public.set_task_status(%L, 'done') $$, pg_temp.task(3)),
  '42501', 'forbidden', 'a former member cannot change their old task');

select pg_temp.as_user('00000000-0000-0000-0000-000000000105');
select throws_ok(
  format($$ select public.take_over_tasks(%L, array[%L]::uuid[]) $$, pg_temp.id('f'), pg_temp.task(3)),
  '42501', 'forbidden', 'an outsider cannot take over');

select pg_temp.as_user('00000000-0000-0000-0000-000000000102');
select throws_ok(
  format($$ select public.take_over_tasks(%L, array[%L, %L]::uuid[]) $$,
         pg_temp.id('f'), pg_temp.task(3), pg_temp.task(1)),
  '22023', 'invalid_input', 'a list with a task not owned by the former member is refused');
select throws_ok(
  format($$ select public.take_over_tasks(%L, '{}'::uuid[]) $$, pg_temp.id('f')),
  '22023', 'invalid_input', 'an empty list is refused');

set local role authenticated;
select is(
  public.take_over_tasks(pg_temp.id('f'), array[pg_temp.task(3), pg_temp.task(3)]),
  array[3], 'a member takes over #3 (duplicates ignored)');
reset role;
select is(
  (select assignee_id from public.tasks where id = pg_temp.task(3)),
  pg_temp.id('m1'), 'the task moves to the caller');
select results_eq(
  $$ select actor_id, target_member_id, meta -> 'numbers' from public.logs where action = 'tasks_taken_over' $$,
  $$ values (pg_temp.id('m1'), pg_temp.id('f'), '[3]'::jsonb) $$,
  'tasks_taken_over lists the numbers');

select pg_temp.as_user('00000000-0000-0000-0000-000000000103');
select throws_ok(
  format($$ select public.take_over_tasks(%L, array[%L]::uuid[]) $$, pg_temp.id('f'), pg_temp.task(3)),
  '22023', 'invalid_input', 'a task already taken over cannot be claimed again');

-- ---------------------------------------------------------------------------
-- 500 live tasks per group
-- ---------------------------------------------------------------------------

insert into public.tasks (group_id, number, title, assignee_id, created_by)
select pg_temp.id('g2'), 100 + i, 'Bulk ' || i, pg_temp.id('o'), pg_temp.id('o')
  from generate_series(1, 500) i;
select pg_temp.as_user('00000000-0000-0000-0000-000000000105');
select throws_ok(
  format($$ select public.create_task(%L, 'One too many', '', %L, null) $$, pg_temp.id('g2'), pg_temp.id('o')),
  '54000', 'task_limit', 'a 501st live task is refused');

select * from finish();
rollback;

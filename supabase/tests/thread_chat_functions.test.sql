-- 2.7 open_question, reply_to_question, set_question_resolved, send_message
-- and the open_questions trigger.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(47);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
create function pg_temp.id(p_k text) returns uuid language sql as $$
  select v from ids where k = p_k;
$$;
create function pg_temp.open_count(p_number int) returns int language sql as $$
  select open_questions from public.tasks where group_id = pg_temp.id('g') and number = p_number;
$$;

-- L leads G with M1 (assignee), M2 and F (leaves later). O leads another group.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'chat_lead@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000202', 'chat_m1@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000203', 'chat_m2@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000204', 'chat_former@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000205', 'chat_other@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-000000000206', 'chat_other_m@users.taskahan.pages.dev');

select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
insert into ids values ('g', public.create_group('Chat', 'work_team', null, 10, 'CHATTTTT'));
select pg_temp.as_user('00000000-0000-0000-0000-000000000202');
select public.join_group('CHATTTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000203');
select public.join_group('CHATTTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000204');
select public.join_group('CHATTTTT');
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
insert into ids values ('g2', public.create_group('Other', 'other', null, 5, 'OTHERCCC'));

insert into ids
select case m.user_id
         when '00000000-0000-0000-0000-000000000201' then 'lead'
         when '00000000-0000-0000-0000-000000000202' then 'm1'
         when '00000000-0000-0000-0000-000000000203' then 'm2'
         when '00000000-0000-0000-0000-000000000204' then 'f'
         when '00000000-0000-0000-0000-000000000205' then 'o'
       end, m.id
  from public.memberships m;

-- Tasks #1 and #2 belong to M1, #3 to M2, #4 to the leader.
select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
select public.create_task(pg_temp.id('g'), 'One', '', pg_temp.id('m1'), null);
select public.create_task(pg_temp.id('g'), 'Two', '', pg_temp.id('m1'), null);
select public.create_task(pg_temp.id('g'), 'Three', '', pg_temp.id('m2'), null);
select public.create_task(pg_temp.id('g'), 'Four', '', pg_temp.id('lead'), null);
insert into ids select 't' || number, id from public.tasks where group_id = pg_temp.id('g');

-- ---------------------------------------------------------------------------
-- open_question
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000202');
set local role authenticated;
select is(
  (select body from public.open_question(pg_temp.id('t1'), E'  Which API?\r\nAny docs?\u0007 ')),
  E'Which API?\nAny docs?', 'the assignee opens a question (text cleaned)');
reset role;
insert into ids select 'th1', id from public.threads where task_id = pg_temp.id('t1');
select is(pg_temp.open_count(1), 1, 'opening a question counts it on the task');
select is(
  (select count(*)::int from public.logs where action = 'question_asked' and task_id = pg_temp.id('t1')),
  1, 'question_asked is logged');

select public.open_question(pg_temp.id('t1'), 'Second one');
insert into ids select 'th2', id from public.threads where task_id = pg_temp.id('t1') and id <> pg_temp.id('th1');
select is(pg_temp.open_count(1), 2, 'two open questions count as two');

select throws_ok(
  format($$ select public.open_question(%L, '  ') $$, pg_temp.id('t1')),
  '22023', 'invalid_input', 'an empty question is refused');
select throws_ok(
  format($$ select public.open_question(%L, E'\n \r\n\n') $$, pg_temp.id('t1')),
  '22023', 'invalid_input', 'a newline-only question is refused');
select is(pg_temp.open_count(1), 2, 'a refused blank question does not block the task');
select is(
  (select body from public.open_question(pg_temp.id('t2'), E'\n\n  Line one\n\nLine two \n')),
  E'Line one\n\nLine two', 'surrounding newlines are trimmed, inner ones kept');
select throws_ok(
  format($$ select public.open_question(%L, repeat('a', 1001)) $$, pg_temp.id('t1')),
  '22023', 'invalid_input', 'a question over 1000 characters is refused');
select throws_ok(
  format($$ select public.open_question(%L, 'Not mine') $$, pg_temp.id('t3')),
  '42501', 'forbidden', 'an assignee cannot ask on someone else''s task');

select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
select throws_ok(
  format($$ select public.open_question(%L, 'Leader asks') $$, pg_temp.id('t1')),
  '42501', 'forbidden', 'the leader replies instead of asking');
select throws_ok(
  format($$ select public.open_question(%L, 'Own task') $$, pg_temp.id('t4')),
  '42501', 'forbidden', 'the leader cannot ask even on their own task');
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
select throws_ok(
  format($$ select public.open_question(%L, 'Outsider') $$, pg_temp.id('t1')),
  '42501', 'forbidden', 'another group''s member cannot ask here');
set local role anon;
select throws_ok(
  format($$ select public.open_question(%L, 'Anon') $$, pg_temp.id('t1')),
  '42501', null, 'anon cannot call open_question');
reset role;

-- ---------------------------------------------------------------------------
-- reply_to_question
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000203');
set local role authenticated;
select is(
  (select author_id from public.reply_to_question(pg_temp.id('th1'), 'Check the wiki')),
  pg_temp.id('m2'), 'any active member can reply');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
select is(
  (select body from public.reply_to_question(pg_temp.id('th1'), 'Also ask Sam')),
  'Also ask Sam', 'the leader can reply');
select is(
  (select count(*)::int from public.logs where action = 'question_replied' and task_id = pg_temp.id('t1')),
  2, 'question_replied is logged');
select is(pg_temp.open_count(1), 2, 'replying does not change the open count');
select is(
  (select meta from public.logs where action = 'question_replied' order by id desc limit 1),
  jsonb_build_object('number', 1, 'thread_id', pg_temp.id('th1')),
  'question_replied carries the task number');

select throws_ok(
  format($$ select public.reply_to_question(%L, '') $$, pg_temp.id('th1')),
  '22023', 'invalid_input', 'an empty reply is refused');
select throws_ok(
  format($$ select public.reply_to_question(%L, E'\n\n') $$, pg_temp.id('th1')),
  '22023', 'invalid_input', 'a newline-only reply is refused');
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
select throws_ok(
  format($$ select public.reply_to_question(%L, 'Outsider') $$, pg_temp.id('th1')),
  '42501', 'forbidden', 'an outsider cannot reply');
select throws_ok(
  format($$ select public.reply_to_question(%L, 'Nope') $$, gen_random_uuid()),
  '42501', 'forbidden', 'an unknown thread looks the same as a forbidden one');

-- ---------------------------------------------------------------------------
-- set_question_resolved
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000203');
select throws_ok(
  format($$ select public.set_question_resolved(%L, true) $$, pg_temp.id('th1')),
  '42501', 'forbidden', 'a member who is neither opener nor leader cannot resolve');

select pg_temp.as_user('00000000-0000-0000-0000-000000000202');
set local role authenticated;
select results_eq(
  format($$ select status::text, resolved_by from public.set_question_resolved(%L, true) $$, pg_temp.id('th1')),
  format($$ values ('resolved', %L::uuid) $$, pg_temp.id('m1')),
  'the opener resolves their question');
reset role;
select is(pg_temp.open_count(1), 1, 'resolving one of two leaves the task blocked');

select public.set_question_resolved(pg_temp.id('th1'), true);
select is(
  (select count(*)::int from public.logs where action = 'question_resolved'),
  1, 'resolving a resolved thread changes and logs nothing');

select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
select results_eq(
  format($$ select status::text, resolved_by, resolved_at from public.set_question_resolved(%L, false) $$, pg_temp.id('th1')),
  $$ values ('open', null::uuid, null::timestamptz) $$,
  'the leader reopens it and the resolve fields clear');
select is(pg_temp.open_count(1), 2, 'reopening counts it again');
select is(
  (select count(*)::int from public.logs where action = 'question_reopened'),
  1, 'question_reopened is logged');
select is(
  (select meta->>'number' from public.logs where action = 'question_resolved' order by id desc limit 1),
  '1', 'question_resolved carries the task number');

select public.set_question_resolved(pg_temp.id('th1'), true);
select public.set_question_resolved(pg_temp.id('th2'), true);
select is(pg_temp.open_count(1), 0, 'resolving the last open question clears the block');

select throws_ok(
  format($$ select public.set_question_resolved(%L, null) $$, pg_temp.id('th1')),
  '22023', 'invalid_input', 'a null resolved flag is refused');
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
select throws_ok(
  format($$ select public.set_question_resolved(%L, false) $$, pg_temp.id('th1')),
  '42501', 'forbidden', 'an outsider cannot reopen');

-- A deleted task takes its threads out of reach.
select pg_temp.as_user('00000000-0000-0000-0000-000000000201');
select public.delete_task(pg_temp.id('t1'));
select throws_ok(
  format($$ select public.reply_to_question(%L, 'Late') $$, pg_temp.id('th1')),
  '42501', 'forbidden', 'a deleted task''s thread cannot be replied to');
select pg_temp.as_user('00000000-0000-0000-0000-000000000202');
select throws_ok(
  format($$ select public.open_question(%L, 'Late') $$, pg_temp.id('t1')),
  '42501', 'forbidden', 'a deleted task cannot get a question');

-- ---------------------------------------------------------------------------
-- send_message
-- ---------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-000000000203');
set local role authenticated;
select results_eq(
  format($$ select author_id, body from public.send_message(%L, ' Hello team ') $$, pg_temp.id('g')),
  format($$ values (%L::uuid, 'Hello team') $$, pg_temp.id('m2')),
  'a member sends a message');
reset role;
select is(
  (select count(*)::int from public.messages where group_id = pg_temp.id('g')),
  1, 'the message is stored');

select throws_ok(
  format($$ select public.send_message(%L, '   ') $$, pg_temp.id('g')),
  '22023', 'invalid_input', 'an empty message is refused');
select throws_ok(
  format($$ select public.send_message(%L, E' \n\t\n ') $$, pg_temp.id('g')),
  '22023', 'invalid_input', 'a newline-only message is refused');
select throws_ok(
  format($$ select public.send_message(%L, repeat('a', 1001)) $$, pg_temp.id('g')),
  '22023', 'invalid_input', 'a message over 1000 characters is refused');

select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
select throws_ok(
  format($$ select public.send_message(%L, 'Hi') $$, pg_temp.id('g')),
  '42501', 'forbidden', 'an outsider cannot send a message');

select pg_temp.as_user('00000000-0000-0000-0000-000000000204');
select public.leave_group(pg_temp.id('g'));
select throws_ok(
  format($$ select public.send_message(%L, 'Hi') $$, pg_temp.id('g')),
  '42501', 'forbidden', 'a former member cannot send a message');

-- Rate limit: 30 messages per minute.
insert into public.rate_limits (user_id, bucket, window_start, count)
values ('00000000-0000-0000-0000-000000000203', 'message', now(), 30)
on conflict (user_id, bucket) do update set count = excluded.count, window_start = now();
select pg_temp.as_user('00000000-0000-0000-0000-000000000203');
select throws_ok(
  format($$ select public.send_message(%L, 'Too fast') $$, pg_temp.id('g')),
  'P0001', 'rate_limited', 'the 31st message in a minute is refused');

-- Rate limit: 20 questions and replies per minute, one shared bucket.
insert into public.rate_limits (user_id, bucket, window_start, count)
values ('00000000-0000-0000-0000-000000000202', 'question', now(), 20)
on conflict (user_id, bucket) do update set count = excluded.count, window_start = now();
select pg_temp.as_user('00000000-0000-0000-0000-000000000202');
select throws_ok(
  format($$ select public.open_question(%L, 'Too fast') $$, pg_temp.id('t2')),
  'P0001', 'rate_limited', 'the 21st question or reply in a minute is refused');

-- Deleting a group with open questions still cascades through the trigger.
select pg_temp.as_user('00000000-0000-0000-0000-000000000206');
select public.join_group('OTHERCCC');
insert into ids select 'o_m', id from public.memberships
 where group_id = pg_temp.id('g2') and user_id = '00000000-0000-0000-0000-000000000206';
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
insert into ids select 'o_t', id from public.create_task(pg_temp.id('g2'), 'Gone', '', pg_temp.id('o_m'), null);
select pg_temp.as_user('00000000-0000-0000-0000-000000000206');
insert into ids select 'o_th', id from public.open_question(pg_temp.id('o_t'), 'Will this survive?');
select public.reply_to_question(pg_temp.id('o_th'), 'Self reply');
select public.leave_group(pg_temp.id('g2'));
select pg_temp.as_user('00000000-0000-0000-0000-000000000205');
select lives_ok(
  format($$ select public.leave_group(%L) $$, pg_temp.id('g2')),
  'the last member leaving a group with questions deletes it');
select is(
  (select count(*)::int from public.threads where group_id = pg_temp.id('g2'))
    + (select count(*)::int from public.thread_replies where group_id = pg_temp.id('g2'))
    + (select count(*)::int from public.groups where id = pg_temp.id('g2')),
  0, 'its group, threads and replies are gone');

select * from finish();
rollback;

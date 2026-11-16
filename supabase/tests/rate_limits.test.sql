-- 2.4 Rate limit helpers. The join-specific case lives in group_functions.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'rate_d@users.taskahan.pages.dev');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select is(private.rate_limit_used('join_failed', interval '1 hour'), 0, 'a fresh bucket is empty');

select private.rate_limit_record('join_failed', interval '1 hour') from generate_series(1, 10);
select is(private.rate_limit_used('join_failed', interval '1 hour'), 10, 'ten failures are counted');
select is(private.rate_limit_used('message', interval '1 minute'), 0, 'buckets are separate');

-- take: the cap is inclusive, the next call is refused.
select lives_ok(
  $$ select private.rate_limit_take('message', 3, interval '1 minute') from generate_series(1, 3) $$,
  'three takes under a cap of three pass');
select throws_ok(
  $$ select private.rate_limit_take('message', 3, interval '1 minute') $$,
  'P0001', 'rate_limited', 'the fourth take is refused');
select is(private.rate_limit_used('message', interval '1 minute'), 3, 'a refused take does not count');

-- An expired window starts over.
update public.rate_limits set window_start = now() - interval '61 minutes'
 where bucket = 'join_failed';
select is(private.rate_limit_used('join_failed', interval '1 hour'), 0, 'an expired window reads as empty');
select is(private.rate_limit_record('join_failed', interval '1 hour'), 1, 'the next hit starts a new window');

-- Not signed in.
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select private.rate_limit_take('message', 3, interval '1 minute') $$,
  '42501', null, 'take requires a signed-in caller');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Tests assume an empty database; seed.sql fills it for local dev. Rolled back.
delete from public.groups;
delete from auth.users;

select plan(18);

-- Sign up with a matching email creates the profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice_1@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'Bob@users.taskahan.pages.dev');

select is(
  (select username::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'alice_1', 'profile row appears with the username');
select is(
  (select username::text from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'bob', 'username is stored lowercase');

-- Non-matching emails are rejected.
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'someone@gmail.com') $$,
  '23514', null, 'a real email is rejected');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'ab@users.taskahan.pages.dev') $$,
  '23514', null, 'a username shorter than 3 is rejected');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'a-b-c@users.taskahan.pages.dev') $$,
  '23514', null, 'a username with bad characters is rejected');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'carol@taskahan.pages.dev') $$,
  '23514', null, 'the bare app domain is rejected');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), null) $$,
  '23514', null, 'a user without email (phone or anonymous) is rejected');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'ALICE_1@users.taskahan.pages.dev') $$,
  null, null, 'a username taken in another case is rejected');

-- Email and username cannot change.
select throws_ok(
  $$ update auth.users set email = 'alice_2@users.taskahan.pages.dev'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'email cannot be changed');
select throws_ok(
  $$ update auth.users set email_change = 'alice@gmail.com'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'an email change cannot be requested');
select lives_ok(
  $$ update auth.users set last_sign_in_at = now()
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  'ordinary auth updates still work');

-- As a signed-in user: read own row only, touch_activity works, no direct writes.
update public.profiles set last_active_at = now() - interval '2 days';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*) from public.profiles)::int, 1, 'a user sees only their own profile');

select public.touch_activity();
select ok(
  (select last_active_at > now() - interval '1 minute' from public.profiles),
  'touch_activity moves last_active_at');

select throws_ok(
  $$ update public.profiles set theme = 'dark' $$,
  '42501', null, 'direct updates are refused');

-- 8.3 set_theme saves the caller's own theme, and only a known value.
select public.set_theme('dark');
select is((select theme from public.profiles), 'dark', 'set_theme saves the theme');
select throws_ok(
  $$ select public.set_theme('neon') $$,
  '22023', 'invalid_input', 'set_theme refuses an unknown theme');
reset role;
select is(
  (select theme from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'system', 'set_theme leaves other profiles alone');
set local role anon;
select throws_ok(
  $$ select public.set_theme('light') $$,
  '42501', null, 'anon cannot call set_theme');

select * from finish();
rollback;

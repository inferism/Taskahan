-- 9.3 orphan_avatars: an unreferenced, old object is listed; referenced and fresh ones are not.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

delete from public.groups;
delete from auth.users;

select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ava@users.taskahan.pages.dev');

insert into storage.objects (bucket_id, name, created_at) values
  ('avatars', '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp', now() - interval '2 days'),
  ('avatars', '00000000-0000-0000-0000-0000000000a1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp', now() - interval '2 days'),
  ('avatars', '00000000-0000-0000-0000-0000000000a1/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp', now());

update public.profiles
   set avatar_path = '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
 where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select array_agg(name) from public.orphan_avatars()),
  array['00000000-0000-0000-0000-0000000000a1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'],
  'only the old unreferenced object is an orphan');

select is(
  (select count(*)::int from public.orphan_avatars()
    where name like '%cccccccc%' or name like '%aaaaaaaa%'),
  0, 'referenced and fresh objects are kept');

set local role authenticated;
select throws_ok($$ select * from public.orphan_avatars() $$, '42501', null,
  'authenticated users cannot list orphans');
reset role;

set local role service_role;
select lives_ok($$ select * from public.orphan_avatars(10) $$, 'service role can list orphans');
reset role;

select * from finish();
rollback;

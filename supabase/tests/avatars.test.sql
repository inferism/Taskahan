-- 8.1 Avatar bucket, storage policies, swap_avatar_path.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

delete from public.groups;
delete from auth.users;

select plan(14);

-- Bucket settings.
select is(
  (select row(public, file_size_limit, allowed_mime_types)::text
     from storage.buckets where id = 'avatars'),
  row(true, 204800::bigint, array['image/webp'])::text,
  'avatars bucket is public, 200 KB, WebP only');

-- Fixtures.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ava@users.taskahan.pages.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'bea@users.taskahan.pages.dev');

insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-0000-0000-0000000000b1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
   '00000000-0000-0000-0000-0000000000b1');

-- As ava.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars',
       '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
       '00000000-0000-0000-0000-0000000000a1') $$,
  'upload into own folder works');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars',
       '00000000-0000-0000-0000-0000000000b1/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp') $$,
  '42501', null, 'upload into another user''s folder fails');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars',
       'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp') $$,
  '42501', null, 'upload outside any folder fails');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars',
       '00000000-0000-0000-0000-0000000000a1/me.png') $$,
  '42501', null, 'upload with a name other than {uuid}.webp fails');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars',
       '00000000-0000-0000-0000-0000000000a1/x/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp') $$,
  '42501', null, 'upload into a subfolder fails');

-- Storage blocks direct SQL deletes unless this is set; the API sets it. Lift
-- the guard so the policy is what gets tested.
select set_config('storage.allow_delete_query', 'true', true);

select is_empty(
  $$ delete from storage.objects
      where name like '00000000-0000-0000-0000-0000000000b1/%' returning 1 $$,
  'deleting another user''s avatar does nothing');

select is_empty(
  $$ update storage.objects set name = name
      where bucket_id = 'avatars' returning 1 $$,
  'updating any avatar object does nothing');

select isnt_empty(
  $$ delete from storage.objects
      where name = '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
      returning 1 $$,
  'deleting your own avatar works');

select throws_ok(
  $$ select public.swap_avatar_path('00000000-0000-0000-0000-0000000000a1', 'x') $$,
  '42501', null, 'a signed-in user cannot call swap_avatar_path');

-- Anonymous visitors cannot upload.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars',
       '00000000-0000-0000-0000-0000000000a1/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp') $$,
  '42501', null, 'an anonymous upload fails');

-- As the Edge Function (service role).
reset role;
set local role service_role;
select is(
  public.swap_avatar_path('00000000-0000-0000-0000-0000000000a1', 'a1/first.webp'),
  null, 'first swap returns no previous path');
select is(
  public.swap_avatar_path('00000000-0000-0000-0000-0000000000a1', 'a1/second.webp'),
  'a1/first.webp', 'second swap returns the previous path');
reset role;
select is(
  (select avatar_path from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'a1/second.webp', 'profile points at the new path');

select * from finish();
rollback;

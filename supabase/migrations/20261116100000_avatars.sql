-- 8.1 Avatar bucket, storage policies, and the profile swap used by set-avatar.
-- See ARCHITECTURE.md section 8, SECURITY.md section 7.

-- ---------------------------------------------------------------------------
-- Bucket: public read, WebP only, 200 KB cap, enforced by Storage itself.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects. Insert and delete only inside your own folder,
-- at {user_id}/{uuid}.webp. No update. Public URLs serve reads without a
-- policy; the select policy only lets a user see (and so delete) their own.
-- ---------------------------------------------------------------------------

create function private.is_own_avatar_path(object_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and object_name ~ ('^' || (select auth.uid())::text
                        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
$$;

-- Schema usage was granted to authenticated in 2.2.
revoke all on function private.is_own_avatar_path(text) from public;
grant execute on function private.is_own_avatar_path(text) to authenticated;

create policy "avatars: see own folder"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and private.is_own_avatar_path(name));

create policy "avatars: insert into own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and private.is_own_avatar_path(name));

create policy "avatars: delete from own folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and private.is_own_avatar_path(name));

-- ---------------------------------------------------------------------------
-- swap_avatar_path: point the profile at a new object and return the old
-- path, in one statement so two concurrent calls cannot both see the same
-- previous object. Only the set-avatar Edge Function (service role) calls it.
-- ---------------------------------------------------------------------------

create function public.swap_avatar_path(p_user_id uuid, p_path text)
returns text
language sql
security definer
set search_path = ''
as $$
  with old as (
    select avatar_path from public.profiles where id = p_user_id for update
  )
  update public.profiles p
     set avatar_path = p_path
    from old
   where p.id = p_user_id
  returning old.avatar_path
$$;

revoke all on function public.swap_avatar_path(uuid, text) from public, anon, authenticated;
grant execute on function public.swap_avatar_path(uuid, text) to service_role;

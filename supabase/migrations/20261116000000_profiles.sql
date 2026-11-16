-- 1.6 Profiles, the auth.users trigger, and touch_activity().
-- See ARCHITECTURE.md sections 3 and 7, SECURITY.md section 2.

create extension if not exists citext with schema extensions;

-- Helpers that must never be reachable through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique
    -- Cast to text: regex on citext is case-insensitive.
    constraint profiles_username_format check (username::text ~ '^[a-z0-9_]{3,20}$'),
  avatar_path text,
  theme text not null default 'system'
    constraint profiles_theme_check check (theme in ('system', 'light', 'dark')),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- The daily purge scans for stale accounts.
create index profiles_last_active_at_idx on public.profiles (last_active_at);

alter table public.profiles enable row level security;

-- Reads only. Writes go through security definer functions.
-- Other members' usernames and avatars arrive through a view in 2.2.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "profiles: read own row"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- Usernames are immutable.
create function private.profiles_guard_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.username is distinct from old.username then
    raise exception 'username is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function private.profiles_guard_identity();

-- ---------------------------------------------------------------------------
-- auth.users: only synthetic username emails, then create the profile
-- ---------------------------------------------------------------------------

-- Must match VITE_AUTH_EMAIL_DOMAIN (prefixed with "users."). Change both together.
create function private.auth_email_pattern()
returns text
language sql
immutable
set search_path = ''
as $$ select '^[a-z0-9_]{3,20}@users\.taskahan\.pages\.dev$' $$;

create function private.auth_users_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Rejects real or arbitrary emails, phone sign ups and anonymous sign ins.
    if new.email is null or lower(new.email) !~ private.auth_email_pattern() then
      raise exception 'sign up is limited to usernames' using errcode = 'check_violation';
    end if;
  elsif new.email is distinct from old.email
     or (new.email_change is distinct from old.email_change and coalesce(new.email_change, '') <> '') then
    -- The email is the username, which is immutable.
    raise exception 'email cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger taskahan_guard_email
  before insert or update of email, email_change on auth.users
  for each row execute function private.auth_users_guard();

create function private.auth_users_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(lower(new.email), '@', 1));
  return null;
end;
$$;

create trigger taskahan_create_profile
  after insert on auth.users
  for each row execute function private.auth_users_create_profile();

revoke all on function private.profiles_guard_identity() from public;
revoke all on function private.auth_email_pattern() from public;
revoke all on function private.auth_users_guard() from public;
revoke all on function private.auth_users_create_profile() from public;

-- ---------------------------------------------------------------------------
-- touch_activity(): the client calls this on load and at most hourly
-- ---------------------------------------------------------------------------

create function public.touch_activity()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set last_active_at = now()
   where id = (select auth.uid());
$$;

revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;

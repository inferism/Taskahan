-- Usernames keep the capitals typed at sign up ("Kim_1"). The login email
-- stays lowercase, and profiles.username is citext, so logging in and
-- uniqueness stay case-insensitive: "Kim" and "kim" are the same account.

alter table public.profiles drop constraint profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9_]{3,20}$');

-- The display case comes from the sign-up metadata, but only when it spells
-- the same name as the email; anything else falls back to lowercase.
create or replace function private.auth_users_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login text := split_part(lower(new.email), '@', 1);
  v_display text := new.raw_user_meta_data ->> 'username';
begin
  if v_display is null or lower(v_display) <> v_login or v_display !~ '^[A-Za-z0-9_]{3,20}$' then
    v_display := v_login;
  end if;
  insert into public.profiles (id, username) values (new.id, v_display);
  return null;
end;
$$;

-- 2.2 Membership helpers and the select policies for every table.
-- See ARCHITECTURE.md section 4, SECURITY.md section 3.
--
-- Policies call these helpers as the querying role, so authenticated needs
-- usage on the private schema and execute on these two functions only. The
-- schema is not exposed through the API (config.toml api.schemas).

grant usage on schema private to authenticated;

create function private.is_active_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
     where m.group_id = p_group_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
  );
$$;

create function private.is_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
     where m.group_id = p_group_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and m.role = 'leader'
  );
$$;

revoke all on function private.is_active_member(uuid) from public;
revoke all on function private.is_leader(uuid) from public;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.is_leader(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Select policies. There are no insert, update or delete policies.
-- ---------------------------------------------------------------------------

create policy "groups: active members read"
  on public.groups for select
  to authenticated
  using (private.is_active_member(id));

-- Your own rows in any status, so a removed user can be told.
create policy "memberships: active members read, and your own rows"
  on public.memberships for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_active_member(group_id));

create policy "tasks: active members read"
  on public.tasks for select
  to authenticated
  using (private.is_active_member(group_id));

create policy "threads: active members read"
  on public.threads for select
  to authenticated
  using (private.is_active_member(group_id));

create policy "thread_replies: active members read"
  on public.thread_replies for select
  to authenticated
  using (private.is_active_member(group_id));

create policy "messages: active members read"
  on public.messages for select
  to authenticated
  using (private.is_active_member(group_id));

create policy "logs: current leader reads"
  on public.logs for select
  to authenticated
  using (private.is_leader(group_id));

-- group_blocks and rate_limits: no policy and no grant. Functions only.

-- ---------------------------------------------------------------------------
-- member_profiles: username and avatar of yourself and of anyone who shares
-- an active group with you. Runs as the view owner so it can read past the
-- own-row policy on profiles; the where clause is the access rule.
-- ---------------------------------------------------------------------------

create view public.member_profiles
with (security_barrier = true)
as
  select p.id, p.username, p.avatar_path
    from public.profiles p
   where p.id = (select auth.uid())
      or exists (
        select 1
          from public.memberships mine
          join public.memberships theirs on theirs.group_id = mine.group_id
         where mine.user_id = (select auth.uid())
           and mine.status = 'active'
           and theirs.user_id = p.id
           and theirs.status = 'active'
      );

revoke all on table public.member_profiles from anon, authenticated;
grant select on table public.member_profiles to authenticated;

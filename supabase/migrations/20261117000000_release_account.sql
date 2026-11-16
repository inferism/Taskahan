-- 9.1 release_account: free every seat an account holds before it is deleted.
-- 9.2 purge helpers the purge-inactive Edge Function calls as service role.
-- See ARCHITECTURE.md section 7, SECURITY.md section 10.

-- ---------------------------------------------------------------------------
-- private.release_account: for every active membership of the account,
-- flip it to former with reason account_deleted. A leader's seat goes to a
-- random active member (leadership_auto_transferred); a group with nobody
-- left is deleted with everything in it. Logged as system actions (no actor).
-- Idempotent: an account with no active seats is a no-op.
-- ---------------------------------------------------------------------------

create function private.release_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_me public.memberships;
  v_heir uuid;
begin
  if p_user_id is null then
    raise exception 'invalid_input' using errcode = 'invalid_parameter_value', detail = 'user_id';
  end if;

  -- Same lock join_group takes for the membership cap, so the account cannot
  -- take a new seat while its seats are being released.
  perform 1 from public.profiles p where p.id = p_user_id for update;

  -- Groups in id order so two releases never lock in opposite orders.
  for v_group_id in
    select m.group_id from public.memberships m
     where m.user_id = p_user_id and m.status = 'active'
     order by m.group_id
  loop
    -- Serializes with every other membership change in the group.
    perform 1 from public.groups g where g.id = v_group_id for no key update;

    select m.* into v_me
      from public.memberships m
     where m.group_id = v_group_id and m.user_id = p_user_id and m.status = 'active';
    continue when not found;

    if v_me.role = 'leader' then
      select m.id into v_heir
        from public.memberships m
       where m.group_id = v_group_id and m.status = 'active' and m.id <> v_me.id
       order by random()
       limit 1;

      if v_heir is null then
        delete from public.groups g where g.id = v_group_id;
        continue;
      end if;
    end if;

    -- Demote and flip in one statement: a former seat is always a member, and
    -- the one-leader index needs the old leader gone before the heir rises.
    update public.memberships m
       set status = 'former', role = 'member', left_at = now(), left_reason = 'account_deleted'
     where m.id = v_me.id;
    perform private.log(v_group_id, null, 'account_deleted', null, v_me.id);

    if v_me.role = 'leader' then
      update public.memberships m set role = 'leader' where m.id = v_heir;
      perform private.log(v_group_id, null, 'leadership_auto_transferred', null, v_heir,
        jsonb_build_object('from_member_id', v_me.id));
    end if;
  end loop;
end;
$$;

revoke all on function private.release_account(uuid) from public;

-- ---------------------------------------------------------------------------
-- inactive_accounts: accounts with no authenticated activity for 30 days,
-- oldest first. The Edge Function pages through these.
-- ---------------------------------------------------------------------------

create function public.inactive_accounts(p_limit int default 100)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profiles p
   where p.last_active_at < now() - interval '30 days'
   order by p.last_active_at, p.id
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- release_inactive_account: re-checks the account is still inactive under the
-- profile lock, releases it, and returns its avatar path so the caller can
-- delete the object before deleting the auth user. No row means the account
-- came back (or is gone) and must be skipped. One call is one transaction.
-- ---------------------------------------------------------------------------

create function public.release_inactive_account(p_user_id uuid)
returns table (avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles p
   where p.id = p_user_id and p.last_active_at < now() - interval '30 days'
     for update;
  if not found then
    return;
  end if;

  perform private.release_account(p_user_id);

  return query select p.avatar_path from public.profiles p where p.id = p_user_id;
end;
$$;

revoke all on function public.inactive_accounts(int) from public, anon, authenticated;
revoke all on function public.release_inactive_account(uuid) from public, anon, authenticated;
grant execute on function public.inactive_accounts(int) to service_role;
grant execute on function public.release_inactive_account(uuid) to service_role;

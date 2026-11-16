-- 2.9 get_group_snapshot: everything the board needs in one round trip.
-- See ARCHITECTURE.md section 4, SECURITY.md section 3.
--
-- Returns one jsonb object:
--   group        the group row (join code included; every member may share it)
--   me           the caller's membership id
--   memberships  every seat, active and former, by seat. avatar_path is set
--                for active seats only, matching public.member_profiles
--   tasks        every live task by number, with its open_questions count
--
-- Only active members may call it; anyone else, and an unknown group, gets
-- 'forbidden'. Internal counters (next_task_number, next_seat) and deleted
-- tasks are left out.

create function public.get_group_snapshot(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.memberships := private.caller_seat(p_group_id);
begin
  return jsonb_build_object(
    'group', (
      select jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'purpose', g.purpose,
        'purpose_note', g.purpose_note,
        'member_limit', g.member_limit,
        'join_code', g.join_code,
        'created_at', g.created_at)
        from public.groups g
       where g.id = p_group_id),
    'me', v_me.id,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'user_id', m.user_id,
        'display_name', m.display_name,
        'seat', m.seat,
        'role', m.role,
        'status', m.status,
        'joined_at', m.joined_at,
        'left_at', m.left_at,
        'left_reason', m.left_reason,
        'avatar_path', case when m.status = 'active' then p.avatar_path end)
        order by m.seat)
        from public.memberships m
        left join public.profiles p on p.id = m.user_id
       where m.group_id = p_group_id), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'number', t.number,
        'title', t.title,
        'details', t.details,
        'assignee_id', t.assignee_id,
        'status', t.status,
        'open_questions', t.open_questions,
        'deadline', t.deadline,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'completed_at', t.completed_at)
        order by t.number)
        from public.tasks t
       where t.group_id = p_group_id
         and t.deleted_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_group_snapshot(uuid) from public, anon;
grant execute on function public.get_group_snapshot(uuid) to authenticated;

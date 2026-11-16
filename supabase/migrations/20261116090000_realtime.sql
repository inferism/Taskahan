-- 5.1 Realtime: channel authorization for group:{id} and the change publication.
-- See ARCHITECTURE.md section 6, SECURITY.md section 11.
--
-- Each open board joins one private channel, group:{group_id}. Realtime asks
-- realtime.messages whether the caller may read (join, receive presence) and
-- insert (track presence) on that topic, with realtime.topic() set to the
-- channel name. Only active members of the group pass. Clients never send
-- broadcasts: every change reaches them as a postgres change, which row level
-- security on the source table filters per subscriber.

-- The group id in a 'group:{uuid}' topic, or null for any other topic. Never
-- raises, so a malformed topic is refused instead of erroring.
create function private.group_topic_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^group:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 7)::uuid
  end;
$$;

revoke all on function private.group_topic_id(text) from public;
grant execute on function private.group_topic_id(text) to authenticated;

-- Join the channel and receive presence: active members of that group.
create policy "group channel: active members join"
  on realtime.messages for select
  to authenticated
  using (
    extension in ('presence', 'broadcast')
    and private.is_active_member(private.group_topic_id((select realtime.topic())))
  );

-- Track presence: active members of that group. No client broadcasts.
create policy "group channel: active members track presence"
  on realtime.messages for insert
  to authenticated
  with check (
    extension = 'presence'
    and private.is_active_member(private.group_topic_id((select realtime.topic())))
  );

-- Tables whose changes the board patches into its cache. Logs stay out: the
-- leader's Logs view refetches instead. Soft deletes mean rows arrive as
-- inserts and updates, so row level security applies to every event.
alter publication supabase_realtime add table
  public.groups,
  public.memberships,
  public.tasks,
  public.threads,
  public.thread_replies,
  public.messages;

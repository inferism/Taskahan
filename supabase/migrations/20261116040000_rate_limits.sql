-- 2.4 Rate limit helpers. See SECURITY.md sections 4 and 10.
--
-- One fixed window per (account, bucket). When the window has passed, the
-- next hit starts a new one.
--
-- Use pattern inside a write function:
--
--   Every attempt counts (messages, questions, replies):
--     perform private.rate_limit_take('message', 30, interval '1 minute');
--   This counts the call and raises 'rate_limited' once the window is full.
--   The raise rolls back the increment, which is fine: the bucket is already
--   at its cap.
--
--   Only failures count (join attempts):
--     if private.rate_limit_used('join_failed', interval '1 hour') >= 10 then
--       raise exception 'rate_limited' ...;
--     end if;
--     ... on failure:
--     perform private.rate_limit_record('join_failed', interval '1 hour');
--     return null;   -- not raise: raising would roll the record back
--
-- Clients see the error message 'rate_limited' (SQLSTATE P0001).

-- Hits in the current window for the caller, 0 when the window has passed.
create function private.rate_limit_used(p_bucket text, p_window interval)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.count
      from public.rate_limits r
     where r.user_id = (select auth.uid())
       and r.bucket = p_bucket
       and r.window_start > now() - p_window
  ), 0);
$$;

-- Counts one hit for the caller and returns the count in the current window.
create function private.rate_limit_record(p_bucket text, p_window interval)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values ((select auth.uid()), p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when r.window_start <= now() - p_window then now() else r.window_start end,
        count = case when r.window_start <= now() - p_window then 1 else r.count + 1 end
  returning r.count;
$$;

-- Counts one hit and raises once the caller is over p_max in the window.
create function private.rate_limit_take(p_bucket text, p_max int, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if private.rate_limit_record(p_bucket, p_window) > p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.rate_limit_used(text, interval) from public;
revoke all on function private.rate_limit_record(text, interval) from public;
revoke all on function private.rate_limit_take(text, int, interval) from public;

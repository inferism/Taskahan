-- 8.3 set_theme: the caller saves their theme so it follows them to every device.
-- See ARCHITECTURE.md section 9 (theme applied from localStorage, then synced to profiles.theme).

create function public.set_theme(p_theme text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_theme is null or p_theme not in ('system', 'light', 'dark') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'theme';
  end if;
  update public.profiles
     set theme = p_theme
   where id = (select auth.uid());
end;
$$;

revoke all on function public.set_theme(text) from public, anon;
grant execute on function public.set_theme(text) to authenticated;

-- 2.11 Demo data for local development. Runs after migrations on `supabase db reset`.
--
-- Six accounts, all with the password "password123" (local only, never seed a
-- hosted project with this file):
--   ana, ben, cara, dev, eli, fay      sign in as the username
--
-- Capstone Crew (join code CAPSTONE): ana leads, ben, cara, dev are active,
--   eli left. Tasks are in every state: to do, in progress, done, blocked by an
--   open question, overdue, owned by the former member, and one deleted.
-- Robotics Club (join code ROBOTICS): fay leads, ana and ben are members.
--
-- Everything goes through the real functions, so memberships, task numbers,
-- question counts and the log all agree with what the app would have written.

do $$
declare
  v_names text[] := array['ana', 'ben', 'cara', 'dev', 'eli', 'fay'];
  v_name text;
  v_id uuid;
  u jsonb := '{}'::jsonb;   -- username -> user id
  m jsonb := '{}'::jsonb;   -- username -> membership id in Capstone Crew
  g1 uuid;
  g2 uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid;
  v_thread uuid;
  v_dummy record;
begin
  -- Accounts (the profile row comes from the auth.users trigger).
  foreach v_name in array v_names loop
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_name || '@users.taskahan.pages.dev',
      extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_name || '@users.taskahan.pages.dev',
                         'email_verified', true),
      'email', now(), now(), now()
    );
    u := u || jsonb_build_object(v_name, v_id);
  end loop;

  -- ana creates Capstone Crew; the others join with the code.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ana', 'role', 'authenticated')::text, true);
  g1 := public.create_group('Capstone Crew', 'student_project', null, 8, 'CAPSTONE');
  foreach v_name in array array['ben', 'cara', 'dev', 'eli'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u->>v_name, 'role', 'authenticated')::text, true);
    perform public.join_group('CAPSTONE');
  end loop;

  select jsonb_object_agg(p.username, mm.id) into m
    from public.memberships mm join public.profiles p on p.id = mm.user_id
   where mm.group_id = g1;

  -- Tasks, created by the leader.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ana', 'role', 'authenticated')::text, true);
  t1 := (public.create_task(g1, 'Draft the problem statement', 'One page: who has the problem, why now.', (m->>'ben')::uuid, now() - interval '6 days')).id;
  t2 := (public.create_task(g1, 'Survey ten students', E'Short form, five questions.\nShare results in chat.', (m->>'cara')::uuid, now() + interval '3 days')).id;
  t3 := (public.create_task(g1, 'Wireframe the dashboard', '', (m->>'dev')::uuid, now() + interval '9 days')).id;
  t4 := (public.create_task(g1, 'Set up the repository', 'Branch rules and CI.', (m->>'dev')::uuid, null)).id;
  t5 := (public.create_task(g1, 'Book the demo room', '', (m->>'ben')::uuid, now() - interval '1 day')).id;
  t6 := (public.create_task(g1, 'Collect consent forms', 'Needed before the survey goes out.', (m->>'eli')::uuid, now() + interval '2 days')).id;
  t7 := (public.create_task(g1, 'Interview the faculty adviser', '', (m->>'eli')::uuid, null)).id;
  t8 := (public.create_task(g1, 'Order stickers', 'Cancelled, kept for the record.', (m->>'ana')::uuid, null)).id;
  perform public.delete_task(t8);

  -- Statuses move by the assignee, or by the leader.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ben', 'role', 'authenticated')::text, true);
  perform public.set_task_status(t1, 'done');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'cara', 'role', 'authenticated')::text, true);
  perform public.set_task_status(t2, 'in_progress');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'dev', 'role', 'authenticated')::text, true);
  perform public.set_task_status(t3, 'in_progress');
  perform public.set_task_status(t4, 'done');

  -- dev is blocked on a question; cara's question is already settled.
  v_thread := (public.open_question(t3, 'Which charts does the adviser want to see first?')).id;
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ana', 'role', 'authenticated')::text, true);
  perform public.reply_to_question(v_thread, 'Progress by person, then by week. I will confirm on Friday.');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'cara', 'role', 'authenticated')::text, true);
  v_thread := (public.open_question(t2, 'Can we survey the other section too?')).id;
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ana', 'role', 'authenticated')::text, true);
  perform public.reply_to_question(v_thread, 'Yes, go ahead.');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'cara', 'role', 'authenticated')::text, true);
  perform public.set_question_resolved(v_thread, true);

  -- Chat.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ana', 'role', 'authenticated')::text, true);
  perform public.send_message(g1, 'Welcome to the crew. Tasks are on the board.');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'ben', 'role', 'authenticated')::text, true);
  perform public.send_message(g1, 'Problem statement is done, please read it.');
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'cara', 'role', 'authenticated')::text, true);
  perform public.send_message(g1, 'Survey link goes out tomorrow.');

  -- eli leaves, with two tasks still on their name to take over.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'eli', 'role', 'authenticated')::text, true);
  perform public.leave_group(g1);

  -- Robotics Club: fay leads, ana and ben are members.
  perform set_config('request.jwt.claims', json_build_object('sub', u->>'fay', 'role', 'authenticated')::text, true);
  g2 := public.create_group('Robotics Club', 'club_org', null, 20, 'ROBOTICS');
  foreach v_name in array array['ana', 'ben'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u->>v_name, 'role', 'authenticated')::text, true);
    perform public.join_group('ROBOTICS');
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', u->>'fay', 'role', 'authenticated')::text, true);
  select jsonb_object_agg(p.username, mm.id) into m
    from public.memberships mm join public.profiles p on p.id = mm.user_id
   where mm.group_id = g2;
  v_dummy := public.create_task(g2, 'Order servo motors', 'Twelve, with spares.', (m->>'ana')::uuid, now() + interval '5 days');
  v_dummy := public.create_task(g2, 'Print the chassis', '', (m->>'ben')::uuid, now() + interval '12 days');
  perform public.send_message(g2, 'First meeting is Thursday.');

  perform set_config('request.jwt.claims', null, true);
end;
$$;

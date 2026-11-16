-- 2.1 Enums and the group-scoped tables, with their constraints and indexes.
-- See ARCHITECTURE.md sections 2 and 3, SECURITY.md sections 3 and 5.
--
-- Read policies arrive in 2.2. Until then every table has row level security
-- enabled and no policy, so nothing is readable by clients. No table gets an
-- insert, update or delete grant for anon or authenticated: writes go through
-- security definer functions only.

-- New functions in private are not callable by default.
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.group_purpose as enum ('student_project', 'work_team', 'club_org', 'other');
create type public.member_role as enum ('leader', 'member');
create type public.member_status as enum ('active', 'former');
create type public.leave_reason as enum ('left', 'removed', 'account_deleted');
create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.thread_status as enum ('open', 'resolved');
create type public.log_action as enum (
  'group_created',
  'member_joined',
  'member_left',
  'member_removed',
  'leadership_transferred',
  'leadership_auto_transferred',
  'join_code_changed',
  'task_created',
  'task_edited',
  'task_reassigned',
  'task_deleted',
  'status_changed',
  'tasks_taken_over',
  'question_asked',
  'question_replied',
  'question_resolved',
  'question_reopened',
  'account_deleted'
);

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint groups_name_length check (char_length(name) between 1 and 40),
  purpose public.group_purpose not null,
  purpose_note text
    constraint groups_purpose_note_length check (char_length(purpose_note) between 1 and 40),
  member_limit int not null
    constraint groups_member_limit_range check (member_limit between 2 and 30),
  join_code char(8) not null
    constraint groups_join_code_key unique
    constraint groups_join_code_format check (join_code ~ '^[A-Z]{8}$'),
  next_task_number int not null default 1
    constraint groups_next_task_number_positive check (next_task_number >= 1),
  next_seat int not null default 1
    constraint groups_next_seat_positive check (next_seat >= 1),
  created_at timestamptz not null default now(),
  -- The note only describes "other".
  constraint groups_purpose_note_only_other check (purpose = 'other' or purpose_note is null)
);

-- ---------------------------------------------------------------------------
-- memberships: the durable identity everything else points at
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  display_name text not null
    constraint memberships_display_name_length check (char_length(display_name) between 1 and 20),
  seat int not null
    constraint memberships_seat_positive check (seat >= 1),
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason public.leave_reason,
  -- Target for same-group foreign keys from the other tables.
  constraint memberships_id_group_key unique (id, group_id),
  constraint memberships_seat_key unique (group_id, seat),
  -- A former membership is always a plain member.
  constraint memberships_former_is_member check (status = 'active' or role = 'member'),
  -- An active seat always belongs to an account. Accounts are released
  -- (memberships flipped to former) before they are deleted.
  constraint memberships_active_has_user check (status = 'former' or user_id is not null),
  constraint memberships_left_fields check (
    (status = 'active' and left_at is null and left_reason is null)
    or (status = 'former' and left_at is not null and left_reason is not null)
  )
);

-- One active seat per account per group.
create unique index memberships_one_active_seat
  on public.memberships (group_id, user_id) where status = 'active';
-- Exactly one active leader per group.
create unique index memberships_one_leader
  on public.memberships (group_id) where role = 'leader' and status = 'active';
-- "My groups", the per-account group cap, and the on delete set null cascade.
create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- group_blocks: accounts a leader removed, so they cannot rejoin with the code
-- ---------------------------------------------------------------------------

create table public.group_blocks (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_blocks_user_id_idx on public.group_blocks (user_id);

-- ---------------------------------------------------------------------------
-- tasks (soft delete only)
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  number int not null
    constraint tasks_number_positive check (number >= 1),
  title text not null
    constraint tasks_title_length check (char_length(title) between 1 and 120),
  details text not null default ''
    constraint tasks_details_length check (char_length(details) <= 2000),
  assignee_id uuid not null,
  status public.task_status not null default 'todo',
  open_questions int not null default 0
    constraint tasks_open_questions_nonnegative check (open_questions >= 0),
  deadline timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint tasks_number_key unique (group_id, number),
  constraint tasks_id_group_key unique (id, group_id),
  -- Assignee and creator must be seats in the same group.
  constraint tasks_assignee_fkey foreign key (assignee_id, group_id)
    references public.memberships (id, group_id),
  constraint tasks_created_by_fkey foreign key (created_by, group_id)
    references public.memberships (id, group_id),
  constraint tasks_completed_at_matches_status check ((status = 'done') = (completed_at is not null))
);

create index tasks_group_live_idx on public.tasks (group_id) where deleted_at is null;
create index tasks_assignee_idx on public.tasks (assignee_id) where deleted_at is null;
create index tasks_created_by_idx on public.tasks (created_by);

-- ---------------------------------------------------------------------------
-- threads and thread_replies: questions on a task
-- ---------------------------------------------------------------------------

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  task_id uuid not null,
  opened_by uuid not null,
  body text not null
    constraint threads_body_length check (char_length(body) between 1 and 1000),
  status public.thread_status not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint threads_id_group_key unique (id, group_id),
  constraint threads_task_fkey foreign key (task_id, group_id)
    references public.tasks (id, group_id),
  constraint threads_opened_by_fkey foreign key (opened_by, group_id)
    references public.memberships (id, group_id),
  constraint threads_resolved_by_fkey foreign key (resolved_by, group_id)
    references public.memberships (id, group_id),
  constraint threads_resolved_fields check (
    (status = 'open' and resolved_by is null and resolved_at is null)
    or (status = 'resolved' and resolved_by is not null and resolved_at is not null)
  )
);

create index threads_task_idx on public.threads (task_id);
create index threads_group_idx on public.threads (group_id);
create index threads_opened_by_idx on public.threads (opened_by);
create index threads_resolved_by_idx on public.threads (resolved_by);

create table public.thread_replies (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  thread_id uuid not null,
  author_id uuid not null,
  body text not null
    constraint thread_replies_body_length check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint thread_replies_thread_fkey foreign key (thread_id, group_id)
    references public.threads (id, group_id),
  constraint thread_replies_author_fkey foreign key (author_id, group_id)
    references public.memberships (id, group_id)
);

create index thread_replies_thread_idx on public.thread_replies (thread_id, created_at);
create index thread_replies_group_idx on public.thread_replies (group_id);
create index thread_replies_author_idx on public.thread_replies (author_id);

-- ---------------------------------------------------------------------------
-- messages: group chat, no edits or deletes in v1
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null,
  body text not null
    constraint messages_body_length check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint messages_author_fkey foreign key (author_id, group_id)
    references public.memberships (id, group_id)
);

-- Latest 50, then page backward.
create index messages_group_created_idx on public.messages (group_id, created_at desc, id desc);
create index messages_author_idx on public.messages (author_id);

-- ---------------------------------------------------------------------------
-- logs: append-only (guard trigger in 2.3)
-- ---------------------------------------------------------------------------

create table public.logs (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Null for system actions such as the 30-day purge.
  actor_id uuid,
  action public.log_action not null,
  task_id uuid,
  target_member_id uuid,
  meta jsonb not null default '{}'::jsonb
    constraint logs_meta_object check (jsonb_typeof(meta) = 'object'),
  created_at timestamptz not null default now(),
  constraint logs_actor_fkey foreign key (actor_id, group_id)
    references public.memberships (id, group_id),
  constraint logs_task_fkey foreign key (task_id, group_id)
    references public.tasks (id, group_id),
  constraint logs_target_member_fkey foreign key (target_member_id, group_id)
    references public.memberships (id, group_id)
);

create index logs_group_created_idx on public.logs (group_id, created_at desc, id desc);
create index logs_actor_idx on public.logs (actor_id);
create index logs_task_idx on public.logs (task_id);
create index logs_target_member_idx on public.logs (target_member_id);

-- ---------------------------------------------------------------------------
-- rate_limits: one fixed window per account and bucket (helper in 2.4)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null
    constraint rate_limits_bucket_format check (bucket ~ '^[a-z_]{1,40}$'),
  window_start timestamptz not null default now(),
  count int not null default 0
    constraint rate_limits_count_nonnegative check (count >= 0),
  primary key (user_id, bucket)
);

-- ---------------------------------------------------------------------------
-- Row level security on, no client writes
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.group_blocks enable row level security;
alter table public.tasks enable row level security;
alter table public.threads enable row level security;
alter table public.thread_replies enable row level security;
alter table public.messages enable row level security;
alter table public.logs enable row level security;
alter table public.rate_limits enable row level security;

revoke all on table
  public.groups, public.memberships, public.group_blocks, public.tasks, public.threads,
  public.thread_replies, public.messages, public.logs, public.rate_limits
  from anon, authenticated;

-- Clients read these under the policies added in 2.2.
-- group_blocks and rate_limits stay unreadable: functions only.
grant select on table
  public.groups, public.memberships, public.tasks, public.threads,
  public.thread_replies, public.messages, public.logs
  to authenticated;

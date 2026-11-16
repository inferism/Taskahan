import type { Board, Member, Task } from './api'

/**
 * Capstone Crew from supabase/seed.sql, as get_group_snapshot returns it to ana (the leader).
 * Deadlines are relative to SEED_NOW, the moment the seed ran. Ids are shortened for reading.
 */
export const SEED_NOW = new Date('2026-11-16T10:39:38Z')

const at = (days: number) => new Date(SEED_NOW.getTime() + days * 86_400_000).toISOString()
const now = SEED_NOW.toISOString()

const member = (id: string, seat: number, extra: Partial<Member> = {}): Member => ({
  id,
  user_id: `u-${id}`,
  display_name: id,
  seat,
  role: 'member',
  status: 'active',
  joined_at: now,
  left_at: null,
  left_reason: null,
  avatar_path: null,
  ...extra,
})

const task = (
  number: number,
  title: string,
  assignee: string,
  status: Task['status'],
  deadline: string | null,
  open_questions = 0,
): Task => ({
  id: `t${number}`,
  number,
  title,
  details: '',
  assignee_id: assignee,
  status,
  open_questions,
  deadline,
  created_by: 'ana',
  created_at: now,
  updated_at: now,
  completed_at: status === 'done' ? now : null,
})

export const seedBoard: Board = {
  group: {
    id: 'capstone',
    name: 'Capstone Crew',
    purpose: 'student_project',
    purpose_note: null,
    member_limit: 8,
    join_code: 'CAPSTONE',
    created_at: now,
  },
  me: 'ana',
  memberships: [
    member('ana', 1, { role: 'leader' }),
    member('ben', 2),
    member('cara', 3),
    member('dev', 4),
    member('eli', 5, { status: 'former', left_at: now, left_reason: 'left' }),
  ],
  tasks: [
    task(1, 'Draft the problem statement', 'ben', 'done', at(-6)),
    task(2, 'Survey ten students', 'cara', 'in_progress', at(3)),
    task(3, 'Wireframe the dashboard', 'dev', 'in_progress', at(9), 1),
    task(4, 'Set up the repository', 'dev', 'done', null),
    task(5, 'Book the demo room', 'ben', 'todo', at(-1)),
    task(6, 'Collect consent forms', 'eli', 'todo', at(2)),
    task(7, 'Interview the faculty adviser', 'eli', 'todo', null),
  ],
}

/** The same board as seen by ben, a plain member. */
export const seedBoardAsBen: Board = { ...seedBoard, me: 'ben' }

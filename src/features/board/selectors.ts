import type { TaskStatus } from '@/ui'
import type { Board, Member, Task } from './api'

/** Blocked is derived, never stored: an open question on a task that is not done. */
export function isBlocked(task: Task): boolean {
  return task.open_questions > 0 && task.status !== 'done'
}

/** The status a row shows, with Blocked on top of the stored status. */
export function shownStatus(task: Task): TaskStatus {
  return isBlocked(task) ? 'blocked' : task.status
}

export function myMember(board: Board): Member | undefined {
  return board.memberships.find((m) => m.id === board.me)
}

export function amLeader(board: Board): boolean {
  return myMember(board)?.role === 'leader'
}

/** Column order: your own column, then active members by seat, then former members by seat. */
export function columnMembers(board: Board): Member[] {
  const bySeat = [...board.memberships].sort((a, b) => a.seat - b.seat)
  const mine = bySeat.filter((m) => m.id === board.me)
  const active = bySeat.filter((m) => m.id !== board.me && m.status === 'active')
  const former = bySeat.filter((m) => m.id !== board.me && m.status === 'former')
  return [...mine, ...active, ...former]
}

/** Every member's tasks by number. Every member has an entry, even with no tasks. */
export function tasksByMember(board: Board): Map<string, Task[]> {
  const out = new Map<string, Task[]>(board.memberships.map((m) => [m.id, []]))
  for (const t of [...board.tasks].sort((a, b) => a.number - b.number)) {
    const list = out.get(t.assignee_id)
    if (list) list.push(t)
    else out.set(t.assignee_id, [t])
  }
  return out
}

export interface Progress {
  total: number
  done: number
  inProgress: number
  todo: number
  /** An indicator on top of the three segments, not a fourth segment. */
  blocked: number
}

/** Done, In progress and To do add up to total; Blocked is counted separately. */
export function progressOf(tasks: Task[]): Progress {
  const p: Progress = { total: tasks.length, done: 0, inProgress: 0, todo: 0, blocked: 0 }
  for (const t of tasks) {
    if (t.status === 'done') p.done++
    else if (t.status === 'in_progress') p.inProgress++
    else p.todo++
    if (isBlocked(t)) p.blocked++
  }
  return p
}

/** "4 of 6 completed", or "No tasks yet". */
export function progressText(p: Progress): string {
  return p.total === 0 ? 'No tasks yet' : `${p.done} of ${p.total} completed`
}

export type DeadlineGroup = 'overdue' | 'today' | 'this_week' | 'later' | 'none' | 'done'

export const deadlineGroupOrder: DeadlineGroup[] = [
  'overdue',
  'today',
  'this_week',
  'later',
  'none',
  'done',
]

export const deadlineGroupLabel: Record<DeadlineGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  this_week: 'This week',
  later: 'Later',
  none: 'No deadline',
  done: 'Done',
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/**
 * Where a task sits in its column, in the viewer's local time. Overdue is past its deadline;
 * Today is the rest of today; This week is the next six days after today; Later is beyond.
 */
export function deadlineGroup(task: Task, now: Date): DeadlineGroup {
  if (task.status === 'done') return 'done'
  if (!task.deadline) return 'none'
  const due = new Date(task.deadline)
  if (due < now) return 'overdue'
  const today = startOfDay(now)
  if (due < addDays(today, 1)) return 'today'
  if (due < addDays(today, 7)) return 'this_week'
  return 'later'
}

export interface DeadlineSection {
  group: DeadlineGroup
  label: string
  tasks: Task[]
}

/**
 * A column's tasks under their deadline headings, empty headings left out. Open tasks run by
 * deadline then number; Done runs most recently completed first.
 */
export function deadlineSections(tasks: Task[], now: Date): DeadlineSection[] {
  const buckets = new Map<DeadlineGroup, Task[]>()
  for (const t of tasks) {
    const g = deadlineGroup(t, now)
    buckets.set(g, [...(buckets.get(g) ?? []), t])
  }
  return deadlineGroupOrder
    .filter((g) => buckets.has(g))
    .map((g) => {
      const list = [...buckets.get(g)!]
      list.sort(
        g === 'done'
          ? (a, b) =>
              (b.completed_at ?? '').localeCompare(a.completed_at ?? '') || a.number - b.number
          : (a, b) =>
              (a.deadline ? Date.parse(a.deadline) : Infinity) -
                (b.deadline ? Date.parse(b.deadline) : Infinity) || a.number - b.number,
      )
      return { group: g, label: deadlineGroupLabel[g], tasks: list }
    })
}

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const shortDayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export interface TaskLabel {
  text: string
  /** Overdue and blocked read in the blocked colour. */
  alert: boolean
}

/** The one label line under a task row: blocked, done, or the deadline. */
export function taskLabel(task: Task, now: Date): TaskLabel | null {
  if (isBlocked(task)) {
    const n = task.open_questions
    return { text: `Blocked · ${n} open question${n === 1 ? '' : 's'}`, alert: true }
  }
  if (task.status === 'done') {
    return task.completed_at
      ? { text: `Done ${shortDayFormat.format(new Date(task.completed_at))}`, alert: false }
      : { text: 'Done', alert: false }
  }
  if (!task.deadline) return null
  const due = new Date(task.deadline)
  const group = deadlineGroup(task, now)
  if (group === 'overdue') {
    const days = Math.round((startOfDay(now).getTime() - startOfDay(due).getTime()) / 86_400_000)
    return {
      text: days >= 1 ? `Overdue by ${days} day${days === 1 ? '' : 's'}` : 'Overdue today',
      alert: true,
    }
  }
  if (group === 'today') return { text: `Due today, ${timeFormat.format(due)}`, alert: false }
  return { text: `Due ${dayFormat.format(due)}`, alert: false }
}

/** Only the assignee and the leader can change a task's status. */
export function canSetStatus(board: Board, task: Task): boolean {
  return task.assignee_id === board.me || amLeader(board)
}

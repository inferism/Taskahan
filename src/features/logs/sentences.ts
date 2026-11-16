import type { Board } from '@/features/board/api'
import { memberName, membersById } from '@/features/board/names'
import type { Database } from '@/lib/database.types'

export type LogAction = Database['public']['Enums']['log_action']

export interface LogEntry {
  id: number
  actor_id: string | null
  action: LogAction
  task_id: string | null
  target_member_id: string | null
  meta: Record<string, unknown>
  created_at: string
}

const statusWord: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

/** "#1", "#1 and #2", "#1, #2 and #3". The numbers become task links where the sentence is shown. */
function numberList(numbers: unknown): string {
  const list = (Array.isArray(numbers) ? numbers : []).map((n) => `#${String(n)}`)
  if (list.length <= 1) return list[0] ?? 'no tasks'
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** "title, details and deadline" from the field names the edit recorded. */
function fieldList(fields: unknown): string {
  const list = (Array.isArray(fields) ? fields : []).map(String)
  if (list.length <= 1) return list[0] ?? 'it'
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * One readable sentence per log row ("Kim took over #13 and #16 from #Renz"). Every action in
 * ARCHITECTURE.md section 3 has a case; the Record type makes a new action a compile error here.
 * Task numbers appear as "#12" so the caller can turn them into links.
 */
export function logSentence(entry: LogEntry, board: Board): string {
  const byId = membersById(board)
  const name = (id: string | null) => (id ? memberName(byId.get(id)) : 'Someone')
  const actor = entry.actor_id ? name(entry.actor_id) : 'Taskahan'
  const target = name(entry.target_member_id)
  const m = entry.meta
  const task = m.number !== undefined ? `#${String(m.number)}` : 'a task'
  const titled = typeof m.title === 'string' && m.title ? ` “${m.title}”` : ''

  const sentences: Record<LogAction, () => string> = {
    group_created: () =>
      `${actor} created the group${typeof m.name === 'string' ? ` “${m.name}”` : ''}`,
    member_joined: () => `${target === 'Someone' ? actor : target} joined the group`,
    member_left: () => `${target === 'Someone' ? actor : target} left the group`,
    member_removed: () => `${actor} removed ${target} from the group`,
    leadership_transferred: () => `${actor} made ${target} the leader`,
    leadership_auto_transferred: () =>
      `${target} became the leader because the previous leader's account was deleted`,
    join_code_changed: () => `${actor} changed the join code`,
    task_created: () => `${actor} added ${task}${titled} for ${target}`,
    task_edited: () => `${actor} edited ${task} (${fieldList(m.fields)})`,
    task_reassigned: () =>
      `${actor} moved ${task} from ${name(typeof m.from === 'string' ? m.from : null)} to ${target}`,
    task_deleted: () => `${actor} deleted ${task}${titled}`,
    status_changed: () =>
      `${actor} moved ${task} from ${statusWord[String(m.from)] ?? String(m.from)} to ${statusWord[String(m.to)] ?? String(m.to)}`,
    tasks_taken_over: () => `${actor} took over ${numberList(m.numbers)} from ${target}`,
    question_asked: () => `${actor} asked a question on ${task}`,
    question_replied: () => `${actor} replied to the question on ${task}`,
    question_resolved: () => `${actor} resolved the question on ${task}`,
    question_reopened: () => `${actor} reopened the question on ${task}`,
    account_deleted: () => `${actor} deleted their account`,
  }
  return sentences[entry.action]()
}

/** Labels for the action filter, in the order ARCHITECTURE.md lists them. */
export const actionLabels: Record<LogAction, string> = {
  group_created: 'Group created',
  member_joined: 'Member joined',
  member_left: 'Member left',
  member_removed: 'Member removed',
  leadership_transferred: 'Leadership transferred',
  leadership_auto_transferred: 'Leadership passed automatically',
  join_code_changed: 'Join code changed',
  task_created: 'Task added',
  task_edited: 'Task edited',
  task_reassigned: 'Task reassigned',
  task_deleted: 'Task deleted',
  status_changed: 'Status changed',
  tasks_taken_over: 'Tasks taken over',
  question_asked: 'Question asked',
  question_replied: 'Question replied to',
  question_resolved: 'Question resolved',
  question_reopened: 'Question reopened',
  account_deleted: 'Account deleted',
}

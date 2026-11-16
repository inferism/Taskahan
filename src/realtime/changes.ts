import {
  upsertMember,
  upsertTask,
  type Board,
  type BoardGroup,
  type Member,
  type Task,
} from '@/features/board/api'

/**
 * Pure mapping from a postgres change row to a board cache patch (ARCHITECTURE.md section 6).
 * Rows arrive as the table stores them, so each patch picks the fields the snapshot carries and
 * drops the rest (group_id, internal counters). Events are hints: the snapshot refetch after any
 * (re)subscribe is what makes the cache right.
 */

type Row = Record<string, unknown>

const taskFields = [
  'id',
  'number',
  'title',
  'details',
  'assignee_id',
  'status',
  'open_questions',
  'deadline',
  'created_by',
  'created_at',
  'updated_at',
  'completed_at',
] as const satisfies readonly (keyof Task)[]

const memberFields = [
  'id',
  'user_id',
  'display_name',
  'seat',
  'role',
  'status',
  'joined_at',
  'left_at',
  'left_reason',
] as const satisfies readonly (keyof Member)[]

const groupFields = [
  'id',
  'name',
  'purpose',
  'purpose_note',
  'member_limit',
  'join_code',
  'created_at',
] as const satisfies readonly (keyof BoardGroup)[]

function pick<K extends string>(row: Row, keys: readonly K[]): Record<K, unknown> {
  return Object.fromEntries(keys.map((k) => [k, row[k]])) as Record<K, unknown>
}

/** A task insert or update. upsertTask ignores a row older than the cached one; a soft delete removes it. */
export function applyTaskRow(board: Board, row: Row): Board {
  const task = pick(row, taskFields) as unknown as Task
  return upsertTask(board, { ...task, deleted_at: (row.deleted_at as string | null) ?? null })
}

/**
 * A membership insert or update. The row has no avatar, so a known seat keeps the one it had
 * while active and a new seat starts without one until the next snapshot fills it in.
 */
export function applyMemberRow(board: Board, row: Row): Board {
  const member = pick(row, memberFields) as unknown as Omit<Member, 'avatar_path'>
  const cached = board.memberships.find((m) => m.id === member.id)
  const avatar_path = member.status === 'active' ? (cached?.avatar_path ?? null) : null
  return upsertMember(board, { ...member, avatar_path })
}

/** A group update: name, purpose, limit or join code. */
export function applyGroupRow(board: Board, row: Row): Board {
  if (row.id !== board.group.id) return board
  return { ...board, group: pick(row, groupFields) as unknown as BoardGroup }
}

/** True when the row is a new seat whose avatar the snapshot has to supply. */
export function needsSnapshot(board: Board, table: string, row: Row): boolean {
  return (
    table === 'memberships' &&
    row.status === 'active' &&
    !board.memberships.some((m) => m.id === row.id)
  )
}

import type { useQueryClient } from '@tanstack/react-query'
import { groupsKey } from '@/features/home/api'
import { boardKey, type Board } from '@/features/board/api'

/**
 * Patch the cached board right after a member action succeeds, so the screen changes at once;
 * the realtime events and the next snapshot confirm it. Home lists roles and member counts, so
 * it is marked stale too.
 */
export function patchBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
  patch: (board: Board) => Board,
) {
  queryClient.setQueryData<Board>(boardKey(groupId), (board) => board && patch(board))
  void queryClient.invalidateQueries({ queryKey: groupsKey })
}

/** A member removed: the seat turns former and loses its photo. */
export function withFormer(board: Board, memberId: string): Board {
  return {
    ...board,
    memberships: board.memberships.map((m) =>
      m.id === memberId
        ? {
            ...m,
            status: 'former',
            role: 'member',
            left_at: new Date().toISOString(),
            left_reason: 'removed',
            avatar_path: null,
          }
        : m,
    ),
  }
}

/** Leadership moved from one seat to another. */
export function withLeader(board: Board, toId: string): Board {
  return {
    ...board,
    memberships: board.memberships.map((m) =>
      m.id === toId ? { ...m, role: 'leader' } : m.role === 'leader' ? { ...m, role: 'member' } : m,
    ),
  }
}

/** Tasks moved to a new assignee. */
export function withAssignee(board: Board, taskIds: string[], assigneeId: string): Board {
  const moved = new Set(taskIds)
  return {
    ...board,
    tasks: board.tasks.map((t) => (moved.has(t.id) ? { ...t, assignee_id: assigneeId } : t)),
  }
}

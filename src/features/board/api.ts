import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { groupsKey } from '@/features/home/api'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/ui'
import type { Database } from '@/lib/database.types'

type Enums = Database['public']['Enums']
export type GroupPurpose = Enums['group_purpose']

/** One seat on the board. The durable identity: tasks and messages point here, not at accounts. */
export interface Member {
  id: string
  user_id: string | null
  display_name: string
  seat: number
  role: 'leader' | 'member'
  status: 'active' | 'former'
  joined_at: string
  left_at: string | null
  left_reason: 'left' | 'removed' | 'account_deleted' | null
  /** Set for active seats only. */
  avatar_path: string | null
}

export interface Task {
  id: string
  number: number
  title: string
  details: string
  assignee_id: string
  status: 'todo' | 'in_progress' | 'done'
  open_questions: number
  deadline: string | null
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface BoardGroup {
  id: string
  name: string
  purpose: GroupPurpose
  purpose_note: string | null
  member_limit: number
  join_code: string
  created_at: string
}

/**
 * The board cache, exactly as `get_group_snapshot` returns it: members by seat, live tasks by
 * number. Realtime events (5.2) and optimistic writes patch it with the helpers below; derived
 * views (columns, progress, deadline groups) come from `selectors.ts` and are never stored.
 */
export interface Board {
  group: BoardGroup
  /** The caller's own membership id. */
  me: string
  memberships: Member[]
  tasks: Task[]
}

export const boardKey = (groupId: string) => ['board', groupId] as const

export async function fetchBoard(groupId: string): Promise<Board> {
  const { data, error } = await supabase.rpc('get_group_snapshot', { p_group_id: groupId })
  if (error) throw error
  return data as unknown as Board
}

export function useBoard(groupId: string) {
  return useQuery({
    queryKey: boardKey(groupId),
    queryFn: () => fetchBoard(groupId),
    // A forbidden board will not become allowed by asking again.
    retry: (count, error) =>
      (error as { message?: string } | null)?.message !== 'forbidden' && count < 1,
  })
}

/** Insert or replace a task, keeping number order. A soft-deleted task leaves the board. */
export function upsertTask(board: Board, task: Task & { deleted_at?: string | null }): Board {
  const rest = board.tasks.filter((t) => t.id !== task.id)
  if (task.deleted_at) return { ...board, tasks: rest }
  const live: Task & { deleted_at?: string | null } = { ...task }
  delete live.deleted_at
  return { ...board, tasks: [...rest, live].sort((a, b) => a.number - b.number) }
}

/** Insert or replace a membership, keeping seat order. */
export function upsertMember(board: Board, member: Member): Board {
  const rest = board.memberships.filter((m) => m.id !== member.id)
  return { ...board, memberships: [...rest, member].sort((a, b) => a.seat - b.seat) }
}

/** Public URL of an avatar object. The bucket is public-read (ARCHITECTURE.md section 8). */
export function avatarUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/**
 * Cache patch for a task row the server just returned. Home's progress counts the same tasks,
 * so it is marked stale too.
 */
export function patchTask(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
  task: Task & { deleted_at?: string | null },
) {
  queryClient.setQueryData<Board>(boardKey(groupId), (board) => board && upsertTask(board, task))
  void queryClient.invalidateQueries({ queryKey: groupsKey })
}

/** Patch a task's status in place, as the optimistic write and its rollback both need. */
export function withStatus(board: Board, taskId: string, status: Task['status']): Board {
  return { ...board, tasks: board.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }
}

/**
 * Status change, applied to the cache before the server answers. A rejected write puts the
 * previous status back and says so in a toast; a good one replaces the guess with the real row.
 */
export function useSetTaskStatus(groupId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (v: { taskId: string; status: Task['status'] }) => {
      const { data, error } = await supabase.rpc('set_task_status', {
        p_task_id: v.taskId,
        p_status: v.status,
      })
      if (error) throw error
      return data as unknown as Task
    },
    onMutate: async (v) => {
      // A refetch landing now would overwrite the guess with the old status.
      await queryClient.cancelQueries({ queryKey: boardKey(groupId) })
      const previous = queryClient.getQueryData<Board>(boardKey(groupId))
      const was = previous?.tasks.find((t) => t.id === v.taskId)?.status
      if (previous)
        queryClient.setQueryData(boardKey(groupId), withStatus(previous, v.taskId, v.status))
      return { was }
    },
    onError: (_error, v, context) => {
      // Undo only this task: other events may have patched the board since.
      const board = queryClient.getQueryData<Board>(boardKey(groupId))
      if (board && context?.was)
        queryClient.setQueryData(boardKey(groupId), withStatus(board, v.taskId, context.was))
      toast('Could not change the status. It was put back.')
    },
    onSuccess: (task) => patchTask(queryClient, groupId, task),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

/** Cache patch for a task row the server just returned. */
export function patchTask(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
  task: Task & { deleted_at?: string | null },
) {
  queryClient.setQueryData<Board>(boardKey(groupId), (board) => board && upsertTask(board, task))
}

export function useSetTaskStatus(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { taskId: string; status: Task['status'] }) => {
      const { data, error } = await supabase.rpc('set_task_status', {
        p_task_id: v.taskId,
        p_status: v.status,
      })
      if (error) throw error
      return data as unknown as Task
    },
    onSuccess: (task) => patchTask(queryClient, groupId, task),
  })
}

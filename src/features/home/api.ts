import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { useAuth } from '@/app/auth'

export type GroupPurpose = Database['public']['Enums']['group_purpose']

export interface HomeGroup {
  id: string
  name: string
  purpose: GroupPurpose
  purposeNote: string | null
  role: 'leader' | 'member'
  memberCount: number
  done: number
  total: number
}

export const purposeLabels: Record<GroupPurpose, string> = {
  student_project: 'Student project',
  work_team: 'Work team',
  club_org: 'Club or org',
  other: 'Other',
}

export function purposeText(purpose: GroupPurpose, note: string | null): string {
  return purpose === 'other' && note ? note : purposeLabels[purpose]
}

export const groupsKey = ['groups'] as const

/** Rows per request. The API caps a response at 1000 rows, so a full read must page. */
export const TASK_PAGE = 1000

/**
 * Every live task in the caller's groups (up to 20 groups of 500), read page by page in a
 * stable order so no row is skipped or counted twice.
 */
async function fetchLiveTasks() {
  const rows: { group_id: string; status: string }[] = []
  for (let from = 0; ; from += TASK_PAGE) {
    const { data, error } = await supabase
      .from('tasks')
      .select('group_id, status')
      .is('deleted_at', null)
      .order('id')
      .range(from, from + TASK_PAGE - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if ((data ?? []).length < TASK_PAGE) return { data: rows, error: null }
  }
}

/** The groups the signed-in user is an active member of. RLS limits every query to them. */
async function fetchGroups(userId: string): Promise<HomeGroup[]> {
  const [groups, seats, tasks] = await Promise.all([
    supabase.from('groups').select('id, name, purpose, purpose_note, created_at'),
    supabase.from('memberships').select('group_id, user_id, role').eq('status', 'active'),
    fetchLiveTasks(),
  ])
  const failure = groups.error ?? seats.error ?? tasks.error
  if (failure) throw failure

  return [...(groups.data ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((g): HomeGroup => {
      const members = (seats.data ?? []).filter((m) => m.group_id === g.id)
      const mine = members.find((m) => m.user_id === userId)
      const own = (tasks.data ?? []).filter((t) => t.group_id === g.id)
      return {
        id: g.id,
        name: g.name,
        purpose: g.purpose,
        purposeNote: g.purpose_note,
        role: mine?.role ?? 'member',
        memberCount: members.length,
        done: own.filter((t) => t.status === 'done').length,
        total: own.length,
      }
    })
}

export function useGroups() {
  const userId = useAuth().session?.user.id
  return useQuery({
    queryKey: [...groupsKey, userId],
    queryFn: () => fetchGroups(userId!),
    enabled: Boolean(userId),
  })
}

/** Stable key Postgres raised, e.g. "join_code_taken", or undefined for anything else. */
export function errorKey(error: unknown): string | undefined {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : undefined
}

import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LogAction, LogEntry } from './sentences'

export const LOG_PAGE = 50

export interface LogFilters {
  /** Membership id of whoever did it. */
  member?: string
  action?: LogAction
}

export const logsKey = (groupId: string, filters: LogFilters) =>
  ['logs', groupId, filters.member ?? null, filters.action ?? null] as const

/**
 * The group's log, newest first, a page at a time. Only the current leader can read it: for anyone
 * else the database returns no rows (SECURITY.md section 5). Logs are not on the realtime channel,
 * so the open pane polls.
 */
export function useLogs(groupId: string, filters: LogFilters) {
  return useInfiniteQuery({
    queryKey: logsKey(groupId, filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('logs')
        .select('id, actor_id, action, task_id, target_member_id, meta, created_at')
        .eq('group_id', groupId)
      if (filters.member) query = query.eq('actor_id', filters.member)
      if (filters.action) query = query.eq('action', filters.action)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + LOG_PAGE - 1)
      if (error) throw error
      return (data ?? []) as unknown as LogEntry[]
    },
    getNextPageParam: (last, all) => (last.length < LOG_PAGE ? undefined : all.length * LOG_PAGE),
    staleTime: 0,
    refetchInterval: 15_000,
  })
}

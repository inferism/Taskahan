import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { boardKey, type Board } from '@/features/board/api'
import { supabase } from '@/lib/supabase'
import { applyGroupRow, applyMemberRow, applyTaskRow, needsSnapshot } from './changes'

/**
 * Channel manager for one open group (ARCHITECTURE.md section 6, SECURITY.md section 11).
 *
 * The board joins the private channel `group:{id}`; the database refuses anyone who is not an
 * active member of that group. Every postgres change on the group's rows patches the TanStack
 * Query cache. Each time the change stream (re)starts, including the first time, the snapshot is
 * refetched, because events sent while the client was away or not yet joined are gone.
 *
 * Channels are shared and counted, so React's double mount in development, or a second hook on
 * the same group, reuse one subscription instead of fighting over the topic.
 */

/** Caches that the chat and thread views keep; a change there refetches them. */
export const messagesKey = (groupId: string) => ['messages', groupId] as const
export const threadsKey = (groupId: string) => ['threads', groupId] as const

type Table = 'tasks' | 'memberships' | 'groups' | 'threads' | 'thread_replies' | 'messages'
type Row = Record<string, unknown>

/** Apply one change event to the caches. Exported for tests. */
export function applyChange(queryClient: QueryClient, groupId: string, table: Table, row: Row) {
  switch (table) {
    case 'tasks':
    case 'memberships':
    case 'groups': {
      const board = queryClient.getQueryData<Board>(boardKey(groupId))
      if (!board) return
      const patch =
        table === 'tasks' ? applyTaskRow : table === 'memberships' ? applyMemberRow : applyGroupRow
      queryClient.setQueryData<Board>(boardKey(groupId), patch(board, row))
      if (needsSnapshot(board, table, row))
        void queryClient.invalidateQueries({ queryKey: boardKey(groupId) })
      return
    }
    case 'messages':
      void queryClient.invalidateQueries({ queryKey: messagesKey(groupId) })
      return
    case 'threads':
    case 'thread_replies':
      void queryClient.invalidateQueries({ queryKey: threadsKey(groupId) })
      return
  }
}

/** After a (re)subscribe: everything may have changed while no events arrived. */
export function refetchGroup(queryClient: QueryClient, groupId: string) {
  for (const queryKey of [boardKey(groupId), messagesKey(groupId), threadsKey(groupId)])
    void queryClient.invalidateQueries({ queryKey })
}

const tables: Table[] = ['tasks', 'memberships', 'threads', 'thread_replies', 'messages']

function openChannel(queryClient: QueryClient, groupId: string): RealtimeChannel {
  const channel = supabase.channel(`group:${groupId}`, { config: { private: true } })
  const onChange = (table: Table) => (payload: RealtimePostgresChangesPayload<Row>) => {
    // Soft deletes only: a DELETE never carries a row worth applying.
    if (payload.eventType === 'DELETE') return
    applyChange(queryClient, groupId, table, payload.new)
  }
  for (const table of tables)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` },
      onChange(table),
    )
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
    onChange('groups'),
  )
  // Refetch once the change stream is live, not on SUBSCRIBED: after a rejoin the channel reports
  // SUBSCRIBED seconds before the server has resubscribed to PostgreSQL, and a write in that gap
  // would reach neither the event stream nor a snapshot fetched at SUBSCRIBED.
  channel.on('system', {}, (msg: { extension?: string; status?: string; message?: string }) => {
    if (msg.extension !== 'postgres_changes') return
    if (msg.status === 'ok') refetchGroup(queryClient, groupId)
    else console.warn('Realtime changes unavailable:', msg.message)
  })
  channel.subscribe()
  return channel
}

interface Entry {
  users: number
  /** Resolves to the channel once any earlier channel on this topic has finished leaving. */
  channel: Promise<RealtimeChannel>
}

const entries = new Map<string, Entry>()
/** Channels still leaving, by group. The client reuses a topic until the leave completes. */
const leaving = new Map<string, Promise<unknown>>()

/** Join the group's channel, or share the one already open. Returns the release function. */
export function acquireGroupChannel(queryClient: QueryClient, groupId: string): () => void {
  let entry = entries.get(groupId)
  if (!entry) {
    const prior = leaving.get(groupId) ?? Promise.resolve()
    entry = { users: 0, channel: prior.then(() => openChannel(queryClient, groupId)) }
    entries.set(groupId, entry)
  }
  entry.users++
  const mine = entry
  let released = false
  return () => {
    if (released) return
    released = true
    mine.users--
    // Wait a tick: a remount in the same tick picks the channel straight back up.
    setTimeout(() => {
      if (mine.users > 0 || entries.get(groupId) !== mine) return
      entries.delete(groupId)
      const done = mine.channel.then((channel) => supabase.removeChannel(channel))
      const settled = done
        .catch(() => undefined)
        .finally(() => {
          if (leaving.get(groupId) === settled) leaving.delete(groupId)
        })
      leaving.set(groupId, settled)
    }, 0)
  }
}

/** Keep the group's channel open while the calling component is mounted. */
export function useGroupChannel(groupId: string) {
  const queryClient = useQueryClient()
  useEffect(() => acquireGroupChannel(queryClient, groupId), [queryClient, groupId])
}

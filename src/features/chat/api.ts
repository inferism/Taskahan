import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { messagesKey } from '@/realtime/groupChannel'
import { useToast } from '@/ui'

export interface Message {
  id: string
  author_id: string
  body: string
  created_at: string
}

/** Cache id of a message the server has not confirmed yet. */
export const pendingId = (n: number) => `pending-${n}`
export const isPending = (m: Message) => m.id.startsWith('pending-')

let nextPending = 0

/** Oldest first, as the chat shows them. A confirmed row replaces its pending twin. */
export function confirmMessage(list: Message[], pending: string, real: Message): Message[] {
  // The change event may have delivered the real row already; never show it twice.
  const rest = list.filter((m) => m.id !== pending && m.id !== real.id)
  return mergeMessages(rest, [real])
}

/**
 * Send a chat message. It appears in the cache at once, marked pending, and is replaced by the
 * server's row when the write returns. A rejected write removes it and says so in a toast.
 */
export function useSendMessage(groupId: string, authorId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = messagesKey(groupId)
  return useMutation({
    mutationFn: async (v: { body: string; pending: string }) => {
      const { data, error } = await supabase.rpc('send_message', {
        p_group_id: groupId,
        p_body: v.body,
      })
      if (error) throw error
      return data as unknown as Message
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key })
      const guess: Message = {
        id: v.pending,
        author_id: authorId,
        body: v.body,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<Message[]>(key, (list) => [...(list ?? []), guess])
    },
    onError: (_error, v) => {
      queryClient.setQueryData<Message[]>(key, (list) => list?.filter((m) => m.id !== v.pending))
      toast('Message not sent. It was taken back out of the chat.')
    },
    onSuccess: (real, v) =>
      queryClient.setQueryData<Message[]>(key, (list) =>
        confirmMessage(list ?? [], v.pending, real),
      ),
  })
}

/** Call `send` with the text; the pending id is made here so callers cannot reuse one. */
export function newPending() {
  return pendingId(nextPending++)
}

/** Chat loads the newest page first and pages backward from there. */
export const PAGE_SIZE = 50

/** Oldest first, one row per id; a later list wins for the same id. */
export function mergeMessages(...lists: Message[][]): Message[] {
  const byId = new Map<string, Message>()
  for (const list of lists) for (const m of list) byId.set(m.id, m)
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
}

/**
 * The newest page of the group's chat, merged into what is already cached. A change event or a
 * reconnect refetches this key; the merge keeps the older pages the member scrolled back to and
 * any message still waiting for the server's answer.
 */
export function useMessages(groupId: string) {
  const queryClient = useQueryClient()
  const key = messagesKey(groupId)
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, author_id, body, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, PAGE_SIZE - 1)
      if (error) throw error
      const cached = queryClient.getQueryData<Message[]>(key) ?? []
      return mergeMessages(cached, (data ?? []) as Message[])
    },
  })
}

/** The page of messages just before `oldest`. Fewer than PAGE_SIZE rows means the start of the chat. */
export async function fetchOlderMessages(groupId: string, oldest: Message): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, author_id, body, created_at')
    .eq('group_id', groupId)
    .or(
      `created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`,
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (error) throw error
  return (data ?? []) as Message[]
}

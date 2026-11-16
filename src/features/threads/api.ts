import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { boardKey } from '@/features/board/api'
import { errorKey } from '@/features/home/api'
import { supabase } from '@/lib/supabase'
import { threadsKey } from '@/realtime/groupChannel'

export interface Reply {
  id: string
  thread_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Thread {
  id: string
  task_id: string
  opened_by: string
  body: string
  status: 'open' | 'resolved'
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  replies: Reply[]
}

const byTime = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at.localeCompare(b.created_at)

/** Nest replies under their thread, both oldest first. */
export function buildThreads(threads: Omit<Thread, 'replies'>[], replies: Reply[]): Thread[] {
  return [...threads].sort(byTime).map((t) => ({
    ...t,
    replies: replies.filter((r) => r.thread_id === t.id).sort(byTime),
  }))
}

/** Every thread and reply of the group, kept fresh by the channel (changes refetch this key). */
export function useThreads(groupId: string) {
  return useQuery({
    queryKey: threadsKey(groupId),
    queryFn: async () => {
      const [threads, replies] = await Promise.all([
        supabase.from('threads').select('*').eq('group_id', groupId).order('created_at'),
        supabase.from('thread_replies').select('*').eq('group_id', groupId).order('created_at'),
      ])
      if (threads.error) throw threads.error
      if (replies.error) throw replies.error
      return buildThreads(
        (threads.data ?? []) as unknown as Omit<Thread, 'replies'>[],
        (replies.data ?? []) as unknown as Reply[],
      )
    },
  })
}

export function questionError(error: unknown): string {
  switch (errorKey(error)) {
    case 'forbidden':
      return 'You cannot do that on this task.'
    case 'rate_limited':
      return 'Too many questions and replies just now. Wait a minute and try again.'
    case 'invalid_input':
      return 'Write between 1 and 1,000 characters.'
    default:
      return 'Could not save that. Try again.'
  }
}

type Call =
  | { fn: 'open_question'; args: { p_task_id: string; p_body: string } }
  | { fn: 'reply_to_question'; args: { p_thread_id: string; p_body: string } }
  | { fn: 'set_question_resolved'; args: { p_thread_id: string; p_resolved: boolean } }

/**
 * Ask, reply, resolve or reopen. The server is the judge, so nothing is guessed here: on success
 * the thread list and the board (whose task row turns Blocked or clears) are refetched, and the
 * channel does the same for everyone else.
 */
export function useQuestionAction(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (call: Call) => {
      const { error } = await supabase.rpc(call.fn, call.args as never)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadsKey(groupId) })
      void queryClient.invalidateQueries({ queryKey: boardKey(groupId) })
    },
  })
}

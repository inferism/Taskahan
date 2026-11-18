import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { avatarUrl, type Board } from '@/features/board/api'
import { memberLabel, membersById } from '@/features/board/names'
import { TaskRefs } from '@/features/board/TaskRefs'
import { messagesKey } from '@/realtime/groupChannel'
import { Avatar, Button, cn } from '@/ui'
import {
  PAGE_SIZE,
  fetchOlderMessages,
  isPending,
  mergeMessages,
  newPending,
  useMessages,
  useSendMessage,
  type Message,
} from './api'

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
/** Messages by the same author this close together share one header. */
const GROUP_GAP_MS = 5 * 60_000
/** Within this many pixels of the end counts as "at the bottom". */
const BOTTOM_SLACK = 48

export function ChatPane({ board }: { board: Board }) {
  const groupId = board.group.id
  const queryClient = useQueryClient()
  const messages = useMessages(groupId)
  const send = useSendMessage(groupId, board.me)
  const byId = membersById(board)
  const list = useMemo(() => messages.data ?? [], [messages.data])

  const scroller = useRef<HTMLDivElement>(null)
  /** What the list looked like at the last layout, to tell a prepend from an append. */
  const seen = useRef<{ first?: string; last?: string; height: number; gap: number }>({
    height: 0,
    gap: 0,
  })
  const [reachedStart, setReachedStart] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderFailed, setOlderFailed] = useState(false)
  const [unseen, setUnseen] = useState(0)
  // A first page shorter than a full page is the whole chat.
  const exhausted = reachedStart || (messages.isSuccess && list.length < PAGE_SIZE)

  const gapToBottom = () => {
    const el = scroller.current
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0
  }
  const toBottom = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    setUnseen(0)
  }, [])

  // Keep the reader's place. Older pages grow the list upward, so the scroll offset moves down by
  // the added height; a new message follows only a reader who was already at the end (or wrote it).
  useLayoutEffect(() => {
    const el = scroller.current
    const prev = seen.current
    const first = list[0]?.id
    const last = list[list.length - 1]
    if (!el || !last) {
      seen.current = { first, last: last?.id, height: 0, gap: 0 }
      return
    }
    if (prev.last === undefined) {
      toBottom()
    } else if (prev.first !== first && prev.last === last.id) {
      el.scrollTop += el.scrollHeight - prev.height
    } else if (prev.last !== last.id) {
      if (last.author_id === board.me || prev.gap <= BOTTOM_SLACK) toBottom()
      else setUnseen((n) => n + 1)
    }
    seen.current = { first, last: last.id, height: el.scrollHeight, gap: gapToBottom() }
  }, [list, board.me, toBottom])

  async function loadOlder() {
    if (!list.length || loadingOlder) return
    setLoadingOlder(true)
    setOlderFailed(false)
    try {
      const older = await fetchOlderMessages(groupId, list[0])
      queryClient.setQueryData<Message[]>(messagesKey(groupId), (cur) =>
        mergeMessages(cur ?? [], older),
      )
      if (older.length < PAGE_SIZE) setReachedStart(true)
    } catch {
      setOlderFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        role="log"
        aria-label="Chat messages"
        onScroll={() => {
          seen.current.gap = gapToBottom()
          if (seen.current.gap <= BOTTOM_SLACK) setUnseen(0)
        }}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-2"
      >
        {messages.isPending && <p className="text-body text-muted">Loading messages…</p>}
        {messages.isError && !list.length && (
          <p role="alert" className="text-body text-blocked">
            Could not load the chat.{' '}
            <Button
              variant="quiet"
              className="h-9 px-2 sm:h-9"
              onClick={() => void messages.refetch()}
            >
              Retry
            </Button>
          </p>
        )}
        {messages.isSuccess && !list.length && (
          <p className="text-body text-muted">No messages yet. Say hello.</p>
        )}
        {list.length > 0 && !exhausted && (
          <Button
            variant="quiet"
            className="self-center"
            busy={loadingOlder}
            busyLabel="Loading…"
            onClick={() => void loadOlder()}
          >
            Load older messages
          </Button>
        )}
        {olderFailed && (
          <p role="alert" className="text-center text-label text-blocked">
            Could not load older messages.
          </p>
        )}
        {list.map((m, i) => {
          const prev = list[i - 1]
          const author = byId.get(m.author_id)
          const day = dayFormat.format(new Date(m.created_at))
          const newDay = !prev || dayFormat.format(new Date(prev.created_at)) !== day
          const joined =
            !newDay &&
            prev.author_id === m.author_id &&
            Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_GAP_MS
          return (
            <div key={m.id} className="flex flex-col gap-1">
              {newDay && <p className="pt-2 text-center text-label text-muted">{day}</p>}
              <div
                className="flex gap-2"
                data-message={m.id}
                data-pending={isPending(m) || undefined}
              >
                <div className="w-7 shrink-0">
                  {!joined && (
                    <Avatar
                      seat={author?.seat ?? 0}
                      name={author?.display_name ?? 'Unknown'}
                      size={28}
                      photoUrl={avatarUrl(author?.avatar_path ?? null)}
                      former={author?.status === 'former'}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {!joined && (
                    <p className="text-label">
                      <span className="font-semibold">{memberLabel(author)}</span>{' '}
                      <span className="text-muted">
                        {timeFormat.format(new Date(m.created_at))}
                      </span>
                    </p>
                  )}
                  <p
                    className={cn(
                      'text-body whitespace-pre-wrap break-words max-md:text-title',
                      isPending(m) && 'text-muted',
                    )}
                  >
                    <TaskRefs text={m.body} groupId={groupId} />
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {unseen > 0 && (
        <Button
          variant="primary"
          className="absolute bottom-24 left-1/2 -translate-x-1/2 shadow-overlay"
          onClick={toBottom}
        >
          {unseen === 1 ? 'New message' : `${unseen} new messages`}
        </Button>
      )}
      <Composer onSend={(body) => send.mutate({ body, pending: newPending() })} />
    </div>
  )
}

/** Pinned under the list. Enter sends, Shift+Enter adds a line. */
function Composer({ onSend }: { onSend: (body: string) => void }) {
  const [text, setText] = useState('')
  const body = text.trim()
  const tooLong = text.length > 1000

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!body || tooLong) return
    onSend(body)
    setText('')
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex shrink-0 flex-col gap-1 border-t border-line bg-surface p-3"
    >
      <label htmlFor="chat-composer" className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="chat-composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Write a message. Use #12 to point at a task."
          aria-invalid={tooLong || undefined}
          className="min-w-0 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-title text-ink focus:border-ink"
        />
        <Button type="submit" variant="primary" disabled={!body || tooLong}>
          Send
        </Button>
      </div>
      {tooLong && <p className="text-label text-blocked">Keep messages under 1,000 characters.</p>}
    </form>
  )
}

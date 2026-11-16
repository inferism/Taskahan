import { useId, useState, type FormEvent } from 'react'
import { type Board, type Member, type Task } from '@/features/board/api'
import { memberLabel, membersById } from '@/features/board/names'
import { amLeader } from '@/features/board/selectors'
import { Avatar, Button, cn } from '@/ui'
import { questionError, useQuestionAction, useThreads, type Thread } from './api'

const timeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** The question thread inside an open task: ask, reply, resolve, reopen (DESIGN.md "Question thread"). */
export function QuestionThread({ board, task }: { board: Board; task: Task }) {
  const groupId = board.group.id
  const threads = useThreads(groupId)
  const action = useQuestionAction(groupId)
  const byId = membersById(board)
  const leader = amLeader(board)
  const mine = task.assignee_id === board.me && !leader
  const list = (threads.data ?? []).filter((t) => t.task_id === task.id)
  const [asking, setAsking] = useState(false)
  const [failure, setFailure] = useState<string>()

  const run = (call: Parameters<typeof action.mutateAsync>[0]) => {
    setFailure(undefined)
    return action.mutateAsync(call).then(
      () => true,
      (error: unknown) => {
        setFailure(questionError(error))
        return false
      },
    )
  }

  return (
    <section aria-label={`Questions on task #${task.number}`} className="flex flex-col gap-3">
      {threads.isError && (
        <p role="alert" className="text-label text-blocked">
          Could not load the questions.{' '}
          <Button
            variant="quiet"
            className="h-9 px-2 sm:h-9"
            onClick={() => void threads.refetch()}
          >
            Retry
          </Button>
        </p>
      )}
      {list.map((t) => (
        <ThreadView
          key={t.id}
          thread={t}
          byId={byId}
          canResolve={leader || t.opened_by === board.me}
          busy={action.isPending}
          onReply={(body) =>
            run({ fn: 'reply_to_question', args: { p_thread_id: t.id, p_body: body } })
          }
          onResolved={(resolved) =>
            run({ fn: 'set_question_resolved', args: { p_thread_id: t.id, p_resolved: resolved } })
          }
        />
      ))}
      {mine &&
        (asking ? (
          <BodyForm
            label="Your question"
            submitLabel="Ask"
            busy={action.isPending}
            onCancel={() => setAsking(false)}
            onSubmit={async (body) => {
              if (await run({ fn: 'open_question', args: { p_task_id: task.id, p_body: body } }))
                setAsking(false)
            }}
          />
        ) : (
          <Button className="self-start" onClick={() => setAsking(true)}>
            Ask a question
          </Button>
        ))}
      {failure && (
        <p role="alert" className="text-label text-blocked">
          {failure}
        </p>
      )}
    </section>
  )
}

function Entry({
  member,
  body,
  at,
  boardId,
}: {
  member: Member | undefined
  body: string
  at: string
  boardId?: string
}) {
  return (
    <li className="flex gap-2" data-entry={boardId}>
      <Avatar
        seat={member?.seat ?? 0}
        name={member?.display_name ?? 'Unknown'}
        size={28}
        former={member?.status === 'former'}
      />
      <div className="min-w-0 flex-1">
        <p className="text-label">
          <span className="font-semibold">{memberLabel(member)}</span>{' '}
          <span className="text-muted">{timeFormat.format(new Date(at))}</span>
        </p>
        <p className="text-body whitespace-pre-wrap break-words">{body}</p>
      </div>
    </li>
  )
}

function ThreadView({
  thread,
  byId,
  canResolve,
  busy,
  onReply,
  onResolved,
}: {
  thread: Thread
  byId: Map<string, Member>
  canResolve: boolean
  busy: boolean
  onReply: (body: string) => Promise<boolean>
  onResolved: (resolved: boolean) => Promise<boolean>
}) {
  if (thread.status === 'resolved') {
    const n = thread.replies.length
    return (
      <p className="flex flex-wrap items-center gap-2 text-body text-muted">
        <span>
          Resolved by {memberLabel(byId.get(thread.resolved_by ?? ''))} · {n}{' '}
          {n === 1 ? 'reply' : 'replies'}
        </span>
        {canResolve && (
          <Button
            variant="quiet"
            busy={busy}
            className="h-9 px-2 sm:h-9"
            onClick={() => void onResolved(false)}
          >
            Reopen
          </Button>
        )}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-2">
      <ul className="flex flex-col gap-2">
        <Entry member={byId.get(thread.opened_by)} body={thread.body} at={thread.created_at} />
        {thread.replies.map((r) => (
          <Entry key={r.id} member={byId.get(r.author_id)} body={r.body} at={r.created_at} />
        ))}
      </ul>
      <BodyForm label="Reply" submitLabel="Reply" busy={busy} onSubmit={onReply} compact />
      {canResolve && (
        <Button
          variant="quiet"
          className="self-start"
          busy={busy}
          onClick={() => void onResolved(true)}
        >
          Mark resolved
        </Button>
      )}
    </div>
  )
}

/** A text box with a submit button. Clears itself when the write goes through. */
function BodyForm({
  label,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  compact,
}: {
  label: string
  submitLabel: string
  busy: boolean
  onSubmit: (body: string) => Promise<boolean | void>
  onCancel?: () => void
  compact?: boolean
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const problem = !text.trim()
    ? 'Write something first'
    : text.length > 1000
      ? 'Keep it under 1,000 characters'
      : undefined

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (problem) return
    if ((await onSubmit(text)) !== false) {
      setText('')
      setTouched(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-1" noValidate>
      <label htmlFor={id} className={cn('text-label font-semibold', compact && 'sr-only')}>
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder={compact ? 'Reply…' : undefined}
        aria-invalid={touched && problem ? true : undefined}
        className={cn(
          'rounded-md border bg-surface px-3 py-2 text-title text-ink focus:border-ink',
          touched && problem ? 'border-blocked' : 'border-line',
        )}
      />
      {touched && problem && <p className="text-label text-blocked">{problem}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

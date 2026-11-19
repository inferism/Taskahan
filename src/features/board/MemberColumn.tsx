import { ChevronRight } from 'lucide-react'
import { forwardRef, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { MemberMenu, type MemberAction } from '@/features/members/MemberMenu'
import { Avatar, Button, StatusGlyph, cn } from '@/ui'
import { avatarUrl, type Member, type Task } from './api'
import { deadlineSections, progressOf, progressText } from './selectors'
import { TaskRow } from './TaskRow'

export interface MemberColumnProps {
  member: Member
  tasks: Task[]
  isMe: boolean
  /** The viewer leads the group: an empty column points at Add task. */
  leader?: boolean
  /** Desktop and tablet only; on phones every column is full width and always expanded. */
  expanded: boolean
  fullWidth?: boolean
  now: Date
  onExpand?: () => void
  /** The one task open in this column, if any. */
  openTaskId?: string
  onToggleTask?: (task: Task) => void
  canSetStatus?: (task: Task) => boolean
  onStatus?: (task: Task, status: Task['status']) => void
  /** At least one of this member's connections is present. */
  online?: boolean
  /** A status save is in flight somewhere on the board. */
  statusSaving?: boolean
  /** The task whose last status change failed. */
  failedTaskId?: string
  onRetryStatus?: () => void
  /** Leader only: when given, open tasks show Edit. */
  onEdit?: (task: Task) => void
  /** The question thread shown inside an open task. */
  renderThread?: (task: Task) => ReactNode
  /** Leader only, on another active member: Make Leader and Remove. */
  onManage?: (action: MemberAction) => void
  /** On a former member's column: claim their tasks. */
  onTakeOver?: () => void
  /** Position on the board, for the entrance stagger. */
  index?: number
}

function statusLine(member: Member, isMe: boolean, online: boolean): string {
  if (member.status === 'former') return 'Former member'
  const role = member.role === 'leader' ? 'Leader' : 'Member'
  return `${online ? 'Online' : 'Offline'} · ${isMe ? `${role} · You` : role}`
}

/** Empty columns say what to do next, in one sentence. */
function emptyText(member: Member, isMe: boolean, leader?: boolean): string {
  if (member.status === 'former') return 'No tasks were left in this column.'
  if (leader)
    return `No tasks yet. Use Add task to give ${isMe ? 'yourself' : member.display_name} one.`
  if (isMe) return 'Nothing for you yet. Your leader will assign tasks here.'
  return 'No tasks yet.'
}

/**
 * One member's column: scoreboard header, progress bar, tasks under deadline headings.
 * The frame and widths belong to the board shell (4.2). Collapsed columns expand on any click;
 * Done is folded to a count until opened.
 */
export const MemberColumn = forwardRef<HTMLElement, MemberColumnProps>(function MemberColumn(
  {
    member,
    tasks,
    isMe,
    leader,
    expanded,
    fullWidth,
    now,
    onExpand,
    openTaskId,
    onToggleTask,
    canSetStatus,
    onStatus,
    online = false,
    statusSaving,
    failedTaskId,
    onRetryStatus,
    onEdit,
    renderThread,
    onManage,
    onTakeOver,
    index = 0,
  },
  ref,
) {
  // For a moment after mounting, the column and its rows play the entrance stagger.
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 900)
    return () => clearTimeout(t)
  }, [])
  const former = member.status === 'former'
  const name = former ? `#${member.display_name}` : member.display_name
  const p = progressOf(tasks)
  const pct = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100)
  const sections = deadlineSections(tasks, now)
  // Done starts folded, but the open task never hides inside it: opening a finished task (a
  // link to #1, say) or finishing the open one unfolds Done.
  const openDone = tasks.some((t) => t.id === openTaskId && t.status === 'done')
    ? openTaskId
    : undefined
  const [doneOpen, setDoneOpen] = useState(Boolean(openDone))
  const [seenOpenDone, setSeenOpenDone] = useState(openDone)
  if (openDone !== seenOpenDone) {
    setSeenOpenDone(openDone)
    if (openDone) setDoneOpen(true)
  }
  const collapsed = !fullWidth && !expanded
  // Done unfolds with motion only when its own button opens it.
  const [doneUnfold, setDoneUnfold] = useState(false)
  // Finishing the last task plays one sweep across the bar and pops the All done label.
  const complete = p.total > 0 && p.done === p.total
  const [wasComplete, setWasComplete] = useState(complete)
  const [cheer, setCheer] = useState(0)
  if (complete !== wasComplete) {
    setWasComplete(complete)
    if (complete) setCheer(cheer + 1)
  }
  let row = 0

  return (
    <section
      ref={ref}
      aria-label={`${member.display_name}'s tasks`}
      data-member={member.id}
      onClick={collapsed ? onExpand : undefined}
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
        entering && 'rise',
        fullWidth
          ? 'h-full w-full snap-start snap-always'
          : cn(
              'max-h-full rounded-lg border border-line transition-[width] duration-200',
              expanded
                ? 'w-[340px] min-w-[320px] grow'
                : 'w-[280px] min-w-[260px] grow cursor-pointer hover:bg-sunken',
            ),
      )}
    >
      <header className={cn('flex flex-col gap-2 border-b border-line p-4', former && 'bg-sunken')}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExpand}
            aria-expanded={fullWidth ? undefined : expanded}
            disabled={fullWidth}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left disabled:cursor-default"
          >
            <Avatar
              seat={member.seat}
              name={member.display_name}
              size={36}
              former={former}
              online={online}
              photoUrl={avatarUrl(member.avatar_path)}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-body font-medium">{name}</span>
              <span className="text-label text-muted">{statusLine(member, isMe, online)}</span>
            </span>
            <span className="relative text-body font-medium">
              <span className="sr-only">{progressText(p)}</span>
              <span aria-hidden>
                <Tally value={p.done} />
                <span className="text-body text-muted">/{p.total}</span>
              </span>
            </span>
          </button>
          {onManage && <MemberMenu member={member} onAction={onManage} />}
        </div>
        <div aria-hidden className="relative flex h-1.5 overflow-hidden rounded-full bg-track">
          <div
            className="bg-done motion-safe:transition-[width] motion-safe:duration-[420ms] motion-safe:ease-(--ease-out)"
            style={{ width: `${pct(p.done)}%` }}
          />
          <div
            className="bg-in-progress motion-safe:transition-[width] motion-safe:duration-[420ms] motion-safe:ease-(--ease-out)"
            style={{ width: `${pct(p.inProgress)}%` }}
          />
          {cheer > 0 && <span key={cheer} className="shine absolute inset-0" />}
        </div>
        <p className="flex items-center gap-1 text-label text-muted">
          {progressText(p)}
          {complete && (
            <span
              key={cheer}
              aria-hidden
              className={cn(
                'ml-1 inline-flex items-center gap-1 font-medium text-done-text',
                cheer > 0 && 'pop',
              )}
            >
              <StatusGlyph status="done" size={12} />
              All done
            </span>
          )}
          {p.blocked > 0 && (
            <>
              {' · '}
              <StatusGlyph status="blocked" size={12} />
              {p.blocked} blocked
            </>
          )}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sections.length === 0 ? (
          <p className="pt-3 text-body text-muted">{emptyText(member, isMe, leader)}</p>
        ) : (
          sections.map((s) => {
            const folded = s.group === 'done' && !doneOpen
            const heading = 'text-label font-medium text-muted'
            return (
              <div key={s.group} className="pt-4">
                {s.group === 'done' ? (
                  <h3 className="pb-1">
                    <button
                      type="button"
                      aria-expanded={!folded}
                      onClick={() => {
                        setDoneUnfold(true)
                        setDoneOpen(!doneOpen)
                      }}
                      className={cn(heading, 'flex min-h-11 items-center gap-1 rounded-md')}
                    >
                      <ChevronRight
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden
                        className={cn(
                          'motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-(--ease-out)',
                          !folded && 'rotate-90',
                        )}
                      />
                      {s.label} · {s.tasks.length}
                    </button>
                  </h3>
                ) : (
                  <h3 className={cn(heading, 'pb-1')}>{s.label}</h3>
                )}
                <div
                  className={cn('fold', s.group === 'done' && doneUnfold && !folded && 'unfold')}
                >
                  <ul hidden={folded}>
                    {s.tasks.map((t) => (
                      <TaskRow
                        enterIndex={entering ? row++ : undefined}
                        key={t.id}
                        task={t}
                        now={now}
                        open={openTaskId === t.id}
                        onToggle={() => onToggleTask?.(t)}
                        canSetStatus={canSetStatus?.(t) ?? false}
                        onStatus={(status) => onStatus?.(t, status)}
                        statusSaving={statusSaving}
                        statusError={failedTaskId === t.id}
                        onRetry={onRetryStatus}
                        onEdit={onEdit && (() => onEdit(t))}
                        thread={renderThread?.(t)}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            )
          })
        )}
      </div>
      {former && onTakeOver && tasks.length > 0 && (
        <div className="border-t border-line p-4">
          <Button onClick={onTakeOver}>Take over tasks</Button>
        </div>
      )}
    </section>
  )
})

/**
 * The done count in the scoreboard header. When it changes, the new digit rolls up (a task was
 * finished) or down (one was reopened), live for everyone; reduced motion swaps it in place.
 */
function Tally({ value }: { value: number }) {
  const [shown, setShown] = useState({ value, dir: '' as '' | 'up' | 'down' })
  if (value !== shown.value) setShown({ value, dir: value > shown.value ? 'up' : 'down' })
  return (
    <span className="inline-flex overflow-hidden align-bottom">
      <span key={shown.value} className={shown.dir && `tally-${shown.dir}`}>
        {shown.value}
      </span>
    </span>
  )
}

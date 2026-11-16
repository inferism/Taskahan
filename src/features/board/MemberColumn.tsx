import { ChevronDown, ChevronRight } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { Avatar, cn } from '@/ui'
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
  /** The task whose last status change failed. */
  failedTaskId?: string
  onRetryStatus?: () => void
  /** Leader only: when given, open tasks show Edit. */
  onEdit?: (task: Task) => void
}

function statusLine(member: Member, isMe: boolean): string {
  if (member.status === 'former') return 'Former member'
  const role = member.role === 'leader' ? 'Leader' : 'Member'
  return isMe ? `${role} · You` : role
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
    failedTaskId,
    onRetryStatus,
    onEdit,
  },
  ref,
) {
  const former = member.status === 'former'
  const name = former ? `#${member.display_name}` : member.display_name
  const p = progressOf(tasks)
  const pct = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100)
  const sections = deadlineSections(tasks, now)
  const [doneOpen, setDoneOpen] = useState(false)
  const collapsed = !fullWidth && !expanded

  return (
    <section
      ref={ref}
      aria-label={`${member.display_name}'s tasks`}
      data-member={member.id}
      onClick={collapsed ? onExpand : undefined}
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
        fullWidth
          ? 'h-full w-full snap-start snap-always'
          : cn(
              'max-h-full rounded-lg border border-line transition-[width] duration-200',
              expanded ? 'w-[408px]' : 'w-[248px] cursor-pointer hover:bg-sunken',
            ),
      )}
    >
      <header className={cn('flex flex-col gap-2 border-b border-line p-3', former && 'bg-sunken')}>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={fullWidth ? undefined : expanded}
          disabled={fullWidth}
          className="flex items-center gap-3 rounded-md text-left disabled:cursor-default"
        >
          <Avatar
            seat={member.seat}
            name={member.display_name}
            size={52}
            former={former}
            photoUrl={avatarUrl(member.avatar_path)}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-display text-name font-bold uppercase tracking-[0.02em]">
              {name}
            </span>
            <span className="text-label text-muted">{statusLine(member, isMe)}</span>
          </span>
          <span className="font-display text-tally font-bold" aria-label={progressText(p)}>
            {p.done}
            <span className="text-name text-muted">/{p.total}</span>
          </span>
        </button>
        <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-track">
          <div className="bg-done" style={{ width: `${pct(p.done)}%` }} />
          <div className="bg-yellow" style={{ width: `${pct(p.inProgress)}%` }} />
        </div>
        <p className="text-label text-muted">
          {progressText(p)}
          {p.blocked > 0 && ` · ${p.blocked} blocked`}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sections.length === 0 ? (
          <p className="pt-3 text-body text-muted">{emptyText(member, isMe, leader)}</p>
        ) : (
          sections.map((s) => {
            const folded = s.group === 'done' && !doneOpen
            const heading =
              'font-display text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-muted'
            return (
              <div key={s.group} className="pt-4">
                {s.group === 'done' ? (
                  <h3 className="pb-1">
                    <button
                      type="button"
                      aria-expanded={!folded}
                      onClick={() => setDoneOpen(!doneOpen)}
                      className={cn(heading, 'flex min-h-11 items-center gap-1 rounded-md')}
                    >
                      {folded ? (
                        <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                      ) : (
                        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
                      )}
                      {s.label} · {s.tasks.length}
                    </button>
                  </h3>
                ) : (
                  <h3 className={cn(heading, 'pb-1')}>{s.label}</h3>
                )}
                <ul hidden={folded}>
                  {s.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      now={now}
                      open={openTaskId === t.id}
                      onToggle={() => onToggleTask?.(t)}
                      canSetStatus={canSetStatus?.(t) ?? false}
                      onStatus={(status) => onStatus?.(t, status)}
                      statusError={failedTaskId === t.id}
                      onRetry={onRetryStatus}
                      onEdit={onEdit && (() => onEdit(t))}
                    />
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
})

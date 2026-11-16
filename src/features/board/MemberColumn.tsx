import { forwardRef } from 'react'
import { Avatar, cn, StatusGlyph } from '@/ui'
import { avatarUrl, type Member, type Task } from './api'
import { deadlineSections, progressOf, progressText, shownStatus } from './selectors'

export interface MemberColumnProps {
  member: Member
  tasks: Task[]
  isMe: boolean
  /** Desktop and tablet only; on phones every column is full width and always expanded. */
  expanded: boolean
  fullWidth?: boolean
  now: Date
  onExpand?: () => void
}

function statusLine(member: Member, isMe: boolean): string {
  if (member.status === 'former') return 'Former member'
  const role = member.role === 'leader' ? 'Leader' : 'Member'
  return isMe ? `${role} · You` : role
}

/**
 * One member's column: scoreboard header, progress bar, tasks under deadline headings.
 * The frame and widths belong to the board shell (4.2); the full column is task 4.3.
 */
export const MemberColumn = forwardRef<HTMLElement, MemberColumnProps>(function MemberColumn(
  { member, tasks, isMe, expanded, fullWidth, now, onExpand },
  ref,
) {
  const former = member.status === 'former'
  const name = former ? `#${member.display_name}` : member.display_name
  const p = progressOf(tasks)
  const pct = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100)
  const sections = deadlineSections(tasks, now)

  return (
    <section
      ref={ref}
      aria-label={`${member.display_name}'s tasks`}
      data-member={member.id}
      className={cn(
        'flex min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
        fullWidth
          ? 'h-full w-full snap-start snap-always'
          : cn(
              'max-h-full rounded-lg border border-line transition-[width] duration-200',
              expanded ? 'w-[408px]' : 'w-[248px]',
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
          <p className="pt-3 text-body text-muted">No tasks yet.</p>
        ) : (
          sections.map((s) => (
            <div key={s.group} className="pt-4">
              <h3 className="pb-1 font-display text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-muted">
                {s.label}
              </h3>
              <ul>
                {s.tasks.map((t) => (
                  <li key={t.id} className="flex min-h-11 items-center gap-2 py-1">
                    <StatusGlyph status={shownStatus(t)} />
                    <span className="text-label text-muted">#{t.number}</span>
                    <span className="min-w-0 flex-1 truncate text-body">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
})

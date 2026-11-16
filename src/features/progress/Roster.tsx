import { avatarUrl, type Member, type Task } from '@/features/board/api'
import { progressOf, progressText } from '@/features/board/selectors'
import { Avatar, StatusGlyph } from '@/ui'

export interface RosterProps {
  members: Member[]
  tasksByMember: Map<string, Task[]>
  me: string
  onSelect: (memberId: string) => void
}

/**
 * Task Progress: one row per member in column order. The shell places it (4.2); the full roster
 * with its stacked bars is task 4.6.
 */
export function Roster({ members, tasksByMember, me, onSelect }: RosterProps) {
  return (
    <section aria-label="Task Progress" className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-4 pb-2 font-display text-name font-bold uppercase tracking-[0.02em]">
        Task Progress
      </h2>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {members.map((m) => {
          const p = progressOf(tasksByMember.get(m.id) ?? [])
          const former = m.status === 'former'
          const pct = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100)
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunken"
              >
                <Avatar
                  seat={m.seat}
                  name={m.display_name}
                  former={former}
                  photoUrl={avatarUrl(m.avatar_path)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-body font-semibold">
                    {former ? `#${m.display_name}` : m.display_name}
                    <span className="font-normal text-muted">
                      {' · '}
                      {former ? 'Former member' : m.role === 'leader' ? 'Leader' : 'Member'}
                      {m.id === me && ' · You'}
                    </span>
                  </span>
                  <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-track">
                    <span className="bg-done" style={{ width: `${pct(p.done)}%` }} />
                    <span className="bg-yellow" style={{ width: `${pct(p.inProgress)}%` }} />
                  </span>
                  <span className="flex items-center gap-1 text-label text-muted">
                    {progressText(p)}
                    {p.blocked > 0 && (
                      <>
                        {' · '}
                        <StatusGlyph status="blocked" size={12} />
                        {p.blocked} blocked
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

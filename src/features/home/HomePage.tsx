import { Settings } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/ui'
import { WorkspaceNav } from '@/ui/WorkspaceNav'
import { purposeText, useGroups, type HomeGroup } from './api'
import { CreateGroupDialog } from './CreateGroupDialog'
import { JoinGroupDialog } from './JoinGroupDialog'
import { LeaveGroupDialog } from './LeaveGroupDialog'

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 w-full overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-done motion-safe:transition-[width] motion-safe:duration-[420ms] motion-safe:ease-(--ease-out)"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-label text-muted">
        <span>{total === 0 ? 'No tasks yet' : `${done} of ${total} completed`}</span>
        {total > 0 && <span className="font-medium text-ink">{pct}%</span>}
      </div>
    </div>
  )
}

function GroupRow({
  group,
  index,
  onLeave,
}: {
  group: HomeGroup
  index: number
  onLeave: () => void
}) {
  return (
    <li
      className="rise card-lift flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5 shadow-card"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/g/${group.id}`}
            className="text-title font-semibold text-link hover:underline"
          >
            {group.name}
          </Link>
          <p className="mt-0.5 text-label text-muted">
            {purposeText(group.purpose, group.purposeNote)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={
              group.role === 'leader'
                ? 'rounded-full bg-accent-soft px-2.5 py-0.5 text-label font-medium text-yellow'
                : 'rounded-full bg-sunken px-2.5 py-0.5 text-label font-medium text-muted'
            }
          >
            {group.role === 'leader' ? 'Leader' : 'Member'} · {group.memberCount}{' '}
            {group.memberCount === 1 ? 'member' : 'members'}
          </span>
          <Button
            variant="quiet"
            className="h-9 px-2.5 text-label text-muted hover:text-ink sm:h-8"
            aria-label={`Leave ${group.name}`}
            onClick={onLeave}
          >
            Leave
          </Button>
        </div>
      </div>
      <Progress done={group.done} total={group.total} />
    </li>
  )
}

export function HomePage() {
  const groups = useGroups()
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState<HomeGroup | null>(null)
  // Set by a board that sent the member Home (removed while it was open).
  const sent = (useLocation().state as { notice?: string } | null)?.notice
  const [dismissed, setDismissed] = useState(false)

  return (
    <div className="flex min-h-dvh">
      <WorkspaceNav />
      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
        <Link to="/" className="workspace-brand self-start lg:hidden">
          Taskahan
        </Link>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-name font-medium tracking-tight">Your groups</h1>
          <Link
            to="/settings"
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-body font-medium hover:bg-sunken sm:h-10 lg:hidden"
          >
            <Settings size={20} strokeWidth={1.75} aria-hidden />
            Settings
          </Link>
        </div>

        {sent && !dismissed && (
          <p
            role="status"
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken p-3 text-body"
          >
            {sent}
            <Button variant="quiet" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create
          </Button>
          <Button onClick={() => setJoining(true)}>Join</Button>
        </div>
        <CreateGroupDialog open={creating} onOpenChange={setCreating} />
        <JoinGroupDialog open={joining} onOpenChange={setJoining} />
        <LeaveGroupDialog group={leaving} onOpenChange={(open) => !open && setLeaving(null)} />

        {groups.isPending ? (
          <ul
            aria-busy="true"
            aria-label="Loading groups"
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {[0, 1].map((i) => (
              <li
                key={i}
                className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-5 w-36 rounded-sm bg-track motion-safe:animate-pulse" />
                    <div className="h-3.5 w-28 rounded-sm bg-track motion-safe:animate-pulse" />
                  </div>
                  <div className="h-6 w-28 rounded-full bg-track motion-safe:animate-pulse" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 w-full rounded-full bg-track motion-safe:animate-pulse" />
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-28 rounded-sm bg-track motion-safe:animate-pulse" />
                    <div className="h-3.5 w-8 rounded-sm bg-track motion-safe:animate-pulse" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : groups.isError ? (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="text-blocked">Could not load your groups.</p>
            <Button onClick={() => void groups.refetch()}>Retry</Button>
          </div>
        ) : groups.data.length === 0 ? (
          <p className="text-body text-muted">
            Create a group to lead it, or join one with its 8-letter code.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {groups.data.map((g, i) => (
              <GroupRow key={g.id} group={g} index={i} onLeave={() => setLeaving(g)} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

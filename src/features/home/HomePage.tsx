import { Settings } from 'lucide-react'
import { useState } from 'react'
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
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
      >
        <div className="h-full bg-done" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-label text-muted">
        {total === 0 ? 'No tasks yet' : `${done} of ${total} completed`}
      </span>
    </div>
  )
}

function GroupRow({ group, onLeave }: { group: HomeGroup; onLeave: () => void }) {
  return (
    <li className="flex flex-col gap-4 border-b border-line py-6 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to={`/g/${group.id}`} className="text-title font-semibold text-link hover:underline">
          {group.name}
        </Link>
        <span className="text-label text-muted">
          {purposeText(group.purpose, group.purposeNote)}
        </span>
        <span className="text-label text-muted">
          {group.role === 'leader' ? 'Leader' : 'Member'} · {group.memberCount}{' '}
          {group.memberCount === 1 ? 'member' : 'members'}
        </span>
        <Button
          variant="quiet"
          className="ml-auto"
          aria-label={`Leave ${group.name}`}
          onClick={onLeave}
        >
          Leave
        </Button>
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
          <ul aria-busy="true" aria-label="Loading groups" className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <li key={i} className="h-16 rounded-md bg-track" />
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
          <ul className="rounded-lg border border-line bg-surface px-6">
            {groups.data.map((g) => (
              <GroupRow key={g.id} group={g} onLeave={() => setLeaving(g)} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

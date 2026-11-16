import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui'
import { purposeText, useGroups, type HomeGroup } from './api'

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

function GroupRow({ group }: { group: HomeGroup }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to={`/g/${group.id}`} className="text-title font-semibold text-link hover:underline">
          {group.name}
        </Link>
        <span className="rounded-full border border-line px-2 text-label text-muted">
          {purposeText(group.purpose, group.purposeNote)}
        </span>
        <span className="text-label text-muted">
          {group.role === 'leader' ? 'Leader' : 'Member'} · {group.memberCount}{' '}
          {group.memberCount === 1 ? 'member' : 'members'}
        </span>
      </div>
      <Progress done={group.done} total={group.total} />
    </li>
  )
}

export function HomePage() {
  const groups = useGroups()

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">
          Your groups
        </h1>
        {/* Temporary until Settings (log out) is built. */}
        <Button variant="quiet" onClick={() => void supabase.auth.signOut()}>
          Log out
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary">Create</Button>
        <Button>Join</Button>
      </div>

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
        <ul>
          {groups.data.map((g) => (
            <GroupRow key={g.id} group={g} />
          ))}
        </ul>
      )}
    </main>
  )
}

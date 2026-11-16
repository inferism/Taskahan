import { useState } from 'react'
import type { Board } from '@/features/board/api'
import { memberLabel, membersById } from '@/features/board/names'
import { TaskRefs } from '@/features/board/TaskRefs'
import { Avatar, Button, Select } from '@/ui'
import { useLogs } from './api'
import { actionLabels, logSentence, type LogAction } from './sentences'

const ALL = 'all'
const timeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** The leader's Logs: newest first, read-only, filterable by member and action (DESIGN.md "Logs"). */
export function LogsPane({ board }: { board: Board }) {
  const [member, setMember] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const logs = useLogs(board.group.id, {
    member: member === ALL ? undefined : member,
    action: action === ALL ? undefined : (action as LogAction),
  })
  const byId = membersById(board)
  const entries = logs.data?.pages.flat() ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pb-2">
        <Select
          label="Member"
          value={member}
          onValueChange={setMember}
          options={[
            { value: ALL, label: 'Everyone' },
            ...board.memberships.map((m) => ({
              value: m.id,
              label: `#${m.seat} ${memberLabel(m)}`,
            })),
          ]}
        />
        <Select
          label="Action"
          value={action}
          onValueChange={setAction}
          options={[
            { value: ALL, label: 'All actions' },
            ...Object.entries(actionLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {logs.isPending && <p className="px-4 text-body text-muted">Loading the log…</p>}
        {logs.isError && (
          <p role="alert" className="px-4 text-body text-blocked">
            Could not load the log.{' '}
            <Button variant="quiet" className="h-9 px-2 sm:h-9" onClick={() => void logs.refetch()}>
              Retry
            </Button>
          </p>
        )}
        {logs.isSuccess && entries.length === 0 && (
          <p className="px-4 text-body text-muted">
            {member === ALL && action === ALL ? 'Nothing has happened yet.' : 'No entries match.'}
          </p>
        )}
        <ol aria-label="Log entries">
          {entries.map((e) => {
            const who = e.actor_id ? byId.get(e.actor_id) : undefined
            return (
              <li key={e.id} className="flex gap-2 border-b border-line px-4 py-2">
                <Avatar
                  seat={who?.seat ?? 0}
                  name={who?.display_name ?? 'Taskahan'}
                  size={28}
                  former={who?.status === 'former'}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-body break-words">
                    <TaskRefs text={logSentence(e, board)} groupId={board.group.id} />
                  </p>
                  <p className="text-label text-muted">
                    {timeFormat.format(new Date(e.created_at))}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        {logs.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button
              variant="quiet"
              busy={logs.isFetchingNextPage}
              busyLabel="Loading…"
              onClick={() => void logs.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useId, type ReactNode } from 'react'
import { useTaskFlash } from '@/realtime/live'
import { SegmentedControl, Button, StatusGlyph, cn, statusLabel } from '@/ui'
import type { Task } from './api'
import { shownStatus, taskLabel } from './selectors'

export interface TaskRowProps {
  task: Task
  now: Date
  open: boolean
  onToggle: () => void
  /** Assignee or leader. Everyone else reads the status as text. */
  canSetStatus: boolean
  onStatus: (status: Task['status']) => void
  /** A status save is in flight; the control waits so answers cannot arrive out of order. */
  statusSaving?: boolean
  statusError?: boolean
  onRetry?: () => void
  /** Leader only: opens the edit dialog. */
  onEdit?: () => void
  /** The question thread, rendered under the deadline. */
  thread?: ReactNode
}

const statusOptions = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const

const dueFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** One task: the row, and its details opened inline beneath it. */
export function TaskRow({
  task,
  now,
  open,
  onToggle,
  canSetStatus,
  onStatus,
  statusSaving,
  statusError,
  onRetry,
  onEdit,
  thread,
}: TaskRowProps) {
  const label = taskLabel(task, now)
  const shown = shownStatus(task)
  const panelId = useId()
  const flash = useTaskFlash(task.id)
  return (
    <li data-task={task.id} className="relative">
      {flash > 0 && (
        // Remounted on every new change so the wash plays again.
        <span
          key={flash}
          aria-hidden
          className="wash pointer-events-none absolute inset-0 rounded-md"
        />
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-md py-1 text-left hover:bg-sunken focus-visible:bg-sunken"
      >
        <StatusGlyph status={shown} />
        <span className="text-label text-muted">#{task.number}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          {/* One line in the list; the whole title once the task is open. */}
          <span className={cn('text-body', open ? '[overflow-wrap:anywhere]' : 'truncate')}>
            {task.title}
          </span>
          {label && (
            <span
              className={cn('truncate text-label', label.alert ? 'text-blocked' : 'text-muted')}
            >
              {label.text}
            </span>
          )}
        </span>
      </button>
      <div id={panelId} role="group" aria-label={`Task #${task.number} details`} hidden={!open}>
        {open && (
          <div className="mb-2 flex flex-col gap-3 rounded-md bg-sunken p-3">
            {canSetStatus ? (
              <SegmentedControl
                label={`Status of task #${task.number}`}
                options={[...statusOptions]}
                value={task.status}
                onValueChange={onStatus}
                disabled={statusSaving}
              />
            ) : (
              <p className="flex items-center gap-2 text-body">
                <StatusGlyph status={shown} size={16} />
                {statusLabel[shown]}
              </p>
            )}
            {statusError && (
              <p role="alert" className="flex items-center gap-2 text-label text-blocked">
                Could not change the status.
                <Button variant="quiet" onClick={onRetry} className="h-9 px-2 sm:h-9">
                  Retry
                </Button>
              </p>
            )}
            <p className="text-body whitespace-pre-wrap">
              {task.details || <span className="text-muted">No details.</span>}
            </p>
            <p className="text-label text-muted">
              {task.deadline
                ? `Deadline: ${dueFormat.format(new Date(task.deadline))}`
                : 'No deadline'}
            </p>
            {thread}
            {onEdit && (
              <Button className="self-start" onClick={onEdit}>
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

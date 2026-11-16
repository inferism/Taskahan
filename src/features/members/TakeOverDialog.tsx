import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { boardKey, type Member, type Task } from '@/features/board/api'
import { shownStatus } from '@/features/board/selectors'
import { errorKey } from '@/features/home/api'
import { useLatestRequest } from '@/features/home/useLatestRequest'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, StatusGlyph, useToast } from '@/ui'
import { patchBoard, withAssignee } from './cache'

export interface TakeOverDialogProps {
  groupId: string
  /** The caller's membership id: the tasks move here. */
  me: string
  /** The former member whose tasks are offered; closed while null. */
  from: Member | null
  /** That member's tasks, in number order. */
  tasks: Task[]
  onOpenChange: (open: boolean) => void
}

/** Any active member can claim tasks a former member left behind. */
export function TakeOverDialog(props: TakeOverDialogProps) {
  return props.from ? <TakeOverForm {...props} from={props.from} /> : null
}

function TakeOverForm({
  groupId,
  me,
  from,
  tasks,
  onOpenChange,
}: TakeOverDialogProps & { from: Member }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const request = useLatestRequest()
  // Open work is ticked; finished work stays with the former member unless asked for.
  const [chosen, setChosen] = useState(
    () => new Set(tasks.filter((t) => t.status !== 'done').map((t) => t.id)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function close(next: boolean) {
    if (!next) request.cancel()
    onOpenChange(next)
  }

  function toggle(id: string) {
    const next = new Set(chosen)
    if (!next.delete(id)) next.add(id)
    setChosen(next)
  }

  async function takeOver() {
    setError(undefined)
    setBusy(true)
    const isCurrent = request.begin()
    const ids = tasks.filter((t) => chosen.has(t.id)).map((t) => t.id)
    const { data, error: err } = await supabase.rpc('take_over_tasks', {
      p_from_member_id: from.id,
      p_task_ids: ids,
    })
    if (!err) patchBoard(queryClient, groupId, (b) => withAssignee(b, ids, me))
    if (!isCurrent()) return
    setBusy(false)
    if (err) {
      if (errorKey(err) === 'invalid_input') {
        // Someone got there first, or a task was deleted: show what is left.
        void queryClient.invalidateQueries({ queryKey: boardKey(groupId) })
        setError(
          'Some of these tasks have changed. The board was refreshed. Close this and try again.',
        )
      } else {
        setError('Could not take over the tasks. Try again.')
      }
      return
    }
    const numbers = ((data as number[] | null) ?? []).map((n) => `#${n}`).join(', ')
    toast(`Took over ${numbers}.`)
    close(false)
  }

  const count = chosen.size
  return (
    <Dialog
      open
      onOpenChange={close}
      title={`Take over tasks from #${from.display_name}`}
      description="Tick the tasks that should move to you. Open tasks are ticked; finished ones are not."
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={count === 0}
            busy={busy}
            busyLabel="Taking over…"
            onClick={() => void takeOver()}
          >
            Take over {count} {count === 1 ? 'task' : 'tasks'}
          </Button>
        </>
      }
    >
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 items-center gap-3 rounded-md px-1 text-body hover:bg-sunken">
              <input
                type="checkbox"
                checked={chosen.has(t.id)}
                onChange={() => toggle(t.id)}
                className="size-4 accent-[var(--court)]"
              />
              <StatusGlyph status={shownStatus(t)} />
              <span className="text-label text-muted">#{t.number}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-label text-blocked">
          {error}
        </p>
      )}
    </Dialog>
  )
}

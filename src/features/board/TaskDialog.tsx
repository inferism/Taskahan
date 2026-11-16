import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { errorKey } from '@/features/home/api'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, Input, Select, cn } from '@/ui'
import { patchTask, type Member, type Task } from './api'

export interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  /** Active members the task can go to. */
  members: Member[]
  /** The caller's membership: the default assignee for a new task. */
  me: string
  /** Present when editing. */
  task?: Task
}

/** `datetime-local` wants local "YYYY-MM-DDTHH:mm"; the database holds an instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

const messages: Record<string, string> = {
  forbidden: 'Only the leader can add or edit tasks.',
  task_limit: 'This group has reached 500 tasks. Delete some before adding more.',
}

export function TaskDialog(props: TaskDialogProps) {
  // Remount on each open so the form starts from the task, not from the last edit.
  return props.open ? <TaskForm {...props} /> : null
}

function TaskForm({ onOpenChange, groupId, members, me, task }: TaskDialogProps) {
  const queryClient = useQueryClient()
  const detailsId = useId()
  const [title, setTitle] = useState(task?.title ?? '')
  const [details, setDetails] = useState(task?.details ?? '')
  const [assignee, setAssignee] = useState(task?.assignee_id ?? me)
  const [deadline, setDeadline] = useState(toLocalInput(task?.deadline ?? null))
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<{ field: string; message: string }>()
  const [busy, setBusy] = useState(false)
  // A reply can arrive after this form was cancelled and another opened; it must not touch that one.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const titleProblem = title.trim() ? undefined : 'Give the task a title'
  const detailsProblem = details.length > 2000 ? 'Keep details under 2,000 characters' : undefined
  const options = members.map((m) => ({ value: m.id, label: `#${m.seat} ${m.display_name}` }))
  // A former member's task keeps them listed, so an unrelated edit does not silently reassign it.
  const formerAssignee = task && members.every((m) => m.id !== task.assignee_id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setTouched(true)
    if (titleProblem || detailsProblem) return
    setBusy(true)
    const args = {
      p_title: title,
      p_details: details,
      p_assignee_id: assignee,
      p_deadline: fromLocalInput(deadline) as string,
    }
    const { data, error: failure } = task
      ? await supabase.rpc('update_task', { p_task_id: task.id, ...args })
      : await supabase.rpc('create_task', { p_group_id: groupId, ...args })
    if (!mounted.current) {
      // Cancelled while saving: keep what the server saved, leave the dialog alone.
      if (!failure && data) patchTask(queryClient, groupId, data as unknown as Task)
      return
    }
    setBusy(false)
    if (failure || !data) {
      const key = errorKey(failure) ?? ''
      const detail = (failure as { details?: string } | null)?.details
      setError(
        key === 'invalid_input' && detail === 'title'
          ? { field: 'title', message: 'Give the task a title of up to 120 characters' }
          : { field: 'form', message: messages[key] ?? 'Could not save the task. Try again.' },
      )
      return
    }
    patchTask(queryClient, groupId, data as unknown as Task)
    onOpenChange(false)
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={task ? `Edit task #${task.number}` : 'Add a task'}
      description={
        task ? undefined : 'Give it to a member. They can change its status; you can edit it.'
      }
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          error={error?.field === 'title' ? error.message : touched ? titleProblem : undefined}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={detailsId} className="text-label font-semibold">
            Details (optional)
          </label>
          <textarea
            id={detailsId}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            aria-invalid={touched && detailsProblem ? true : undefined}
            className={cn(
              'rounded-md border bg-surface px-3 py-2 text-title text-ink focus:border-ink',
              touched && detailsProblem ? 'border-blocked' : 'border-line',
            )}
          />
          {touched && detailsProblem && <p className="text-label text-blocked">{detailsProblem}</p>}
        </div>
        <Select
          label="Assignee"
          options={
            formerAssignee
              ? [{ value: task.assignee_id, label: 'Former member', disabled: true }, ...options]
              : options
          }
          value={assignee}
          onValueChange={setAssignee}
        />
        <Input
          label="Deadline (optional)"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        {error?.field === 'form' && (
          <p role="alert" className="text-label text-blocked">
            {error.message}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="quiet">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            busyLabel={task ? 'Saving…' : 'Adding…'}
          >
            {task ? 'Save task' : 'Add task'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

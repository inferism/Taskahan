import { useState } from 'react'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'
import {
  Avatar,
  Button,
  Dialog,
  DialogClose,
  Input,
  SegmentedControl,
  Select,
  StatusGlyph,
  Tabs,
  useToast,
  type TaskStatus,
} from '@/ui'

/** Dev-only page that shows every primitive in every state. Route: /dev/ui */
export function Gallery() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference())
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [open, setOpen] = useState(false)
  const [assignee, setAssignee] = useState<string>()
  const toast = useToast()

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-name font-medium tracking-tight">
        UI primitives
      </h1>

      <SegmentedControl<ThemePreference>
        label="Theme"
        value={theme}
        onValueChange={(t) => {
          setTheme(t)
          applyTheme(t)
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <section className="flex flex-wrap gap-2" aria-label="Buttons">
        <Button variant="primary">Add task</Button>
        <Button variant="secondary">Join</Button>
        <Button variant="quiet">Cancel</Button>
        <Button variant="destructive">Remove member</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="primary" busy busyLabel="Adding…">
          Add task
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Fields">
        <Input label="Username" placeholder="kim" helper="Letters and numbers" />
        <Input label="Code" defaultValue="ABC" error="Codes are 8 letters, A to Z" />
        <Input label="Disabled" disabled defaultValue="Locked" />
        <Select
          label="Assignee"
          placeholder="Pick a member"
          value={assignee}
          onValueChange={setAssignee}
          options={[
            { value: '1', label: 'Kim' },
            { value: '2', label: 'Renz' },
            { value: '3', label: 'Bea' },
          ]}
        />
      </section>

      <section className="flex flex-wrap items-center gap-4" aria-label="Status">
        {(['todo', 'in_progress', 'done', 'blocked'] as const).map((s) => (
          <StatusGlyph key={s} status={s} />
        ))}
        <SegmentedControl<TaskStatus>
          label="Status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'todo', label: 'To do' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'done', label: 'Done' },
          ]}
        />
      </section>

      <section className="flex flex-wrap items-end gap-4" aria-label="Avatars">
        <Avatar seat={1} name="Kim" size={52} online />
        <Avatar seat={2} name="Renz" size={36} />
        <Avatar seat={9} name="Bea" size={28} />
        <Avatar seat={7} name="Jamie" size={52} former />
      </section>

      <Tabs
        label="Dock"
        items={[
          { value: 'chat', label: 'Chat', content: 'Chat goes here.' },
          { value: 'logs', label: 'Logs', content: 'Logs go here.' },
        ]}
      />

      <section className="flex gap-2" aria-label="Overlays">
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Button onClick={() => toast('Task added')}>Show toast</Button>
      </section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Make Bea the leader?"
        description="You will become a member and lose access to Logs and task editing."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="quiet">Cancel</Button>
            </DialogClose>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Make Bea the leader
            </Button>
          </>
        }
      />
    </main>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose } from '@/ui'
import { errorKey, groupsKey, type HomeGroup } from './api'

/**
 * A leader with other active members must hand over leadership first (the database
 * refuses otherwise). A leader who is the last member leaves by deleting the group.
 */
export function LeaveGroupDialog({
  group,
  onOpenChange,
}: {
  group: HomeGroup | null
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const mustTransfer = group?.role === 'leader' && group.memberCount > 1
  const lastMember = group?.role === 'leader' && group.memberCount <= 1

  function close(next: boolean) {
    if (!next) setError(undefined)
    onOpenChange(next)
  }

  async function leave() {
    if (!group) return
    setError(undefined)
    setBusy(true)
    const { error: err } = await supabase.rpc('leave_group', { p_group_id: group.id })
    setBusy(false)
    if (err) {
      setError(
        errorKey(err) === 'leader_must_transfer'
          ? 'Make another member the Leader first, then leave.'
          : 'Could not leave the group. Try again.',
      )
      return
    }
    await queryClient.invalidateQueries({ queryKey: groupsKey })
    close(false)
    void navigate('/', { replace: true })
  }

  return (
    <Dialog
      open={group !== null}
      onOpenChange={close}
      title={group ? `Leave ${group.name}?` : 'Leave group'}
      description={
        mustTransfer
          ? 'You are the Leader. A group always has one, so make another member the Leader before you leave.'
          : lastMember
            ? 'You are the only member. Leaving deletes the group and its tasks, and cannot be undone.'
            : 'Your column stays on the board as a former member with its tasks and messages. You will need the join code to come back.'
      }
      footer={
        <>
          <DialogClose asChild>
            <Button>{mustTransfer ? 'Close' : 'Cancel'}</Button>
          </DialogClose>
          {!mustTransfer && (
            <Button
              variant="destructive"
              busy={busy}
              busyLabel="Leaving…"
              onClick={() => void leave()}
            >
              {lastMember ? 'Delete group' : 'Leave group'}
            </Button>
          )}
        </>
      }
    >
      {mustTransfer && (
        <p className="text-label text-muted">
          Open the group and hand leadership to another member. Once someone else leads, you can
          leave.
        </p>
      )}
      {error && (
        <p role="alert" className="text-label text-blocked">
          {error}
        </p>
      )}
    </Dialog>
  )
}

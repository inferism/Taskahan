import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorKey } from '@/features/home/api'
import { randomCode } from '@/features/home/codes'
import { useLatestRequest } from '@/features/home/useLatestRequest'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, useToast } from '@/ui'
import type { Member } from '@/features/board/api'
import { patchBoard, withFormer } from './cache'

export interface MemberDialogProps {
  groupId: string
  /** The seat the action is about; the dialog is closed while this is null. */
  member: Member | null
  onOpenChange: (open: boolean) => void
}

/** A fresh code can collide with another group's; try a few before giving up. */
const CODE_TRIES = 3

/**
 * The leader removes a member. The column stays as a former member, their access ends and the
 * account is blocked from rejoining; the join code is changed in the same step unless unticked.
 */
export function RemoveMemberDialog(props: MemberDialogProps) {
  return props.member ? <RemoveForm {...props} member={props.member} /> : null
}

function RemoveForm({ groupId, member, onOpenChange }: MemberDialogProps & { member: Member }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const request = useLatestRequest()
  const [changeCode, setChangeCode] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function close(next: boolean) {
    if (!next) request.cancel()
    onOpenChange(next)
  }

  async function remove() {
    setError(undefined)
    setBusy(true)
    const isCurrent = request.begin()
    let failure: unknown
    let newCode: string | undefined
    for (let attempt = 0; attempt < (changeCode ? CODE_TRIES : 1); attempt++) {
      newCode = changeCode ? randomCode() : undefined
      const { error: err } = await supabase.rpc('remove_member', {
        p_member_id: member.id,
        // The function treats null as "keep the code".
        p_new_join_code: newCode as string,
      })
      failure = err
      if (!err || errorKey(err) !== 'join_code_taken') break
    }
    const removed = !failure
    if (removed) {
      const code = newCode
      patchBoard(queryClient, groupId, (b) => {
        const next = withFormer(b, member.id)
        return code ? { ...next, group: { ...next.group, join_code: code } } : next
      })
    }
    if (!isCurrent()) return
    setBusy(false)
    if (!removed) {
      setError(
        errorKey(failure) === 'forbidden'
          ? 'Only the leader can remove members.'
          : 'Could not remove them. Try again.',
      )
      return
    }
    toast(
      newCode
        ? `Removed ${member.display_name}. New join code: ${newCode}`
        : `Removed ${member.display_name}.`,
    )
    close(false)
  }

  return (
    <Dialog
      open
      onOpenChange={close}
      title={`Remove ${member.display_name}?`}
      description="Their column stays on the board as a former member with its tasks and messages. Their access ends now, and they cannot rejoin this group with this account, even with the code."
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            busy={busy}
            busyLabel="Removing…"
            onClick={() => void remove()}
          >
            Remove member
          </Button>
        </>
      }
    >
      <label className="flex items-start gap-3 text-body">
        <input
          type="checkbox"
          checked={changeCode}
          onChange={(e) => setChangeCode(e.target.checked)}
          className="mt-1 size-4 accent-[var(--court)]"
        />
        <span>
          Also change the join code
          <span className="block text-label text-muted">
            Recommended if the old code was shared widely. Everyone else keeps their access.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-label text-blocked">
          {error}
        </p>
      )}
    </Dialog>
  )
}

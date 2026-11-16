import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorKey } from '@/features/home/api'
import { useLatestRequest } from '@/features/home/useLatestRequest'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, useToast } from '@/ui'
import type { Member } from '@/features/board/api'
import { patchBoard, withLeader } from './cache'
import type { MemberDialogProps } from './RemoveMemberDialog'

/** The leader hands the group over. The two seats swap roles in one step. */
export function TransferLeadershipDialog(props: MemberDialogProps) {
  return props.member ? <TransferForm {...props} member={props.member} /> : null
}

function TransferForm({ groupId, member, onOpenChange }: MemberDialogProps & { member: Member }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const request = useLatestRequest()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function close(next: boolean) {
    if (!next) request.cancel()
    onOpenChange(next)
  }

  async function transfer() {
    setError(undefined)
    setBusy(true)
    const isCurrent = request.begin()
    const { error: err } = await supabase.rpc('transfer_leadership', { p_member_id: member.id })
    if (!err) patchBoard(queryClient, groupId, (b) => withLeader(b, member.id))
    if (!isCurrent()) return
    setBusy(false)
    if (err) {
      setError(
        errorKey(err) === 'forbidden'
          ? 'Only the leader can hand over leadership.'
          : 'Could not hand over leadership. Try again.',
      )
      return
    }
    toast(`${member.display_name} is now the Leader.`)
    close(false)
  }

  return (
    <Dialog
      open
      onOpenChange={close}
      title={`Make ${member.display_name} the Leader?`}
      description="Are you sure? You become a Member. You will no longer see Logs, add or edit tasks, remove members or change group settings. Only the new Leader can give leadership back."
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            busy={busy}
            busyLabel="Handing over…"
            onClick={() => void transfer()}
          >
            Yes, make {member.display_name} Leader
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-label text-blocked">
          {error}
        </p>
      )}
    </Dialog>
  )
}

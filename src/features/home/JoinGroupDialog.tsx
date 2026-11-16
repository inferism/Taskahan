import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, Input } from '@/ui'
import { errorKey, groupsKey } from './api'
import { codeError, normalizeCode } from './codes'
import { useLatestRequest } from './useLatestRequest'

export function JoinGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const request = useLatestRequest()

  function reset(next: boolean) {
    if (!next) {
      request.cancel()
      setBusy(false)
      setCode('')
      setError(undefined)
    }
    onOpenChange(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const problem = codeError(code)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const isCurrent = request.begin()
    const { data, error: err } = await supabase.rpc('join_group', {
      p_join_code: normalizeCode(code),
    })
    if (!isCurrent()) {
      // Cancelled while waiting: list a group joined anyway, but stay where the user is.
      if (!err && data) void queryClient.invalidateQueries({ queryKey: groupsKey })
      return
    }
    setBusy(false)
    if (err) {
      const key = errorKey(err)
      setError(
        key === 'rate_limited'
          ? 'Too many tries. Wait an hour, then try again.'
          : key === 'membership_limit'
            ? 'You are in 20 groups, the most one account can be in. Leave one first.'
            : 'Could not join. Try again.',
      )
      return
    }
    if (!data) {
      // One answer for a wrong code, a full group and a blocked account.
      setError('That code did not work. Check it with the group leader and try again.')
      return
    }
    await queryClient.invalidateQueries({ queryKey: groupsKey })
    // The dialog may have closed (or the page changed) during the refresh.
    if (!isCurrent()) return
    reset(false)
    void navigate(`/g/${data}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      title="Join a group"
      description="Enter the 8-letter code the group leader gave you."
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Join code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError(undefined)
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="font-mono tracking-[0.15em]"
          error={error}
        />
        <div className="mt-2 flex justify-end gap-2">
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Joining…">
            Join group
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

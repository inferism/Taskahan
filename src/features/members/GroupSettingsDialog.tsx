import { Check, Copy } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorKey, purposeLabels, type GroupPurpose } from '@/features/home/api'
import { codeError, normalizeCode, randomCode } from '@/features/home/codes'
import { useLatestRequest } from '@/features/home/useLatestRequest'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, Input, Select, useToast } from '@/ui'
import type { BoardGroup } from '@/features/board/api'
import { patchBoard } from './cache'

export interface GroupSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: BoardGroup
  /** The limit cannot go below this. */
  activeCount: number
}

const purposeOptions = (Object.keys(purposeLabels) as GroupPurpose[]).map((value) => ({
  value,
  label: purposeLabels[value],
}))

/** Leader only: rename, purpose, member limit, join code. */
export function GroupSettingsDialog(props: GroupSettingsDialogProps) {
  // Remount on each open so the form starts from the saved group.
  return props.open ? <SettingsForm {...props} /> : null
}

function SettingsForm({ onOpenChange, group, activeCount }: GroupSettingsDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const request = useLatestRequest()
  const [name, setName] = useState(group.name)
  const [purpose, setPurpose] = useState<GroupPurpose>(group.purpose)
  const [note, setNote] = useState(group.purpose_note ?? '')
  const [limit, setLimit] = useState(String(group.member_limit))
  const [code, setCode] = useState(group.join_code)
  const [copied, setCopied] = useState(false)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<{ field: string; message: string }>()
  const [busy, setBusy] = useState(false)

  const n = Number(limit)
  const nameProblem = name.trim() ? undefined : 'Give the group a name'
  const codeProblem = codeError(code)
  const limitProblem =
    !Number.isInteger(n) || n < 2 || n > 30
      ? 'Use a whole number from 2 to 30'
      : n < activeCount
        ? `${activeCount} people are in the group now. The limit cannot be lower.`
        : undefined
  const codeChanged = normalizeCode(code) !== group.join_code
  const fieldError = (field: string, local?: string) =>
    serverError?.field === field ? serverError.message : touched ? local : undefined

  function close(next: boolean) {
    if (!next) request.cancel()
    onOpenChange(next)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(group.join_code)
      setCopied(true)
      toast('Join code copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast(`Join code: ${group.join_code}`)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(undefined)
    setTouched(true)
    if (nameProblem || codeProblem || limitProblem) return
    setBusy(true)
    const isCurrent = request.begin()
    const saved = {
      name: name.trim(),
      purpose,
      purpose_note: purpose === 'other' ? note.trim() || null : null,
      member_limit: n,
      join_code: normalizeCode(code),
    }
    const { error } = await supabase.rpc('update_group', {
      p_group_id: group.id,
      p_name: saved.name,
      p_purpose: saved.purpose,
      p_purpose_note: saved.purpose_note ?? '',
      p_member_limit: saved.member_limit,
      p_join_code: saved.join_code,
    })
    if (!error)
      patchBoard(queryClient, group.id, (b) => ({ ...b, group: { ...b.group, ...saved } }))
    if (!isCurrent()) return
    setBusy(false)
    if (error) {
      const key = errorKey(error)
      if (key === 'join_code_taken')
        setServerError({ field: 'code', message: 'That code is taken. Pick another one.' })
      else if (key === 'member_limit_below_active')
        setServerError({
          field: 'limit',
          message: `${activeCount} people are in the group now. The limit cannot be lower.`,
        })
      else if (key === 'forbidden')
        setServerError({ field: 'form', message: 'Only the leader can change group settings.' })
      else setServerError({ field: 'form', message: 'Could not save the settings. Try again.' })
      return
    }
    toast('Group settings saved')
    close(false)
  }

  return (
    <Dialog open onOpenChange={close} title="Group settings">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          error={fieldError('name', nameProblem)}
        />
        <Select
          label="Purpose"
          options={purposeOptions}
          value={purpose}
          onValueChange={(v) => setPurpose(v as GroupPurpose)}
        />
        {purpose === 'other' && (
          <Input
            label="Describe it (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={40}
          />
        )}
        <Input
          label="Member limit"
          type="number"
          inputMode="numeric"
          min={Math.max(2, activeCount)}
          max={30}
          value={limit}
          onChange={(e) => {
            setLimit(e.target.value)
            if (serverError?.field === 'limit') setServerError(undefined)
          }}
          helper={`2 to 30 people. ${activeCount} in the group now.`}
          error={fieldError('limit', limitProblem)}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Join code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              if (serverError?.field === 'code') setServerError(undefined)
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            className="font-mono tracking-[0.15em]"
            helper={
              codeChanged && !codeProblem
                ? 'The old code stops working when you save. Current members keep their access.'
                : 'Eight letters people type to join, A to Z'
            }
            error={fieldError('code', codeProblem)}
          />
          <div className="flex gap-2">
            <Button onClick={() => setCode(randomCode())}>Change code</Button>
            <Button onClick={() => void copy()} aria-label={`Copy join code ${group.join_code}`}>
              {copied ? (
                <Check size={20} strokeWidth={1.75} aria-hidden />
              ) : (
                <Copy size={20} strokeWidth={1.75} aria-hidden />
              )}
              Copy code
            </Button>
          </div>
        </div>
        {serverError?.field === 'form' && (
          <p role="alert" className="text-label text-blocked">
            {serverError.message}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
            Save settings
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

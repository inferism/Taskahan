import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Dialog, DialogClose, Input, Select } from '@/ui'
import { errorKey, groupsKey, purposeLabels, type GroupPurpose } from './api'
import { codeError, normalizeCode, randomCode } from './codes'

const purposeOptions = (Object.keys(purposeLabels) as GroupPurpose[]).map((value) => ({
  value,
  label: purposeLabels[value],
}))

function limitError(raw: string): string | undefined {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 2 || n > 30) return 'Use a whole number from 2 to 30'
}

export function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<GroupPurpose>('student_project')
  const [note, setNote] = useState('')
  const [limit, setLimit] = useState('10')
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<{ field: string; message: string }>()
  const [busy, setBusy] = useState(false)

  const nameProblem = name.trim() ? undefined : 'Give the group a name'
  const codeProblem = codeError(code)
  const limitProblem = limitError(limit)
  const fieldError = (field: string, local?: string) =>
    serverError?.field === field ? serverError.message : touched ? local : undefined

  function reset(next: boolean) {
    if (!next) {
      setName('')
      setPurpose('student_project')
      setNote('')
      setLimit('10')
      setCode('')
      setTouched(false)
      setServerError(undefined)
    }
    onOpenChange(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(undefined)
    setTouched(true)
    if (nameProblem || codeProblem || limitProblem) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name,
      p_purpose: purpose,
      p_purpose_note: purpose === 'other' ? note : '',
      p_member_limit: Number(limit),
      p_join_code: normalizeCode(code),
    })
    setBusy(false)
    if (error || !data) {
      const key = errorKey(error)
      if (key === 'join_code_taken') {
        setServerError({ field: 'code', message: 'That code is taken. Pick another one.' })
      } else if (key === 'membership_limit') {
        setServerError({
          field: 'form',
          message: 'You are in 20 groups, the most one account can be in. Leave one first.',
        })
      } else {
        setServerError({ field: 'form', message: 'Could not create the group. Try again.' })
      }
      return
    }
    await queryClient.invalidateQueries({ queryKey: groupsKey })
    reset(false)
    void navigate(`/g/${data}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      title="Create a group"
      description="You become its Leader. Share the code so others can join."
    >
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
          min={2}
          max={30}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          helper="2 to 30 people, you included"
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
              code && !codeProblem ? 'Looks good' : 'Eight letters people type to join, A to Z'
            }
            error={
              serverError?.field === 'code'
                ? serverError.message
                : code
                  ? codeProblem
                  : touched
                    ? 'Choose an 8-letter code'
                    : undefined
            }
          />
          <Button variant="quiet" className="self-start" onClick={() => setCode(randomCode())}>
            Suggest a code
          </Button>
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
          <Button type="submit" variant="primary" busy={busy} busyLabel="Creating…">
            Create group
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

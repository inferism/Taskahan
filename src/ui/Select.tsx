import { useId, type ReactNode } from 'react'
import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from './cn'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface SelectProps {
  label: string
  options: SelectOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  error?: string
  helper?: string
  disabled?: boolean
}

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  error,
  helper,
  disabled,
}: SelectProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? helper
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label font-semibold">
        {label}
      </label>
      <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <S.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={cn(
            'flex h-11 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-title text-ink',
            'data-[placeholder]:text-muted focus:border-ink disabled:opacity-45',
            error ? 'border-blocked' : 'border-line',
          )}
        >
          <S.Value placeholder={placeholder} />
          <S.Icon>
            <ChevronDown size={20} strokeWidth={1.75} aria-hidden />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={4}
            className="z-50 min-w-(--radix-select-trigger-width) rounded-lg border border-line bg-surface p-1 shadow-overlay"
          >
            <S.Viewport>
              {options.map((o) => (
                <S.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="flex h-11 cursor-default items-center justify-between gap-2 rounded-sm px-3 text-title outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-sunken sm:h-9"
                >
                  <S.ItemText>{o.label}</S.ItemText>
                  <S.ItemIndicator>
                    <Check size={20} strokeWidth={1.75} aria-hidden />
                  </S.ItemIndicator>
                </S.Item>
              ))}
            </S.Viewport>
          </S.Content>
        </S.Portal>
      </S.Root>
      {note && (
        <p id={noteId} className={cn('text-label', error ? 'text-blocked' : 'text-muted')}>
          {note}
        </p>
      )}
    </div>
  )
}

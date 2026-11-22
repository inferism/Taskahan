import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  helper?: string
  /** Problem and the fix, e.g. "Codes are 8 letters, A to Z". */
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const noteId = `${inputId}-note`
  const note = error ?? helper
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-label font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn(
          'h-11 rounded-md border bg-surface px-3.5 text-body text-ink shadow-card transition-[border-color,box-shadow] duration-150 placeholder:text-muted',
          'focus:border-focus',
          'disabled:opacity-45',
          error ? 'border-blocked' : 'border-line',
          className,
        )}
        {...rest}
      />
      {note && (
        <p id={noteId} className={cn('text-label', error ? 'text-blocked' : 'text-muted')}>
          {note}
        </p>
      )}
    </div>
  )
})

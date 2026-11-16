import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** While true, shows `busyLabel` in place of the children and ignores clicks. */
  busy?: boolean
  busyLabel?: string
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-yellow text-on-yellow hover:bg-yellow-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-ink hover:bg-sunken',
  quiet: 'bg-transparent text-ink border border-transparent hover:bg-sunken',
  destructive:
    'bg-surface text-blocked border border-blocked hover:bg-blocked hover:text-on-status',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    busy,
    busyLabel,
    className,
    children,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 font-sans text-body font-semibold transition-colors duration-[120ms] sm:h-10',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
})

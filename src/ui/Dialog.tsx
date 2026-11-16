import type { ReactNode } from 'react'
import { Dialog as D } from 'radix-ui'
import { cn } from './cn'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  /** Buttons, primary on the right. */
  footer?: ReactNode
}

/** 440px dialog on desktop, full-screen sheet on phones. */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <D.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-50 flex flex-col gap-4 bg-surface p-6 text-ink',
            'inset-0 overflow-y-auto sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[440px] sm:max-w-[calc(100vw-32px)]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line sm:shadow-overlay',
          )}
        >
          <D.Title className="text-title font-semibold">{title}</D.Title>
          {description ? <D.Description className="text-body">{description}</D.Description> : null}
          {children}
          {footer && <div className="mt-2 flex justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export const DialogClose = D.Close

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Toast as T } from 'radix-ui'

interface ToastItem {
  id: number
  message: string
}

const ToastContext = createContext<(message: string) => void>(() => {})

/** Toasts are for confirmations only; errors go inline next to the thing that failed. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const show = useCallback((message: string) => {
    setItems((cur) => [...cur, { id: nextId++, message }])
  }, [])
  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      <T.Provider duration={4000} label="Notification">
        {children}
        {items.map((t) => (
          <T.Root
            key={t.id}
            onOpenChange={(open) => {
              if (!open) setItems((cur) => cur.filter((x) => x.id !== t.id))
            }}
            className="toast flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-3 text-body text-ink shadow-overlay"
          >
            <T.Description>{t.message}</T.Description>
            <T.Close className="h-9 rounded-md px-2 font-semibold hover:bg-sunken">Dismiss</T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </T.Provider>
    </ToastContext.Provider>
  )
}

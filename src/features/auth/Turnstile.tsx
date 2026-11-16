import { useEffect, useRef } from 'react'

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | undefined

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing'))
    script.onerror = () => {
      loading = undefined
      reject(new Error('Turnstile failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

interface Props {
  /** Called with a fresh token, or null when it expires or errors. */
  onToken: (token: string | null) => void
}

/** Cloudflare Turnstile widget. Renders nothing when no site key is configured. */
export function Turnstile({ onToken }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  useEffect(() => {
    cb.current = onToken
  })
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey || !host.current) return
    let id: string | undefined
    let gone = false
    loadTurnstile()
      .then((api) => {
        if (gone || !host.current) return
        id = api.render(host.current, {
          sitekey: siteKey,
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        })
      })
      .catch(() => cb.current(null))
    return () => {
      gone = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey])

  if (!siteKey) return null
  return <div ref={host} className="min-h-[65px]" />
}

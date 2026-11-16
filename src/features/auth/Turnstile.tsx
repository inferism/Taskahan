import { useEffect, useRef, useState } from 'react'
import { Button } from '@/ui'

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
    // Clear the cached promise on any failure so Retry downloads the script again.
    const fail = (message: string) => {
      loading = undefined
      script.remove()
      reject(new Error(message))
    }
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail('Turnstile missing'))
    script.onerror = () => fail('Turnstile failed to load')
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
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

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
      .catch(() => {
        cb.current(null)
        if (!gone) setFailed(true)
      })
    return () => {
      gone = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, attempt])

  if (!siteKey) return null
  return (
    <div>
      <div ref={host} className="min-h-[65px]" hidden={failed} />
      {failed && (
        <div role="alert" className="flex items-center gap-3 text-label">
          <span className="text-blocked">The bot check could not load.</span>
          <Button
            onClick={() => {
              setFailed(false)
              setAttempt((a) => a + 1)
            }}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}

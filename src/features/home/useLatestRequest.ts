import { useMemo, useRef } from 'react'

/**
 * Tells a reply whether it still belongs to what is on screen. `begin()` starts a request and
 * returns a check; `cancel()` (on closing the dialog) makes every request in flight stale, so a
 * late reply cannot navigate away from, reset, or report into a dialog opened since.
 */
export function useLatestRequest() {
  const current = useRef(0)
  return useMemo(
    () => ({
      begin: () => {
        const id = ++current.current
        return () => id === current.current
      },
      cancel: () => {
        current.current++
      },
    }),
    [],
  )
}

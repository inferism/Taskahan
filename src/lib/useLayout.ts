import { useSyncExternalStore } from 'react'

/** The three board layouts from DESIGN.md: under 768, 768 to 1279, 1280 and wider. */
export type Layout = 'phone' | 'tablet' | 'desktop'

const PHONE = '(max-width: 767.98px)'
const TABLET = '(min-width: 768px) and (max-width: 1279.98px)'

function read(): Layout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop'
  if (window.matchMedia(PHONE).matches) return 'phone'
  if (window.matchMedia(TABLET).matches) return 'tablet'
  return 'desktop'
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const queries = [PHONE, TABLET].map((q) => window.matchMedia(q))
  queries.forEach((q) => q.addEventListener('change', onChange))
  return () => queries.forEach((q) => q.removeEventListener('change', onChange))
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, read, () => 'desktop')
}

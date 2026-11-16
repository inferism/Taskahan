import { useEffect } from 'react'
import { applyTheme, getThemePreference } from '@/lib/theme'
import { useProfile } from './api'

/**
 * The theme paints from localStorage before React starts (public/theme-init.js); once the
 * account's saved theme arrives it wins, so a choice made on one device shows on every other.
 * While the preference is System, a change of the device's own setting repaints live.
 */
export function ThemeSync() {
  const saved = useProfile().data?.theme

  useEffect(() => {
    if (saved && saved !== getThemePreference()) applyTheme(saved)
  }, [saved])

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const follow = () => {
      if (getThemePreference() === 'system') applyTheme('system')
    }
    media.addEventListener?.('change', follow)
    return () => media.removeEventListener?.('change', follow)
  }, [])

  return null
}

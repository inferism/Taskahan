import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

export const HEARTBEAT_MS = 60 * 60 * 1000

/** Keeps profiles.last_active_at fresh: once on load, then at most hourly. Renders nothing. */
export function ActivityHeartbeat() {
  const userId = useAuth().session?.user.id

  useEffect(() => {
    if (!userId) return
    // A failed beat is harmless; the next one retries.
    const beat = () =>
      void supabase.rpc('touch_activity').then(
        () => {},
        () => {},
      )
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [userId])

  return null
}

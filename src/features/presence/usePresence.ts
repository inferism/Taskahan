import { useMemo, useSyncExternalStore } from 'react'
import type { Board } from '@/features/board/api'
import { getOnline, subscribeOnline } from '@/realtime/presence'

/**
 * Membership ids that are online in this group. Presence payloads are claims by other clients,
 * so only ids that are active members in the snapshot count (SECURITY.md section 11).
 */
export function usePresence(board: Board): ReadonlySet<string> {
  const raw = useSyncExternalStore(
    subscribeOnline,
    () => getOnline(board.group.id),
    () => getOnline(board.group.id),
  )
  return useMemo(() => {
    const active = new Set(board.memberships.filter((m) => m.status === 'active').map((m) => m.id))
    return new Set([...raw].filter((id) => active.has(id)))
  }, [raw, board.memberships])
}

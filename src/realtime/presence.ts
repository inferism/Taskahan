/**
 * Who is online in each open group (ARCHITECTURE.md section 6). Presence lives only in the
 * channel; nothing is stored. Each connection tracks `{ member_id }`, so a member with two tabs
 * has two entries and stays online until both are gone.
 */

const online = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()
const none: ReadonlySet<string> = new Set()

/** Membership ids present in a presence state. Entries without a string member_id are ignored. */
export function onlineMembers(state: Record<string, { member_id?: unknown }[]>) {
  const ids = new Set<string>()
  for (const metas of Object.values(state))
    for (const meta of metas) if (typeof meta.member_id === 'string') ids.add(meta.member_id)
  return ids
}

export function setOnline(groupId: string, ids: ReadonlySet<string>) {
  online.set(groupId, ids)
  listeners.forEach((l) => l())
}

export function clearOnline(groupId: string) {
  if (online.delete(groupId)) listeners.forEach((l) => l())
}

export const getOnline = (groupId: string) => online.get(groupId) ?? none

export function subscribeOnline(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

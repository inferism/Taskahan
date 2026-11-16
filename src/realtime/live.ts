import { useSyncExternalStore } from 'react'

/**
 * Small live-state stores the board reads beside the query cache (DESIGN.md, Board):
 * whether a group's change stream is down, and which task rows someone else just changed.
 */

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** Groups whose channel dropped and has not come back yet. */
const down = new Set<string>()

export function setReconnecting(groupId: string, value: boolean) {
  if (value === down.has(groupId)) return
  if (value) down.add(groupId)
  else down.delete(groupId)
  emit()
}

export const isReconnecting = (groupId: string) => down.has(groupId)

/** True while the group's channel is reconnecting. */
export function useReconnecting(groupId: string): boolean {
  return useSyncExternalStore(subscribe, () => isReconnecting(groupId))
}

/** A counter per task, bumped each time a change arrives that alters what its row shows. */
const flashes = new Map<string, number>()

export function flashTask(taskId: string) {
  flashes.set(taskId, (flashes.get(taskId) ?? 0) + 1)
  emit()
}

export const taskFlash = (taskId: string) => flashes.get(taskId) ?? 0

/** 0 until the task first changes under the viewer; a new value restarts the wash. */
export function useTaskFlash(taskId: string): number {
  return useSyncExternalStore(subscribe, () => taskFlash(taskId))
}

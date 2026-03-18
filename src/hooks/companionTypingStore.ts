/**
 * companionTypingStore — module-level reactive store for companions with pending
 * delayed messages. Lets useAICompanions (writer) and ChatSection (reader) share
 * state without prop drilling or a new context provider.
 *
 * Usage:
 *   Writer: addPendingCompanion(id) / removePendingCompanion(id)
 *   Reader: usePendingCompanions() → string[]
 */

import { useSyncExternalStore } from 'react'

let pendingIds: string[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function addPendingCompanion(id: string) {
  if (pendingIds.includes(id)) return
  pendingIds = [...pendingIds, id]
  notify()
}

export function removePendingCompanion(id: string) {
  pendingIds = pendingIds.filter((p) => p !== id)
  notify()
}

export function clearPendingCompanions() {
  if (pendingIds.length === 0) return
  pendingIds = []
  notify()
}

export function usePendingCompanions(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => pendingIds,
  )
}

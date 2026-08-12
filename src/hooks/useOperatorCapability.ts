import { useEffect, useRef, useState } from 'react'
import {
  normalizeOperatorCapability,
  operatorCapabilityStorageKey,
  parseOperatorCapabilityFragment,
} from '../lib/operator-capability'
import { supabase } from '../lib/supabase'

interface CapabilityState {
  roomId: string | null
  revision: number | null
  capability: string | null
}

export interface OperatorCapabilityResult {
  capability: string | null
  isLoading: boolean
}

/**
 * Imports a room capability from the initial URL or a later rotated-link hash,
 * persists it only in this browser, and removes it from the visible URL before
 * the operator can copy or screenshot the page. Mount this at the route owner,
 * never inside a conditional operator panel. Fragments are never sent in the
 * HTTP request.
 */
export function useOperatorCapability(
  roomId: string | undefined,
  enabled: boolean,
  revision: number | undefined,
  routeIdentity = '',
): OperatorCapabilityResult {
  const memoryCapabilityRef = useRef<CapabilityState>({
    roomId: null,
    revision: null,
    capability: null,
  })
  const [state, setState] = useState<CapabilityState>({
    roomId: null,
    revision: null,
    capability: null,
  })

  useEffect(() => {
    if (!enabled || !roomId) {
      memoryCapabilityRef.current = { roomId: null, revision: null, capability: null }
      setState({ roomId: null, revision: null, capability: null })
      return
    }

    const storageKey = operatorCapabilityStorageKey(roomId)
    const expectedRevision = revision ?? null
    let cancelled = false
    let consumeVersion = 0
    const publish = (capability: string | null, version: number) => {
      if (cancelled || version !== consumeVersion) return
      const next = { roomId, revision: expectedRevision, capability }
      memoryCapabilityRef.current = next
      setState(next)
    }
    const consume = async (allowMemoryFallback: boolean) => {
      const version = ++consumeVersion
      let stored: string | null = null
      let storedValue: string | null = null
      try {
        storedValue = localStorage.getItem(storageKey)
        stored = normalizeOperatorCapability(storedValue)
        if (!stored && storedValue !== null) {
          localStorage.removeItem(storageKey)
        }
      } catch {
        stored = null
      }

      const fragment = parseOperatorCapabilityFragment(window.location.hash)
      if (fragment.had_operator_parameter) {
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}${fragment.remaining_hash}`,
        )
      }

      const memory = memoryCapabilityRef.current
      const capability = fragment.capability
        ?? stored
        ?? (allowMemoryFallback && memory.roomId === roomId ? memory.capability : null)
      if (!capability) {
        publish(null, version)
        return
      }

      const { data, error } = await supabase.rpc('validate_room_operator_capability', {
        p_room_id: roomId,
        p_operator_capability: capability,
      })
      if (error || data !== true) {
        if (stored === capability) {
          try { localStorage.removeItem(storageKey) } catch { /* memory-only fallback */ }
        }
        publish(null, version)
        return
      }

      if (fragment.capability) {
        try { localStorage.setItem(storageKey, fragment.capability) } catch { /* memory-only fallback */ }
      }
      publish(capability, version)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) void consume(false)
    }
    const handleHashChange = () => { void consume(true) }
    void consume(true)
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [enabled, revision, roomId, routeIdentity])

  const expectedRevision = revision ?? null
  const isCurrentRoom = state.roomId === roomId && state.revision === expectedRevision
  return {
    capability: isCurrentRoom ? state.capability : null,
    isLoading: enabled && roomId !== undefined && !isCurrentRoom,
  }
}

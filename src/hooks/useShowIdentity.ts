/**
 * useShowIdentity — what show is this room bound to, in the words a player sees.
 *
 * Read-only. One `show_packs` select of the registry columns, deduplicated and
 * cached per pack id at module scope so the many surfaces that need the show's
 * name (landing, explainer, draft, chat, live home, scores, results, share
 * cards) cost one request per room rather than one per component.
 *
 * The legacy pack never fetches: its identity is pinned in `show-identity.ts`
 * so a legacy room renders its exact authored copy on the first frame. A room
 * with no binding, a pack whose row has not resolved yet, and a failed read all
 * resolve to the unbound identity — the restrictive answer, because showing the
 * platform's own wording is always safe and naming the wrong show is not.
 */

import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  LEGACY_SHOW_IDENTITY,
  UNBOUND_SHOW_IDENTITY,
  isLegacyShowPack,
  showIdentityFromPackRow,
  type ShowIdentity,
} from '../lib/show-identity'

const resolved = new Map<string, ShowIdentity>()
const inFlight = new Map<string, Promise<ShowIdentity>>()

function loadIdentity(showPackId: string): Promise<ShowIdentity> {
  const existing = inFlight.get(showPackId)
  if (existing) return existing

  const request = Promise.resolve(
    supabase
      .from('show_packs')
      .select('title, property, installment')
      .eq('id', showPackId)
      .single(),
  ).then(({ data, error }) => {
    // A failed read stays retryable: only a real answer is cached.
    const identity = error ? UNBOUND_SHOW_IDENTITY : showIdentityFromPackRow(showPackId, data)
    if (!error) resolved.set(showPackId, identity)
    inFlight.delete(showPackId)
    return identity
  })

  inFlight.set(showPackId, request)
  return request
}

/** The answer available without a read, or null when one is needed. */
function settledIdentity(showPackId: string | null): ShowIdentity | null {
  if (showPackId == null) return UNBOUND_SHOW_IDENTITY
  if (isLegacyShowPack(showPackId)) return LEGACY_SHOW_IDENTITY
  return resolved.get(showPackId) ?? null
}

export interface ShowIdentityState {
  identity: ShowIdentity
  /** True while a non-legacy pack row is still being read. */
  isLoading: boolean
}

interface InternalState extends ShowIdentityState {
  showPackId: string | null
}

/**
 * The same read, for a pack id the caller already holds.
 *
 * The session-free routes (`/recap/:code`) resolve a room by code rather than
 * through GameContext, so the show they must name is the record's, not the
 * viewer's. They pass that pack id here and share this module's cache and
 * in-flight deduplication rather than carrying a second loader.
 */
export function useShowIdentityForPack(showPackId: string | null): ShowIdentityState {
  const known = settledIdentity(showPackId)

  const [state, setState] = useState<InternalState>({
    showPackId,
    identity: known ?? UNBOUND_SHOW_IDENTITY,
    isLoading: known == null,
  })

  useEffect(() => {
    const already = settledIdentity(showPackId)
    if (already != null) {
      setState({ showPackId, identity: already, isLoading: false })
      return
    }
    let cancelled = false
    setState({ showPackId, identity: UNBOUND_SHOW_IDENTITY, isLoading: true })
    void loadIdentity(showPackId as string).then((identity) => {
      if (cancelled) return
      setState({ showPackId, identity, isLoading: false })
    })
    return () => { cancelled = true }
  }, [showPackId])

  // The frame where the room changed but the effect has not run yet: never
  // render one room's show name inside another room.
  if (state.showPackId !== showPackId) {
    return { identity: known ?? UNBOUND_SHOW_IDENTITY, isLoading: known == null }
  }
  return { identity: state.identity, isLoading: state.isLoading }
}

/** The identity of the room this viewer has a session in. */
export function useShowIdentity(): ShowIdentityState {
  const { room } = useGame()
  return useShowIdentityForPack(room?.show_pack_id ?? null)
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface GroundingReviewMessage {
  companion_id: string
  text: string
  delay_seconds: number
}

export interface GroundingReviewFinding {
  companion_id: string
  text: string
  violations: string[]
}

export interface PendingCompanionGroundingReview {
  id: string
  reaction_key: string
  surface: string
  engine: 'browser' | 'daemon'
  facts: string[]
  attempted_messages: GroundingReviewMessage[]
  findings: GroundingReviewFinding[]
  attempts: number
  model: string
  created_at: string
}

export function useCompanionGroundingReviews(
  roomId: string | undefined,
  actorPlayerId: string | undefined,
  reviewRevision: number | undefined,
  enabled: boolean,
  operatorCapability: string | null,
) {
  const [reviews, setReviews] = useState<PendingCompanionGroundingReview[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scope = enabled && roomId && actorPlayerId && operatorCapability
    ? `${roomId}:${actorPlayerId}:${reviewRevision ?? 'unknown'}:${operatorCapability}`
    : null
  const currentScopeRef = useRef(scope)
  const activeDismissRef = useRef<{ scope: string; reviewId: string } | null>(null)
  currentScopeRef.current = scope

  useEffect(() => {
    activeDismissRef.current = null
    setDismissingId(null)
    if (!scope || !roomId || !actorPlayerId) {
      setReviews([])
      setIsLoading(false)
      setLoadedScope(null)
      setError(null)
      return
    }
    let cancelled = false
    setReviews([])
    setIsLoading(true)
    setError(null)
    void (async () => {
      const { data, error: readError } = await supabase.rpc(
        'list_pending_companion_grounding_reviews_authorized',
        {
          p_room_id: roomId,
          p_actor_player_id: actorPlayerId,
          p_operator_capability: operatorCapability,
        },
      )
      if (cancelled) return
      if (readError) {
        setError(readError.message)
      } else {
        setReviews((data ?? []) as PendingCompanionGroundingReview[])
        setError(null)
      }
      setLoadedScope(scope)
      setIsLoading(false)
    })()
    return () => { cancelled = true }
  }, [scope, roomId, actorPlayerId, operatorCapability])

  const dismiss = useCallback(async (reviewId: string) => {
    if (!enabled || !roomId || !actorPlayerId || !operatorCapability
      || !scope || activeDismissRef.current !== null) {
      return false
    }
    const operation = { scope, reviewId }
    activeDismissRef.current = operation
    setDismissingId(reviewId)
    setError(null)
    try {
      const { data, error: dismissError } = await supabase.rpc(
        'dismiss_companion_grounding_review_authorized',
        {
          p_room_id: roomId,
          p_review_id: reviewId,
          p_actor_player_id: actorPlayerId,
          p_operator_capability: operatorCapability,
        },
      )
      if (dismissError) throw new Error(dismissError.message)
      if (data !== true) throw new Error('That grounding review is no longer pending.')
      if (currentScopeRef.current !== operation.scope || activeDismissRef.current !== operation) {
        return false
      }
      setReviews((current) => current.filter((review) => review.id !== reviewId))
      return true
    } catch (caught) {
      if (currentScopeRef.current === operation.scope && activeDismissRef.current === operation) {
        setError(caught instanceof Error ? caught.message : 'Could not dismiss that grounding review.')
      }
      return false
    } finally {
      if (activeDismissRef.current === operation) {
        activeDismissRef.current = null
        setDismissingId(null)
      }
    }
  }, [enabled, roomId, actorPlayerId, operatorCapability, scope])

  const isCurrentScope = scope !== null && loadedScope === scope
  const capabilityError = enabled && roomId && actorPlayerId && !operatorCapability
    ? 'Operator capability required. Open this room from its private operator link.'
    : null
  return {
    reviews: isCurrentScope ? reviews : [],
    isLoading: scope !== null && (!isCurrentScope || isLoading),
    dismissingId,
    error: capabilityError ?? (isCurrentScope ? error : null),
    dismiss,
  }
}

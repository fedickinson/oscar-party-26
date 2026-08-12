import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WitnessRulingOption } from '../lib/witness-authority'

export interface PendingWitnessProposal {
  id: string
  source_signature_beat_id: number
  beat_name: string
  trigger_text: string
  exclusions: string[]
  adjudication: {
    proxies: string
    offscreen: string
    mentions: string
  }
  points: number
  entity_id: string
  entity_name: string
  confidence: number
  observed_at: string
  frame_sha256: string
  reference_manifest_sha256: string
  reference_images_sha256: string
  model_output_sha256: string
  model: string
  created_at: string
  observation_count: number
  matching_entity_count: number
  conflicting_entity_count: number
  conflicting_entity_name: string | null
  ruling_options: WitnessRulingOption[]
  minimum_confidence: number
  maximum_confidence: number
  latest_observed_at: string
}

export type WitnessReviewAction = 'accept' | 'dismiss'

export function useWitnessProposals(
  roomId: string | undefined,
  actorPlayerId: string | undefined,
  witnessRevision: number | undefined,
  enabled: boolean,
  operatorCapability: string | null,
) {
  const [proposals, setProposals] = useState<PendingWitnessProposal[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const scope = enabled && roomId && actorPlayerId && operatorCapability
    ? `${roomId}:${actorPlayerId}:${witnessRevision ?? 'unknown'}:${operatorCapability}:${refreshRevision}`
    : null
  const currentScopeRef = useRef(scope)
  const activeReviewRef = useRef<{ scope: string; proposalId: string } | null>(null)
  currentScopeRef.current = scope

  useEffect(() => {
    activeReviewRef.current = null
    setReviewingId(null)
    if (!scope || !roomId || !actorPlayerId) {
      setProposals([])
      setIsLoading(false)
      setLoadedScope(null)
      setError(null)
      return
    }
    let cancelled = false
    setProposals([])
    setIsLoading(true)
    setError(null)
    void (async () => {
      const { data, error: readError } = await supabase.rpc(
        'list_pending_witness_proposals_authorized_v2',
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
        setProposals((data ?? []) as PendingWitnessProposal[])
        setError(null)
      }
      setLoadedScope(scope)
      setIsLoading(false)
    })()
    return () => { cancelled = true }
  }, [scope, roomId, actorPlayerId, operatorCapability])

  const review = useCallback(async (
    proposalId: string,
    action: WitnessReviewAction,
    selectedEntityId: string | null = null,
    expectedObservationCount: number | null = null,
  ) => {
    if (!enabled || !roomId || !actorPlayerId || !operatorCapability
      || !scope || activeReviewRef.current !== null) {
      return false
    }
    const operation = { scope, proposalId }
    activeReviewRef.current = operation
    setReviewingId(proposalId)
    setError(null)
    try {
      const { error: reviewError } = await supabase.rpc(
        'review_witness_proposal_authorized_v2',
        {
          p_room_id: roomId,
          p_proposal_id: proposalId,
          p_actor_player_id: actorPlayerId,
          p_action: action,
          p_selected_entity_id: action === 'accept' ? selectedEntityId : null,
          p_expected_observation_count: action === 'accept' ? expectedObservationCount : null,
          p_operator_capability: operatorCapability,
        },
      )
      if (reviewError?.code === '40001') {
        setRefreshRevision((current) => current + 1)
        return false
      }
      if (reviewError) throw new Error(reviewError.message)
      if (currentScopeRef.current !== operation.scope || activeReviewRef.current !== operation) {
        return false
      }
      setProposals((current) => current.filter((proposal) => proposal.id !== proposalId))
      return true
    } catch (caught) {
      if (currentScopeRef.current === operation.scope && activeReviewRef.current === operation) {
        setError(caught instanceof Error ? caught.message : 'Could not review that witness proposal.')
      }
      return false
    } finally {
      if (activeReviewRef.current === operation) {
        activeReviewRef.current = null
        setReviewingId(null)
      }
    }
  }, [enabled, roomId, actorPlayerId, operatorCapability, scope])

  const isCurrentScope = scope !== null && loadedScope === scope
  const capabilityError = enabled && roomId && actorPlayerId && !operatorCapability
    ? 'Operator capability required. Open this room from its private operator link.'
    : null
  return {
    proposals: isCurrentScope ? proposals : [],
    isLoading: scope !== null && (!isCurrentScope || isLoading),
    reviewingId,
    error: capabilityError ?? (isCurrentScope ? error : null),
    review,
  }
}

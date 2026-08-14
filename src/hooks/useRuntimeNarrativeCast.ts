import { useEffect, useState } from 'react'
import { LEGACY_SHOW_PACK_ID } from '../lib/catalog-scope'
import { buildRoomRuntimeNarrativeCast, type PackRuntimeNarrativeCast } from '../lib/runtime-narrative'
import { supabase } from '../lib/supabase'

interface RuntimeNarrativeCastState {
  showPackId: string | null
  cast: PackRuntimeNarrativeCast | null
  isLoading: boolean
  error: string | null
}

export function useRuntimeNarrativeCast(showPackId: string | undefined): RuntimeNarrativeCastState {
  const needsPackCast = Boolean(showPackId && showPackId !== LEGACY_SHOW_PACK_ID)
  const [state, setState] = useState<RuntimeNarrativeCastState>({
    showPackId: showPackId ?? null,
    cast: null,
    isLoading: needsPackCast,
    error: null,
  })

  useEffect(() => {
    if (!showPackId || showPackId === LEGACY_SHOW_PACK_ID) {
      setState({ showPackId: showPackId ?? null, cast: null, isLoading: false, error: null })
      return
    }
    let cancelled = false
    setState({ showPackId, cast: null, isLoading: true, error: null })
    void supabase
      .from('show_packs')
      .select('pack_key, version, compiled_bundle')
      .eq('id', showPackId)
      .eq('status', 'published')
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || data?.compiled_bundle == null) {
          setState({
            showPackId,
            cast: null,
            isLoading: false,
            error: 'The room show pack could not be loaded for narrative identity.',
          })
          return
        }
        try {
          const cast = buildRoomRuntimeNarrativeCast(showPackId, data)
          if (!cast) {
            setState({
              showPackId,
              cast: null,
              isLoading: false,
              error: 'The room show pack has no complete runtime narrative cast.',
            })
            return
          }
          setState({
            showPackId,
            cast,
            isLoading: false,
            error: null,
          })
        } catch (parseError) {
          console.error('Runtime narrative pack load failed:', parseError)
          setState({
            showPackId,
            cast: null,
            isLoading: false,
            error: 'The room show pack has an invalid narrative contract.',
          })
        }
      })

    return () => { cancelled = true }
  }, [showPackId])

  if (state.showPackId !== (showPackId ?? null)) {
    return {
      showPackId: showPackId ?? null,
      cast: null,
      isLoading: needsPackCast,
      error: null,
    }
  }
  return state
}

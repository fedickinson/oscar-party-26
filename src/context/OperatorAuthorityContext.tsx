import { createContext, useContext, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useOperatorCapability } from '../hooks/useOperatorCapability'
import { deriveRefereeAuthority, type RefereeAuthority } from '../lib/referee-authority'
import { useGame } from './GameContext'

interface OperatorAuthorityContextValue {
  capability: string | null
  isLoading: boolean
  authority: RefereeAuthority
}

const OperatorAuthorityContext = createContext<OperatorAuthorityContextValue | null>(null)

/**
 * Owns private-link import for the whole room route family. The bearer must be
 * available before the lobby's first shared command and remain the same across
 * phase-driven navigation, so no individual screen may own this lifecycle.
 */
export function OperatorAuthorityProvider({ children }: { children: React.ReactNode }) {
  const { room, player } = useGame()
  const location = useLocation()
  const result = useOperatorCapability(
    room?.id,
    room != null,
    room?.operator_capability_revision,
    `${location.pathname}${location.search}${location.hash}`,
  )
  const authority = useMemo(() => deriveRefereeAuthority({
    isHost: player?.is_host ?? false,
    capability: result.capability,
    capabilityLoading: result.isLoading,
  }), [player?.is_host, result.capability, result.isLoading])

  return (
    <OperatorAuthorityContext.Provider value={{
      capability: result.capability,
      isLoading: result.isLoading,
      authority,
    }}>
      {children}
    </OperatorAuthorityContext.Provider>
  )
}

export function useOperatorAuthority(): OperatorAuthorityContextValue {
  const context = useContext(OperatorAuthorityContext)
  if (!context) throw new Error('useOperatorAuthority must be used inside OperatorAuthorityProvider')
  return context
}

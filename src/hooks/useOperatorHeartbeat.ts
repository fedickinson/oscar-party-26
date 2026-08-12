import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { OperatorHeartbeatRow } from '../types/database'

interface OperatorHeartbeatState {
  heartbeat: OperatorHeartbeatRow | null
  isLoading: boolean
  error: string | null
  nowMs: number
}

export function useOperatorHeartbeat(
  roomId: string | undefined,
): OperatorHeartbeatState {
  const [heartbeat, setHeartbeat] = useState<OperatorHeartbeatRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    setHeartbeat(null)
    setError(null)
    setIsLoading(Boolean(roomId))
    if (!roomId) return

    let cancelled = false
    let changeVersion = 0
    let loaded = false

    const load = async () => {
      if (loaded) return
      loaded = true
      const versionAtStart = changeVersion
      const { data, error: fetchError } = await supabase
        .from('operator_heartbeats')
        .select()
        .eq('room_id', roomId)
        .eq('engine', 'companion_daemon')
        .maybeSingle()
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      if (changeVersion === versionAtStart) {
        setHeartbeat((data as OperatorHeartbeatRow | null) ?? null)
      }
      setIsLoading(false)
    }

    const channel = supabase
      .channel(`operator-heartbeat:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operator_heartbeats',
        },
        (payload) => {
          if (cancelled) return
          const changed = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<OperatorHeartbeatRow>
          if (changed.room_id !== roomId || changed.engine !== 'companion_daemon') return
          changeVersion += 1
          setIsLoading(false)
          if (payload.eventType === 'DELETE') {
            setHeartbeat(null)
            return
          }
          setHeartbeat(payload.new as OperatorHeartbeatRow)
        },
      )
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') void load()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setError('Heartbeat subscription unavailable')
          setIsLoading(false)
        }
      })

    const tick = window.setInterval(() => setNowMs(Date.now()), 5_000)
    setNowMs(Date.now())
    return () => {
      cancelled = true
      window.clearInterval(tick)
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  return { heartbeat, isLoading, error, nowMs }
}

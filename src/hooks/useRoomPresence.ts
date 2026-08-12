import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { OperatorPresenceMeta } from '../lib/operator-lens'

interface PresenceIdentity {
  id: string
}

export function useRoomPresence(
  roomId: string | undefined,
  player: PresenceIdentity | null,
): { metas: OperatorPresenceMeta[]; isSynced: boolean } {
  const [metas, setMetas] = useState<OperatorPresenceMeta[]>([])
  const [isSynced, setIsSynced] = useState(false)

  useEffect(() => {
    setMetas([])
    setIsSynced(false)
    if (!roomId || !player) return

    let subscribed = false
    let disposed = false
    const payload = (): OperatorPresenceMeta => ({
      player_id: player.id,
      visible: document.visibilityState === 'visible',
      tracked_at: new Date().toISOString(),
    })
    const channel = supabase.channel(`room-presence:${roomId}`, {
      config: { presence: { key: player.id } },
    })

    const syncPresence = () => {
      if (disposed) return
      const state = channel.presenceState<OperatorPresenceMeta>()
      setMetas(
        Object.values(state).flatMap((entries) =>
          entries.map(({ player_id, visible, tracked_at }) => ({
            player_id,
            visible,
            tracked_at,
          }))),
      )
      setIsSynced(true)
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void channel.track(payload())
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          setMetas([])
          setIsSynced(false)
        }
      })

    const trackVisibility = () => {
      if (subscribed) void channel.track(payload())
    }
    document.addEventListener('visibilitychange', trackVisibility)

    return () => {
      disposed = true
      subscribed = false
      document.removeEventListener('visibilitychange', trackVisibility)
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [roomId, player?.id])

  return { metas, isSynced }
}

/**
 * useChat — fetches and subscribes to room chat messages.
 *
 * Subscribe before initial fetch to close the race window.
 * INSERT events from Realtime append to local state.
 * sendMessage writes to the messages table — Realtime delivers it back.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MessageRow } from '../types/database'

export type { MessageRow }

export function useChat(roomId: string | undefined, channelKey = 'default') {
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    // Subscribe first so we don't miss messages inserted between fetch + subscribe
    // channelKey disambiguates callers so two useChat instances on the same roomId
    // don't share (and accidentally unsubscribe) the same Supabase channel object.
    const channel = supabase
      .channel(`chat:${roomId}:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow
          setMessages((prev) => {
            // Deduplicate in case the optimistic insert already arrived
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        },
      )
      .subscribe()

    // Then fetch existing messages — merge with any already-accumulated via Realtime
    // to avoid overwriting messages that arrived between subscribe and fetch completing.
    supabase
      .from('messages')
      .select('id, room_id, player_id, text, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setMessages((prev) => {
            const fetched = data as MessageRow[]
            // Merge: keep any subscription-delivered messages not in the fetched snapshot
            const fetchedIds = new Set(fetched.map((m) => m.id))
            const extra = prev.filter((m) => !fetchedIds.has(m.id))
            return [...fetched, ...extra].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            )
          })
        }
        setIsLoading(false)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, channelKey])

  async function sendMessage(playerId: string, text: string): Promise<{ error: Error | null }> {
    if (!roomId || !playerId || !text.trim()) return { error: null }
    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      player_id: playerId,
      text: text.trim(),
    })
    if (error) return { error: new Error(error.message) }
    return { error: null }
  }

  return { messages, sendMessage, isLoading }
}

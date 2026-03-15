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

export function useChat(roomId: string | undefined) {
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    // Subscribe first so we don't miss messages inserted between fetch + subscribe
    const channel = supabase
      .channel(`chat:${roomId}`)
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

    // Then fetch existing messages
    supabase
      .from('messages')
      .select('id, room_id, player_id, text, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as MessageRow[])
        setIsLoading(false)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  async function sendMessage(playerId: string, text: string) {
    if (!roomId || !playerId || !text.trim()) return
    await supabase.from('messages').insert({
      room_id: roomId,
      player_id: playerId,
      text: text.trim(),
    })
  }

  return { messages, sendMessage, isLoading }
}

/**
 * useChat — fetches and subscribes to room chat messages.
 *
 * Subscribe before initial fetch to close the race window.
 * INSERT events from Realtime append to local state.
 * sendMessage writes to the messages table — Realtime delivers it back.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MessageRow } from '../types/database'
import { fetchAllRows } from './fetch-all-rows'

export type { MessageRow }

const CHAT_REALTIME_STABILIZATION_MS = 5_000

export function useChat(roomId: string | undefined, channelKey = 'default') {
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const activeScopeRef = useRef<string | null>(null)
  const canSendRef = useRef(false)

  const requestedScope = roomId ?? null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId) {
      activeScopeRef.current = null
      canSendRef.current = false
      setMessages([])
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    activeScopeRef.current = roomId
    canSendRef.current = false
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    setMessages([])
    setLoadingState(true)
    setSyncErrorState(null)

    const compareMessages = (left: MessageRow, right: MessageRow) => (
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
    )
    const upsertMessage = (message: MessageRow) => {
      setMessages((current) => {
        const index = current.findIndex((candidate) => candidate.id === message.id)
        const next = index === -1
          ? [...current, message]
          : current.map((candidate, candidateIndex) => (
            candidateIndex === index ? message : candidate
          ))
        return next.sort(compareMessages)
      })
    }

    const hydrateMessages = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const result = await fetchAllRows<MessageRow>((from, to) => supabase
            .from('messages')
            .select('id, room_id, player_id, text, created_at')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to))
          if (result.error) throw result.error
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          setMessages((result.data ?? []).sort(compareMessages))
          canSendRef.current = true
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Chat record load failed:', loadError)
        setSyncErrorState('The room chat could not be synchronized.')
        setLoadingState(false)
      }
    }

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
          if (disposed) return
          liveRevision += 1
          const msg = payload.new as MessageRow
          upsertMessage(msg)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateMessages()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateMessages(false)
          }, CHAT_REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          canSendRef.current = false
          hydrationRun += 1
          setSyncErrorState('The room chat feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      canSendRef.current = false
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      supabase.removeChannel(channel)
    }
  }, [roomId, channelKey, retryVersion])

  const retrySync = useCallback(() => {
    canSendRef.current = false
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  async function sendMessage(playerId: string, text: string): Promise<{ error: Error | null }> {
    if (!roomId || !playerId || !text.trim()) return { error: null }
    if (!canSendRef.current || isLoading || syncError != null) {
      return { error: new Error('Chat must finish synchronizing before a message can be sent.') }
    }
    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      player_id: playerId,
      text: text.trim(),
    })
    if (error) return { error: new Error(error.message) }
    return { error: null }
  }

  return { messages, sendMessage, isLoading, syncError, retrySync }
}

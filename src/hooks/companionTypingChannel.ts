import { supabase } from '../lib/supabase'

export interface CompanionTypingPayload {
  id: string
  typing: boolean
}

type TypingListener = (payload: CompanionTypingPayload) => void

interface SharedTypingChannel {
  channel: ReturnType<typeof supabase.channel>
  listeners: Set<TypingListener>
  references: number
  disposalTimer: ReturnType<typeof setTimeout> | null
}

export interface CompanionTypingChannelHandle {
  send: (payload: CompanionTypingPayload) => Promise<unknown>
  release: () => void
}

const channels = new Map<string, SharedTypingChannel>()

function createSharedChannel(roomId: string): SharedTypingChannel {
  const listeners = new Set<TypingListener>()
  const channel = supabase
    .channel(`room-${roomId}-companion-typing`)
    .on('broadcast', { event: 'companion_typing' }, ({ payload }) => {
      if (!payload || typeof payload.id !== 'string' || typeof payload.typing !== 'boolean') return
      listeners.forEach((listener) => listener(payload as CompanionTypingPayload))
    })

  channel.subscribe()
  return { channel, listeners, references: 0, disposalTimer: null }
}

/**
 * One browser client may have several companion features mounted at once, but
 * Supabase allows only one joined channel for a topic. Share that transport so
 * a later subscriber never evicts the host's sender or the chat's listener.
 * Delayed disposal also makes React Strict Mode's release/reacquire cycle safe.
 */
export function acquireCompanionTypingChannel(
  roomId: string,
  listener?: TypingListener,
): CompanionTypingChannelHandle {
  let shared = channels.get(roomId)
  if (!shared) {
    shared = createSharedChannel(roomId)
    channels.set(roomId, shared)
  }
  if (shared.disposalTimer) {
    clearTimeout(shared.disposalTimer)
    shared.disposalTimer = null
  }
  shared.references += 1
  if (listener) shared.listeners.add(listener)

  let released = false
  return {
    send: (payload) => shared.channel.send({
      type: 'broadcast',
      event: 'companion_typing',
      payload,
    }),
    release: () => {
      if (released) return
      released = true
      if (listener) shared.listeners.delete(listener)
      shared.references = Math.max(0, shared.references - 1)
      if (shared.references !== 0) return
      shared.disposalTimer = setTimeout(() => {
        if (shared.references !== 0 || channels.get(roomId) !== shared) return
        channels.delete(roomId)
        void supabase.removeChannel(shared.channel)
      }, 0)
    },
  }
}

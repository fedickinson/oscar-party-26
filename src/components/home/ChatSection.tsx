/**
 * ChatSection — real-time room chat.
 *
 * - Auto-scrolls to newest message on mount and on each new message.
 * - Current player's messages align right; others align left.
 * - Empty state when no messages exist.
 * - Input bar at bottom: 16px font-size to prevent iOS zoom.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useChat } from '../../hooks/useChat'
import Avatar from '../Avatar'

export default function ChatSection() {
  const { room, player, players } = useGame()
  const { messages, sendMessage, isLoading } = useChat(room?.id)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text || !player) return
    sendMessage(player.id, text)
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden flex flex-col">
      {/* Message list */}
      <div
        className="overflow-y-auto px-3 py-3 flex flex-col gap-2"
        style={{ maxHeight: '40vh', minHeight: '120px' }}
      >
        {!isLoading && messages.length === 0 && (
          <p className="text-white/40 text-sm text-center py-6">
            No messages yet. Say something!
          </p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMine = msg.player_id === player?.id
            const sender = players.find((p) => p.id === msg.player_id)
            const senderName = sender?.name ?? 'Unknown'
            const avatarId = sender?.avatar_id ?? ''

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={['flex gap-2 items-end', isMine ? 'flex-row-reverse' : 'flex-row'].join(' ')}
              >
                {/* Avatar (hide on own messages to save space) */}
                {!isMine && (
                  <div className="flex-shrink-0 mb-0.5">
                    <Avatar avatarId={avatarId} size="sm" />
                  </div>
                )}

                <div className={['flex flex-col gap-0.5 max-w-[75%]', isMine ? 'items-end' : 'items-start'].join(' ')}>
                  {/* Sender name */}
                  {!isMine && (
                    <span className="text-[11px] text-white/45 px-1">{senderName}</span>
                  )}

                  {/* Bubble */}
                  <div
                    className={[
                      'px-3 py-2 rounded-2xl text-sm leading-snug',
                      isMine
                        ? 'bg-oscar-gold/20 border border-oscar-gold/30 text-white rounded-br-sm'
                        : 'bg-white/8 border border-white/10 text-white/90 rounded-bl-sm',
                    ].join(' ')}
                  >
                    {msg.text}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-white/10 px-3 py-2 flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
          maxLength={280}
          style={{ fontSize: 16 }}
          className="flex-1 bg-white/8 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/35 outline-none focus:border-oscar-gold/50 transition-colors"
        />
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-10 h-10 rounded-xl bg-oscar-gold/20 border border-oscar-gold/40 flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
        >
          <Send size={16} className="text-oscar-gold" />
        </motion.button>
      </div>
    </div>
  )
}

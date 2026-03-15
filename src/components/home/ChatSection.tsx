/**
 * ChatSection — real-time room chat.
 *
 * - Auto-scrolls to newest message on mount and on each new message.
 * - Current player's messages align right; others align left.
 * - Empty state when no messages exist.
 * - Input bar at bottom: 16px font-size to prevent iOS zoom.
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useChat } from '../../hooks/useChat'
import Avatar from '../Avatar'
import CompanionAvatar from './CompanionAvatar'
import { COMPANION_IDS, getCompanionById } from '../../data/ai-companions'

// ─── Markdown-lite renderer ───────────────────────────────────────────────────
// Supports: \n line breaks, **bold**, *italic*

function renderFormattedText(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  return lines.map((line, li) => {
    // Split by **bold** and *italic* patterns
    const parts: React.ReactNode[] = []
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index))
      }
      if (match[2] !== undefined) {
        // **bold**
        parts.push(<strong key={match.index}>{match[2]}</strong>)
      } else if (match[3] !== undefined) {
        // *italic*
        parts.push(<em key={match.index}>{match[3]}</em>)
      }
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex))
    }

    return (
      <span key={li}>
        {parts}
        {li < lines.length - 1 && <br />}
      </span>
    )
  })
}

// ─── Companion bubble styles ──────────────────────────────────────────────────

const COMPANION_BUBBLE_STYLES: Record<string, {
  background: string
  border: string
  borderLeft: string
}> = {
  'the-academy': {
    background: 'rgba(212, 175, 55, 0.07)',
    border: '1px solid rgba(212, 175, 55, 0.18)',
    borderLeft: '3px solid #D4AF37',
  },
  meryl: {
    background: 'rgba(201,168,76,0.09)',
    border: '1px solid rgba(201,168,76,0.18)',
    borderLeft: '3px solid #CC9966',
  },
  nikki: {
    background: 'rgba(236,72,153,0.08)',
    border: '1px solid rgba(236,72,153,0.18)',
    borderLeft: '3px solid #EC4899',
  },
  will: {
    background: 'rgba(234,179,8,0.08)',
    border: '1px solid rgba(234,179,8,0.18)',
    borderLeft: '3px solid #EAB308',
  },
}

interface Props {
  /** When true, the message list fills all available vertical space instead of capping at 40vh. */
  fill?: boolean
}

export default function ChatSection({ fill = false }: Props) {
  const { room, player, players } = useGame()
  const { messages, sendMessage, isLoading } = useChat(room?.id)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevMessageCountRef = useRef(0)

  // Scroll to bottom instantly on mount (no visible pan), smooth only for new messages
  useEffect(() => {
    if (!bottomRef.current) return
    const isNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    bottomRef.current.scrollIntoView({ behavior: isNewMessage ? 'smooth' : 'instant' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || !player) return
    const { error } = await sendMessage(player.id, text)
    if (!error) {
      setInput('')
    }
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={['bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden flex flex-col', fill ? 'flex-1 min-h-0' : ''].join(' ')}>
      {/* Message list */}
      <div
        className={['overflow-y-auto px-3 py-3 flex flex-col gap-2', fill ? 'flex-1 min-h-0' : ''].join(' ')}
        style={fill ? undefined : { maxHeight: '40vh', minHeight: '120px' }}
      >
        {!isLoading && messages.length === 0 && (
          <p className="text-white/40 text-sm text-center py-6">
            No messages yet. Say something!
          </p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            // ── System divider messages ──────────────────────────────────
            if (msg.player_id === 'system') {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="flex-1 h-px bg-white/15" />
                  <span className="text-[11px] uppercase tracking-wider text-white/30 font-medium whitespace-nowrap">
                    {msg.text}
                  </span>
                  <div className="flex-1 h-px bg-white/15" />
                </motion.div>
              )
            }

            const isCompanion = COMPANION_IDS.has(msg.player_id)
            const companion = isCompanion ? getCompanionById(msg.player_id) : undefined
            const isMine = !isCompanion && msg.player_id === player?.id
            const sender = !isCompanion ? players.find((p) => p.id === msg.player_id) : undefined
            const senderName = sender?.name ?? (isCompanion ? (companion?.name ?? 'AI') : 'Unknown')
            const avatarId = sender?.avatar_id ?? ''

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={[
                  'flex gap-2 items-end',
                  isMine ? 'flex-row-reverse' : 'flex-row',
                  isCompanion ? 'mb-1' : '',
                ].join(' ')}
              >
                {/* Avatar — companion icon or player avatar (hidden on own messages) */}
                {!isMine && (
                  <div className="flex-shrink-0 mb-0.5">
                    {isCompanion ? (
                      <CompanionAvatar companionId={msg.player_id} size="sm" />
                    ) : (
                      <Avatar avatarId={avatarId} size="sm" />
                    )}
                  </div>
                )}

                <div className={['flex flex-col gap-0.5 max-w-[75%]', isMine ? 'items-end' : 'items-start'].join(' ')}>
                  {/* Sender name */}
                  {!isMine && (
                    <span
                      className="text-[11px] px-1"
                      style={companion ? { color: companion.colorPrimary } : { color: 'rgba(255,255,255,0.45)' }}
                    >
                      {senderName}
                    </span>
                  )}

                  {/* Bubble */}
                  {isCompanion && companion ? (
                    (() => {
                      const bubbleStyle = COMPANION_BUBBLE_STYLES[companion.id] ?? COMPANION_BUBBLE_STYLES['the-academy']
                      const isAcademy = companion.id === 'the-academy'
                      return (
                        <div
                          className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed rounded-bl-sm"
                          style={{
                            background: bubbleStyle.background,
                            border: bubbleStyle.border,
                            borderLeft: bubbleStyle.borderLeft,
                            color: isAcademy ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.88)',
                          }}
                        >
                          {renderFormattedText(msg.text)}
                        </div>
                      )
                    })()
                  ) : (
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
                  )}
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

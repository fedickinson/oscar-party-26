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
import { BookOpen, Send } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useChat } from '../../hooks/useChat'
import Avatar from '../Avatar'
import CompanionAvatar from './CompanionAvatar'
import CompanionProfileModal from './CompanionProfileModal'
import { COMPANION_IDS, getCompanionById } from '../../data/ai-companions'
import { getAvatarById } from '../../lib/avatar-utils'
import { usePendingCompanions } from '../../hooks/companionTypingStore'

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

// ─── Companions typing indicator ─────────────────────────────────────────────
// Shows the next companion in intro sequence who hasn't spoken yet.
// Starts with just The Academy, then advances as each message arrives.

const INTRO_COMPANIONS: { id: string; name: string; color: string }[] = [
  { id: 'the-academy', name: 'The Academy', color: '#D4AF37' },
  { id: 'meryl',       name: 'Gloria',      color: '#C9A84C' },
  { id: 'nikki',       name: 'Razor',       color: '#EC4899' },
  { id: 'will',        name: 'Buddy',       color: '#EAB308' },
]

const INTRO_COMPANION_IDS = INTRO_COMPANIONS.map((c) => c.id)

function TypingDots({ color }: { color: string }) {
  return (
    <div
      className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1.5"
      style={{
        background: `color-mix(in srgb, ${color} 8%, rgba(255,255,255,0.04))`,
        border: `1px solid color-mix(in srgb, ${color} 18%, rgba(255,255,255,0.08))`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function SingleCompanionTyping({ companionId, onProfile }: { companionId: string; onProfile: (id: string) => void }) {
  const c = INTRO_COMPANIONS.find((x) => x.id === companionId)
  if (!c) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex gap-2 items-end py-1"
    >
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => onProfile(c.id)}
        className="flex-shrink-0 mb-0.5"
      >
        <CompanionAvatar companionId={c.id} size="xl" />
      </motion.button>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] px-1 font-medium" style={{ color: c.color }}>
          {c.name}
        </span>
        <TypingDots color={c.color} />
      </div>
    </motion.div>
  )
}

// ─── Companion role labels ───────────────────────────────────────────────────

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
  /** Called when user taps a film-link card in chat. Receives the film title. */
  onFilmLinkTap?: (filmTitle: string) => void
}

export default function ChatSection({ fill = false, onFilmLinkTap }: Props) {
  const { room, player, players } = useGame()
  const { messages, sendMessage, isLoading } = useChat(room?.id)
  const [input, setInput] = useState('')
  const [profileCompanionId, setProfileCompanionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevMessageCountRef = useRef(0)

  // Which intro companion should show a typing indicator right now?
  // Find the first in sequence that hasn't sent a message yet.
  const spokCompanions = new Set(messages.filter((m) => INTRO_COMPANION_IDS.includes(m.player_id)).map((m) => m.player_id))
  const nextTypingCompanionId = !isLoading ? INTRO_COMPANION_IDS.find((id) => !spokCompanions.has(id)) : undefined

  // Companions with pending delayed messages (host-side, from useAICompanions)
  const pendingCompanionIds = usePendingCompanions()

  // All typing indicators to show — pending delayed companions first (in natural order),
  // then the intro companion if not already covered, deduplicated.
  const typingCompanionIds = [
    ...INTRO_COMPANION_IDS.filter((id) => pendingCompanionIds.includes(id)),
    ...(nextTypingCompanionId && !pendingCompanionIds.includes(nextTypingCompanionId) ? [nextTypingCompanionId] : []),
  ]

  const profileCompanion = profileCompanionId ? getCompanionById(profileCompanionId) : null

  // Scroll to bottom on new messages.
  // Dividers (category start, winner) jump instantly — they open new sections and may be
  // far from the current scroll position. Companion/player messages scroll smoothly.
  useEffect(() => {
    if (!bottomRef.current) return
    const isNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (!isNewMessage) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
      return
    }
    const newest = messages[messages.length - 1]
    const isSectionStart =
      newest?.player_id === 'system' || newest?.player_id === 'winner-divider'
    bottomRef.current.scrollIntoView({ behavior: isSectionStart ? 'instant' : 'smooth' })
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

            // ── Winner sub-divider ────────────────────────────────────
            if (msg.player_id === 'winner-divider') {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 py-1"
                >
                  <div className="flex-1 h-px bg-oscar-gold/15" />
                  <span className="text-[10px] uppercase tracking-widest text-oscar-gold/55 font-semibold whitespace-nowrap">
                    {msg.text}
                  </span>
                  <div className="flex-1 h-px bg-oscar-gold/15" />
                </motion.div>
              )
            }

            // ── Film encyclopedia link cards ──────────────────────────────
            if (msg.player_id === 'film-link') {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="flex justify-center py-1"
                >
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onFilmLinkTap?.(msg.text)}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-oscar-gold/8 border border-oscar-gold/25 min-h-[44px]"
                  >
                    <BookOpen size={15} className="text-oscar-gold flex-shrink-0" />
                    <span className="text-sm text-oscar-gold/90 font-medium">
                      See <span className="font-semibold text-oscar-gold">{msg.text}</span> in Film Encyclopedia
                    </span>
                  </motion.button>
                </motion.div>
              )
            }

            const isCompanion = COMPANION_IDS.has(msg.player_id)
            const companion = isCompanion ? getCompanionById(msg.player_id) : undefined
            const isMine = !isCompanion && msg.player_id === player?.id
            const sender = !isCompanion ? players.find((p) => p.id === msg.player_id) : undefined
            const senderName = sender?.name ?? (isCompanion ? (companion?.name ?? 'AI') : 'Unknown')
            const avatarId = sender?.avatar_id ?? ''
            const avatarColor = !isCompanion && !isMine && avatarId
              ? (getAvatarById(avatarId)?.colorPrimary ?? null)
              : null

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={[
                  'flex gap-2 items-end',
                  isMine ? 'flex-row-reverse' : 'flex-row',
                  isCompanion ? 'mb-3' : '',
                ].join(' ')}
              >
                {/* Avatar — companion icon or player avatar (hidden on own messages) */}
                {!isMine && (
                  <div className="flex-shrink-0 mb-0.5">
                    {isCompanion ? (
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setProfileCompanionId(msg.player_id)}
                      >
                        <CompanionAvatar companionId={msg.player_id} size="xl" />
                      </motion.button>
                    ) : (
                      <Avatar avatarId={avatarId} size="sm" />
                    )}
                  </div>
                )}

                <div className={['flex flex-col gap-0.5 max-w-[75%]', isMine ? 'items-end' : 'items-start'].join(' ')}>
                  {/* Sender name */}
                  {!isMine && (
                    <span className="text-[13px] px-1 font-medium flex items-baseline gap-1">
                      <span style={companion ? { color: companion.colorPrimary } : { color: 'rgba(255,255,255,0.45)' }}>
                        {senderName}
                      </span>
                      {companion && companion.role && (
                        <span
                          className="text-[11px] font-normal"
                          style={{ color: companion.colorPrimary, opacity: 0.5 }}
                        >
                          ({companion.role})
                        </span>
                      )}
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
                          : 'text-white/90 rounded-bl-sm',
                      ].join(' ')}
                      style={
                        isMine
                          ? undefined
                          : avatarColor
                            ? {
                                background: `color-mix(in srgb, ${avatarColor} 10%, rgba(255,255,255,0.05))`,
                                border: `1px solid color-mix(in srgb, ${avatarColor} 28%, rgba(255,255,255,0.08))`,
                                borderLeft: `3px solid ${avatarColor}`,
                              }
                            : {
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }
                      }
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {typingCompanionIds.map((id) => (
            <SingleCompanionTyping
              key={id}
              companionId={id}
              onProfile={setProfileCompanionId}
            />
          ))}
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

      {/* Companion profile modal */}
      <AnimatePresence>
        {profileCompanion && (
          <CompanionProfileModal
            key={profileCompanion.id}
            companion={profileCompanion}
            onClose={() => setProfileCompanionId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

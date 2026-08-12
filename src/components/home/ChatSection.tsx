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
import { AlertTriangle, BookOpen, Send, MessageSquare, ChevronDown, RefreshCw } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useChat } from '../../hooks/useChat'
import Avatar from '../Avatar'
import CompanionAvatar from './CompanionAvatar'
import CompanionProfileModal from './CompanionProfileModal'
import PlayerProfileModal from './PlayerProfileModal'
import { AI_COMPANIONS, COMPANION_IDS, NARRATOR, PRE_SHOW_COMPANIONS, getCompanionById } from '../../data/ai-companions'
import { getAvatarById } from '../../lib/avatar-utils'
import { usePendingCompanions, addPendingCompanion, removePendingCompanion } from '../../hooks/companionTypingStore'
import { acquireCompanionTypingChannel } from '../../hooks/companionTypingChannel'

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
// Starts with the narrator, then advances as each message arrives.

// Derived from the cast so adding a companion needs no change here.
// Narrator first — that is the order they introduce themselves in.
// LATE_ARRIVAL is excluded on purpose: he is the surprise who turns up after
// the episode starts, and a "Joffrey is typing…" indicator sitting there for
// the whole pre-show would announce him half an hour early.
const INTRO_COMPANIONS: { id: string; name: string; color: string }[] =
  PRE_SHOW_COMPANIONS.map((c) => ({ id: c.id, name: c.name, color: c.colorPrimary }))

const INTRO_COMPANION_IDS = INTRO_COMPANIONS.map((c) => c.id)

function TypingDots({ color }: { color: string }) {
  return (
    <div
      className="ai-parchment material-vellum flex items-center gap-1.5"
      style={{
        // A companion thinking is still a companion — same parchment as speech
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
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => onProfile(c.id)}
        className="flex-shrink-0 mb-0.5"
        aria-label={`Open ${c.name} profile`}
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
}> = Object.fromEntries(
  AI_COMPANIONS.map((c) => [
    c.id,
    {
      background: `color-mix(in srgb, ${c.colorPrimary} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c.colorPrimary} 18%, transparent)`,
      borderLeft: `3px solid ${c.colorPrimary}`,
    },
  ]),
)

interface Props {
  /** When true, the message list fills all available vertical space instead of capping at 40vh. */
  fill?: boolean
  /** Called when user taps a film-link card in chat. Receives the film title. */
  onFilmLinkTap?: (filmTitle: string) => void
}

export default function ChatSection({ fill = false, onFilmLinkTap }: Props) {
  // Collapsed state survives tab switches within the session but not reloads —
  // a fresh open should always show the room talking.
  const [collapsed, setCollapsed] = useState(false)
  const { room, player, players } = useGame()
  const { messages, sendMessage, isLoading, syncError, retrySync } = useChat(room?.id)
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [profileCompanionId, setProfileCompanionId] = useState<string | null>(null)
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevMessageCountRef = useRef(0)
  const initialScrollDoneRef = useRef(false)

  // The derived "whoever hasn't spoken yet is typing" indicator is GONE. It
  // lied whenever the host's schedule shifted (phone lock, reload): it showed
  // e.g. "Cersei is typing" for MINUTES because she was merely next in intro
  // order, with no insert actually in flight. Only broadcast-driven indicators
  // remain — those reflect a real scheduled message on the host.
  const nextTypingCompanionId = undefined as string | undefined

  // Companions with pending delayed messages (host-side, from useAICompanions)
  const pendingCompanionIds = usePendingCompanions()

  // Subscribe to host-broadcast typing events so guests see the same indicators
  useEffect(() => {
    if (!room?.id) return
    const channel = acquireCompanionTypingChannel(
      room.id,
      (payload) => {
        if (payload?.typing) addPendingCompanion(payload.id)
        else removePendingCompanion(payload.id)
      },
    )
    return () => { channel.release() }
  }, [room?.id])

  // All typing indicators to show — pending delayed companions first (in natural order),
  // then the intro companion if not already covered, deduplicated.
  const typingCompanionIds = isLoading || syncError
    ? []
    : [
        ...INTRO_COMPANION_IDS.filter((id) => pendingCompanionIds.includes(id)),
        ...(nextTypingCompanionId && !pendingCompanionIds.includes(nextTypingCompanionId) ? [nextTypingCompanionId] : []),
      ]

  const profileCompanion = profileCompanionId ? getCompanionById(profileCompanionId) : null

  // Scroll to bottom on new messages.
  // On initial mount or remount (tab switch, spotlight open), jump instantly so we
  // don't animate through the full message history. Only smooth-scroll for messages
  // that arrive after we've already established the initial position.
  useEffect(() => {
    if (!bottomRef.current) return
    const isNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (!initialScrollDoneRef.current) {
      // First render with messages — jump instantly regardless of count
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
      if (messages.length > 0) initialScrollDoneRef.current = true
      return
    }

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
    setSendError(null)
    const { error } = await sendMessage(player.id, text)
    if (!error) {
      setInput('')
    } else {
      setSendError(error.message)
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
    <div className={['relief-glass overflow-hidden flex flex-col', fill && !collapsed ? 'flex-1 min-h-0' : 'flex-shrink-0'].join(' ')}>
      {/* Header — always visible; tap to collapse/expand the panel */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 px-3.5 min-h-[44px] w-full text-left border-b border-white/8 flex-shrink-0"
      >
        <MessageSquare size={14} className="text-white/40" />
        <span className="text-xs uppercase tracking-wider text-white/50 font-medium">Chat</span>
        <span className="text-[11px] text-white/30 font-mono">{messages.length}</span>
        <ChevronDown
          size={16}
          className={['ml-auto text-white/40 transition-transform', collapsed ? '-rotate-90' : ''].join(' ')}
        />
      </button>
      {/* Message list */}
      {!collapsed && (
      <div
        className={['overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 flex flex-col gap-2', fill ? 'flex-1 min-h-0' : ''].join(' ')}
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
                  <span className="text-[11px] uppercase tracking-wider text-white/30 font-medium text-center min-w-0 break-words">
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
                  <div className="flex-1 h-px bg-accent/15" />
                  <span className="text-[10px] uppercase tracking-widest text-accent/55 font-semibold text-center min-w-0 break-words">
                    {msg.text}
                  </span>
                  <div className="flex-1 h-px bg-accent/15" />
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
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-accent/8 border border-accent/25 min-h-[44px]"
                  >
                    <BookOpen size={15} className="text-accent flex-shrink-0" />
                    <span className="text-sm text-accent/90 font-medium">
                      See <span className="font-semibold text-accent">{msg.text}</span> in Film Encyclopedia
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
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setProfileCompanionId(msg.player_id)}
                        aria-label={`Open ${senderName} profile`}
                      >
                        <CompanionAvatar companionId={msg.player_id} size="xl" />
                      </motion.button>
                    ) : (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setProfilePlayerId(msg.player_id)}
                        className="flex h-11 w-11 items-center justify-center"
                        aria-label={`Open ${senderName} profile`}
                      >
                        <Avatar avatarId={avatarId} size="md" />
                      </motion.button>
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

                  {/* Bubble — three materials, three kinds of speaker (v7):
                      companions on parchment (history), self on faction-edged
                      glass, other players on glass with their avatar color. */}
                  {isCompanion && companion ? (
                    (() => {
                      const bubbleStyle = COMPANION_BUBBLE_STYLES[companion.id] ?? COMPANION_BUBBLE_STYLES[NARRATOR.id]
                      return (
                        <div
                          className="ai-parchment material-vellum text-sm leading-relaxed"
                          style={{
                            // Companion identity survives as the scrap's inked edge
                            borderLeft: bubbleStyle.borderLeft,
                          }}
                        >
                          {renderFormattedText(msg.text)}
                        </div>
                      )
                    })()
                  ) : (
                    <div
                      className={[
                        'px-3 py-2 relief-glass text-sm leading-snug',
                        isMine ? 'text-white' : 'text-white/90',
                      ].join(' ')}
                      style={
                        isMine
                          ? { borderLeft: '2px solid var(--t-personal-device)' }
                          : avatarColor
                            ? { borderLeft: `3px solid ${avatarColor}` }
                            : undefined
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
      )}

      {/* Input bar */}
      {!collapsed && (
      <>
      {(syncError || sendError) && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-3 py-2" role="alert">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--t-pending)]" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--t-text-muted)]">
            {syncError ?? sendError}
          </p>
          {syncError && (
            <button
              type="button"
              onClick={() => {
                setSendError(null)
                retrySync()
              }}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--t-pending)]"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          )}
        </div>
      )}
      <div className="border-t border-white/10 px-3 py-2 flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? 'Synchronizing chat...' : syncError ? 'Chat unavailable' : 'Say something...'}
          maxLength={280}
          disabled={isLoading || syncError != null}
          className="flex-1 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-[length:var(--t-type-input)] text-white placeholder-white/35 outline-none transition-colors focus:border-accent/50"
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          disabled={!input.trim() || isLoading || syncError != null}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/20 transition-opacity disabled:opacity-40"
          aria-label="Send chat message"
        >
          <Send size={16} className="text-accent" />
        </motion.button>
      </div>
      </>
      )}

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

      {/* Player profile modal */}
      <AnimatePresence>
        {profilePlayerId && (() => {
          const profilePlayer = players.find((p) => p.id === profilePlayerId)
          if (!profilePlayer) return null
          return (
            <PlayerProfileModal
              key={profilePlayerId}
              playerName={profilePlayer.name}
              avatarId={profilePlayer.avatar_id ?? ''}
              isSelf={profilePlayer.id === player?.id}
              onClose={() => setProfilePlayerId(null)}
            />
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

/**
 * Home — the entry point for creating or joining a room.
 *
 * SCREEN STATE MACHINE:
 *
 *   landing
 *     ├─ "Create Room" → create-form  (code generated instantly, no DB yet)
 *     └─ "Join Room"   → join-code
 *                           └─ valid code entered → join-form
 *
 * The room code is generated client-side on "Create Room" click so it appears
 * instantly (no spinner). The actual DB insert happens when the form is
 * submitted with name + avatar. Collision risk is ~1 in 160k — acceptable
 * for a private party game.
 *
 * AnimatePresence with mode="wait" ensures the current screen exits before the
 * next one enters, giving a clean slide-up transition between steps.
 *
 * SESSION REDIRECT:
 * If the context already has a player (session restored on mount), we redirect
 * straight to their room so they don't have to rejoin after a refresh.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useRoom } from '../hooks/useRoom'
import AvatarPicker from '../components/AvatarPicker'

// ─── Screen state ─────────────────────────────────────────────────────────────

type Screen =
  | { view: 'landing' }
  | { view: 'create-form'; code: string }
  | { view: 'join-code' }
  | { view: 'join-form'; code: string; takenAvatarIds: string[]; takenBy: Record<string, string> }

// 4-letter uppercase code using consonants only (avoids accidental words and
// ambiguous I/O characters)
function generateCode(): string {
  const chars = 'BCDFGHJKLMNPQRSTVWXYZ'
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('')
}

// Shared slide animation for screen transitions
const screenAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate()
  const { player, room, loading } = useGame()
  const { createRoom, joinRoom } = useRoom()

  const [screen, setScreen] = useState<Screen>({ view: 'landing' })
  const [name, setName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If the session was restored (refresh), go straight to the room
  useEffect(() => {
    if (!loading && player && room) {
      navigate(`/room/${room.code}`)
    }
  }, [loading, player, room, navigate])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleCreateClick() {
    setScreen({ view: 'create-form', code: generateCode() })
    setError(null)
  }

  async function handleJoinCodeSubmit() {
    if (joinCode.length !== 4) {
      setError('Enter the 4-letter room code')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const code = joinCode.toUpperCase()

      const { data: roomData } = await supabase
        .from('rooms')
        .select('id, phase')
        .eq('code', code)
        .single()

      if (!roomData) throw new Error('Room not found. Check the code.')
      if (roomData.phase !== 'lobby') throw new Error('This game has already started.')

      // Prefetch taken avatars so the picker greys them out immediately
      const { data: existingPlayers } = await supabase
        .from('players')
        .select('avatar_id, name')
        .eq('room_id', roomData.id)

      const takenAvatarIds = (existingPlayers ?? []).map((p) => p.avatar_id)
      const takenBy: Record<string, string> = {}
      for (const p of existingPlayers ?? []) {
        takenBy[p.avatar_id] = p.name
      }

      setScreen({ view: 'join-form', code, takenAvatarIds, takenBy })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateSubmit() {
    if (screen.view !== 'create-form') return
    if (!name.trim()) { setError('Enter your name'); return }
    if (!selectedAvatar) { setError('Pick an avatar'); return }

    setIsSubmitting(true)
    setError(null)
    try {
      await createRoom(screen.code, name, selectedAvatar)
      navigate(`/room/${screen.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleJoinSubmit() {
    if (screen.view !== 'join-form') return
    if (!name.trim()) { setError('Enter your name'); return }
    if (!selectedAvatar) { setError('Pick an avatar'); return }

    setIsSubmitting(true)
    setError(null)
    try {
      await joinRoom(screen.code, name, selectedAvatar)
      navigate(`/room/${screen.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Loading (session restore in flight) ────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] gap-6">
      {/* App title — always visible */}
      <motion.div
        className="text-center relative"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Decorative film-strip bars */}
        <div className="flex justify-center gap-1 mb-4 opacity-30" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-2 rounded-sm"
              style={{ backgroundColor: i % 2 === 0 ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>

        {/* Statuette silhouette SVG */}
        <div className="flex justify-center mb-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
          >
            <svg width="44" height="64" viewBox="0 0 44 64" fill="none" aria-hidden>
              {/* Oscar statuette silhouette */}
              <ellipse cx="22" cy="58" rx="12" ry="4" fill="#D4AF37" opacity="0.4" />
              <rect x="16" y="50" width="12" height="10" rx="2" fill="#D4AF37" opacity="0.7" />
              <rect x="18" y="34" width="8" height="18" rx="1" fill="#D4AF37" opacity="0.85" />
              {/* arms */}
              <path d="M18 40 Q10 36 12 28 Q14 22 18 26" fill="#D4AF37" opacity="0.85" />
              <path d="M26 40 Q34 36 32 28 Q30 22 26 26" fill="#D4AF37" opacity="0.85" />
              {/* head */}
              <ellipse cx="22" cy="22" rx="8" ry="10" fill="#D4AF37" opacity="0.9" />
              {/* shimmer highlight */}
              <ellipse cx="19" cy="18" rx="2.5" ry="4" fill="white" opacity="0.2" />
            </svg>
          </motion.div>
        </div>

        <motion.h1
          className="text-5xl font-extrabold tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #F5E6A3 0%, #D4AF37 40%, #B8960C 70%, #D4AF37 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          Awards Party
        </motion.h1>
        <motion.p
          className="text-white/45 text-sm mt-2 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          Oscars 2026
        </motion.p>

        {/* Star field — static decorative dots */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {([
            { top: '10%', left: '5%', size: 2, opacity: 0.5 },
            { top: '20%', left: '92%', size: 1.5, opacity: 0.35 },
            { top: '55%', left: '2%', size: 1, opacity: 0.3 },
            { top: '70%', left: '96%', size: 2, opacity: 0.4 },
            { top: '80%', left: '10%', size: 1, opacity: 0.25 },
          ] as Array<{ top: string; left: string; size: number; opacity: number }>).map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-oscar-gold"
              style={{
                width: s.size,
                height: s.size,
                top: s.top,
                left: s.left,
                opacity: s.opacity,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Screen switcher */}
      <div className="w-full">
        <AnimatePresence mode="wait">

          {/* ── LANDING ─────────────────────────────────────────────────── */}
          {screen.view === 'landing' && (
            <motion.div key="landing" {...screenAnim} className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreateClick}
                className="w-full py-4 rounded-2xl font-bold text-lg text-deep-navy relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #F5E6A3 0%, #D4AF37 50%, #B8960C 100%)',
                  boxShadow: '0 4px 24px rgba(212,175,55,0.35)',
                }}
              >
                {/* Subtle shimmer stripe */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.22) 50%, transparent 60%)',
                  }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                />
                Create Room
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setScreen({ view: 'join-code' }); setError(null) }}
                className="w-full py-4 rounded-2xl backdrop-blur-lg bg-white/8 border border-white/20 text-white font-bold text-lg hover:bg-white/12 transition-colors"
              >
                Join Room
              </motion.button>

              {/* Divider with ceremony label */}
              <div className="flex items-center gap-3 mt-1 px-1">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[10px] uppercase tracking-widest text-white/20">March 15, 2026</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>
            </motion.div>
          )}

          {/* ── CREATE FORM ─────────────────────────────────────────────── */}
          {screen.view === 'create-form' && (
            <motion.div key="create-form" {...screenAnim}>
              <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-5">

                {/* Code display — shown immediately before DB insert */}
                <div className="text-center">
                  <p className="text-xs text-white/50 uppercase tracking-widest mb-3">Your Room Code</p>
                  <div className="flex gap-2 justify-center">
                    {screen.code.split('').map((letter, i) => (
                      <div
                        key={i}
                        className="w-14 h-14 flex items-center justify-center text-3xl font-bold text-oscar-gold bg-oscar-gold/10 border border-oscar-gold/30 rounded-xl"
                      >
                        {letter}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/35 mt-2">Share with friends after you set up</p>
                </div>

                <hr className="border-white/10" />

                {/* Name */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                    Your Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={24}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-oscar-gold transition-colors"
                  />
                </div>

                {/* Avatar */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                    Pick Your Avatar
                  </label>
                  <AvatarPicker
                    onSelect={setSelectedAvatar}
                    selectedId={selectedAvatar}
                    takenIds={[]}
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleCreateSubmit}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-oscar-gold text-deep-navy font-bold text-lg disabled:opacity-50 hover:bg-oscar-gold-light active:scale-95 transition-all"
                >
                  {isSubmitting ? 'Creating…' : 'Create Room'}
                </button>

                <button
                  onClick={() => setScreen({ view: 'landing' })}
                  className="w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <ArrowLeft size={14} /> Back
                  </span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── JOIN: ENTER CODE ────────────────────────────────────────── */}
          {screen.view === 'join-code' && (
            <motion.div key="join-code" {...screenAnim}>
              <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Join a Room</h2>
                  <p className="text-white/50 text-sm">Get the 4-letter code from whoever created the room</p>
                </div>

                <div>
                  <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                    Room Code
                  </label>
                  {/* Single input that auto-uppercases and limits to 4 chars */}
                  <input
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))
                    }
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinCodeSubmit()}
                    placeholder="ABCD"
                    maxLength={4}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-4 rounded-xl bg-white/10 border border-white/15 text-white text-center text-3xl font-bold tracking-widest placeholder:text-white/20 focus:outline-none focus:border-oscar-gold transition-colors uppercase"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleJoinCodeSubmit}
                  disabled={isSubmitting || joinCode.length !== 4}
                  className="w-full py-4 rounded-2xl bg-oscar-gold text-deep-navy font-bold text-lg disabled:opacity-50 hover:bg-oscar-gold-light active:scale-95 transition-all"
                >
                  {isSubmitting ? (
                    'Checking…'
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Continue <ArrowRight size={16} />
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setScreen({ view: 'landing' }); setError(null) }}
                  className="w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <ArrowLeft size={14} /> Back
                  </span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── JOIN: NAME + AVATAR FORM ─────────────────────────────────── */}
          {screen.view === 'join-form' && (
            <motion.div key="join-form" {...screenAnim}>
              <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-5">

                {/* Confirmed code badge */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {screen.code.split('').map((letter, i) => (
                      <span
                        key={i}
                        className="w-9 h-9 flex items-center justify-center text-lg font-bold text-oscar-gold bg-oscar-gold/10 border border-oscar-gold/30 rounded-lg"
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                  <p className="text-white/50 text-sm flex items-center gap-1.5">
                    Room found <Check size={13} className="text-emerald-400" />
                  </p>
                </div>

                <hr className="border-white/10" />

                {/* Name */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                    Your Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={24}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-oscar-gold transition-colors"
                  />
                </div>

                {/* Avatar */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                    Pick Your Avatar
                  </label>
                  <AvatarPicker
                    onSelect={setSelectedAvatar}
                    selectedId={selectedAvatar}
                    takenIds={screen.takenAvatarIds}
                    takenBy={screen.takenBy}
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleJoinSubmit}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-oscar-gold text-deep-navy font-bold text-lg disabled:opacity-50 hover:bg-oscar-gold-light active:scale-95 transition-all"
                >
                  {isSubmitting ? 'Joining…' : 'Join Room'}
                </button>

                <button
                  onClick={() => { setScreen({ view: 'join-code' }); setError(null) }}
                  className="w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <ArrowLeft size={14} /> Back
                  </span>
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

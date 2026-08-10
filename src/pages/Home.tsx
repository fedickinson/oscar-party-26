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
import { Hallmark } from '../components/ui/Hallmarks'

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

      // maybeSingle, not single: a missing room is an expected outcome here, not
      // an exception. single() throws on zero rows, and the old code only worked
      // because it discarded the error and fell through to the null check.
      const { data: roomData, error: lookupError } = await supabase
        .from('rooms')
        .select('id, phase')
        .eq('code', code)
        .maybeSingle()

      if (lookupError) throw new Error(`Could not look up that room: ${lookupError.message}`)
      if (!roomData) throw new Error('Room not found. Check the code.')
      // Non-lobby rooms pass through: joinRoom() reclaims an existing seat on
      // an exact name match (how a phone that lost its identity rejoins a
      // running game). The started-game rejection for genuinely new names
      // lives in joinRoom, where the reclaim check can run first.

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
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] gap-6">
      {/* Keep the established masthead on the forms; the landing has its own lockup. */}
      {screen.view !== 'landing' && (
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
              style={{ backgroundColor: i % 2 === 0 ? 'var(--t-accent)' : 'rgba(255,255,255,0.12)' }}
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
            {/* The Dance — two dragons, Black and Green, circling. The master mark. */}
            <Hallmark id="hallmark-dance" size={72} />
          </motion.div>
        </div>

        {/* Lockup: platform kicker over event name (v7 hierarchy) */}
        <motion.p
          className="text-[11px] font-bold uppercase tracking-[0.28em]"
          style={{ color: 'var(--t-text-dim)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Party Night presents
        </motion.p>
        <motion.h1
          className="text-[27px] font-bold tracking-[0.04em] uppercase mt-2"
          style={{
            fontFamily: 'Cinzel, Georgia, serif',
            background: 'linear-gradient(135deg, var(--t-vellum-light) 0%, var(--t-beacon-light) 45%, var(--t-beacon) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          Fire &amp; Blood
        </motion.h1>
        <motion.p
          className="text-sm mt-2"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic', color: 'var(--t-text-muted)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          House of the Dragon — Season 3 Finale
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
              className="absolute rounded-full bg-accent"
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
      )}

      {/* Screen switcher */}
      <div className="w-full">
        <AnimatePresence mode="wait">

          {/* ── LANDING ─────────────────────────────────────────────────── */}
          {screen.view === 'landing' && (
            <motion.div
              key="landing"
              {...screenAnim}
              className="flex w-full min-w-0 max-w-full flex-col items-center gap-5 py-4"
            >
              {/* A quiet processional marker replaces the Oscars film strip. */}
              <div className="flex w-full items-center gap-3 px-2" aria-hidden>
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-line-soft)' }} />
                <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: 'var(--t-madder)' }} />
                <span className="h-1 w-1 rotate-45" style={{ backgroundColor: 'var(--t-beacon)' }} />
                <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: 'var(--t-madder)' }} />
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-line-soft)' }} />
              </div>

              <section className="w-full min-w-0 text-center" aria-labelledby="party-title">
                <motion.div
                  className="mb-3 flex justify-center"
                  initial={{ opacity: 0, scale: 0.78, rotate: -4 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 190, damping: 19, delay: 0.04 }}
                >
                  <Hallmark id="hallmark-dance-hero" size={128} />
                </motion.div>

                <motion.p
                  className="m-0 text-[12px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: 'var(--t-text-dim)' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  Party Night presents
                </motion.p>
                <motion.h1
                  id="party-title"
                  className="mt-2 max-w-full whitespace-nowrap text-[clamp(34px,10.67vw,40px)] font-extrabold uppercase leading-[0.96] tracking-[0.01em]"
                  style={{
                    color: 'var(--t-beacon-light)',
                    fontFamily: 'var(--font-family-display)',
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.14 }}
                >
                  Fire <span style={{ color: 'var(--t-vellum-light)' }}>&amp;</span> Blood
                </motion.h1>
                <motion.p
                  className="mt-2 text-[18px] font-semibold italic leading-none"
                  style={{
                    color: 'var(--t-text-muted)',
                    fontFamily: 'var(--font-family-manuscript)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  House of the Dragon
                </motion.p>
              </section>

              {/* The episode is treated as tonight's dated proclamation. */}
              <motion.div
                className="material-vellum deckled relief-raised flex min-h-11 w-full items-center justify-center gap-3 px-5 py-2"
                style={{ color: 'var(--t-ink)' }}
                initial={{ opacity: 0, scaleX: 0.88 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.4, delay: 0.22 }}
              >
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-ink-muted)' }} aria-hidden />
                <span
                  className="whitespace-nowrap text-[12px] font-extrabold uppercase tracking-[0.18em]"
                  style={{ fontFamily: 'var(--font-family-display)' }}
                >
                  Season 3 Finale
                </span>
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-ink-muted)' }} aria-hidden />
              </motion.div>

              {/* Blood-thread divider: madder line, wax knot, restrained ornament. */}
              <div className="flex w-full items-center gap-2 px-1" aria-hidden>
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-madder)' }} />
                <span
                  className="relief-seal h-2.5 w-2.5 rotate-45"
                  style={{ backgroundColor: 'var(--t-wax)' }}
                />
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-madder)' }} />
              </div>

              <div className="flex w-full flex-col gap-3" role="group" aria-label="Room actions">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreateClick}
                  className="material-enamel team-black relief-raised relative flex min-h-[60px] w-full items-center justify-between overflow-hidden px-5 text-left"
                  style={{
                    border: '1px solid var(--t-madder)',
                    borderLeftWidth: '5px',
                    clipPath: 'var(--t-chamfer)',
                    color: 'var(--t-text)',
                  }}
                >
                  <span className="relative flex flex-col">
                    <span
                      className="text-[18px] font-extrabold uppercase tracking-[0.06em]"
                      style={{ fontFamily: 'var(--font-family-display)' }}
                    >
                      Create Room
                    </span>
                    <span className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--t-text-dim)' }}>
                      Host tonight's gathering
                    </span>
                  </span>
                  <ArrowRight size={20} style={{ color: 'var(--t-madder-light)' }} aria-hidden />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScreen({ view: 'join-code' }); setError(null) }}
                  className="relief-glass flex min-h-[56px] w-full items-center justify-between px-5 text-left"
                  style={{
                    borderColor: 'var(--t-line-strong)',
                    clipPath: 'var(--t-chamfer)',
                    color: 'var(--t-text)',
                  }}
                >
                  <span className="flex flex-col">
                    <span
                      className="text-[16px] font-bold uppercase tracking-[0.06em]"
                      style={{ fontFamily: 'var(--font-family-display)' }}
                    >
                      Join Room
                    </span>
                    <span className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--t-text-dim)' }}>
                      Enter with a four-letter code
                    </span>
                  </span>
                  <ArrowRight size={18} style={{ color: 'var(--t-ornament)' }} aria-hidden />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── CREATE FORM ─────────────────────────────────────────────── */}
          {screen.view === 'create-form' && (
            <motion.div key="create-form" {...screenAnim}>
              <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-5">

                {/* The room code is deliberately NOT shown here.
                    It is generated client-side at this point, but the room row is
                    not written until handleCreateSubmit below. Showing it caused
                    exactly the failure you would predict: people read the code off
                    this screen, sent it to friends, and those friends got "room
                    not found" because the room did not exist yet. Dimming it was
                    not enough — a code on screen gets shared.
                    It appears in the lobby, with tap-to-copy, the moment it is
                    real. See Room.tsx. */}
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Set yourself up first
                  </p>
                  <p className="text-xs text-white/35 mt-1">
                    You will get a room code to share once the room exists.
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
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
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
                  className="w-full py-4 rounded-2xl bg-accent text-ground font-bold text-lg disabled:opacity-50 hover:bg-accent-light active:scale-95 transition-all"
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
                    className="w-full px-4 py-4 rounded-xl bg-white/10 border border-white/15 text-white text-center text-3xl font-bold tracking-widest placeholder:text-white/20 focus:outline-none focus:border-accent transition-colors uppercase"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleJoinCodeSubmit}
                  disabled={isSubmitting || joinCode.length !== 4}
                  className="w-full py-4 rounded-2xl bg-accent text-ground font-bold text-lg disabled:opacity-50 hover:bg-accent-light active:scale-95 transition-all"
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
                        className="w-9 h-9 flex items-center justify-center text-lg font-bold text-accent bg-accent/10 border border-accent/30 rounded-lg"
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
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
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
                  className="w-full py-4 rounded-2xl bg-accent text-ground font-bold text-lg disabled:opacity-50 hover:bg-accent-light active:scale-95 transition-all"
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

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
 * JOIN DEEP LINK:
 * /join/CODE and /?join=CODE both land here, put the screen in 'join-code'
 * with the code prefilled, and run the same room lookup the Continue button
 * runs. They never submit the join itself — a seat still needs a name, and an
 * avatar when the room is in its lobby.
 *
 * SESSION REDIRECT:
 * If the context already has a player (session restored on mount), we redirect
 * straight to their room so they don't have to rejoin after a refresh. The
 * exception is a join link naming a different room: that is a choice, not a
 * redirect, so the 'session-conflict' screen names both rooms and waits.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Tv } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useRoom } from '../hooks/useRoom'
import { useShowIdentity, useShowIdentityForPack } from '../hooks/useShowIdentity'
import { resolvePlayerReclaim } from '../lib/player-reclaim'
import { normalizeJoinLinkCode, parseJoinLinkCode } from '../lib/join-link'
import AvatarPicker from '../components/AvatarPicker'
import Avatar from '../components/Avatar'
import { Hallmark } from '../components/ui/Hallmarks'
import { PLAYER_AVATARS } from '../data/avatar-config'
import {
  FEATURED_SHOW_IDENTITY,
  showIdentityKicker,
  showIdentityMastheadLine,
  showIdentityPresentsProperty,
} from '../lib/show-identity'
import type { PlayerRow, RoomPhase } from '../types/database'

// ─── Screen state ─────────────────────────────────────────────────────────────

type Screen =
  | { view: 'landing' }
  | { view: 'create-form'; code: string }
  | { view: 'join-code' }
  | {
    view: 'join-form'
    code: string
    phase: RoomPhase
    // The room's pack, read in the same lookup that fetched the phase. The
    // avatar set is the room's decision, not the visitor's: a legacy room keeps
    // offering its sigils however this phone arrived at it.
    showPackId: string | null
    existingPlayers: Array<Pick<PlayerRow, 'id' | 'name' | 'avatar_id'>>
  }
  // A restored session and a join link that disagree. The session redirect is
  // the right default and stays untouched everywhere else; here it would throw
  // away the link the player just tapped, so the two rooms are named and the
  // player picks. Nothing is written until they do.
  | { view: 'session-conflict'; linkCode: string; restoredCode: string }

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
  // This route exists before any room does: a restored session is redirected to
  // its room by the effect below, so every screen here — landing, create, join —
  // is room-less and names the featured show rather than the unbound wording. A
  // bound identity still wins whenever one is somehow in hand, and only the
  // legacy pack keeps the Fire & Blood wordmark and the two-dragon Dance
  // hallmark.
  const { identity: boundIdentity } = useShowIdentity()
  const showIdentity = room == null ? FEATURED_SHOW_IDENTITY : boundIdentity
  const isLegacy = showIdentity.isLegacy

  const [screen, setScreen] = useState<Screen>({ view: 'landing' })
  const [name, setName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The avatar set belongs to the room being joined, not to the featured show:
  // the join form has a pack id in hand, so it asks the same cached resolver
  // every other surface asks. The create form has no room yet and uses the
  // featured answer above.
  const { identity: joinIdentity } = useShowIdentityForPack(
    screen.view === 'join-form' ? screen.showPackId : null,
  )

  // ── The join deep link ─────────────────────────────────────────────────────
  //
  // /join/CODE carries the code in the path; /?join=CODE carries it in the
  // query, for the chat apps and QR tools that mangle one or the other. Both
  // are read here and validated by the same pure rule as a typed code — see
  // lib/join-link. A link only ever fills the form and runs the lookup the
  // Continue button runs; it never joins, because a seat needs a name.
  const { code: routeJoinCode } = useParams<{ code?: string }>()
  const [searchParams] = useSearchParams()
  const linkCodeRaw = routeJoinCode ?? searchParams.get('join')
  const linkCode = useMemo(() => parseJoinLinkCode(linkCodeRaw), [linkCodeRaw])
  // Set to the code whose room lookup is owed, and cleared the moment it runs,
  // so a re-render (or a StrictMode double effect) cannot look it up twice.
  const pendingLinkLookupRef = useRef<string | null>(null)
  const linkHandledRef = useRef(false)

  const reclaim = screen.view === 'join-form'
    ? resolvePlayerReclaim(screen.existingPlayers, name)
    : null
  const reclaimedPlayer = reclaim?.status === 'match' ? reclaim.player : null
  const reclaimedAvatar = reclaimedPlayer
    ? PLAYER_AVATARS.find((avatar) => avatar.id === reclaimedPlayer.avatar_id)
    : null

  // If the session was restored (refresh), go straight to the room.
  // The one exception is a join link for a DIFFERENT room: silently redirecting
  // there would swallow the link the player just tapped and leave them certain
  // they had joined the new room. They get the choice instead, and the redirect
  // resumes for every other case, including a link for the room they are in.
  const restoredSessionConflictsWithLink =
    room != null && linkCode != null && linkCode !== room.code
  useEffect(() => {
    if (!loading && player && room && !restoredSessionConflictsWithLink) {
      navigate(`/room/${room.code}`)
    }
  }, [loading, player, room, navigate, restoredSessionConflictsWithLink])

  // Apply the link once the session restore has settled, so the decision is
  // made against a known session rather than a momentarily empty one.
  useEffect(() => {
    if (loading || linkCodeRaw == null || linkHandledRef.current) return
    linkHandledRef.current = true

    if (player && room) {
      // Same room: the redirect above already takes them home. Different room:
      // name both and wait. A link we could not read is not worth stranding a
      // seated player over, so that also falls through to the redirect.
      if (linkCode != null && linkCode !== room.code) {
        setScreen({ view: 'session-conflict', linkCode, restoredCode: room.code })
      }
      return
    }

    if (linkCode == null) {
      // Restrictive default: a code that is not exactly four letters is never
      // repaired into a room lookup. The salvageable letters prefill the field
      // and a person finishes it.
      setJoinCode(normalizeJoinLinkCode(linkCodeRaw))
      setScreen({ view: 'join-code' })
      setError('That link did not carry a four-letter room code. Enter it here.')
      return
    }

    setJoinCode(linkCode)
    setError(null)
    setScreen({ view: 'join-code' })
    pendingLinkLookupRef.current = linkCode
  }, [loading, linkCodeRaw, linkCode, player, room])

  // The lookup runs only once the field actually holds the link's code, so it
  // goes through the same handler, with the same state, as a typed code.
  useEffect(() => {
    if (pendingLinkLookupRef.current == null) return
    if (joinCode !== pendingLinkLookupRef.current) return
    pendingLinkLookupRef.current = null
    void handleJoinCodeSubmit()
  }, [joinCode])

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
        .select('id, phase, show_pack_id')
        .eq('code', code)
        .maybeSingle()

      if (lookupError) throw new Error(`Could not look up that room: ${lookupError.message}`)
      if (!roomData) throw new Error('Room not found. Check the code.')
      // Non-lobby rooms pass through: joinRoom() reclaims an existing seat on
      // an exact name match (how a phone that lost its identity rejoins a
      // running game). The started-game rejection for genuinely new names
      // lives in joinRoom, where the reclaim check can run first.

      // Prefetch taken avatars so the picker greys them out immediately
      const { data: existingPlayers, error: playersError } = await supabase
        .from('players')
        .select('id, avatar_id, name')
        .eq('room_id', roomData.id)

      if (playersError) throw new Error(`Could not load room seats: ${playersError.message}`)

      setSelectedAvatar(null)
      setScreen({
        view: 'join-form',
        code,
        phase: roomData.phase,
        showPackId: roomData.show_pack_id ?? null,
        existingPlayers: existingPlayers ?? [],
      })
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
      const operatorCapability = await createRoom(screen.code, name, selectedAvatar)
      navigate(`/room/${screen.code}#operator=${operatorCapability}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleJoinSubmit() {
    if (screen.view !== 'join-form') return
    if (!name.trim()) { setError('Enter your name'); return }
    const reclaim = resolvePlayerReclaim(screen.existingPlayers, name)
    if (reclaim.status === 'ambiguous') {
      setError('More than one seat uses that exact name. Ask the host which seat is yours.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await joinRoom(
        screen.code,
        name,
        reclaim.status === 'match' ? reclaim.player.avatar_id : selectedAvatar,
      )
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
            {isLegacy
              ? <Hallmark id="hallmark-dance" size={72} />
              : <Tv size={72} strokeWidth={1} style={{ color: 'var(--t-ornament)' }} aria-hidden />}
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
          {showIdentityKicker(showIdentity, 'Watch Party presents')}
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
          {isLegacy ? <>Fire &amp; Blood</> : showIdentity.title}
        </motion.h1>
        <motion.p
          className="text-sm mt-2"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic', color: 'var(--t-text-muted)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          {showIdentityMastheadLine(showIdentity)}
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

          {/* ── JOIN LINK vs RESTORED SESSION ───────────────────────────── */}
          {screen.view === 'session-conflict' && (
            <motion.div key="session-conflict" {...screenAnim}>
              <div className="relief-glass rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-[var(--t-text)]">
                    Which room?
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
                    You already have a seat in room {screen.restoredCode}, and the link you
                    opened is for room {screen.linkCode}. Nothing changes until you choose.
                  </p>
                </div>

                <button
                  onClick={() => navigate(`/room/${screen.restoredCode}`)}
                  className="min-h-[56px] w-full rounded-2xl bg-accent px-5 text-lg font-bold text-ground transition-all active:scale-95 hover:bg-accent-light"
                >
                  Back to room {screen.restoredCode}
                </button>

                <button
                  onClick={() => {
                    const target = screen.linkCode
                    setError(null)
                    setSelectedAvatar(null)
                    setJoinCode(target)
                    setScreen({ view: 'join-code' })
                    pendingLinkLookupRef.current = target
                  }}
                  className="min-h-[56px] w-full rounded-2xl border px-5 text-base font-bold text-[var(--t-text)] transition-colors"
                  style={{ borderColor: 'var(--t-line-strong)' }}
                >
                  Join room {screen.linkCode} instead
                </button>

                <p className="text-xs leading-relaxed text-[var(--t-text-dim)]">
                  Joining the new room moves this phone's identity to it. Your old seat stays
                  where it is; rejoin it later with the same name.
                </p>
              </div>
            </motion.div>
          )}

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
                  {isLegacy
                    ? <Hallmark id="hallmark-dance-hero" size={128} />
                    : <Tv size={128} strokeWidth={1} style={{ color: 'var(--t-ornament)' }} aria-hidden />}
                </motion.div>

                <motion.p
                  className="m-0 text-[12px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: 'var(--t-text-dim)' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  {showIdentityKicker(showIdentity, 'Watch Party presents')}
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
                  {isLegacy
                    ? <>Fire <span style={{ color: 'var(--t-vellum-light)' }}>&amp;</span> Blood</>
                    : showIdentity.title}
                </motion.h1>
                {/* The property sits here only when the kicker above did not
                    take it; when it did, the dated band below is the line. */}
                {!showIdentityPresentsProperty(showIdentity) && (
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
                  {showIdentity.property}
                </motion.p>
                )}
              </section>

              {/* The installment is treated as tonight's dated proclamation.
                  The band renders only when the identity names one. */}
              {showIdentity.installment != null && (
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
                  {showIdentity.installment}
                </span>
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--t-ink-muted)' }} aria-hidden />
              </motion.div>
              )}

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

              {/* The only way into the explainer from the landing. Quiet on
                  purpose — it sits under the two actions, not beside them —
                  and the row clears the 44px target on its own. */}
              <Link
                to="/how-it-works"
                className="flex min-h-[44px] w-full items-center justify-center px-4 text-[14px] font-medium underline underline-offset-4"
                style={{ color: 'var(--t-text-dim)', textDecorationColor: 'var(--t-line-strong)' }}
              >
                How it works
              </Link>
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
                    onChange={(e) => { setName(e.target.value); setError(null) }}
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
                    isLegacy={isLegacy}
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
                  className="min-h-11 w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
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
                  className="min-h-11 w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
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
                    onChange={(e) => { setName(e.target.value); setError(null) }}
                    placeholder="Enter your name"
                    maxLength={24}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {reclaimedPlayer ? (
                  <div
                    className="material-stone relief-inset flex items-center gap-4 p-4"
                    style={{ borderColor: 'var(--t-positive)' }}
                    aria-live="polite"
                  >
                    <Avatar
                      avatarId={reclaimedPlayer.avatar_id}
                      size="lg"
                      highlighted
                      className="flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p
                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest"
                        style={{ color: 'var(--t-positive)' }}
                      >
                        <Check size={13} aria-hidden /> Seat recognized
                      </p>
                      <h2 className="mt-1 text-lg font-bold leading-tight text-[var(--t-text)]">
                        Welcome back, {reclaimedPlayer.name}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--t-text-muted)]">
                        {reclaimedAvatar
                          ? `House ${reclaimedAvatar.name} is still yours. No new sigil needed.`
                          : 'Your original sigil and every game choice are still attached.'}
                      </p>
                    </div>
                  </div>
                ) : reclaim?.status === 'ambiguous' ? (
                  <div
                    className="material-stone relief-inset p-4"
                    style={{ borderColor: 'var(--t-negative)' }}
                    aria-live="polite"
                  >
                    <p className="text-sm font-bold" style={{ color: 'var(--t-negative)' }}>
                      That seat name is not unique
                    </p>
                    <p className="mt-1 text-sm text-[var(--t-text-muted)]">
                      Ask the host which seat is yours before continuing.
                    </p>
                  </div>
                ) : screen.phase !== 'lobby' ? (
                  <div className="material-iron relief-inset p-4" aria-live="polite">
                    <p className="text-sm font-bold text-[var(--t-text)]">Reclaim an existing seat</p>
                    <p className="mt-1 text-sm text-[var(--t-text-muted)]">
                      This room is underway. Enter the exact name you used before;
                      your original sigil will return automatically.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-widest block mb-2">
                      Pick Your Avatar
                    </label>
                    <AvatarPicker
                      onSelect={setSelectedAvatar}
                      selectedId={selectedAvatar}
                      isLegacy={joinIdentity.isLegacy}
                      takenIds={screen.existingPlayers.map((player) => player.avatar_id)}
                      takenBy={Object.fromEntries(
                        screen.existingPlayers.map((player) => [player.avatar_id, player.name]),
                      )}
                    />
                  </div>
                )}

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleJoinSubmit}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-accent text-ground font-bold text-lg disabled:opacity-50 hover:bg-accent-light active:scale-95 transition-all"
                >
                  {isSubmitting
                    ? 'Joining…'
                    : reclaimedPlayer
                      ? 'Reclaim Seat'
                      : screen.phase !== 'lobby'
                        ? 'Find My Seat'
                        : 'Join Room'}
                </button>

                <button
                  onClick={() => { setScreen({ view: 'join-code' }); setError(null) }}
                  className="min-h-11 w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors"
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

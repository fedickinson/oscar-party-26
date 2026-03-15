/**
 * HotTake — hot take submission page (phase: hot_takes).
 *
 * STATES:
 *   writing   — text area + word count + submit button
 *   submitted — read-only view of your take + submission status grid
 *               Host also sees "Run AI Analysis" button
 *
 * WORD COUNT:
 *   < 20 words: submit disabled
 *   > 400 words: counter turns yellow
 *   > 500 words: counter turns red (soft limit — not enforced in DB)
 *
 * GUIDING QUESTIONS:
 *   Collapsible section (ChevronDown / ChevronUp) with five prompts to
 *   help players who aren't sure what to write. Closed by default.
 *
 * HOST FLOW:
 *   After all players submit, host sees "Run AI Analysis" (Sparkles icon).
 *   If not all submitted, host sees "Run Anyway" with a warning.
 *   On success, phase → morning_after → Realtime navigates everyone.
 *
 * PHASE NAVIGATION:
 *   useRoomSubscription keeps room state fresh. If phase flips to
 *   morning_after (another client triggered analysis), we navigate.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Sparkles,
} from 'lucide-react'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useHotTakes } from '../hooks/useHotTakes'
import Avatar from '../components/Avatar'

const QUESTIONS = [
  'What was the biggest surprise of the night?',
  'What felt most earned? What was a robbery?',
  'Best moment of the broadcast?',
  'Grade the ceremony overall — and defend your grade.',
  'What\'s the story of this Oscars in one sentence?',
]

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

export default function HotTake() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  const [draft, setDraft] = useState('')
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useRoomSubscription(room?.id)

  const { hotTakes, myTake, allSubmitted, isAnalyzing, analyzeError, submitTake, analyzeHotTakes } =
    useHotTakes(room?.id)

  // Phase navigation
  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'morning_after') navigate(`/room/${code}/morning-after`)
  }, [room?.phase, code, navigate])

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  const wordCount = countWords(draft)
  const canSubmit = wordCount >= 20
  const isOverLimit = wordCount > 500
  const isNearLimit = wordCount > 400 && !isOverLimit

  const wordCountClass = isOverLimit
    ? 'text-red-400'
    : isNearLimit
      ? 'text-amber-400'
      : 'text-white/30'

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await submitTake(draft.trim())
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit.')
      setIsSubmitting(false)
    }
  }

  async function handleAnalyze() {
    try {
      await analyzeHotTakes()
    } catch {
      // analyzeError state is set in the hook
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  const isHost = player.is_host

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* Header */}
      <div className="text-center pt-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles size={16} className="text-oscar-gold" />
          <p className="text-xs text-white/40 uppercase tracking-widest">Game 4</p>
          <Sparkles size={16} className="text-oscar-gold" />
        </div>
        <h1 className="text-2xl font-bold text-white">Your Hot Take</h1>
        <p className="text-sm text-white/45 mt-1">
          The ceremony is over. What do you actually think?
        </p>
      </div>

      {!myTake ? (
        <>
          {/* Guiding questions */}
          <div className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl overflow-hidden">
            <button
              onClick={() => setQuestionsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm font-medium text-white/70">Need inspiration?</span>
              {questionsOpen ? (
                <ChevronUp size={15} className="text-white/30" />
              ) : (
                <ChevronDown size={15} className="text-white/30" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {questionsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ul className="px-4 pb-4 space-y-2.5">
                    {QUESTIONS.map((q, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-oscar-gold/60 text-xs font-mono mt-0.5 flex-shrink-0">
                          {i + 1}.
                        </span>
                        <span className="text-sm text-white/65 leading-snug">{q}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text area */}
          <div className="relative">
            <motion.textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="The ceremony peaked when..."
              rows={8}
              whileFocus={{ boxShadow: '0 0 0 2px rgba(212,175,55,0.35)' }}
              className="w-full rounded-2xl bg-white/8 border border-white/12 text-white placeholder-white/20 leading-relaxed px-4 py-4 resize-none outline-none transition-colors focus:border-oscar-gold/40"
              style={{ minHeight: 200, fontSize: '16px' }}
            />
            {/* Word count */}
            <div
              className={[
                'absolute bottom-3 right-4 text-xs tabular-nums transition-colors',
                wordCountClass,
              ].join(' ')}
            >
              {wordCount} / 500 words
            </div>
          </div>

          {/* Submit error */}
          <AnimatePresence>
            {submitError && (
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-red-400 text-center -mt-2"
              >
                {submitError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <motion.button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            whileTap={canSubmit && !isSubmitting ? { scale: 0.97 } : undefined}
            className={[
              'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              canSubmit && !isSubmitting
                ? 'bg-oscar-gold text-deep-navy'
                : 'bg-white/10 text-white/25 cursor-not-allowed',
            ].join(' ')}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-deep-navy/40 border-t-deep-navy rounded-full animate-spin" />
            ) : (
              <>
                <Send size={16} />
                {canSubmit ? 'Submit Take' : `Need ${20 - wordCount} more word${20 - wordCount === 1 ? '' : 's'}`}
              </>
            )}
          </motion.button>
        </>
      ) : (
        <>
          {/* Submitted state — read-only view */}
          <div className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Check size={14} className="text-emerald-400" strokeWidth={3} />
              <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                Take submitted
              </p>
            </div>
            <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
              {myTake.text}
            </p>
          </div>

          {/* Submission status grid */}
          <div className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-4">
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3">
              Waiting for others
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.map((p) => {
                const hasSubmitted = hotTakes.some((t) => t.player_id === p.id)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2"
                  >
                    <Avatar
                      avatarId={p.avatar_id}
                      size="sm"
                      emotion={hasSubmitted ? 'happy' : 'neutral'}
                    />
                    <span
                      className={[
                        'text-sm truncate flex-1',
                        hasSubmitted ? 'text-white' : 'text-white/40',
                      ].join(' ')}
                    >
                      {p.id === player.id ? 'You' : p.name}
                    </span>
                    <div className="flex-shrink-0">
                      {hasSubmitted ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        >
                          <Check size={14} className="text-emerald-400" strokeWidth={3} />
                        </motion.div>
                      ) : (
                        <Clock size={14} className="text-white/20" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Host analysis controls */}
          {isHost && (
            <div className="space-y-3">
              {analyzeError && (
                <div className="backdrop-blur-lg bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-400">{analyzeError}</p>
                </div>
              )}

              {!allSubmitted && (
                <p className="text-xs text-white/35 text-center">
                  {players.length - hotTakes.length} player
                  {players.length - hotTakes.length !== 1 ? 's' : ''} yet to submit.
                  You can run anyway.
                </p>
              )}

              <motion.button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                whileTap={!isAnalyzing ? { scale: 0.97 } : undefined}
                className={[
                  'w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all',
                  !isAnalyzing
                    ? 'bg-oscar-gold text-deep-navy'
                    : 'bg-white/10 text-white/30 cursor-not-allowed',
                ].join(' ')}
              >
                {isAnalyzing ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles size={16} />
                    </motion.div>
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    {allSubmitted ? 'Run AI Analysis' : 'Run Anyway'}
                  </>
                )}
              </motion.button>
            </div>
          )}

          {/* Guest waiting message when not host */}
          {!isHost && (
            <div className="text-center py-2 space-y-2">
              <div className="flex justify-center">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles size={20} className="text-oscar-gold/50" />
                </motion.div>
              </div>
              <p className="text-sm text-white/40">
                Waiting for host to run analysis…
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

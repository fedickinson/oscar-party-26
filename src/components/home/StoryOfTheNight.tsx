/**
 * StoryOfTheNight — AI-generated narrative card for the Home tab.
 *
 * Two modes:
 *   Live mode  — shows AI story with word-by-word animation, refresh button,
 *                and loading state. Used in LiveHomeView during the ceremony.
 *   Static mode — shows a pre-written templated string. Used in
 *                 PreCeremonyView before the first winner is announced.
 *
 * In live mode, the card auto-hides until the first story is generated or
 * a generation is in progress.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RefreshCw } from 'lucide-react'

// ─── Props ────────────────────────────────────────────────────────────────────

interface LiveProps {
  story: string | null
  isGenerating: boolean
  announcedCount: number
  onRefresh: () => void
  staticText?: undefined
}

interface StaticProps {
  staticText: string
  story?: undefined
  isGenerating?: undefined
  announcedCount?: undefined
  onRefresh?: undefined
}

type Props = LiveProps | StaticProps

// ─── Word-by-word stagger animation ──────────────────────────────────────────

function AnimatedText({ text }: { text: string }) {
  const words = text.split(' ')
  return (
    <motion.span key={text}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: 'blur(3px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: i * 0.035, duration: 0.25, ease: 'easeOut' }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StoryOfTheNight(props: Props) {
  const isStatic = props.staticText !== undefined

  // Live mode: don't render until we have something to show
  if (!isStatic && !props.isGenerating && !props.story) {
    return null
  }

  return (
    <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {props.isGenerating ? (
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles size={16} className="text-oscar-gold" />
            </motion.div>
          ) : (
            <Sparkles size={16} className="text-oscar-gold" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-oscar-gold">
            Story of the Night
          </span>
        </div>

        {/* Refresh button — live mode only */}
        {!isStatic && !props.isGenerating && props.onRefresh && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={props.onRefresh}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors"
            aria-label="Refresh story"
          >
            <RefreshCw size={13} />
          </motion.button>
        )}
      </div>

      {/* Body */}
      <AnimatePresence mode="wait">
        {props.isGenerating ? (
          // Loading state
          <motion.p
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-white/40 italic"
          >
            Writing the next chapter...
          </motion.p>
        ) : (
          // Story text (AI or static)
          <motion.div
            key="story"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-base italic text-white/85 leading-relaxed">
              {isStatic ? (
                props.staticText
              ) : props.story ? (
                <AnimatedText text={props.story} />
              ) : null}
            </p>

            {/* "Updated after X winners" — live mode only */}
            {!isStatic && props.story && props.announcedCount !== undefined && (
              <p className="text-xs text-white/40 mt-2">
                Updated after {props.announcedCount} winner{props.announcedCount !== 1 ? 's' : ''}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

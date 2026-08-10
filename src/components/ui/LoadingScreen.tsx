/**
 * LoadingScreen — consistent full-page loading state used across all pages
 * while initial data fetches are in flight.
 *
 * The Dance mark breathing over a blood-thread fill line. Pass an optional
 * message to provide context (defaults to "Loading…").
 */

import { motion } from 'framer-motion'
import { Hallmark } from './Hallmarks'

interface Props {
  message?: string
}

export default function LoadingScreen({ message = 'The ravens are flying…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
      <motion.div
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Hallmark id="hallmark-dance" size={56} />
      </motion.div>

      {/* Blood-thread fill — the title-sequence channel, looping */}
      <div
        className="w-32 h-0.5 rounded-full overflow-hidden"
        style={{ background: 'var(--t-line-soft)' }}
        aria-hidden
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--t-wax-dark), var(--t-madder-light))' }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <p className="text-sm text-white/40">{message}</p>
    </div>
  )
}

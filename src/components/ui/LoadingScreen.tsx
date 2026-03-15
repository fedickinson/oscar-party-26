/**
 * LoadingScreen — consistent full-page loading state used across all pages
 * while initial data fetches are in flight.
 *
 * A pulsing Trophy icon on the dark background. Pass an optional message
 * to provide context (defaults to "Loading…").
 */

import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'

interface Props {
  message?: string
}

export default function LoadingScreen({ message = 'Loading…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <motion.div
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Trophy size={36} className="text-oscar-gold" />
      </motion.div>
      <p className="text-sm text-white/40">{message}</p>
    </div>
  )
}

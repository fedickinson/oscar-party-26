/**
 * WelcomeCard -- orientation overlay shown once per player per room
 * when they first arrive at the Live page after submitting confidence picks.
 *
 * Follows the same glassmorphism + framer-motion pattern as PhaseExplainer,
 * but uses a slide-up-from-bottom entrance (modal/sheet pattern from CLAUDE.md).
 */

import { motion } from 'framer-motion'
import { Home, MessageCircle, Grid3X3, Trophy } from 'lucide-react'

interface WelcomeCardProps {
  onDismiss: () => void
}

export default function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(10, 14, 39, 0.85)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 flex flex-col gap-5"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {/* Icon */}
        <div className="flex justify-center pt-1">
          <Home size={40} className="text-oscar-gold" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center">
          You're all set for tonight!
        </h1>

        {/* Body */}
        <p className="text-white/80 text-sm leading-relaxed text-center">
          This is your home base. Chat with friends and AI companions,
          check your bingo card, watch the scores update live as winners
          are announced.
        </p>

        {/* Feature hints */}
        <div className="flex justify-center gap-6">
          <div className="flex flex-col items-center gap-1.5">
            <MessageCircle size={20} className="text-white/40" />
            <span className="text-xs text-white/40">Chat</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Grid3X3 size={20} className="text-white/40" />
            <span className="text-xs text-white/40">Bingo</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Trophy size={20} className="text-white/40" />
            <span className="text-xs text-white/40">Scores</span>
          </div>
        </div>

        {/* Dismiss button */}
        <motion.button
          onClick={onDismiss}
          whileTap={{ scale: 0.97 }}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-oscar-gold text-deep-navy mt-1"
        >
          Let's go
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

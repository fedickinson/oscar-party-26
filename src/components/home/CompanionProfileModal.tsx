/**
 * CompanionProfileModal — bottom sheet shown when a user taps a companion avatar.
 *
 * Shows a large photo, the companion's name, role, and a short bio.
 * Tapping the backdrop or the X button dismisses it.
 */

import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { CompanionConfig } from '../../data/ai-companions'

interface Props {
  companion: CompanionConfig
  onClose: () => void
}

export default function CompanionProfileModal({ companion, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 40 }}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto"
      >
        <div className="backdrop-blur-xl bg-deep-navy/97 border border-white/15 rounded-t-3xl overflow-hidden pb-10">

          {/* Large image with gradient fade to content */}
          <div className="relative h-52 w-full">
            <img
              src={companion.imageUrl}
              alt={companion.name}
              className="w-full h-full object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, #080C1F 0%, #080C1Faa 25%, transparent 60%)' }}
            />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"
            >
              <X size={14} className="text-white/80" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 pt-3">
            <div className="flex items-baseline gap-2.5 mb-2">
              <h2
                className="text-2xl font-bold leading-tight"
                style={{ color: companion.colorPrimary }}
              >
                {companion.name}
              </h2>
              <span className="text-sm text-white/35 font-medium">{companion.role}</span>
            </div>
            <p className="text-sm text-white/65 leading-relaxed">{companion.bio}</p>
          </div>
        </div>
      </motion.div>
    </>
  )
}

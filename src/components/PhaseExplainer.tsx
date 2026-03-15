import { motion } from 'framer-motion'
import { Users, Hash, Grid3X3, Sparkles } from 'lucide-react'

type Phase = 'draft' | 'confidence' | 'bingo'

interface PhaseExplainerProps {
  phase: Phase
  onContinue: () => void
}

const CONTENT: Record<Phase, {
  icon: React.ReactNode
  title: string
  what: string
  different: string
  tip: string
}> = {
  draft: {
    icon: <Users size={40} className="text-oscar-gold" />,
    title: 'Ensemble',
    what: "Take turns claiming nominees and films. When they win an Oscar tonight you score points. You're building your ensemble for the whole ceremony — choose wisely.",
    different: "This is the only game where you're competing for picks. Once someone claims Ryan Coogler, he's theirs. Everyone needs to be here for this part.",
    tip: "People nominated in multiple categories are the most valuable. Ryan Coogler could win Director AND Screenplay — that's 14 points from one claim.",
  },
  confidence: {
    icon: <Hash size={40} className="text-oscar-gold" />,
    title: 'Prestige Picks',
    what: "Predict the winner in all 24 categories, then assign prestige points (1–24) to each pick. If you're right, you earn those points. If you're wrong, zero.",
    different: "Unlike the draft, everyone picks independently — you can all pick the same winner. The strategy isn't WHO you pick, it's WHERE you put your big numbers. Do this on your own — no peeking.",
    tip: "Your prestige number IS your score — put your 24 where you're most certain, not where the category seems most important. The real edge is nailing a pick no one else makes with a high number.",
  },
  bingo: {
    icon: <Grid3X3 size={40} className="text-oscar-gold" />,
    title: 'Bingo',
    what: "Your card has 25 moments that might happen during the broadcast. Tap a square when you see it happen. Get 5 in a row for a bingo bonus.",
    different: "This isn't about predictions — it's about paying attention to the broadcast. The weird squares ('someone in the room says this is rigged') are where the fun lives.",
    tip: "Objective squares (like 'Sinners wins an award') auto-complete when the host records the winner. Focus on marking the subjective ones.",
  },
}

export default function PhaseExplainer({ phase, onContinue }: PhaseExplainerProps) {
  const { icon, title, what, different, tip } = CONTENT[phase]

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0A0E27ee, #12163Aee)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 flex flex-col gap-5"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        {/* Phase icon */}
        <div className="flex justify-center pt-1">
          {icon}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center">{title}</h1>

        {/* What you're doing */}
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1.5">What you're doing</p>
          <p className="text-white/80 text-sm leading-relaxed">{what}</p>
        </div>

        {/* How it's different — visually distinct callout */}
        <div className="border-l-2 border-oscar-gold/50 pl-4 bg-oscar-gold/5 rounded-r-xl py-3 pr-3">
          <p className="text-xs text-oscar-gold/60 uppercase tracking-widest mb-1.5">How it's different</p>
          <p className="text-white/80 text-sm leading-relaxed">{different}</p>
        </div>

        {/* Pro tip */}
        <div className="flex gap-2.5 items-start">
          <Sparkles size={15} className="text-oscar-gold flex-shrink-0 mt-0.5" />
          <p className="text-white/55 text-sm italic leading-relaxed">{tip}</p>
        </div>

        {/* Got it */}
        <motion.button
          onClick={onContinue}
          whileTap={{ scale: 0.97 }}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-oscar-gold text-deep-navy mt-1"
        >
          Got it
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

import { motion } from 'framer-motion'
import { Users, Hash, Grid3X3, Sparkles } from 'lucide-react'

type Phase = 'draft' | 'confidence' | 'bingo'

interface PhaseExplainerProps {
  phase: Phase
  onContinue: () => void
  confidenceRange?: number
}

const GAME_LABEL: Record<Phase, string> = {
  draft: 'Game One',
  confidence: 'Game Two',
  bingo: 'Game Three',
}

const CONTENT: Record<Phase, {
  icon: React.ReactNode
  title: string
  what: string
  different: string
  tip: string
}> = {
  draft: {
    icon: <Users size={40} className="text-[var(--t-personal-device)]" />,
    title: 'The Draft',
    what: "One dragon each, then four characters each. When your pick does something tonight — a kill, a betrayal, a death, a dragon falling — you score. You are drafting who matters in this episode.",
    different: "This is the only part where you compete for picks. Once someone takes Vhagar, she is theirs. Everyone needs to be here, because it goes in turns.",
    tip: "Dragons go first and there are only eleven, so somebody is not getting Vhagar. After that, characters who could plausibly die, kill, or betray are worth more than characters who will simply be present.",
  },
  confidence: {
    icon: <Hash size={40} className="text-[var(--t-personal-device)]" />,
    title: 'Picks',
    what: '',
    different: '',
    tip: '',
  },
  bingo: {
    icon: <Grid3X3 size={40} className="text-[var(--t-personal-device)]" />,
    title: 'Bingo',
    what: "Your card has 25 things that might happen in the episode. Tap a square when you see it. Every square you land scores on its own — the unlikely ones are worth up to five times the obvious ones — and five in a row is a bonus on top.",
    different: "This one is not about predicting anything — it is about paying attention. Every card is dealt to the same difficulty, so nobody gets the easy one. The squares with a dot are the long shots, and that is where the points are.",
    // Not "spells out what does not count" — six of the 75 squares qualify the
    // other way ("A refusal counts if it changes what happens"), and the app is
    // careful not to claim otherwise.
    tip: "Read a square before you claim it — each one spells out exactly what counts, and what doesn't. Marking is on your honor — tap a marked square to undo it.",
  },
}

export default function PhaseExplainer({ phase, onContinue, confidenceRange = 24 }: PhaseExplainerProps) {
  const base = CONTENT[phase]
  const { icon, title } = base

  // Confidence copy is dynamic based on the number of categories in play
  let { what, different, tip } = base
  if (phase === 'confidence') {
    what = `Pick who you think will win each of the ${confidenceRange} categories. Each pick gets a confidence number from 1 to ${confidenceRange} — if your pick wins, you score that many points. Each number can only be used once.`
    different = `Everyone picks independently — you can all choose the same winner. The strategy isn't just WHO you pick, it's WHERE you put your big numbers. Save the high numbers for categories you're sure about.`
    tip = `Put your highest numbers on your most confident picks, not on the biggest awards. Missing Best Picture with a ${confidenceRange} hurts more than missing a craft category.`
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden bg-[var(--t-overlay)] px-4 py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="material-vellum deckled relief-raised w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 flex flex-col gap-5 text-[var(--t-ink)] font-manuscript"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        {/* Game number eyebrow label */}
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[var(--t-ink-muted)]">
          {GAME_LABEL[phase]}
        </p>

        {/* Phase icon */}
        <div className="flex justify-center pt-1">
          {icon}
        </div>

        {/* Title */}
        <h1 className="font-display text-2xl font-bold text-[var(--t-ink)] text-center">{title}</h1>

        {/* What you're doing */}
        <div>
          <p className="font-sans text-xs font-semibold text-[var(--t-ink-muted)] uppercase tracking-widest mb-1.5">What you're doing</p>
          <p className="text-[var(--t-ink)] text-base font-semibold leading-relaxed">{what}</p>
        </div>

        {/* How it's different — visually distinct callout */}
        <div className="border-l-2 border-[var(--t-personal-device)] pl-4 bg-[var(--t-clear)] rounded-r-xl py-3 pr-3">
          <p className="font-sans text-xs font-semibold text-[var(--t-ink-muted)] uppercase tracking-widest mb-1.5">How it's different</p>
          <p className="text-[var(--t-ink)] text-base font-semibold leading-relaxed">{different}</p>
        </div>

        {/* Pro tip */}
        <div className="flex gap-2.5 items-start">
          <Sparkles size={15} className="text-[var(--t-personal-device)] flex-shrink-0 mt-0.5" />
          <p className="text-[var(--t-ink-muted)] text-base font-semibold italic leading-relaxed">{tip}</p>
        </div>

        {/* Got it */}
        <motion.button
          onClick={onContinue}
          whileTap={{ scale: 0.97 }}
          className="relief-raised w-full min-h-11 py-3 rounded-2xl border border-[var(--t-line-strong)] font-sans font-bold text-lg bg-[var(--t-personal-device)] text-[var(--t-vellum-light)] mt-1"
        >
          Got it
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

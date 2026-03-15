/**
 * LiveHomeView — Home tab content during the ceremony.
 *
 * Layout (full-height, no page scroll):
 *   1. NextUpCard — next unannounced category + current player's picks in it
 *   2. CollapsibleScores — rank summary, expands to full leaderboard
 *   3. ChatSection — fills all remaining vertical space
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { supabase } from '../../lib/supabase'
import ChatSection from './ChatSection'
import NomineeDetailSheet from './NomineeDetailSheet'
import { CategoryIcon } from '../../lib/category-icons'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

interface Props {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
  isHost: boolean
  openSpotlight: (categoryId: number) => Promise<void>
}

// ─── Category Info Modal ──────────────────────────────────────────────────────

interface CategoryInfoModalProps {
  category: CategoryRow
  allNominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  currentPlayerId: string
  onClose: () => void
}

function CategoryInfoModal({ category, allNominees, confidencePicks, currentPlayerId, onClose }: CategoryInfoModalProps) {
  const [nomineeIds, setNomineeIds] = useState<string[] | null>(null)
  const [selectedNominee, setSelectedNominee] = useState<NomineeRow | null>(null)

  // Fetch the category→nominee mapping on mount
  useEffect(() => {
    supabase
      .from('category_nominees')
      .select('nominee_id')
      .eq('category_id', category.id)
      .then(({ data }) => {
        setNomineeIds(data?.map((r) => r.nominee_id) ?? [])
      })
  }, [category.id])

  const nominees = nomineeIds
    ? allNominees.filter((n) => nomineeIds.includes(n.id))
    : []

  // How many players picked each nominee in this category
  const catPicks = confidencePicks.filter((cp) => cp.category_id === category.id)
  const pickCounts = new Map<string, number>()
  catPicks.forEach((cp) => pickCounts.set(cp.nominee_id, (pickCounts.get(cp.nominee_id) ?? 0) + 1))

  const myPickId = catPicks.find((cp) => cp.player_id === currentPlayerId)?.nominee_id

  const tierLabel = category.tier === 1 ? 'Major' : category.tier === 2 ? 'Craft' : 'Honorary'

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#0e1230] border-t border-white/10 rounded-t-3xl max-h-[82vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-4 flex-shrink-0">
          <div className="min-w-0 pr-3">
            <p className="text-[11px] uppercase tracking-wider text-oscar-gold/70 mb-0.5">{tierLabel} · {category.points} pts</p>
            <h2 className="text-xl font-bold text-white leading-tight flex items-center gap-2">
              <CategoryIcon categoryName={category.name} size={20} className="text-oscar-gold/70 flex-shrink-0" />
              {category.name}
            </h2>
          </div>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1"
          >
            <X size={16} className="text-white/60" />
          </motion.button>
        </div>

        <div className="h-px bg-white/8 flex-shrink-0" />

        {/* Nominee list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {nomineeIds === null && (
            <p className="text-sm text-white/40 text-center py-6">Loading...</p>
          )}

          {nomineeIds !== null && nominees.length === 0 && (
            <p className="text-sm text-white/40 text-center py-6">No nominees found</p>
          )}

          {nominees.map((nominee) => {
            const isMyPick = nominee.id === myPickId
            const count = pickCounts.get(nominee.id) ?? 0
            const isFilm = nominee.type === 'film'

            return (
              <motion.button
                key={nominee.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedNominee(nominee)}
                className={[
                  'w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors',
                  isMyPick
                    ? 'bg-oscar-gold/10 border-oscar-gold/30'
                    : 'bg-white/4 border-white/8',
                ].join(' ')}
              >
                {/* Poster / avatar */}
                <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-white/8 border border-white/10">
                  {nominee.image_url ? (
                    <img
                      src={nominee.image_url}
                      alt={nominee.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-lg font-bold text-white/20">
                        {(isFilm ? nominee.film_name : nominee.name).charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  {isFilm ? (
                    <p className="text-sm font-semibold text-white/90 leading-snug">{nominee.film_name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-white/90 leading-snug">{nominee.name}</p>
                      {nominee.film_name && (
                        <p className="text-xs text-white/45 mt-0.5 truncate">{nominee.film_name}</p>
                      )}
                    </>
                  )}

                  {isMyPick && (
                    <p className="text-[11px] text-oscar-gold mt-1 font-medium">Your pick</p>
                  )}
                </div>

                {/* Pick count + info hint */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                  {count > 0 && (
                    <p className="text-[11px] text-white/30">{count} {count === 1 ? 'pick' : 'picks'}</p>
                  )}
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/55">
                    Info
                  </span>
                </div>
              </motion.button>
            )
          })}

          {/* Bottom padding for safe area */}
          <div className="h-6" />
        </div>
      </motion.div>

      {/* Nominee detail sheet — slides over this modal */}
      <AnimatePresence>
        {selectedNominee && (
          <NomineeDetailSheet
            nominee={selectedNominee}
            categoryName={category.name}
            onClose={() => setSelectedNominee(null)}
          />
        )}
      </AnimatePresence>
    </AnimatePresence>
  )
}

// ─── Next Up Card ─────────────────────────────────────────────────────────────

function NextUpCard({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  isHost,
  openSpotlight,
}: Omit<Props, 'leaderboard'>) {
  const { player } = useGame()
  const currentPlayerId = player?.id ?? ''
  const [showModal, setShowModal] = useState(false)

  // Categories are ordered by display_order from the DB
  const nextCategory = categories.find((c) => c.winner_id == null)
  if (!nextCategory) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
        <p className="text-sm text-white/50 text-center">All categories announced</p>
      </div>
    )
  }

  // My confidence pick for this category
  const myPick = confidencePicks.find(
    (cp) => cp.player_id === currentPlayerId && cp.category_id === nextCategory.id,
  )
  const myNominee = myPick ? nominees.find((n) => n.id === myPick.nominee_id) : null

  // Nominees in this category (inferred from all players' confidence picks)
  const nomineeIdsInCat = new Set(
    confidencePicks.filter((cp) => cp.category_id === nextCategory.id).map((cp) => cp.nominee_id),
  )
  const nomineesInCat = nominees.filter((n) => nomineeIdsInCat.has(n.id))

  // My draft entities that overlap with nominees in this category
  const myEntityIds = new Set(
    draftPicks.filter((dp) => dp.player_id === currentPlayerId).map((dp) => dp.entity_id),
  )
  const myDraftHere = draftEntities.filter((e) => {
    if (!myEntityIds.has(e.id)) return false
    return nomineesInCat.some((n) => {
      if (e.type === 'film') return n.type === 'film' && n.film_name === e.film_name
      return n.type === 'person' && n.name === e.name
    })
  })

  const hasAnything = myNominee || myDraftHere.length > 0

  return (
    <>
    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
      {/* Category name row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-oscar-gold/70 flex-shrink-0">Next up</p>
          <CategoryIcon categoryName={nextCategory.name} size={14} className="text-white/60 flex-shrink-0" />
          <p className="text-sm font-bold text-white truncate">{nextCategory.name}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isHost && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => openSpotlight(nextCategory.id)}
              className="px-2.5 py-1 rounded-lg bg-oscar-gold/15 border border-oscar-gold/30 text-oscar-gold text-[11px] font-semibold"
              aria-label="Open category spotlight"
            >
              Spotlight
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setShowModal(true)}
            className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center"
            aria-label="Category info"
          >
            <Info size={13} className="text-white/45" />
          </motion.button>
        </div>
      </div>

      {hasAnything ? (
        <div className="flex flex-col gap-2">
          {myNominee && myPick && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-oscar-gold/55 mb-0.5">Prestige</p>
                <p className="text-sm text-white/85 font-medium truncate">{myNominee.name}</p>
                {myNominee.film_name && myNominee.type !== 'film' && (
                  <p className="text-xs text-white/40 truncate">{myNominee.film_name}</p>
                )}
              </div>
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center">
                <span className="text-sm font-bold text-oscar-gold">{myPick.confidence}</span>
              </div>
            </div>
          )}

          {myDraftHere.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Ensemble</p>
              <div className="flex flex-wrap gap-1.5">
                {myDraftHere.map((e) => (
                  <span
                    key={e.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-white/55"
                  >
                    {e.type === 'film' ? e.film_name : e.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/35">No picks in this category</p>
      )}
    </div>

    {showModal && (
      <CategoryInfoModal
        category={nextCategory}
        allNominees={nominees}
        confidencePicks={confidencePicks}
        currentPlayerId={currentPlayerId}
        onClose={() => setShowModal(false)}
      />
    )}
    </>
  )
}

// ─── Collapsible Scores ───────────────────────────────────────────────────────

function CollapsibleScores({ leaderboard }: { leaderboard: ScoredPlayer[] }) {
  const { player } = useGame()
  const [expanded, setExpanded] = useState(false)
  const currentPlayerId = player?.id ?? ''

  const myIndex = leaderboard.findIndex((sp) => sp.player.id === currentPlayerId)
  const myRank = myIndex + 1
  const leader = leaderboard[0]
  const me = leaderboard[myIndex]

  const summaryText = (() => {
    if (!me || !leader) return ''
    if (myRank === 1) {
      const gap = me.totalScore - (leaderboard[1]?.totalScore ?? me.totalScore)
      return gap > 0 ? `Leading by ${gap} pts` : 'Tied for the lead'
    }
    const gap = leader.totalScore - me.totalScore
    return `#${myRank} · ${gap} pts behind`
  })()

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white/80 flex-shrink-0">Scores</span>
          {me && (
            <span className="text-sm font-bold text-oscar-gold flex-shrink-0">{me.totalScore} pts</span>
          )}
          {!expanded && summaryText && (
            <span className="text-xs text-white/35 truncate">{summaryText}</span>
          )}
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-white/35 flex-shrink-0" />
          : <ChevronDown size={16} className="text-white/35 flex-shrink-0" />
        }
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 py-2.5 space-y-1">
              {leaderboard.map((sp, i) => {
                const isMe = sp.player.id === currentPlayerId
                return (
                  <div
                    key={sp.player.id}
                    className={['flex items-center justify-between py-1', isMe ? 'text-white' : 'text-white/55'].join(' ')}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={['text-xs font-bold w-4 flex-shrink-0', i === 0 ? 'text-oscar-gold' : 'text-white/25'].join(' ')}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{sp.player.name}</span>
                      {isMe && <span className="text-[10px] text-white/30 flex-shrink-0">you</span>}
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0 ml-2">{sp.totalScore} pts</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveHomeView({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
  isHost,
  openSpotlight,
}: Props) {
  return (
    <div className="h-full flex flex-col max-w-md mx-auto">
      {/* Fixed top: next category + score summary */}
      <div className="px-4 pt-4 space-y-3 flex-shrink-0">
        <NextUpCard
          categories={categories}
          nominees={nominees}
          confidencePicks={confidencePicks}
          draftPicks={draftPicks}
          draftEntities={draftEntities}
          isHost={isHost}
          openSpotlight={openSpotlight}
        />
        <CollapsibleScores leaderboard={leaderboard} />
      </div>

      {/* Chat fills remaining vertical space */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-4">
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1 flex-shrink-0">Chat</p>
        <ChatSection fill />
      </div>
    </div>
  )
}

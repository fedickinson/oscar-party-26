/**
 * App — root router with page transitions and global UI.
 *
 * STRUCTURE:
 *   BrowserRouter
 *     GameProvider
 *       AppInner (uses useLocation — must be inside BrowserRouter)
 *         ReconnectBanner   ← fixed amber bar when navigator goes offline
 *         AnimatePresence   ← keyed by pathname for page-level transitions
 *           Routes          ← each route element wrapped in PageWrap
 *
 * PAGE TRANSITIONS:
 *   Each route element is wrapped in <PageWrap> which fades + slides in from
 *   the right on enter (opacity: 0, x: 16 → opacity: 1, x: 0). Exit is a
 *   quick opacity fade with no x movement so it doesn't fight the incoming
 *   page's direction. AnimatePresence mode="wait" ensures the exiting page
 *   fully leaves before the entering page mounts.
 *
 * RECONNECT BANNER:
 *   Tracks navigator.onLine + window 'online'/'offline' events. Shows an
 *   amber fixed bar at the top of the screen when offline.
 *
 * OVERSCROLL:
 *   overscrollBehavior: 'contain' on the main wrapper prevents pull-to-refresh
 *   on iOS and Android from firing accidentally during scroll gestures.
 */

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { HallmarkDefs } from './components/ui/Hallmarks'
import { allegianceForAvatar } from './lib/allegiance'
import { WifiOff } from 'lucide-react'
import { GameProvider, useGame } from './context/GameContext'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Room from './pages/Room'
import Draft from './pages/Draft'
import Activate from './pages/Activate'
import Live from './pages/Live'
import Admin from './pages/Admin'
import Results from './pages/Results'
import PublicResults from './pages/PublicResults'
import PlayerRecap from './pages/PlayerRecap'

// ─── Page wrapper ─────────────────────────────────────────────────────────────

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// ─── Offline banner ───────────────────────────────────────────────────────────

function ReconnectBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -48 }}
          animate={{ y: 0 }}
          exit={{ y: -48 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500/95 text-ground text-sm font-semibold py-3 px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <WifiOff size={14} />
          No internet connection. Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Inner app (needs useLocation — must be inside BrowserRouter) ─────────────

function AppInner() {
  const location = useLocation()
  const { player } = useGame()

  // Your house is your side. The --t-personal-* token layer (active tab, own
  // leaderboard row, chat edge, primary actions) resolves through this
  // attribute — see src/lib/allegiance.ts for the house → claim mapping.
  useEffect(() => {
    document.documentElement.dataset.allegiance = allegianceForAvatar(player?.avatar_id)
  }, [player?.avatar_id])

  return (
    <>
      <ReconnectBanner />
      <div
        className="max-w-md mx-auto px-4 py-6"
        style={{ minHeight: '100dvh', overscrollBehavior: 'none' }}
      >
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrap><Home /></PageWrap>} />
            {/* Public pregame explainer — sent as a link before anyone has joined,
                so it must render with no room and no player. */}
            <Route path="/how-it-works" element={<PageWrap><HowItWorks /></PageWrap>} />
            <Route path="/room/:code" element={<PageWrap><Room /></PageWrap>} />
            <Route path="/room/:code/draft" element={<PageWrap><Draft /></PageWrap>} />
            <Route path="/room/:code/confidence" element={<PageWrap><Activate /></PageWrap>} />
            <Route path="/room/:code/live" element={<PageWrap><Live /></PageWrap>} />
            <Route path="/room/:code/admin" element={<PageWrap><Admin /></PageWrap>} />
            <Route path="/room/:code/results" element={<PageWrap><Results /></PageWrap>} />
            {/* Public, session-free results. Deliberately NOT under /room/:code —
                those routes all assume a player session and redirect without one,
                which is exactly what made shared links dead on arrival. */}
            <Route path="/recap/:code" element={<PageWrap><PublicResults /></PageWrap>} />
            {/* One player's keepsake. Same public, session-free contract. */}
            <Route path="/recap/:code/:playerId" element={<PageWrap><PlayerRecap /></PageWrap>} />
          </Routes>
        </AnimatePresence>
      </div>
    </>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <GameProvider>
        {/* Hallmark <symbol> defs — mounted once so <use> refs resolve anywhere */}
        <HallmarkDefs />
        <AppInner />
      </GameProvider>
    </BrowserRouter>
  )
}

export default App

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
import { WifiOff } from 'lucide-react'
import { GameProvider } from './context/GameContext'
import Home from './pages/Home'
import Room from './pages/Room'
import Draft from './pages/Draft'
import Confidence from './pages/Confidence'
import Live from './pages/Live'
import Admin from './pages/Admin'
import Results from './pages/Results'

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
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500/95 text-deep-navy text-sm font-semibold py-3 px-4"
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

  return (
    <>
      <ReconnectBanner />
      <div
        className="min-h-screen max-w-md mx-auto px-4 py-6"
        style={{ overscrollBehavior: 'contain' }}
      >
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrap><Home /></PageWrap>} />
            <Route path="/room/:code" element={<PageWrap><Room /></PageWrap>} />
            <Route path="/room/:code/draft" element={<PageWrap><Draft /></PageWrap>} />
            <Route path="/room/:code/confidence" element={<PageWrap><Confidence /></PageWrap>} />
            <Route path="/room/:code/live" element={<PageWrap><Live /></PageWrap>} />
            <Route path="/room/:code/admin" element={<PageWrap><Admin /></PageWrap>} />
            <Route path="/room/:code/results" element={<PageWrap><Results /></PageWrap>} />
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
        <AppInner />
      </GameProvider>
    </BrowserRouter>
  )
}

export default App

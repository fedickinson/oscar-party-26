import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Escape hatch: visiting ?fresh wipes this app's stored identity (player id,
// per-room seen-flags) BEFORE React boots, then cleans the URL. Identity lives
// in localStorage and silently restores you into your last room — right for a
// party, wrong when you need a clean start on a phone where DevTools doesn't
// exist. "watch-the-dance.vercel.app/?fresh" is the whole instruction.
if (new URLSearchParams(window.location.search).has('fresh')) {
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

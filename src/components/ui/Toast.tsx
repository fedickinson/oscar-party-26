/**
 * Toast — slide-up notification bar for errors, warnings, and confirmations.
 *
 * USAGE:
 *   const { toast, showToast, dismissToast } = useToast()
 *
 *   // trigger:
 *   showToast('Could not save your pick. Try again.', 'error')
 *
 *   // render anywhere in the component tree:
 *   <Toast toast={toast} onDismiss={dismissToast} />
 *
 * Auto-dismisses after 3 seconds. onDismiss can also be called early (e.g.,
 * on retry action). Wrapped in AnimatePresence by the caller so exit animations
 * play when toast is cleared.
 *
 * TYPE COLORS:
 *   error   → red background
 *   success → emerald background
 *   warning → amber background
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle, TriangleAlert, X } from 'lucide-react'

export type ToastType = 'error' | 'success' | 'warning'

export interface ToastData {
  message: string
  type: ToastType
  action?: { label: string; onClick: () => void }
}

// ─── useToast hook ────────────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'error', action?: ToastData['action']) => {
    setToast({ message, type, action })
  }, [])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  return { toast, showToast, dismissToast }
}

// ─── Toast component ──────────────────────────────────────────────────────────

interface Props {
  toast: ToastData | null
  onDismiss: () => void
}

const COLORS: Record<ToastType, string> = {
  error: 'bg-red-500/95 border-red-400/40',
  success: 'bg-emerald-600/95 border-emerald-400/40',
  warning: 'bg-amber-500/95 border-amber-400/40',
}

const ICONS: Record<ToastType, React.ReactNode> = {
  error: <AlertCircle size={16} />,
  success: <CheckCircle size={16} />,
  warning: <TriangleAlert size={16} />,
}

function ToastInner({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  // Auto-dismiss after 3 seconds; reset on each new toast
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 48 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={[
        'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-4 right-4 max-w-md mx-auto z-[9999]',
        'flex items-center gap-3 px-4 py-3.5 rounded-2xl border backdrop-blur-lg text-white shadow-xl',
        COLORS[toast.type],
      ].join(' ')}
    >
      <span className="flex-shrink-0">{ICONS[toast.type]}</span>

      <p className="flex-1 text-sm font-medium leading-tight">{toast.message}</p>

      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss() }}
          className="flex-shrink-0 text-xs font-bold underline underline-offset-2 opacity-90 hover:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={onDismiss}
        className="flex-shrink-0 opacity-70 hover:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  )
}

export default function Toast({ toast, onDismiss }: Props) {
  return (
    <AnimatePresence>
      {toast && <ToastInner key={`${toast.type}-${toast.message}`} toast={toast} onDismiss={onDismiss} />}
    </AnimatePresence>
  )
}

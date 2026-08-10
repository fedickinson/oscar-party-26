-- ============================================================================
-- Shared draft countdown
--
-- The 3-2-1 before the draft was driven by a client-local ref plus a chain of
-- setTimeouts, one independent chain per client. That has two failure modes and
-- we hit both: a client whose timers get cleared (unmount, background tab
-- throttling, a re-render) freezes on whatever number it was showing, and since
-- ONLY the host fires the phase change, a frozen host strands everybody on
-- "Ensemble time." forever.
--
-- Storing the start instant on the room makes the countdown a pure function of
-- wall clock. Every client derives the same number independently, a missed tick
-- self-heals on the next one, and any client can see that the countdown has
-- elapsed rather than waiting to be told.
-- ============================================================================

BEGIN;

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ;

COMMIT;

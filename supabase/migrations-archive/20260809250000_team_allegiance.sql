-- ============================================================================
-- Team allegiance + arrival welcomes
--
-- players.team — which claimant a player backs: 'black' | 'green' | NULL
-- (undeclared). Self-declared, switchable all night. A switch is a chat event:
-- the host client watches player UPDATEs and has a companion react, which is
-- the entire reason this is a column and not local state — Realtime carries the
-- defection to every phone, including the one that fires the announcement.
--
-- players.welcomed_at — when the companions greeted this player in chat.
-- Written by the host client as it works through the welcome queue. A stamp
-- rather than host memory so a host reload mid-pre-show cannot re-welcome
-- everyone (the same failure the companion intros had, solved the same way).
-- ============================================================================

BEGIN;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS team TEXT CHECK (team IN ('black', 'green')),
  ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMPTZ;

COMMIT;

-- ============================================================================
-- Remote co-watch sync — pause coordination and drift correction
--
-- The setup this exists for: five people share ONE screen in New York, one
-- person watches separately in Mexico. Six phones, but only TWO playbacks. One
-- designated "point person" in the room is the playback authority — they own
-- the remote, and their timestamp is what the room is actually at.
--
-- The real enemy is DRIFT. If the room is 20 seconds ahead, their reactions
-- spoil the remote viewer. So both sides post where they are, and the app works
-- out who needs to skip or wait.
-- ============================================================================

BEGIN;

ALTER TABLE rooms
  -- ── Sync beacon ──────────────────────────────────────────────────────────
  -- The most recent "I am here" from either side. Position is milliseconds into
  -- the episode; posted_at is the wall clock when it was sent, which is what
  -- makes the comparison honest — a beacon read 8 seconds after it was posted
  -- describes a playhead that has itself moved on 8 seconds.
  ADD COLUMN IF NOT EXISTS sync_position_ms  INTEGER,
  ADD COLUMN IF NOT EXISTS sync_posted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_posted_by    TEXT,

  -- ── Playback state ───────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS is_paused         BOOLEAN NOT NULL DEFAULT false,
  -- Set when someone asks for a pause but the room has not stopped yet. The
  -- point person pauses at the next scene break rather than mid-shot, so a
  -- request and an actual pause are deliberately two different states.
  ADD COLUMN IF NOT EXISTS pause_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS pause_reason      TEXT,
  ADD COLUMN IF NOT EXISTS paused_at_ms      INTEGER,
  -- Player ids who have tapped "ready" to resume. Cleared on every pause.
  ADD COLUMN IF NOT EXISTS resume_ready      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- ── Roles ────────────────────────────────────────────────────────────────
  -- TWO point people, because there are two playbacks: one person controls the
  -- shared screen in New York, the remote viewer controls their own. Either can
  -- confirm a pause or start the resume countdown. Everyone else asks.
  ADD COLUMN IF NOT EXISTS point_person_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Wall clock at which both playbacks should press play. Set when the resume
  -- countdown starts; both sides count down to the SAME instant rather than one
  -- person pressing play and the other following, which would re-introduce the
  -- drift the pause just fixed.
  ADD COLUMN IF NOT EXISTS resume_at         TIMESTAMPTZ,
  -- Wall clock the episode started, for anyone joining late.
  ADD COLUMN IF NOT EXISTS episode_started_at TIMESTAMPTZ;

-- Atomic ready-up. Two people tapping "ready" at once with a client-side
-- read-modify-write would overwrite each other — same bug the Oscars build hit
-- with ready_players, same fix.
CREATE OR REPLACE FUNCTION mark_resume_ready(p_room_id uuid, p_player_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE rooms
  SET resume_ready = COALESCE(resume_ready, '[]'::jsonb) || to_jsonb(p_player_id)
  WHERE id = p_room_id
    AND NOT (resume_ready @> to_jsonb(p_player_id));
$$;

COMMIT;

-- Sanity
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='rooms' AND column_name LIKE 'sync%' OR column_name LIKE 'pause%';

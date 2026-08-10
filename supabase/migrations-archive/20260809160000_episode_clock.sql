-- ============================================================================
-- Episode clock — start everyone's position automatically
--
-- THE BUG THIS FIXES
-- useWatchSync tracks a position, compares it to the other side's beacon, and
-- reports drift. All of that works. None of it ever RAN, because the clock only
-- starts when somebody types a timestamp into their phone, and nobody is going
-- to do that in a dark room with the episode playing. The sync bar sat at
-- "--:--" and reported nothing all night.
--
-- rooms.episode_started_at was added in 20260809120000 for exactly this and was
-- never read or written. This finishes the job — but on players, not rooms.
--
-- WHY PER-PLAYER AND NOT PER-ROOM
-- There are two playbacks tonight and they do not start together. Tulum presses
-- play when Tulum presses play; New York presses when New York presses. A single
-- room-level timestamp records whoever was first and silently mis-times everyone
-- else — which would manufacture exactly the drift the feature exists to detect.
--
-- So the origin lives on the player, and a screen's remote-holder stamps it for
-- everyone sharing that screen. Solo watchers stamp only themselves. From then
-- on every clock derives from its own origin and nobody types anything.
-- ============================================================================

BEGIN;

ALTER TABLE players
  -- When THIS player's screen started playing. NULL = not started yet.
  ADD COLUMN IF NOT EXISTS episode_started_at TIMESTAMPTZ;

-- Starting the episode is two facts at once: the game is live for everybody
-- (rooms.show_started), and THIS screen's clock has an origin. They must be one
-- transaction — a client doing two writes can flip the game live and then fail
-- to stamp the clock, which is the inert state all over again.
--
-- Idempotent on both counts: a second press by the same screen does not move an
-- origin that is already set, so a double tap cannot shift a running clock.
CREATE OR REPLACE FUNCTION start_episode_for_screen(p_room_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group TEXT;
BEGIN
  SELECT watch_group INTO v_group FROM players WHERE id = p_player_id;

  IF v_group IS NULL THEN
    -- Solo watcher: their own screen, nobody else on it.
    UPDATE players
    SET episode_started_at = now()
    WHERE id = p_player_id
      AND episode_started_at IS NULL;
  ELSE
    -- Everyone sharing this screen gets the same origin, including whoever is
    -- still walking back from the kitchen.
    UPDATE players
    SET episode_started_at = now()
    WHERE room_id = p_room_id
      AND watch_group = v_group
      AND episode_started_at IS NULL;
  END IF;

  UPDATE rooms
  SET show_started = true
  WHERE id = p_room_id
    AND NOT show_started;
END;
$$;

COMMIT;

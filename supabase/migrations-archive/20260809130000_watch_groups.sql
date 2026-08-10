-- ============================================================================
-- Watch groups — model WHERE people are watching, not just who pauses
--
-- The previous model asked the host to name two "point people" globally, which
-- assumed the answer rather than deriving it. The real structure is:
--
--   a watch group = one screen = one playback
--   everyone in a group shares that screen, however many phones they have
--   each group needs exactly ONE person who touches the remote
--
-- Tonight that is two groups (five together, one remote), but nothing here
-- hardcodes two. Deriving the remote-holders from group membership means the
-- lobby can ask the question in the order people actually think about it:
-- where are you, then who has the remote there.
--
-- NOTE ON NAMING: "room" is already the game room. These are watch GROUPS.
-- ============================================================================

BEGIN;

ALTER TABLE players
  -- Which screen this player is watching on. NULL = not yet assigned.
  -- Free text so the lobby can label them meaningfully ("New York", "Mexico")
  -- rather than forcing Group 1 / Group 2.
  ADD COLUMN IF NOT EXISTS watch_group TEXT,
  -- True for the one person per group who controls playback. Enforced in the UI
  -- rather than by constraint: a partial unique index would fight the lobby's
  -- optimistic updates while the host is still assigning people.
  ADD COLUMN IF NOT EXISTS is_remote_holder BOOLEAN NOT NULL DEFAULT false;

-- Assigning a remote-holder must clear any previous holder in the SAME group,
-- atomically. Doing it as two client-side writes leaves a window where a group
-- has two holders or none, and the sync bar reads that state directly.
CREATE OR REPLACE FUNCTION set_remote_holder(p_room_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group TEXT;
BEGIN
  SELECT watch_group INTO v_group FROM players WHERE id = p_player_id;

  UPDATE players
  SET is_remote_holder = false
  WHERE room_id = p_room_id
    AND is_remote_holder
    AND watch_group IS NOT DISTINCT FROM v_group;

  UPDATE players
  SET is_remote_holder = true
  WHERE id = p_player_id;
END;
$$;

COMMIT;

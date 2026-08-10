-- ============================================================================
-- The Reckoning — one written verdict per player, at the end of the night
--
-- WHAT THIS IS FOR
-- The leaderboard rewards one person. Everyone else reads a number and finds
-- out they lost. This table holds a short passage written ABOUT each player, in
-- the voice of one of the seven companions, so every person at the party ends
-- the night with something that is about them specifically.
--
-- WHY IT IS PERSISTED RATHER THAN HELD IN STATE
-- Three reasons, all of which bit the post-show chat before it was moved into
-- `messages`:
--   1. It costs an Anthropic call. Recomputing on every mount would re-bill and,
--      worse, hand each player a DIFFERENT verdict from the one their friend is
--      reading over their shoulder.
--   2. The recap PDF and the share image are generated later, from whatever is
--      on the page. They need the same text everyone saw.
--   3. The public results link (no player session) has no way to generate this
--      itself and must read what the party already produced.
--
-- The title alongside it is computed, not written — see src/lib/night-awards.ts.
-- It is stored here so the row is self-contained for the public view, which
-- does not load the draft data the title was derived from.
--
-- SCOPE
-- Permissive RLS, matching every other table in this app: one shared anon key,
-- a private room of friends, authorization by obscurity of the room code.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS player_verdicts (
  room_id     UUID NOT NULL REFERENCES rooms(id)   ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Which companion wrote it. Deterministically assigned client-side so the
  -- same player always gets the same voice across reloads and across clients.
  companion_id TEXT NOT NULL,

  -- The computed honorific ("The Kingmaker"). Denormalised deliberately: see above.
  title        TEXT NOT NULL,
  -- The written passage. 2-3 sentences.
  verdict      TEXT NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One verdict per player per room. Also the conflict target for the upsert,
  -- so a double-fire (two clients racing, or a host refreshing mid-generation)
  -- overwrites rather than duplicating.
  PRIMARY KEY (room_id, player_id)
);

ALTER TABLE player_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read verdicts" ON player_verdicts;
CREATE POLICY "anon can read verdicts"
  ON player_verdicts FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon can write verdicts" ON player_verdicts;
CREATE POLICY "anon can write verdicts"
  ON player_verdicts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- The upsert path needs UPDATE as well as INSERT: ON CONFLICT DO UPDATE is an
-- update, and RLS judges it as one. Granting only INSERT would let the first
-- generation succeed and every retry fail with 42501.
DROP POLICY IF EXISTS "anon can revise verdicts" ON player_verdicts;
CREATE POLICY "anon can revise verdicts"
  ON player_verdicts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Only the host generates; everyone else receives. Without this the other
-- players sit on an empty Reckoning section until they reload.
ALTER PUBLICATION supabase_realtime ADD TABLE player_verdicts;

COMMIT;

-- ── Sanity check ────────────────────────────────────────────────────────────
-- SELECT player_id, title, companion_id FROM player_verdicts WHERE room_id = '<uuid>';

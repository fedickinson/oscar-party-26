-- ============================================================================
-- Let the companions choose the artwork on a player's keepsake
--
-- The verdict call already reads each player's whole night, so it is the only
-- thing positioned to answer "which picture belongs on this person's page". It
-- now returns a slug per slot alongside the title, passage, and highlights.
--
-- STORED AS SLUGS, NEVER PATHS
-- The model picks from a catalogue in src/data/image-library.ts and returns an
-- id from it. Anything unrecognised is dropped before this table is written, so
-- a hallucinated filename can never become a broken image inside a file
-- somebody keeps for a year. Storing the slug rather than the path also means
-- re-pointing or renaming artwork is a code change, not a data migration.
--
-- OPTIONAL, LIKE EVERYTHING ELSE ON THIS ROW
-- Empty is the normal state until the House of the Dragon portraits exist. The
-- keepsake renders without artwork rather than reserving an empty box for it.
-- ============================================================================

BEGIN;

ALTER TABLE player_verdicts
  -- [{ "slot": "crest" | "hero", "slug": "...", "note": "why this one" }]
  ADD COLUMN IF NOT EXISTS imagery JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN player_verdicts.imagery IS
  'Artwork chosen for this keepsake: [{slot, slug, note}]. Slugs resolve against src/data/image-library.ts; unknown slugs are dropped on write.';

COMMIT;

-- ── Sanity check ────────────────────────────────────────────────────────────
-- SELECT player_id, title, jsonb_array_length(imagery) FROM player_verdicts;

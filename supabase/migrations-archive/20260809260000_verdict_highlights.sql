-- ============================================================================
-- Let the companions name each player and pick their best lines
--
-- WHAT CHANGES
-- Two additions to player_verdicts, both authored by the same Anthropic call
-- that already writes the verdict passage:
--
--   1. The TITLE becomes bespoke. It was drawn from a fixed pool of eight
--      honorifics in lib/night-awards.ts. That pool guarantees everyone gets
--      something and it still does — it is the fallback — but with eight names
--      and six players the same titles recur every party, and "The Kingmaker"
--      stops meaning anything the second time somebody earns it. The model sees
--      every player's night at once, so it can name each person for what
--      actually happened to them and keep the names distinct from each other.
--
--   2. HIGHLIGHTS records which chat lines belong in that player's keepsake.
--      The heuristic it replaces was "anything mentioning your name, then your
--      own longest messages", which reliably surfaced the most VERBOSE line
--      rather than the best one. Picking the funny one is a judgement call, so
--      it goes to the thing that can make it.
--
-- WHY message ids AND NOT the text
-- Chat is immutable for the anon key (insert and select only — no update, no
-- delete), so a referenced message can never be edited out from under this.
-- Storing ids keeps `messages` the single source of truth for what was said and
-- lets the note travel separately from the line it annotates.
--
-- NO FK ON message_id, deliberately: highlights is a jsonb array, and the rows
-- it points at are already immutable. A referential trigger would buy nothing.
--
-- BOTH COLUMNS ARE OPTIONAL
-- Everything degrades in one direction. No verdict row at all -> computed title,
-- heuristic lines. Row present but highlights empty -> bespoke title, heuristic
-- lines. The artifact never depends on the model having succeeded.
-- ============================================================================

BEGIN;

ALTER TABLE player_verdicts
  -- [{ "message_id": "<uuid>", "note": "why this one" }]
  ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN player_verdicts.title IS
  'Bespoke honorific written for this player. Falls back to the computed pool title in lib/night-awards.ts when no row exists.';
COMMENT ON COLUMN player_verdicts.highlights IS
  'Chat lines chosen for this player''s keepsake: [{message_id, note}]. Empty means fall back to the heuristic in lib/player-recap.ts.';

COMMIT;

-- ── Sanity check ────────────────────────────────────────────────────────────
-- SELECT player_id, title, jsonb_array_length(highlights) FROM player_verdicts;

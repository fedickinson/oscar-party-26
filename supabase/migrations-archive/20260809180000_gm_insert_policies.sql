-- ============================================================================
-- Let the Game Master actually log an event
--
-- THE BUG
-- The GM console's logEvent() writes three rows: categories, category_nominees,
-- room_winners. Only the third was permitted. INSERT on categories and
-- category_nominees was blocked by RLS, so every attempt to log an event failed
-- with 42501 and the console showed "Could not log that event."
--
-- That is the single action the entire evening is built on — no event can be
-- logged, so nothing can score, so the leaderboard never moves and the AI
-- companions never react. Found by scripts/dogfood-e2e.mts.
--
-- WHY IT WAS MISSING
-- In the Oscars build `categories` was reference data: 24 rows seeded once, and
-- the host only ever UPDATEd winner_id on them. SELECT/UPDATE/DELETE policies
-- exist and work. Nothing ever CREATED a category, so no INSERT policy was ever
-- written. Repurposing categories as a GM-authored event log is the first time
-- anything has needed to.
--
-- SCOPE
-- Permissive, matching the rest of this app: one shared anon key, a private room
-- of friends, and authorization by obscurity of the room code. This grants no
-- more than the SELECT/UPDATE/DELETE that these same tables already allow.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "anon can create events" ON categories;
CREATE POLICY "anon can create events"
  ON categories FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon can link events to nominees" ON category_nominees;
CREATE POLICY "anon can link events to nominees"
  ON category_nominees FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Undo removes the link row as well as the event, so DELETE has to be allowed
-- on the join table too. Untested before now for the same reason as the above:
-- nothing ever created one of these rows, so nothing ever removed one.
DROP POLICY IF EXISTS "anon can unlink events" ON category_nominees;
CREATE POLICY "anon can unlink events"
  ON category_nominees FOR DELETE
  TO anon, authenticated
  USING (true);

COMMIT;

-- ============================================================================
-- Make the Game Master's undo actually undo
--
-- DELETE on categories was blocked by RLS, but PostgREST answers a
-- policy-filtered delete with 200 and an empty result rather than an error —
-- so undoEvent() reported success, the console cleared its spinner, and the
-- event stayed on the board. A silent no-op is worse than a failure here: the
-- host believes a mis-logged event is gone and moves on.
--
-- Found by scripts/dogfood-e2e.mts, which caught it only because it asserts on
-- rows read back rather than on HTTP status.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "anon can remove events" ON categories;
CREATE POLICY "anon can remove events"
  ON categories FOR DELETE
  TO anon, authenticated
  USING (true);

COMMIT;

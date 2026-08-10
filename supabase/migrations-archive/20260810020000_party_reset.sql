-- ============================================================================
-- Party reset — the real evening starts from zero.
-- REST deletes silently no-op on tables without anon DELETE policies (204 with
-- rows filtered out); SQL migrations run privileged, so this actually clears.
-- Content tables (categories/nominees/entities/beats/squares/avatars) untouched.
-- Full pre-reset snapshot taken at 2026-08-10T01-41-21 (.private/snapshots).
-- ============================================================================
BEGIN;

DELETE FROM bingo_marks;
DELETE FROM bingo_cards;
DELETE FROM beat_activations;
DELETE FROM messages;
DELETE FROM confidence_picks;
DELETE FROM draft_picks;
DELETE FROM room_winners;
DELETE FROM category_nominees WHERE category_id > 20;
DELETE FROM categories WHERE id > 20;

-- Break the circular FK, then drop every test room and player. Stale phone
-- localStorage now resolves to nothing -> every device starts clean without
-- needing ?fresh.
UPDATE rooms SET host_id = NULL, active_spotlight_category_id = NULL;
DELETE FROM players;
DELETE FROM rooms;

COMMIT;

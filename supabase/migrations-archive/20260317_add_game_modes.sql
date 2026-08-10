-- Migration: add game depth mode columns to rooms
-- Run this in the Supabase SQL editor before deploying the game modes feature.
--
-- ensemble_mode controls which entities are in the draft pool.
-- prestige_mode controls which Oscar categories are in the picks game.
-- Both default to 'full' so existing rooms behave identically to before.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS ensemble_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (ensemble_mode IN ('full', 'stars_and_films', 'films_only')),
  ADD COLUMN IF NOT EXISTS prestige_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (prestige_mode IN ('full', 'main_stage', 'big_night'));

-- Confirm the columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rooms'
  AND column_name IN ('ensemble_mode', 'prestige_mode');

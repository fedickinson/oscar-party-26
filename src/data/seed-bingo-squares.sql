-- ─────────────────────────────────────────────────────────────────────────────
-- seed-bingo-squares.sql
-- 98th Academy Awards (March 15, 2026) — 50 bingo squares
--
-- Purpose: Replace all bingo squares with ceremony-specific content.
--   20 objective squares: auto-approved by checkObjectiveCondition() when a
--     winner is announced. Text must match patterns in bingo-utils.ts:
--       "[target] wins any award"
--       "[target] speaks at the podium"
--       "[target] wins [category name]"
--   30 subjective squares: host approves manually during the broadcast.
--
-- This is idempotent: DELETE + INSERT means it's safe to run multiple times.
-- WARNING: Running this after a game has started will orphan existing
--   bingo_cards.squares references. Only run this before any rooms are created.
--
-- Verification query is at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Clear existing squares
DELETE FROM bingo_squares;

-- Step 2: Reset the id sequence after insert (done at the end)

-- Step 3: Insert all 50 squares
INSERT INTO bingo_squares (id, text, short_text, is_objective) VALUES

  -- ── OBJECTIVE (20) ─────────────────────────────────────────────────────────
  -- Auto-approved when a matching winner is announced.

  (1,  'Sinners wins any award',
       'Sinners wins anything',                    true),
  (2,  'One Battle After Another wins any award',
       'One Battle wins anything',                 true),
  (3,  'Paul Thomas Anderson wins any award',
       'PTA wins anything',                        true),
  (4,  'Jessie Buckley wins Best Actress',
       'Buckley wins Actress',                     true),
  (5,  'Michael B. Jordan wins Best Actor',
       'MBJ wins Actor',                           true),
  (6,  'Timothee Chalamet wins Best Actor',
       'Chalamet wins Actor',                      true),
  (7,  'Sinners wins Best Picture',
       'Sinners wins Picture',                     true),
  (8,  'One Battle After Another wins Best Picture',
       'One Battle wins Picture',                  true),
  (9,  'Paul Thomas Anderson wins Best Director',
       'PTA wins Director',                        true),
  (10, 'Sinners wins Best Director',
       'Sinners wins Director',                    true),
  (11, 'Delroy Lindo wins any award',
       'Delroy Lindo wins',                        true),
  (12, 'Sinners wins Best Cinematography',
       'Sinners wins Cinematography',              true),
  (13, 'Sinners wins Best Film Editing',
       'Sinners wins Editing',                     true),
  (14, 'One Battle After Another wins Best Director',
       'One Battle wins Director',                 true),
  (15, 'One Battle After Another wins Best Cinematography',
       'One Battle wins Cinematography',           true),
  (16, 'Sinners wins Best Original Score',
       'Sinners wins Score',                       true),
  (17, 'One Battle After Another wins Best Original Screenplay',
       'One Battle wins Screenplay',               true),
  (18, 'Sinners wins Best Original Screenplay',
       'Sinners wins Screenplay',                  true),
  (19, 'Michael B. Jordan speaks at the podium',
       'MBJ at the podium',                        true),
  (20, 'Jessie Buckley speaks at the podium',
       'Buckley at the podium',                    true),

  -- ── SUBJECTIVE (30) ────────────────────────────────────────────────────────
  -- Host approves manually during the broadcast.

  -- Conan O'Brien host moments
  (21, 'Conan O''Brien makes a self-deprecating joke about never winning an Oscar',
       'Conan self-deprecates',                    false),
  (22, 'Conan does a bit that goes on longer than it should',
       'Conan bit runs long',                      false),
  (23, 'Conan gets visibly flustered or breaks character',
       'Conan breaks character',                   false),
  (24, 'Conan references the writers'' room or his late-night history',
       'Conan plugs late night',                   false),

  -- Misty Copeland / Chalamet storyline
  (25, 'The camera cuts to Timothee Chalamet during the Misty Copeland performance',
       'Camera finds Chalamet',                    false),
  (26, 'The Misty Copeland performance gets a standing ovation',
       'Copeland standing ovation',                false),
  (27, 'Timothee Chalamet looks uncomfortable at any point on camera',
       'Chalamet looks awkward',                   false),

  -- PTA / long-overdue narrative
  (28, 'A presenter or winner mentions a long-overdue recognition or first-time winner',
       'Long overdue mention',                     false),
  (29, 'Someone on stage mentions Paul Thomas Anderson''s career or prior nominations',
       'PTA career mentioned',                     false),
  (30, 'Paul Thomas Anderson appears visibly emotional on camera',
       'PTA gets emotional',                       false),

  -- Delroy Lindo
  (31, 'Delroy Lindo gets a standing ovation',
       'Delroy Lindo ovation',                     false),
  (32, 'Delroy Lindo cries or visibly tears up on camera',
       'Delroy Lindo tears up',                    false),

  -- Sinners record nominations
  (33, 'A presenter announces or references Sinners'' record 16 nominations',
       'Sinners record cited',                     false),
  (34, 'Ryan Coogler is shown in the audience or on stage',
       'Ryan Coogler on camera',                   false),

  -- Best Casting inaugural category
  (35, 'The inaugural Best Casting award presenter acknowledges it is a new category',
       'New Casting category noted',               false),
  (36, 'The Best Casting winner thanks the actors in their speech',
       'Casting winner thanks actors',             false),

  -- General ceremony moments
  (37, 'A winner forgets to thank someone and turns back to the mic to add them',
       'Winner turns back to mic',                 false),
  (38, 'An acceptance speech gets played off by the orchestra',
       'Played off by orchestra',                  false),
  (39, 'A winner thanks their therapist',
       'Winner thanks therapist',                  false),
  (40, 'A winner cries before they say a single word',
       'Winner cries before speaking',             false),
  (41, 'A presenter mispronounces a nominee''s name',
       'Name mispronounced',                       false),
  (42, 'Two presenters'' banter falls noticeably flat',
       'Banter falls flat',                        false),
  (43, 'A winner uses the phrase "I am speechless" in their speech',
       '"I am speechless"',                        false),
  (44, 'A nominee''s reaction shot shows them genuinely surprised they lost',
       'Surprised loser reaction',                 false),
  (45, 'A winner mentions a film that did not get nominated this year',
       'Snubbed film mentioned',                   false),
  (46, 'Any presenter or winner references the film industry strike or labor conditions',
       'Strike or labor mentioned',                false),
  (47, 'A winner dedicates their award to a deceased person',
       'Dedicated to the deceased',                false),
  (48, 'The In Memoriam segment is interrupted by applause',
       'In Memoriam applause',                     false),
  (49, 'A clip reel shown before an award contains a film that did not win',
       'Clip reel includes a loser',               false),
  (50, 'Best Picture winner is announced and the room reaction sounds genuinely shocked',
       'Shocked Best Picture room',                false);

-- Step 4: Advance the sequence past our highest id so future inserts don't collide
SELECT setval(pg_get_serial_sequence('bingo_squares', 'id'), 50, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query — run this after the INSERT to confirm the data:
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                AS total,
  COUNT(*) FILTER (WHERE is_objective = true)            AS objective,
  COUNT(*) FILTER (WHERE is_objective = false)           AS subjective,
  MIN(id)                                                AS min_id,
  MAX(id)                                                AS max_id
FROM bingo_squares;

-- Expected result:
--   total | objective | subjective | min_id | max_id
--      50 |        20 |         30 |      1 |     50

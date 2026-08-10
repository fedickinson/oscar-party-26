-- ============================================================================
-- Bingo rebalance — fix the LIKELIHOOD DISTRIBUTION, not the writing
--
-- THE PROBLEM
-- A card is 24 live squares (the centre is free) drawn from a pool of 50. The
-- original pool had roughly a dozen squares that are near-certain in any
-- episode of this show — "a dragon roars in close-up", "someone says 'the
-- realm'", "a character rides a horse into frame", "blood on someone's face".
-- Those are not squares, they are free marks. With ~12 of them in a 50 pool,
-- every card starts about half-filled within twenty minutes and the game is
-- over before the episode is. Another handful sat at the opposite extreme
-- ("someone mentions the Wall or the North") and could never fill at all.
--
-- Dead-certain and dead-impossible squares fail the same way: they carry no
-- tension. The target is most squares landing somewhere in the middle, so a
-- card is still live in the last twenty minutes.
--
-- A THIRD FAILURE MODE: squares the host cannot adjudicate. "Daemon smirks at
-- exactly the wrong moment" and "a dragonseed does something reckless" start
-- arguments rather than settling them, which matters because every mark here
-- is host-confirmed. Those are rewritten as observable facts.
--
-- WHAT THE REPLACEMENTS ARE BUILT FROM
-- The open questions left standing at the end of E7 — Vhagar missing, Aemond
-- poisoned at Harrenhal, Corlys a prisoner at Tumbleton, Ulf secretly turned,
-- Helaena pregnant in the capital, a Black northern host closing on Ormund.
-- These are predictions the players would make themselves, which is the whole
-- point of a bingo card. Nothing here asserts an outcome.
--
-- 28 squares are unchanged. 22 are replaced. Ids are stable, so bingo_cards
-- that reference them stay valid.
-- ============================================================================

BEGIN;

-- Replacements, by id. Everything not listed is deliberately kept.
UPDATE bingo_squares SET text = v.text, short_text = v.short_text
FROM (VALUES
  -- ── Were near-certain: guaranteed marks with no tension ──────────────────
  --    "A dragon breathes fire on a person" -> Vhagar has been missing since E7
  (2,  'Vhagar appears on screen',                                    'Vhagar appears'),
  --    "Someone drinks wine in a tense scene"
  (15, 'Someone is served something they should not drink',           'Bad drink'),
  --    "Someone says ''my queen'' or ''my king''"
  (20, 'Someone refuses to call Rhaenyra queen to her face',          'Refuses "queen"'),
  --    "A Targaryen says something about blood"
  (23, 'Someone tries to claim a dragon',                             'Claim attempt'),
  --    "A character rides a horse into frame"
  (30, 'Alicent and Rhaenyra are in the same scene',                  'Alicent + Rhaenyra'),
  --    "A map or table of the realm is shown"
  (33, 'A war council ends with no agreement',                        'Council deadlocks'),
  --    "A character kneels or is told to kneel"
  (35, 'Someone kneels to a claimant they fought against',            'Kneels to the enemy'),
  --    "Someone says ''the realm''"
  (37, 'Someone says the war is already lost',                        '"It is lost"'),
  --    "A dragon roars in close-up"
  (38, 'A dragon refuses or ignores its rider',                       'Dragon disobeys'),
  --    "Blood is shown on someone''s face"
  (44, 'A character coughs or spits blood',                           'Coughs blood'),
  --    "A character says a name of a dragon aloud"
  (46, 'Someone speaks High Valyrian to a dragon',                    'Valyrian to a dragon'),
  --    "A crown is shown or worn"
  (49, 'A crown is taken off, thrown down, or refused',               'Crown refused'),
  --    "A battle horn or war drum sounds"
  (19, 'The northern host reaches Tumbleton',                         'North hits Tumbleton'),

  -- ── Were near-impossible: could never fill ───────────────────────────────
  --    "Someone says ''the Dance of the Dragons''" — nobody in-world calls it that
  (9,  'Aemond gets out of that bed',                                 'Aemond rises'),
  --    "A character we thought was dead is alive"
  (17, 'Corlys Velaryon appears on screen',                           'Corlys appears'),
  --    "Someone rides a dragon for the first time"
  (18, 'A dragonseed turns on the side that gave them a dragon',      'Dragonseed turns'),
  --    "Someone mentions the Wall or the North"
  (26, 'Helaena is shown alive',                                      'Helaena alive'),

  -- ── Were unadjudicable: arguments, not squares ───────────────────────────
  --    "Daemon smirks at exactly the wrong moment"
  (13, 'Daemon and Rhaenyra disagree in front of other people',       'Daemon vs Rhaenyra'),
  --    "A dragon lands and dismounts a rider" (also just confusing English)
  (27, 'A rider falls or is thrown from a dragon',                    'Rider falls'),
  --    "Someone whispers a secret in an ear"
  (29, 'A secret from earlier this season is said out loud',          'Secret spoken'),
  --    "Alys Rivers does something unsettling"
  (31, 'Alys Rivers gives a warning that is ignored',                 'Alys ignored'),
  --    "A dragonseed does something reckless"
  (42, 'Hugh Hammer is given an order',                               'Hugh gets an order')
) AS v(id, text, short_text)
WHERE bingo_squares.id = v.id;

-- Cards generated during testing hold marks against the OLD text at those
-- positions, which would now read as marks for squares nobody actually saw.
-- Everything currently in these tables is test data from the practice runs —
-- verified before writing this: 2 cards, 1 mark, no real game has been played.
-- Clearing them means every player is dealt a fresh card on their next visit.
DELETE FROM bingo_marks;
DELETE FROM bingo_cards;

COMMIT;

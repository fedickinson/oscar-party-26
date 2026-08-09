/**
 * generate-bingo-migration.mjs — turns the researcher's master pool JSON into
 * the bingo_squares seed migration.
 *
 * The JSON at src/data/bingo-master-pool.json is the source of truth for bingo
 * content. This script is the only thing that writes the seed migration, so if
 * the pool is revised, re-run it rather than hand-editing SQL:
 *
 *   node scripts/generate-bingo-migration.mjs
 *
 * Column mapping (the two legacy columns keep their existing meaning so every
 * component that reads them keeps working):
 *   short_text -> title         (the grid tile label, max ~22 chars in the pool)
 *   text       -> win_condition (the strict adjudication rule the host reads)
 *
 * Numeric ids are assigned by pool order and are what bingo_cards.squares
 * stores. Changing the pool order changes the ids, which is why the migration
 * wipes cards and marks — mid-game regeneration is not supported.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POOL_PATH = resolve(root, 'src/data/bingo-master-pool.json')
const OUT_PATH = resolve(root, 'supabase/migrations/20260809170000_bingo_master_pool.sql')

const pool = JSON.parse(readFileSync(POOL_PATH, 'utf8'))
const squares = pool.squares

// ─── Validation — a bad pool should fail here, not in Postgres ───────────────

const TIERS = ['likely', 'toss_up', 'long_shot', 'chaos']
const problems = []

if (squares.length !== pool.game.master_pool_size) {
  problems.push(`pool declares master_pool_size=${pool.game.master_pool_size} but has ${squares.length} squares`)
}
const slugs = new Set()
for (const s of squares) {
  if (slugs.has(s.id)) problems.push(`duplicate slug: ${s.id}`)
  slugs.add(s.id)
  if (!TIERS.includes(s.likelihood_tier)) problems.push(`${s.id}: unknown tier ${s.likelihood_tier}`)
  if (!(s.estimated_probability_pct >= 0 && s.estimated_probability_pct <= 100)) {
    problems.push(`${s.id}: probability out of range`)
  }
  if (!s.title || !s.win_condition) problems.push(`${s.id}: missing title or win_condition`)
  if (s.title.length > 26) problems.push(`${s.id}: title "${s.title}" is too long for a grid tile`)
}
// A board needs 24 live squares in the 7/9/6/2 mix — the pool must cover it.
const perTier = Object.fromEntries(TIERS.map((t) => [t, squares.filter((s) => s.likelihood_tier === t).length]))
for (const [tier, need] of Object.entries({ likely: 7, toss_up: 9, long_shot: 6, chaos: 2 })) {
  if (perTier[tier] < need) problems.push(`tier ${tier} has ${perTier[tier]} squares, a board needs ${need}`)
}

if (problems.length) {
  console.error('Pool validation failed:\n  ' + problems.join('\n  '))
  process.exit(1)
}

// ─── SQL emission ────────────────────────────────────────────────────────────

const q = (v) => `'${String(v).replace(/'/g, "''")}'`
const arr = (vals) => (vals.length ? `ARRAY[${vals.map(q).join(', ')}]::text[]` : `ARRAY[]::text[]`)

const rows = squares.map((s, i) => {
  const id = i + 1
  return `  (${id}, ${q(s.id)}, ${q(s.title)}, ${q(s.win_condition)}, ${q(s.title)}, false, ` +
    `${q(s.category)}, ${s.estimated_probability_pct}, ${q(s.likelihood_tier)}, ` +
    `${q(s.win_condition)}, ${q(s.why_it_is_fun)}, ${arr(s.storyline_tags)}, ${q(s.fun_type)})`
})

const evPerTier = Object.fromEntries(
  TIERS.map((t) => {
    const ps = squares.filter((s) => s.likelihood_tier === t).map((s) => s.probability_decimal)
    return [t, ps.reduce((a, b) => a + b, 0) / ps.length]
  }),
)
const targetEv = 7 * evPerTier.likely + 9 * evPerTier.toss_up + 6 * evPerTier.long_shot + 2 * evPerTier.chaos

const sql = `-- ============================================================================
-- Bingo master pool — replaces the 50 hand-written squares with the researched
-- 75-square pool for the House of the Dragon S3 finale.
--
-- GENERATED FILE. Source: src/data/bingo-master-pool.json
-- Regenerate with: node scripts/generate-bingo-migration.mjs
--
-- WHAT CHANGED AND WHY
-- The old pool was written by feel and then patched once (20260809150000) to
-- pull the near-certain squares back toward the middle. This pool replaces that
-- guesswork with per-square probability estimates, so board difficulty is a
-- computed property instead of a hope. Every square also carries a strict
-- win_condition that names what does NOT count, which is the part that actually
-- matters: every mark in this game is host-adjudicated, and arguments at 10pm
-- are what kill a bingo card.
--
-- Pool shape: ${perTier.likely} likely / ${perTier.toss_up} toss-up / ${perTier.long_shot} long-shot / ${perTier.chaos} chaos, averaging
-- ${pool.probability_model.pool_average_probability_pct}% per square. A generated board draws 7/9/6/2 across those tiers
-- (24 live squares plus the free centre), for an expected ~${targetEv.toFixed(1)} hits per board.
-- Board assembly lives in generateBingoCard() in src/lib/bingo-utils.ts.
--
-- Spoiler policy from the researcher: ${pool.spoiler_policy.canon_cutoff}.
-- No screeners, reviews, leaks, or unaired Fire & Blood outcomes.
--
-- COLUMN MAPPING
--   short_text -> title          (grid tile label)
--   text       -> win_condition  (kept in sync so older readers stay correct)
-- The new columns carry everything the old schema had no room for.
--
-- DESTRUCTIVE: square ids are reassigned, so existing bingo_cards.squares
-- arrays would point at the wrong squares. Cards and marks are wiped. Run this
-- before the finale starts, never during.
-- ============================================================================

BEGIN;

-- ── Schema: room for the researched metadata ────────────────────────────────
ALTER TABLE bingo_squares
  ADD COLUMN IF NOT EXISTS slug            text,
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS category        text,
  ADD COLUMN IF NOT EXISTS probability_pct integer,
  ADD COLUMN IF NOT EXISTS likelihood_tier text,
  ADD COLUMN IF NOT EXISTS win_condition   text,
  ADD COLUMN IF NOT EXISTS why_it_is_fun   text,
  ADD COLUMN IF NOT EXISTS storyline_tags  text[],
  ADD COLUMN IF NOT EXISTS fun_type        text;

-- ── Clear the old pool (marks -> cards -> squares, FK order) ────────────────
DELETE FROM bingo_marks;
DELETE FROM bingo_cards;
DELETE FROM bingo_squares;

-- ── The ${squares.length}-square master pool ──────────────────────────────────────────────
INSERT INTO bingo_squares
  (id, slug, title, text, short_text, is_objective,
   category, probability_pct, likelihood_tier, win_condition, why_it_is_fun, storyline_tags, fun_type)
VALUES
${rows.join(',\n')};

-- Keep the id sequence ahead of the seeded rows if this table uses one.
DO $$
DECLARE seq text;
BEGIN
  seq := pg_get_serial_sequence('bingo_squares', 'id');
  IF seq IS NOT NULL THEN
    PERFORM setval(seq, (SELECT max(id) FROM bingo_squares), true);
  END IF;
END $$;

-- ── Constraints — enforce the contract the generator relies on ──────────────
ALTER TABLE bingo_squares
  ALTER COLUMN slug            SET NOT NULL,
  ALTER COLUMN title           SET NOT NULL,
  ALTER COLUMN probability_pct SET NOT NULL,
  ALTER COLUMN likelihood_tier SET NOT NULL,
  ALTER COLUMN win_condition   SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bingo_squares_slug_key ON bingo_squares (slug);

ALTER TABLE bingo_squares DROP CONSTRAINT IF EXISTS bingo_squares_tier_check;
ALTER TABLE bingo_squares ADD CONSTRAINT bingo_squares_tier_check
  CHECK (likelihood_tier IN (${TIERS.map(q).join(', ')}));

ALTER TABLE bingo_squares DROP CONSTRAINT IF EXISTS bingo_squares_probability_check;
ALTER TABLE bingo_squares ADD CONSTRAINT bingo_squares_probability_check
  CHECK (probability_pct BETWEEN 0 AND 100);

COMMIT;

-- ── Sanity checks ───────────────────────────────────────────────────────────
-- SELECT count(*) FROM bingo_squares;                                  -- expect ${squares.length}
-- SELECT likelihood_tier, count(*) FROM bingo_squares GROUP BY 1;      -- expect ${TIERS.map((t) => `${t} ${perTier[t]}`).join(', ')}
-- SELECT round(avg(probability_pct), 1) FROM bingo_squares;            -- expect ~${pool.probability_model.pool_average_probability_pct}
`

writeFileSync(OUT_PATH, sql)
console.log(`Wrote ${OUT_PATH}`)
console.log(`  ${squares.length} squares — ${TIERS.map((t) => `${t}: ${perTier[t]}`).join(', ')}`)
console.log(`  target board expected hits: ${targetEv.toFixed(2)}`)

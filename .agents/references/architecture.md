# Architecture reference

Read when implementing, debugging, or reviewing anything that touches multiplayer state, phases,
scoring, or the database. `AGENTS.md` carries the invariants; this file carries the mechanics.

## The one data flow

```text
User action -> Supabase write -> Realtime broadcast -> all clients update state -> React re-renders
```

Every phase transition, every declared fact, every score update, and every bingo mark uses it.
There is no other sync mechanism, no polling, and no shared server state.

## Room phases

`RoomPhase` (`src/types/database.ts`): `lobby -> pre_draft -> draft -> confidence -> live ->
finished`. Routes mirror them under `/room/:code/*`; `/room/:code/confidence` renders `Activate`.

The host writes the new phase to `rooms`; every client's Realtime subscription fires; a
`useEffect` on `room.phase` navigates. **Never `navigate()` directly from the action that caused a
shared transition** — that moves one phone and strands the rest.

Game depth is orthogonal to phase: `ensemble_mode` and `prestige_mode` on the room shrink the
draft and prediction surfaces without changing the state machine.

## State ownership

| Kind of state | Where it lives |
| --- | --- |
| Shared game state (picks, marks, scores, phase, chat) | Supabase, synced by Realtime |
| Local UI state (inputs, expanded, selected tab) | React `useState` |
| Player identity | `localStorage` (`oscar_player_id`), restored on mount by `GameContext` |

Because all game state is in Postgres, the app is a disposable window: any phone can reload, any
deploy can land mid-game, and nothing is lost. Every host-side scheduler must therefore have a
reload-recovery guard that re-derives its work from the database.

## Realtime subscription pattern

```ts
const channel = supabase.channel('channel-name')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tablename', filter: 'id=eq.xxx' },
      (payload) => { /* update local state */ })
  .subscribe()
return () => { supabase.removeChannel(channel) }
```

Subscribe **before** the initial fetch — otherwise a write that lands between fetch and subscribe
is lost forever. Callbacks capture stale closures: read through refs or use functional `setState`.
Realtime must be enabled per table (`ALTER PUBLICATION supabase_realtime ADD TABLE x` in the
migration); a table that is not in the publication will never broadcast, and the symptom is "it
works after refresh."

## Pure vs orchestration

- `src/lib/*` — pure. No React, no Supabase, no async. This is what `scripts/dogfood-e2e.mts`
  imports to assert on real scoring with real rows. Logic that cannot be imported by a script
  cannot be verified headlessly.
- `src/hooks/*` — fetch, subscribe, set state, call `lib/`.
- Components stay thin.

## Scoring cascade

When the host declares an outcome:

1. `UPDATE categories.winner_id` (or the equivalent declared-fact write).
2. `UPDATE confidence_picks.is_correct` for every player in that category.
3. Realtime broadcasts both -> every client re-renders -> `computeLeaderboard()` runs on fresh rows.

Scoring is derived, never stored as a running total. Do not cache a score; recompute it from the
canonical rows.

## Content pipelines

- **Bingo pool.** `src/data/bingo-master-pool.json` is the source of truth (75 squares). Cards are
  drawn to a fixed likelihood-tier mix — 7 likely / 9 toss-up / 6 long shot / 2 chaos — chosen from
  400 candidates so every player's board has the same expected difficulty. Regenerate the seed
  migration with `node scripts/generate-bingo-migration.mjs`; never hand-edit the generated SQL.
- **Signature beats.** Declarable moments seeded by migration. Author them like bingo squares:
  screen-decidable by an eyewitness on a couch, proxy-aware (say whether agents, off-screen deaths,
  or mere mentions count), and honestly titled — the title must promise the same event the trigger
  pays. A bare one-sentence beat is how disputes start.
- **Generated prose.** Import `scripts/grounded-line.mts`. Do not write a generation prompt by
  hand; the contract (fact block, refutation pass, retries, surfaced residuals) is enforced in
  code precisely because remembering it failed three times in one night.

## Database

`supabase/migrations/` holds **one** migration: `00000000000000_baseline.sql`, the whole schema —
17 tables, 41 policies, 10 realtime-published tables, generated from the live project by
`scripts/schema-baseline.mts`. Regenerate it rather than hand-editing, and prove it with
`scripts/schema-diff.mts`, which fingerprints local and remote and compares object by object
(641 objects, identical at the time of writing).

The 19 historical migrations now live in `supabase/migrations-archive/`. They were squashed
because they cannot replay onto a current-state baseline: a 2026-08-09 seed insert predates the
`bingo_squares.slug` column that the same schema now requires. They are kept for history, not for
execution.

**Migration history is reconciled** (2026-08-10). Production's history table was squashed to match
local: the baseline marked applied, the 19 archived versions marked reverted. `supabase migration
list` shows `00000000000000` on both sides and `supabase db push` reports the remote database up
to date. No DDL ran — `schema-diff` reported the same 641 identical objects before and after — and
the pre-repair history table is saved at
`.private/snapshots/migration-history/2026-08-10T17-schema_migrations.json` if it is ever needed.

Schema changes are therefore now ordinary migrations: write the SQL into `supabase/migrations/`,
test it with `supabase db reset` locally, then `supabase db push`. That loop did not exist before
the baseline — the database could only be changed by hand in the SQL editor.

`supabase/seed.sql` carries authored content only — the board, the cast, the pool, the draftable
entities — so a fresh local database is playable. It contains no rooms, players or messages: that
data is a real evening with real names and this repository is public.

Row types live in `src/types/database.ts` — `Row` / `Insert` / `Update` per table. Keep them in
sync by hand; there is no codegen step wired up.

The `categories` table is **global** — no `room_id`. Anything written there shows up in every
room forever. `dogfood-e2e.mts` tears down its own rows for exactly this reason; any new script
that writes there must do the same.

## Gotchas that have actually bitten

- `.single()` throws on zero rows — use `.maybeSingle()` when the row may not exist.
- UUIDs must be valid hex; `g`-`z` in a hand-written id is a silent 400.
- `rooms.host_id` starts null: the room is created, then the host player is inserted, then the
  room is updated.
- Snake draft with 2 players alternates A,B,B,A,A,B. Correct, just repetitive.
- Confidence values are 1..N, each used exactly once per player. Validate on submit, not on keystroke.
- REST deletes silently no-op on tables without an anon DELETE policy — you get a 204 and nothing
  is deleted. Privileged SQL migrations actually clear.
- PostgREST pages at 1000 rows. Paginate any full-table read; `snapshot-game.mts` learned this the
  hard way.
- Optimistic local application beats waiting on the Realtime echo for taps that must feel instant
  (bingo marks).

## Environment

`.env.local` (gitignored; template in `.env.local.example`):

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_ANTHROPIC_API_KEY=sk-ant-...   # AI cast only
```

The `scripts/*.mts` tools read `.env.local` directly, so a script run always points at whatever
that file points at — which is the one live project. The Anthropic key is used through the Vercel
function at `api/anthropic/v1/messages.ts`; do not add a second path to the API.

## Operator layer

The game has three layers and the third is easy to forget: the game itself, the narrative engine
(`scripts/companion-daemon.mts`, phone-independent), and the operator's lens
(`scripts/gm-pulse.mts`, snapshots, daemon logs) — presence, engine health, and the power to
repair the world without touching the party. `RUNBOOK.md` is the procedure for all of it.

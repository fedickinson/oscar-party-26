-- When each room winner was declared.
--
-- WHY: the Scores feed orders a reloaded phone's night by
-- categories.announced_at, and nothing writes that column. Neither
-- declare_scheduled_winner (20260810194000) nor declare_room_event
-- (20260810191900) sets it, and room_winners itself carried no timestamp, so
-- every seeded entry came back untimed and the feed fell through to the
-- authored slate order. A phone that reloaded mid-show therefore read the
-- night in catalog order instead of the order the room actually watched it in.
-- room_winners is the row that records the declaration, so the declaration
-- time belongs on it.
--
-- ADDITIVE: add column if not exists, not null with a default, so the column
-- appears without a rewrite and every existing row is stamped with the moment
-- the migration ran. Nothing is renamed, dropped, retyped or repurposed; no
-- existing value changes meaning. Backfilling the true historical declaration
-- time is impossible - it was never recorded - and inventing one would be
-- worse than the honest default, so existing rows share the migration
-- timestamp and sort among themselves by display order exactly as they do
-- today.
--
-- TWO BUNDLES, ONE DATABASE (invariant 5):
--   - An older bundle never selects or writes this column. Its inserts still
--     work because the column is defaulted, and its ordering is unchanged.
--   - A newer bundle against an un-migrated database gets rows without the
--     field. src/lib/winner-feed.ts treats an absent declared_at as "no
--     declaration time" and falls back to announced_at, then display order,
--     then id. The Scores tab keeps working; it just orders the way it does
--     today. The client selects `*`, never a named column list, so a missing
--     column can never turn into a failed fetch.
--
-- SCOPE: one column on public.room_winners. Every writer keeps its current
-- signature; the default supplies the value. The commands that insert here
-- (declare_scheduled_winner, declare_room_event, the witness applier and the
-- referee undo) are deliberately untouched.

alter table public.room_winners
  add column if not exists declared_at timestamptz not null default now();

comment on column public.room_winners.declared_at is
  'When this winner was declared into the room. Defaulted on insert; the Scores feed orders the night by it.';

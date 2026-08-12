# Architecture reference

Read when implementing, debugging, or reviewing anything that touches multiplayer state, phases,
scoring, or the database. `AGENTS.md` carries the invariants; this file carries the mechanics.

## The one data flow

```text
User action -> Supabase write -> Realtime broadcast -> all clients update state -> React re-renders
```

Every phase transition, every declared fact, every score update, and every bingo mark uses it.
There is no other sync mechanism, no polling, and no shared server state.

Ephemeral live-page presence is the one non-row signal. `useRoomPresence` tracks each player's
foreground/background state on a room-scoped Supabase Presence channel; multiple tabs remain
separate metas under one player key. The operator reducer stays neutral until the first sync and
clears its snapshot on channel failure. Presence means “this live page is connected,” not durable
last-seen history. `operator_heartbeats` is the separate durable engine signal: the companion
daemon renews its room lease every 15 seconds, the UI declares it stale after 45 seconds, and a
second process may take over only after that boundary. Cast/fact order is still labeled as
sequence evidence only; it must never be presented as response provenance or causation.
Human-chat reactions have a separate durable identity and lease. Browser host tabs and the daemon
derive the same room-scoped reaction key from the source message and reaction kind; mentions and
banter include the selected companion, while ambient keys intentionally do not. The first engine
claims that key for 60 seconds. `complete_companion_reaction` inserts the generated `messages`
rows and records their IDs while holding the claim lock in one transaction, so there is no state
where a visible answer exists but its work can be reclaimed. Failed work is owner-released and a
dead owner may be replaced only after lease expiry. Completed claims are permanent until the room
is deleted. The ledger lives in the non-exposed `private` schema and is reachable by clients only
through the narrow claim, complete and release RPCs.

## Room phases

`RoomPhase` (`src/types/database.ts`): `lobby -> pre_draft -> draft -> confidence -> live ->
finished -> closed`. `finished` exposes the provisional live ledger; `closed` means a researched
settlement is active. Routes mirror them under `/room/:code/*`; `/room/:code/confidence` renders
`Activate`, and both post-show phases render Results.

The current operator invokes a capability-gated phase command; it writes the new phase to
`rooms`, every client's Realtime subscription fires, and a `useEffect` on `room.phase` navigates.
The creator receives the first room capability in the same transaction as the room and host seat;
the app-shell provider imports and preserves it across every room route. Begin-draft, shared
countdown, open-draft, timed skip, complete-draft and open-live each re-check both that bearer and
the current host seat under the room lock. Direct browser room creation and writes to the phase,
host, draft-order, countdown and timer-owned pick fields fail closed. Player-owned ready and pick
actions remain anonymous and narrow. Watch-sync is a separate seat-authority command family:
locations and holder handoffs close when shared playback begins; any member may request their own pause; only the
database-derived holder for a screen may publish its clock, park it, answer ready or release an
exact matured countdown. Direct browser writes to those room fields and to the player fields that
confer playback control fail closed. Player ids remain public seat handles, not cryptographic
caller identity; these commands enforce membership, current role and legal state without claiming
otherwise. Bingo uses the same deliberately bounded seat-authority model without turning into a
host-adjudicated game: one idempotent command deals a validated 24-square room-pack card to the
named seat, and another sets or clears only a non-center mark on that seat's own card. Direct
browser card and mark writes fail closed; service-role repair remains explicit. **Never
`navigate()` directly from the action that caused a shared transition** — that
moves one phone and strands the rest.

The live operator closes the floor through the permanent two-step command at the top of Events.
`close_live_floor_authorized` requires the current private room capability plus the current host
seat, then locks the room and atomically writes only `live -> finished` while clearing the active
spotlight. Identical concurrent calls and replays reconcile idempotently. The trigger rejects a
direct browser `live -> finished` write; service-role snapshot repair remains explicit.
Zero-declaration rooms remain closable, with an empty-ledger warning plus every staked prediction
still unresolved. Realtime moves every phone from the canonical room update; the action never
navigates locally. `finished` is an honestly provisional ledger and never uses the ceremony's
sealed-record gate. Only the checked settlement command may activate researched evidence and write
`closed`.
Provisional declaration undo goes through `undo_room_declaration_authorized`: current room
capability, current host seat, room phase, room ownership, declaration deletion and the public
system correction are checked and committed under one room lock. Clients never compose a
correction from a locally successful subset of deletes. Manual declaration creation likewise goes
through `declare_room_event_authorized`, which commits the room category, nominee link, winner and
public announcement as one transaction after the same two-part authority check.
Scheduled winners and spotlight opening/closing use the same capability-gated command discipline.
The room lock, current host, live phase, scheduled model, authored category and database-owned
spotlight revision are checked together. An opening cannot replace another active category or
reopen a resolved one; closing compares the exact active category and revision. Ordinary browsers
have read-only declaration-ledger table grants and cannot mutate spotlight state directly.

Game depth is orthogonal to phase: `ensemble_mode` and `prestige_mode` on the room shrink the
draft and prediction surfaces without changing the state machine.

## State ownership

| Kind of state | Where it lives |
| --- | --- |
| Shared game state (picks, marks, scores, phase, chat) | Supabase, synced by Realtime |
| Local UI state (inputs, expanded, selected tab) | React `useState` |
| Player identity | `localStorage` (`oscar_player_id`), restored on mount by `GameContext` |
| Operator authority | Room-scoped bearer in `localStorage`, imported and validated by `OperatorAuthorityProvider` |

Because all game state is in Postgres, the app is a disposable window: any phone can reload, any
deploy can land mid-game, and nothing is lost. Every host-side scheduler must therefore have a
reload-recovery guard that re-derives its work from the database.

A draft pick is an atomic database command even though its client surface remains a direct table
insert. A trigger locks the room, validates the current snake-order player and eligible sub-draft
pool, normalizes the derived round, inserts the claim, and advances `rooms.current_pick` in the
same transaction. Concurrent or stale claims cannot leave orphan picks. Already-open older
clients remain compatible because their follow-up conditional room update matches zero rows.

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
`useScores` waits for its winner, bingo and confidence channels to subscribe before hydrating;
each callback advances a revision, and a fetch that overlaps a callback retries before publishing
its snapshot. Global category broadcasts must also pass the room's pack-or-room predicate.
Realtime must be enabled per table (`ALTER PUBLICATION supabase_realtime ADD TABLE x` in the
migration); a table that is not in the publication will never broadcast, and the symptom is "it
works after refresh."
The bingo peer ledger subscribes to both room card membership and mark changes before hydration;
newly dealt cards therefore become peekable without remounting the tab.
Beat activation uses the same readiness and revision barrier for both wager rows and the room
phase. A bounded post-subscription reconciliation covers a cold Realtime worker, and a degraded
ledger blocks both wager mutation and the host's shared start transition.
The draft screen likewise owns one channel for its room row and pick claims, waits for
`SUBSCRIBED`, revision-retries hydration, and reconciles after the cold-worker window. A degraded
draft ledger blocks claims, timer skips and the shared phase transition until retry succeeds.
Every other route that consumes the canonical room row uses the same readiness, revision and
cold-worker reconciliation barrier. Phase navigation and phase-authoring controls remain paused
while that row is loading or degraded; Results also refuses to choose between the provisional and
settled canon from a cached active-settlement pointer.
Room chat uses that barrier too. Messages are replaced only by a revision-clean, fully paginated
and deterministically ordered transcript; sends stop while delivery is unknown, and the operator
narrative witness reports “checking” instead of interpreting a cached transcript.
Reactive cast triggers keep database presence separate from callback execution: a live callback
still fires once when overlapping hydration already contains its row, while a bounded canonical
reconciliation processes rows whose callbacks a cold worker missed. Trigger/context/cooldown refs
reset with room scope so one room cannot leak narrative state into the next.
The player roster follows the same barrier and replaces its snapshot only when no live revision
overlapped the fetch. This prevents a stale hydration merge from resurrecting a deleted seat.
Lobby start/countdown treats a loading or degraded roster as unknown, and Live carries that same
uncertainty into the operator presence lens instead of presenting cached seats as current.

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

After settlement, `rooms.active_settlement_id` changes the canonical rows. Every score, timeline,
award and recap consumer goes through `src/lib/room-record.ts`: it uses the legacy
`categories + room_winners` projection while the ledger is provisional, then replaces that
projection wholesale with the active `room_settlement_entries`. Earlier live and settlement rows
remain immutable history. Confidence outcomes are recomputed from explicit authored-category
entries. Bingo always reads versioned settlement marks after closure: `preserve_live` snapshots
the exact approved live set with an operator warrant, while `replace` stores individually warranted
authored marks. Neither mode retains a mutable pointer into `bingo_marks`.
Composite foreign keys bind both the active pointer and the supersession chain to the owning room;
room scope is a database invariant, not merely an RPC convention.
Database triggers freeze the rest of the room record after `closed`: players, draft picks,
confidence picks, bingo cards, live marks, chat, verdicts, beat activations, provisional winners,
and the points/tier of categories referenced by the active settlement. Anonymous stale clients
are rejected; service-role repair remains available only as operator authority and should always
be followed by an appended settlement version.
Those room-input triggers also take a key-share lock before writing. The checked
settlement RPC takes the room's update lock and compares the operator's canonical
player/confidence/draft/card plus approved-mark timestamp snapshot inside the same transaction. A write that
arrived first makes preflight fail without closure; a write that arrived second
waits and is rejected after closure. Stale preflight uses a non-retryable check
violation so infrastructure cannot silently replay it after the inputs change.
Preserved-live mark timestamps also enter the settlement idempotency identity,
while generated replacement-preview times do not. The service role can execute only this checked wrapper. Its legacy inner writer
has no direct client grant, preventing an older script or manual RPC call from
bypassing the snapshot gate.
Every canonical consumer exhausts deterministically ordered PostgREST pages through
`src/hooks/fetch-all-rows.ts`; a complete settlement must not become a truncated screen when any
global catalog or room ledger crosses the 1,000-row server page.

The post-show ceremony is compiled separately by `src/lib/settlement-drop.ts`.
Its manifest may choose narrative order and visual weight, but it cannot own a
second score. An applied `settle-room` command first proves its preflight input
snapshot while holding the room lock, closes the room atomically, and then
reconstructs the canonical receipt from a frozen post-close reread. The receipt
never comes from provisional evidence. `buildPostCloseSettlementReceipt` rejects
a non-closed room, inactive or foreign settlement, and unbound show pack before
it assembles any portable identity. It binds player identity, the complete
draft-entity roster and ownership, canonical score events, and settled personal
cards. It also carries the settlement row's creation timestamp and nullable
superseded-settlement ID, preserving the dated amendment chain in every
re-emittable receipt and flywheel attestation. `scripts/export-settlement-receipt.mts`
recovers those same canonical bytes for an already-closed room without a manifest
or write RPC. It uses service-role visibility, paginates every input and brackets
the read with the room's active settlement identity so a concurrent amendment
fails rather than crossing versions. The drop references the receipt by confined path and SHA-256, then orders those
event IDs without owning their attribution, label or points; every event appears
exactly once and all totals are derived. Fired character-drawer rows also
reference the exact receipt event, while quiet hypotheticals remain presentation
copy. Rankings use the canonical total/confidence/correct-count/top-correct
cascade and preserve co-champion ties. Grounded quotes retain their pipeline
stamp and evidence block. `scripts/generate-settlement-drop.mts` embeds confined
local images and emits one CSP-locked offline HTML artifact; it has no Supabase
or network path.
`scripts/dogfood-settlement-command.mts` exercises the real operator CLI against
one disposable local room while treating the published seed catalog as read-only.
It first runs `scripts/prepare-settlement.mts`, which keeps private room evidence
under `.private/settlements/`, leaves every new truth-bearing field undecided,
and finalizes only the closed manifest allowlist after explicit authoring. The
manifest parser rejects unknown fields at every object boundary, preventing
private research context from changing canonical settlement identity. The
dogfood then proves dry-run silence, wrong-confirmation rejection, no-clobber receipt
output, apply, receipt emission, a zero-score amendment that preserves and
supersedes the initial row, byte-stable idempotent re-emission of both active
versions, byte-identical read-only active receipt export, rejection of a
superseded manifest without receipt output, and exact
cleanup; an explicit remote target is rejected before any database request.

Before settlement crosses the apply boundary, `src/lib/settlement-delta.ts`
compares the proposed record to the room's current canonical owner. A finished
room uses its provisional live projection; a closed room uses the active
settlement, so amendments never pretend the live-night ledger is still current.
The report classifies each fact once and compares already-derived player,
character and bingo results. It is console evidence only: it neither caches a
score nor participates in settlement identity or writes.

A declaration that adjudicates a reviewed signature beat retains both
`source_signature_beat_id` and the exact `source_trigger_contract` on its room-scoped category.
The database rejects half-provenance, cross-pack beats, unreviewed contracts, later mutation, or
a copied contract that differs from the source. It also binds sourced declaration names and points
to the beat on every update; paired collision beats admit only the two character-qualified labels
emitted by the operator console. Settled category projection preserves the pair; receipt evidence
binds it only to a resulting character-draft score event. Ceremony rule drawers render only that
receipt-owned contract. Manual declarations and grandfathered legacy beats remain explicitly
without a drawer; display-name matching is never evidence of provenance.

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
  code precisely because remembering it failed three times in one night. Show-pack batches go
  through `scripts/publish-show-pack-commentary.mts`, which is plan-only by default and atomically
  checkpoints its separate working output after every request. The pack owns one commentary
  voice roster; voice instructions and source-material attitude claims remain expression-only.
  Ready publications freeze the exact speaker, voice, fact and angle blocks, and the shared
  grounding system is show-neutral rather than importing the current show's companion prompt.
  Live declared-event batches use the same multi-speaker core in `api/_grounding.ts`: the browser
  supplies ordinary Vercel-proxy model calls and the daemon supplies direct operator model calls.
  `buildWinnerReactionPrompt` projects the declaration, dossier and relevant game facts; every
  returned speaker is audited in parallel and any residual blocks the entire batch. Other live
  direct human-to-cast replies and browser-originated companion banter project the trigger and
  recent transcript as explicitly unverified CHAT RECORD statements plus authoritative GAME
  RECORD facts. They enforce the one requested speaker before atomic claim completion. The daemon
  does not originate banter. Approved bingo marks project their honor-system LIVE DECLARATION and
  derived line state in both browser and daemon; line completion comes from canonical mark
  chronology rather than callback order, stable per-mark announcement and reaction claims prevent
  duplicate publication, and both engines select and enforce only a responder already present in
  durable chat. Six/twelve-event milestone reactions project the canonical event count and complete
  leaderboard as GAME RECORD facts in the browser, require the exact Ned/Cersei/Tyrion roster and
  contend on one stable key per threshold before sealing the staggered plan. Awards-style rows wait
  for the confidence-scoring cascade to settle, while room-authored events with no picks pass
  immediately; the daemon does not originate milestones. Player welcomes use a capability-gated
  current-host command to claim `welcomed_at` once, then use a stable per-player reaction key.
  Name, allegiance, banner and exact roster are quoted ROOM/GAME RECORD facts, the selected greeter
  is enforced and house-affinity notes are expression-only; the daemon does not originate them.
  Team changes enter through the player-owned room-membership command; direct browser writes fail
  closed. Trigger-owned `players.team_revision` and `previous_team` preserve the transition;
  revision zero is
  inherited baseline state, while every later transition owns distinct announcement and reaction
  keys. The browser can recover the latest unfinished revision after reload, grounds the exact
  transition plus roster, and enforces one already-arrived speaker. The daemon does not originate
  team-change reactions. Show-start projects only the canonical `rooms.show_started` phase and
  exact quoted room roster, enforces the authored four-speaker order, and owns separate stable
  divider and grounded-reaction keys. Its durable stagger recovers after reload; an existing
  unkeyed divider suppresses legacy-bundle replay during a mixed-version deploy. The daemon does
  not originate show-start. Pre-show arrivals use one pure authored offset schedule and one stable
  key per companion. Each grounded arrival projects only synchronized room/draft state and qualified
  prior chat; degraded room/score/roster state, host loss, a declared result or playback start
  suppresses the write.
  Reload removes companions already present and re-bases the remaining browser timers, while a
  second legacy-row check after audit narrows the mixed-version race. The daemon does not originate
  pre-show arrivals. Spotlight openings use trigger-owned room revision/time metadata, one divider
  key and one grounded Ned/Cersei key per non-null opening. Their facts treat the label only as an
  operator question and derive candidate membership from `category_nominees`, not player wagers.
  Close/replacement and degraded state invalidate in-flight completion; the timestamp scopes the
  mixed-version divider sentinel to the current opening. The daemon does not originate spotlight.
  The provisional post-show farewell uses the widened seven-line ceremony primitive, stable
  divider/reaction keys and the exact finished-phase roster, component scoreboard and wager ledger.
  The complete Ned/Cersei/Tyrion/Joffrey/Daenerys/Olenna/Arya cadence is audited, durably staggered
  and reload-recoverable; a legacy `Final Standings` divider suppresses deploy-window replay. The
  daemon does not originate post-show. Keepsake verdicts use a distinct schema-aware adapter over
  the same generator/refutation/retry core. Each slot projects exact scoreboard and deterministic
  award facts, qualified chat candidates and a complete image catalog. Structural validation binds
  slots, companion bylines, highlight IDs and image slugs before every prose-bearing field is
  audited. One `keepsake:verdicts:v1` claim and `complete_grounded_player_verdicts` transaction write
  the exact current player set with shared provenance; partial legacy sets are replaced, complete
  legacy sets remain readable, and the completed claim seals later direct writes. Residuals use the
  same private review queue under the `verdict` surface. The daemon does not originate verdicts.
- **Show-pack portraits.** Schema-v3 entities own one confined public raster path and its SHA-256.
  Compiler and activation scripts resolve it inside the deployment's `public/` tree, reject
  symlink escapes, require the bytes' JPEG/PNG/WebP/AVIF signature to match the suffix, reject
  hash drift, and project the verified path to `nominees.image_url`. The
  atomic publisher also requires schema v3 and exact entity `id` to nominee `pack_key` and image
  path agreement; Postgres attests the binding while deploy tooling attests the file bytes.

## Database

`supabase/migrations/00000000000000_baseline.sql` is the generated whole-schema baseline.
Timestamped additive migrations after it are ordinary increments; do not regenerate the baseline
to absorb them. Prove production parity with `scripts/schema-diff.mts` after an authorized apply.

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

Catalog identity is room-bound through `rooms.show_pack_id`. Authored predictions, nominees,
draft entities, signature beats and bingo squares carry that immutable pack ID. A live category
declaration is the exception: it carries `room_id` and a null pack ID. Readers select authored
rows from the room's pack plus declarations from that room; confidence selects authored rows
only. Database triggers enforce the same boundary for picks, cards, beats, winners, spotlights
and settlement entries, so a missed client filter cannot silently score another show.

Existing catalog rows and rooms backfill to the fixed legacy HotD pack. New compiled versions are
installed and bound with `scripts/activate-show-pack.mts`; direct room binding is service-only,
requires a playable published catalog, is lobby-only and freezes once pack-dependent game state
exists. `src/lib/show-pack-activation.ts` owns the deterministic activation plan: compiled bytes
and hash, stable IDs, every normalized row, pair-beat mapping and collision checks within each
planned table. It also owns the exact installed-catalog attestation. The script contributes
paginated database reads, external collision checks and write authority only; it rereads every
table before publication, leaves missing/extra/drifted installs in draft, and never upserts a
published or retired pack. Even dry runs use service-visible reads so RLS cannot turn a hidden
draft into an apparently absent registry. The pure layer emits the closed database manifest.
Every catalog mutation share-locks its registry; `publish_and_bind_show_pack` update-locks it,
repeats the exact row-set attestation, publishes and binds the lobby room in one service-only
transaction. Direct service registry updates and the earlier bind-only RPC are revoked. Anonymous
policies admit only room-scoped declarations and their nominee links, never authored catalog rows.
Catalog triggers reject every nominee, prediction, candidate-link, draft-entity, signature-beat
or bingo-square mutation once its registry is published or retired, including ordinary
service-role writes; database-owner migrations are the explicit break-glass path.
Backend dogfood therefore retains one deterministic published isolation fixture in the local
stack and uses a separate disposable draft pack for rejection tests. The harness refuses a remote
target; immutable test catalogs must not leak into production or require a deletion backdoor.
The grandfathered catalog crosses into schema-v3 research through
`scripts/audit-legacy-show-pack.mts`, a local-only read path that preserves every
catalog row in a deterministic non-publishable worksheet. It exhausts pages,
fails closed against the sealed legacy inventory counts,
checks every reference, resolves entity/nominee identity through the same
fixed-legacy matcher as scoring, exact-matches portrait labels, and hashes the
real raster bytes. Missing claims, dossiers, trigger decisions,
title approvals and commentary remain explicit authoring queues; the audit never
turns historical prose into a reviewed contract. It also preserves the legacy
split between roster nominations and category candidates as an explicit
migration-decision queue. Schema v3 has one candidate owner, so rider/dragon
disagreements cannot be reconciled by name matching or an invented payout.
Activation copies the complete compiled doctrine into `trigger_contract` on predictions,
signature beats and bingo squares. Database constraints reject every non-legacy catalog row whose
contract is missing, has an implicit proxy/off-screen/mention decision, lacks an exclusion or
claim basis, or has not passed title-honesty review. The legacy pack is the only grandfathered
catalog; room-scoped declarations are facts and therefore carry no wager contract.

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

Operator tools resolve their database through `scripts/lib/env.mts`, announce the target, and
default to remote; test-data writers default to local. `SUPABASE_TARGET=local|remote` is the
explicit override. Browser companions use the Vercel proxy at
`api/anthropic/v1/messages.ts`; the phone-independent daemon calls Anthropic from the operator
laptop with the private script credential.

## Operator layer

The game has three layers and the third is easy to forget: the game itself, the narrative engine
(`scripts/companion-daemon.mts`, phone-independent), and the operator's lens
(`scripts/gm-pulse.mts`, `scripts/sentinel.mts`, the host Events lens, snapshots, daemon logs) —
presence, persisted engine heartbeat, and the power to repair the world without touching the party. The heartbeat
table is read-only to clients; narrow security-definer claim/release RPCs serialize one daemon
per room, permit stale takeover, and make graceful release owner-only. `RUNBOOK.md` is the
procedure for all of it.

The laptop pulse is a complete room read, not a recent global sample. It paginates the ordered
room transcript, roster and cards, filters bingo marks to those exact card IDs before paging, and
derives player activity plus the recent fact/cast readout in `src/lib/gm-pulse.ts`. Grounding and
witness queue counts come from the same stable RPCs as the phone. Both private review reads require
current host role plus the room operator capability. Browser grounding producers validate that same
capability before model work, then database-authorized claim and publication wrappers check it
again; only the service-role daemon retains the legacy reaction and residual primitives.
Revoking the anonymous primitives is a coordinated between-show migration because old bundles
cannot cross the new boundary. Declaration
actor IDs do not exist on historical banners, so duplicate display names are explicitly
ambiguous; the command never turns matching prose into invented ownership. It remains read-only
and defaults to production because it is an operator observer, while its two-room dogfood is
local-only and proves the former 200-message/100-global-mark cutoffs cannot recur.

The pulse and sentinel share `scripts/lib/operator-room-read.mts`, so complete pagination,
room-scoped bingo marks, the one-daemon-row invariant and private queue reads have
one implementation. Sentinel reduces each observation with `src/lib/operator-sentinel.ts` into
separate stable channels for phase/settlement identity, live host identity, live daemon health,
fact/cast sequence, grounding review and witness review. One-shot mode is machine-readable by exit
status (`0` clear, `2` attention, `1` observation failure); loop mode emits only signature changes.
Heartbeat age is deliberately excluded from the stable signature while stale/live state remains.
Narrative alarms carry the sequence-only caveat and never claim a response. Both commands are
read-only, remote-default operator observers. Their paginated requests are complete but not one
cross-table MVCC snapshot; atomic snapshots and settlement receipts own that stronger identity.

That room heartbeat elects the phone-independent process; it does not deduplicate individual
answers. `private.companion_reaction_claims` provides the per-message arbitration shared by the
daemon and browser fallback. Generation happens only after a successful claim. Chat replies use
the atomic completion RPC. Declared-event batches use
`schedule_staggered_companion_reaction`: the transaction inserts the zero-delay line, freezes the
full grounded plan and creates private due-time rows. Browser timers plus browser/daemon recovery
polls call `deliver_due_companion_reactions`; row locks and delivery receipts make concurrent flushes
idempotent. A sleeping process can delay later lines but cannot make another engine regenerate the
event or insert a scheduled line twice. This distinction keeps engine liveness, reaction ownership,
delivery progress and narrative-sequence evidence from collapsing into one overloaded meaning.

Factual grounding failures are a separate operator signal. Rejected grounded live batches are
never inserted into `messages` or `player_verdicts`; `private.companion_grounding_reviews` preserves the exact fact
block, attempted lines, auditor findings, engine, model and attempt count. Its insert/update trigger
increments `rooms.grounding_review_revision`, using the existing room Realtime subscription only as
an invalidation signal. Browser record, list and dismissal RPCs require both the current
`rooms.host_id` and the room operator capability; the service-role daemon alone retains the legacy
writer. Dismissal means “reviewed and still blocked”; there is deliberately no publish action in
this lane.

The host Events lens collapses Presence, heartbeat, narrative sequence and the two private review
queues into one restrictive readiness summary. The console owns each grounding and witness hook
once, then feeds that same state to both the summary and the actionable desk; a second read cannot
disagree with the visible queue. `Ready` appears only after every channel has loaded, every player
has a foreground or background signal, the daemon lease is current, no declared fact is newer
than cast activity, and both review queues are clear. Each failing channel contributes one
operator check; individual absent players and individual review rows remain visible details rather
than inflating severity. Room or revision changes hide stale queue rows and return the summary to
`Checking` until the new scope resolves. Capability loading is explicit rather than sharing the
missing-authority sentinel; once resolved missing, the host's Events tab carries the existing
attention badge until the private operator link is imported. This summary is triage, not a new source of truth: the
expanded lens retains the channel caveats and the episode log remains canonical.

Operator snapshots publish only after all 25 canonical public tables and the PostgREST schema have been
hashed into one exact manifest. The service-visible OpenAPI table definitions must equal that
canonical set. The stable service-only `capture_operator_snapshot_v1` RPC name is historical;
current manifests are version 2. Original 24-table version-1 seals remain readable only while every
original table definition matches, with the new witness support table treated as empty. The RPC
materializes all table arrays in one SQL statement, so one
MVCC snapshot owns capture, recovery preflight and post-write verification. Those reads require
service-role visibility; RLS cannot hide a row from the completeness contract. OpenAPI JSON is
canonicalized, and equal schema reads bracket each atomic capture plus restore replay; concurrent
migration makes the command fail closed rather than joining schema and rows from different eras.
`restore-room-snapshot.mts` consumes only that sealed format, defaults to a local dry run, and
plans missing room-owned inserts in dependency order. Exact rows
are no-ops; divergent rows, catalog drift, schema drift, room recreation, heartbeat replay,
updates and deletes are blockers or out of scope. A partially applied insert replay is idempotent
and must pass the same full post-write plan before it is reported restored.
`repair-room-message.mts` is the first separate destructive boundary. It accepts
one human player message ID, derives either a text-only replacement or an
extra-row deletion from the same sealed format, and emits canonical plan bytes
before any write. Apply requires those exact reviewed bytes and a room-code
confirmation. The service-only transaction room-locks, rechecks the bound show
pack and compare-and-swaps the exact preimage; it rejects synthetic and
companion-owned outputs, chat with reaction provenance, keepsake evidence and
closed rooms, then appends a public correction and stores an idempotent private receipt.
It deliberately cannot repair any non-text field or any other table.

The first AI-witness rung is proposal-only. `witness-once.mts` defaults to a
zero-send, zero-write plan and requires `--send-frame --confirm-room CODE`
before an operator-selected frame and gitignored reference portraits leave the
laptop. Model output is a closed ID/confidence object, never publishable prose.
`witness-observer.mts` adds continuous sampling without broadening that authority.
It watches one explicit real directory, ignores the startup backlog by default,
selects only the newest stable direct-child image, and invokes `witness-once` as
the sole perception writer. A room-scoped local lease prevents duplicate observer
processes; send mode atomically journals the exact ingress cursor and successful
frame hashes so restarts do not repeat spend. An exact `in_flight` hash is sealed
before the external worker begins; uncertain exits stop until the operator checks
the review queue and explicitly skips that hash. Failed or changing frames never
silently advance the journal. The observer does not capture a screen, accept a
proposal, or declare a fact.
`witness-capture.mts` is the separate macOS ingress adapter. Planning captures
no pixels; execution requires exact approved plan bytes plus a capture-specific
room confirmation. The plan freezes one display, window ID or rectangle, cadence
and finite frame limit. Capture writes hidden partial PNGs and atomically exposes
only complete files to the observer. Partials live outside ingress; publication
is an atomic no-replace hard link after PNG/type/size validation against the
shared 5 MiB worker ceiling. The adapter requires an owner-private ingress,
rechecks its device/inode through the run, and caps an invocation at 1,000
frames. It has no database or model import, cannot delete evidence, and cannot
inherit the observer's send authority or the host's review authority.
`witness_proposals` and its bounded supporting-observation ledger are
service-write-only and have no client select policy. The first positive frame
judgment creates the review unit; later distinct positive frames attach to it,
up to eight judgments total. No-proposal frames remain only in the observer's
local processed journal and are not negative votes. Agreement is repeated
temporal support from one model, never independent corroboration; a paired-beat
disagreement carries the other entity's sealed name into review. Both evidence
tables advance `rooms.witness_revision`; the existing room Realtime channel
invalidates the review queue, which is then read through a capability-authorized RPC.
Each row retains the image-subset hash it actually used. Support binds the
stable reference manifest, model and exact candidate, but does not require the
subset hash to stay fixed as unrelated candidates leave the live board.
When paired evidence disagrees, the phone offers only entities with retained
positive judgments and has no default selection. The host must choose before
acceptance. `witness_proposals.entity_id` remains the immutable first observation;
nullable `reviewed_entity_id` records the accepted human ruling, including when
it selects the other paired character. Acceptance also compares the retained
observation count loaded by the phone, so concurrent evidence forces a reload.
Older browser review RPCs are revoked because they cannot represent this choice;
service-role recovery retains the legacy root selection. Dismissal never selects one.
The queue derives a restrictive authority verdict from the sealed frame and
model-output hashes. Even repeated 100% model confidence remains human-review-only:
it is not independent corroboration,
has no empirical calibration into declaration authority, and cannot apply the
contract's exclusions or edge cases without the host. Candidate contract v2
seals and displays the explicit proxy, off-screen and mention adjudication too;
the database rejects new pending v1 candidates while retaining the v1 validator
for historical evidence and exact service-role snapshot recovery. A restored
pending v1 row remains blocked from the v2 phone queue rather than receiving
invented adjudication; operator recovery authority must resolve it.
That revision is database-owned and cannot be patched directly. The command
exhausts deterministic PostgREST pages and seals the exact candidate JSON shown
to the model; queue display reads from that seal, and catalog drift makes
acceptance fail stale. Acceptance locks the room, share-locks the sealed beat
and entity rows, and re-reads the authored nominee, points and trigger contract before atomically writing the
declaration, winner, system announcement and review. Dismissal writes no fact.
Catalog drift cannot strand a proposal because dismissal intentionally skips
current-catalog equivalence checks.
Accepted observations retain the historical declaration ID even if referee
undo later strikes that provisional category, and service-only recovery may
restore that audit row without recreating the category.

`private.room_operator_capabilities` is the operator AI authority boundary.
The service role issues 256 random bits and stores only their SHA-256; rotation
replaces that hash and increments its private generation. The matching public
`rooms.operator_capability_revision` is an invalidation signal only: issuance
updates it atomically, Realtime makes every open route revalidate, and ordinary
clients cannot author it. The authorized list and review wrappers require both
the bearer and the current `rooms.host_id`, then delegate to the existing queue
projection and atomic review transaction. Browser reaction claims require the
bearer before model work; companion, staggered and keepsake completion wrappers
require it again before publishing. Browser completion, scheduling and release
also lock the claim and require `engine = 'browser'`, so the active instance ID
returned to a losing claimant remains observation rather than daemon-mutation
authority. Their legacy entry points have no anonymous
execute grant and remain service-only for the daemon. The raw
bearer and fragment-only phone link live mode `0600` under the gitignored
operator directory. The always-mounted app-shell provider scopes the bearer to the room
ID in localStorage, removes it from the URL before any tab is opened, and exposes
it to consumers only after the validation RPC accepts the current hash. Missing
or stale authority is a visible operator error, never an empty queue or an
enabled browser engine. Manual declarations and other wider host actions still
use product-role checks and must not be described as caller-authenticated.

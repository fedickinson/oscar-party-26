# AGENTS.md — repository contract

Read this first. It is the shared contract for every agent working in this repo.

**Governing principle:** resolve ambiguity before execution. Plan first, implement second,
verify the real behavior third, review with fresh eyes fourth, ship last. When two agents are
available, the one that did not implement the change performs the review. When only one is
available, keep the separation cognitively — do not collapse the phases into one unexamined pass.

## What this is

A mobile-first, real-time multiplayer watch-party game. Players on their own phones share one
room: they draft entities, stake predictions, mark bingo, and watch a leaderboard move as facts
about the broadcast are declared. An AI cast reacts in chat.

Two show types have run on it live: an awards ceremony (the 98th Academy Awards — external,
scheduled fact stream) and a prestige-drama finale (no schedule — the room declares reality).
What is constant is the platform: declared facts as the spine, a board of possibilities,
cascading scores, a character cast reacting to facts, chat as the record, an operator's lens.
Themed content and copy are current-show-specific; the engine is not.

The product thesis is **commitment under unfolding canon**: people care enough about what happens
next to commit to a belief before a shared canon resolves it; the room witnesses the resolution,
settles the commitments and remembers the consequences. Winning is only one form of resolution.
Character survival, allegiance, betrayal, relationships, transformation, revelation and theories
are equally valid game material.

**Serverless. No backend server. No REST API.** React talks directly to Supabase over HTTPS and
WebSockets. Row Level Security is the entire authorization layer. Supabase Realtime (logical
replication) is the entire sync layer. The only server-side runtime surface is a Vercel function
proxying the Anthropic API for the AI cast (`api/anthropic/v1/messages.ts`), supported by shared
guards and grounding logic under `api/`.

```text
User action -> Supabase write -> Realtime broadcast -> all clients update state -> React re-renders
```

## Current system and intended direction

Keep implemented behavior separate from planned behavior.

### Implemented in the current checkout

- **Results Night** uses `legacy_ensemble`: a scheduled, externally resolved fact stream with an
  entity draft, confidence picks and ceremony spotlights.
- **Story Night** uses `conviction_portfolio`: each player spends a fixed twelve-slot portfolio
  across any authored signature beats on the whole board. A resolved beat's authored pot is split
  among its believers; a correct lonely belief receives the full pot. The current story pack keeps
  one dragon per player as a non-scoring identity draft, not as exclusive prediction access.
- Show packs bind authored content to rooms; exact trigger contracts govern declarations.
- Rooms move through `lobby -> pre_draft -> draft -> confidence -> live -> finished -> closed`.
  `finished` is provisional; only researched settlement and write-back produce canonical `closed`.
- The AI cast, browser reactions and daemon use the shared grounded-generation engine. The witness
  ladder currently stops at AI proposals requiring human review; AI auto-declaration is not an
  implemented authority.
- Settlement receipts are the canonical post-show evidence. The settlement-drop compiler consumes
  a receipt to produce the reusable offline ceremony, and the show-pack flywheel can use settled
  show N as evidence for authoring show N+1.

“Implemented in the current checkout” is not the same as committed, deployed or fully verified.
This worktree may contain a large platformization pass. Inspect the diff and run the evidence
required by the relevant roadmap exit criteria before making a readiness claim.

### Known architectural seam

The current database still couples orthogonal product decisions: a show pack has one
`fact_source`, and binding that pack derives one room `game_model` (`scheduled` selects
`legacy_ensemble`; room-declared or AI-witnessed selects `conviction_portfolio`). This is the
present compatibility behavior, not the target ontology. A future hybrid may mix official facts,
operator declarations and AI proposals in one event.

There is no season-campaign model yet. Current rooms represent one event or installment. Campaign
membership, installment containers, historical thesis revisions, evolving character state and the
between-installments home are planned work, not existing capabilities.

### Product rules that survive every mode

1. **Drafting may create identity and rivalry, but it must not determine what a player is allowed
   to believe.** Whole-cast conviction is the Story Night default; exclusive ownership is an
   optional rule.
2. Truth authority, commitment instrument, scarcity, identity, duration, settlement cadence,
   visibility and continuity are independent dimensions. Do not add another hard-coded genre mode
   when a show-pack contract can compose the primitives.
3. Settled receipts, not AI summaries, own evolving canon. AI may propose or narrate; it cannot
   silently promote an interpretation into a screen fact.
4. A campaign contains independently recoverable installment rooms. Do not stretch one room phase
   machine across an entire season.
5. Conviction revisions are append-only. Changing a mind must not erase what was believed earlier
   or make a late call appear early.

### Current build priority

[`ROADMAP.md`](ROADMAP.md) is the canonical tactical plan and status ledger:

1. **P0:** close and prove the current platform foundation.
2. **P1:** replace the coarse `fact_source -> game_model` derivation for new packs with an explicit,
   composable game contract while preserving historical behavior.
3. **P2:** productize reusable Story Night, including optional identity and pack-configurable
   whole-cast convictions.
4. **P3:** author and rehearse the next real event end to end.
5. **P4-P8:** only then add campaign containers, conviction lifecycles, canonical character
   write-back, the campaign home and the season ceremony.

P0-P3 are the next-event readiness line. Do not use campaign work to bypass unfinished foundation
verification. When live evidence changes the order, update the roadmap decision log rather than
creating a competing plan.

### Documentation authority

| Question | Canonical source |
| --- | --- |
| What does the software and schema do now? | Code, migrations and real-entry-point verification |
| What should be built next and in what order? | `ROADMAP.md` |
| What doctrine governs live operation, canon, settlement and generated prose? | `RUNBOOK.md` |
| What are the repository-wide engineering and safety rules? | `AGENTS.md` |
| What is the private, transient handoff state? | `.private/postop/HANDOFF.md` |

Documentation is navigation, not implementation proof. If prose and code disagree, report the
drift and resolve it deliberately; do not silently choose whichever account is more convenient.

## Map

| Path | What lives there |
| --- | --- |
| `src/lib/` | Pure functions. No React, no Supabase, no async. Scoring, draft order, bingo, timeline, prompts. |
| `src/hooks/` | Orchestration: fetch, subscribe, set state, call `lib/`. All side effects live here. |
| `src/components/`, `src/pages/` | UI. Thin. Route-level components in `pages/`. |
| `src/context/GameContext.tsx` | Room + player identity, persisted to localStorage. |
| `src/data/` | Static content: cast, avatars, encyclopedias, bingo master pool. |
| `src/types/` | Supabase row types (`database.ts`) + derived game types. |
| `src/index.css` | The design token contract. Source of truth for every color, space, and type value. |
| `supabase/migrations/` | Generated baseline plus timestamped additive migrations — see invariants. |
| `scripts/` | Operator and verification tooling (`.mts`, run with `npx tsx`). |
| `settlement-drops/` | Versioned offline-ceremony authoring examples and contract guidance. |
| `show-packs/` | Versioned authoring inputs and compiler/activation guidance. |
| `api/` | The Anthropic Vercel proxy plus its shared authorization, parsing and grounding helpers. |
| `ROADMAP.md` | Canonical P0-P8 tactical build plan, exit criteria and decision log. |
| `RUNBOOK.md` | Live-ops procedure **and** the project's doctrine ledger. Load it for anything involving a live game, generated prose, or mobile layout. |

Deeper references, loaded only when relevant:
[architecture](.agents/references/architecture.md) (patterns, phases, scoring cascade, gotchas) ·
[design system](.agents/references/design-system.md) (tokens, icons, motion, mobile grammar).

## Commands

Verified in this repository on the current checkout:

| Purpose | Command | Notes |
| --- | --- | --- |
| Install | `npm install` | Node 20+. |
| Dev server | `npm run dev` | Vite, on `localhost:5173`. |
| Type check | `npx tsc -p tsconfig.app.json --noEmit` | Fast inner-loop check on `src` only. |
| **Build gate** | `npm run build` | `tsc -b && vite build`, covering `src`, `api` and the configs. Green build is the ship gate; nothing ships red. |
| **Unit tests** | `npm test` | Vitest over pure/deterministic helpers and the proxy guards. 365 tests, no network, no database. |
| Tests, watching | `npm run test:watch` | Inner loop while changing `src/lib`. |
| Local stack | `supabase start` / `supabase stop` | Full Postgres + PostgREST + Realtime in Docker. `npm run dev` talks to it automatically. |
| Rebuild local DB | `supabase db reset` | Replays the baseline migration and `supabase/seed.sql` (authored content, no player data). |
| Backend e2e | `npx tsx scripts/dogfood-e2e.mts` | Full local suite over real write shapes. **Local-only.** Required when a change touches backend writes. |
| Room phase authority dogfood | `npx tsx scripts/dogfood-room-phase-authority.mts` | Focused local atomic creator, bearer/host, direct-write, countdown, draft-skip and phase-machine proof; writes no catalog row. |
| Seat authority dogfood | `npx tsx scripts/dogfood-playback-sync-authority.mts` | Focused local direct-write, bingo deal/mark ownership, allegiance/welcome, holder, clock, pause and exact-resume proof; writes no catalog row. |
| Draft command dogfood | `npx tsx scripts/dogfood-draft-command.mts` | Focused local concurrency and compatibility proof; reads the seed catalog but writes only one disposable room. |
| Scheduled winner dogfood | `npx tsx scripts/dogfood-scheduled-winner-command.mts` | Focused local winner/tie/undo, confidence projection, concurrency and mixed-version proof; never writes catalog rows. |
| Scheduled spotlight dogfood | `npx tsx scripts/dogfood-scheduled-spotlight-command.mts` | Focused local host/revision/open/close concurrency and Realtime proof; never writes catalog rows. |
| Close-floor dogfood | `npx tsx scripts/dogfood-close-live-floor-command.mts` | Focused local host authorization, concurrency, zero-event, spotlight cleanup, mixed-version and Realtime proof; never writes catalog rows. |
| Roster sync dogfood | `npx tsx scripts/dogfood-roster-sync.mts` | Focused local INSERT/UPDATE/DELETE race proof; writes and removes one disposable room only. |
| Room sync dogfood | `npx tsx scripts/dogfood-room-sync.mts` | Focused local phase/update race proof; writes and removes one disposable room only. |
| Chat sync dogfood | `npx tsx scripts/dogfood-chat-sync.mts` | Focused local transcript and reactive-trigger INSERT/race proof; writes and removes one disposable room only. |
| Companion claim dogfood | `npx tsx scripts/dogfood-companion-claims.mts` | Focused local concurrent engine lease, grounded/atomic direct-chat, banter, welcome, revisioned team change, pre-show arrival, show-start, revisioned spotlight, bingo and milestone completion, and idempotent staggered delivery proof; writes and removes one disposable room only. |
| Grounding review dogfood | `npx tsx scripts/dogfood-grounding-reviews.mts` | Focused local capability-gated browser recording/review, daemon-provenance and revision proof; writes and removes one disposable room only. |
| Sentinel dogfood | `npx tsx scripts/dogfood-sentinel.mts` | Focused local read-only alarm and stable-loop proof; writes and removes one disposable room only. |
| Operator capability dogfood | `npx tsx scripts/dogfood-operator-capability.mts` | Focused local witness/grounding authority, rotation, secret-file and cleanup proof; writes no catalog row. |
| Second player | `npx tsx scripts/ghost-screen.mts` | Joins your room as a real counterparty. Local by default. |
| Schema parity | `npx tsx scripts/schema-diff.mts` | Fingerprints local against production and diffs, object by object. Non-zero exit on drift. |
| Room dashboard | `npx tsx scripts/gm-pulse.mts --room CODE` | Declares, marks, cast sequence, persisted daemon heartbeat. |
| Room sentinel | `npx tsx scripts/sentinel.mts --room CODE [--loop 15]` | Read-only exact-room alarms; one-shot exits 0 clear, 2 attention, 1 observer failure. |
| DB snapshot | `npx tsx scripts/snapshot-game.mts [--loop 300]` | Atomically seals all 24 public tables plus schema integrity in `.private/snapshots/`. |
| Room recovery | `npx tsx scripts/restore-room-snapshot.mts --snapshot DIR --room CODE` | Local missing-row dry run by default; apply requires `--apply --confirm-room CODE` and never overwrites or deletes. |
| AI witness | `npx tsx scripts/witness-once.mts --room CODE --frame FRAME --references REFERENCES.json` | Local plan only by default. `--send-frame --confirm-room CODE` explicitly sends private images to Anthropic and may queue one host-reviewed proposal. |
| Witness observer | `npx tsx scripts/witness-observer.mts --room CODE --ingress DIR --references REFERENCES.json` | Samples the newest stable frame from an explicit local ingress. Existing frames are ignored and nothing is sent by default; `--send-frames --confirm-room CODE` enables proposal-only observation. |
| Operator capability | `npx tsx scripts/issue-operator-capability.mts --room CODE` | Read-only status by default; apply requires room confirmation and writes the private token/link mode 0600 without printing either. |
| Cast daemon | `npx tsx scripts/companion-daemon.mts --room CODE` | Service-role phone-independent narrative engine; one renewable lease per room. Requires `SUPABASE_SERVICE_ROLE_KEY` remotely. |
| Settlement preparation | `npx tsx scripts/prepare-settlement.mts --room CODE` | Read-only, local by default. Writes private decision worksheets only under `.private/settlements/`; finalization extracts the closed manifest contract. |
| Settlement | `npx tsx scripts/settle-room.mts --room CODE --manifest record.json` | Local, read-only dry run by default. Apply requires `--apply --confirm-room CODE`; `--receipt FILE` emits canonical drop evidence after apply. |
| Settlement dogfood | `npx tsx scripts/dogfood-settlement-command.mts` | Local-only real CLI proof: private preparation, explicit authoring, apply guards, amendment chain, byte-stable active replays, stale-version rejection, exact cleanup. Never writes catalog tables. |
| Legacy pack audit | `npx tsx scripts/audit-legacy-show-pack.mts` | Local-only, read-only complete catalog and portrait audit. `--output FILE` writes a deterministic non-publishable migration worksheet. |
| Show-pack compile | `npx tsx scripts/compile-show-pack.mts --input PACK.json` | Pure local validation and publishability dry run. `--output BUNDLE.json` writes deterministic bytes; never touches Supabase. |
| Show-pack prose | `npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json` | Read-only plan by default. `--generate` calls the canonical grounding pipeline and checkpoints after every request; `--resume` continues an existing output. |
| Show-pack activation | `npx tsx scripts/activate-show-pack.mts --input PACK.json --room CODE` | Local read-only preflight by default. Apply requires `--apply --confirm-room CODE`; production additionally requires `SUPABASE_TARGET=remote`. |
| Settlement drop | `npx tsx scripts/generate-settlement-drop.mts --input DROP.json` | Pure local validation and HTML dry run. `--output CEREMONY.html` writes one self-contained offline artifact. |
| Show-pack flywheel | `npx tsx scripts/generate-show-pack-flywheel.mts --input RECEIPT.json` | Offline, public-safe research seed from canonical settlement evidence. |
| Show-pack compose | `npx tsx scripts/compose-show-pack-flywheel.mts --input NEXT.json --seed SEED.json --receipt RECEIPT.json` | Receipt-verifies and compiles a next pack; `--authoring` opens the grounded-prose stage first. |
| Bingo seed | `node scripts/generate-bingo-migration.mjs` | After editing `src/data/bingo-master-pool.json`. |
| Deploy | `npx vercel --prod` | |
| Rollback | `npx vercel ls` then `npx vercel alias set <url> <domain>` | Seconds, no redeploy. |

**There is no linter and no browser-level test tooling.** The `lint` script was removed because
eslint was never installed and it only ever failed; if you want linting, wire it up deliberately.
There is no playwright and no component testing.

So the verification surface is: `npm test` for pure logic, the build for types, `dogfood-e2e.mts`
for real write shapes against the live database, the operator scripts, and a human or a headless
browser actually using the app. Unit tests cover `src/lib`, the proxy guards, and the injected
PostgREST page collector — **not** React hook state, components, Realtime delivery, or layout.
Say which layer you verified instead of implying the rest. CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the build and the tests on every push
and pull request.

## Invariants

1. **No backend server, no REST layer.** Clients write to Supabase directly; authorization is RLS
   policy, not application code. Do not introduce a server, a proxy, or an API route to solve an
   authorization problem — write the policy.
2. **Phase-change navigation.** Never `navigate()` from a user action that should move every
   player. Write the phase to `rooms`, let the Realtime subscription fire, navigate from a
   `useEffect` on `room.phase`. This is how all clients stay together.
3. **Pure `lib/`, effectful `hooks/`.** Computation goes in `lib/` and stays importable by
   `scripts/`. If a script cannot import your logic, it cannot be verified headlessly.
4. **Subscribe before the initial fetch**, always, to close the race window. Realtime callbacks
   capture stale closures — use refs or functional `setState`.
5. **Additive migrations while a game can be live.** Between a deploy and the last phone
   refreshing, two bundles talk to one database. `ADD COLUMN IF NOT EXISTS`, nullable or
   defaulted. Never rename, drop, retype, or repurpose the meaning of an existing value. Save
   destructive migrations for the day after.
6. **No emoji. Anywhere.** Not in UI, not in code, not in comments, not in commit messages. Icons
   come from `lucide-react` or `src/components/ui/Icons.tsx`.
7. **Design tokens only.** Colors, spacing, and type come from the token contract in
   `src/index.css`. No hardcoded hex in components.
8. **No generated line ships ungrounded.** Any surface that generates prose must go through
   `scripts/grounded-line.mts` — exhaustive numbered fact block, refutation pass, retries with
   findings attached, residual findings surfaced for human judgment. Do not hand-roll generation
   prompts. Screen canon and source-material canon are different worlds; where they diverge the
   screen wins, where the screen is silent the verdict is UNVERIFIABLE. (RUNBOOK: grounding
   doctrine, two-canons rule.)
9. **This repository is public, and the hosted Supabase project is production.** Develop against
   the local stack; `SUPABASE_TARGET=remote` is what makes a script touch the real one, and every
   script prints the target it resolved before it does anything. Writers (`dogfood-e2e`,
   `ghost-screen`) default to local; the operator's lens (`gm-pulse`, `sentinel`, `snapshot-game`,
   `companion-daemon`) defaults to remote, because it exists to watch a live party. No secrets in
   tracked files: `docs/`, `.private/`, `.env*.local`, and `.claude/settings.local.json` are
   gitignored, and `supabase/seed.sql` carries authored content only — never rooms, players or
   messages.
10. **Mobile is the only viewport that matters.** Design and check at 375×812. Fixed overlays
    publish their height and content pads to the sum below it; every screen scrolls; an
    overflowing column is never flex-centered. (RUNBOOK: the mobile grammar.)

### Protected — confirm with the user before acting

Applying migrations to the live project · deleting or truncating any table · running any script
against a room that real people are in · `npx vercel --prod` and alias changes · rotating or
touching credentials · anything that writes to `categories` (global, no `room_id` — practice rows
leak into real rooms forever).

## Git and worktree safety

- The working tree routinely holds unrelated in-progress design and doc work. Preserve it. Inspect
  `git status` before editing and never revert, stash, or clean what you did not create.
- Stage **explicit paths**. Do not use `git add -A` or `git add .`. (`RUNBOOK.md` step 3 uses
  `git add -A` — that is a mid-show hotfix shortcut for the operator at the keyboard, not the
  default for agent work.)
- Do not commit, push, open a PR, or deploy unless the user asked for that specific step.
- Independent work streams get a focused branch or an isolated worktree, not a shared dirty `main`.
- Nothing sensitive in a commit: the repo is public.

## Verification expectations

- Name the scope of every check you ran: type-check, unit tests, build, backend e2e, or real app
  usage. A type check is not a build, a unit test is not a screen, and a passing script is not a
  phone in someone's hand.
- A new test that passes before your change proves nothing. Watch it fail first, or mutate the
  source to confirm the test can fail at all.
- Re-run the **originally reported scenario** through the real entry point, not just the component
  you edited.
- Check every exit path a change touches: zero, empty, missing, error, cached, fallback.
- Confirm the server, database, and branch you are observing are the ones under test.
- Never convert partial evidence into a full-verification claim. Report what you did not run.

## Definition of done

1. The requested behavior works end to end, not a scaffold for it.
2. `npm run build` and `npm test` are green.
3. Changed logic in `src/lib` has a test that fails without the change. Backend-write changes pass
   `npx tsx scripts/dogfood-e2e.mts`, or you state that it was not run and why.
4. The original report or acceptance criteria are each individually verified or explicitly deferred.
5. The invariants above are intact — especially tokens, no-emoji, additive migrations, grounding.
6. Unrelated working-tree changes are untouched.
7. The final message states what was verified, at what scope, and what remains uncertain.

## Working agreements

- Do not change a test or an assertion to bless a broken implementation. Fix the implementation
  unless the product contract genuinely changed — and say so if it did.
- Use targeted checks for fast feedback while iterating; run the full gate before claiming ready.
- Ask only for genuine product decisions, destructive actions, external actions, or authority
  boundaries. Routine judgment calls are yours.
- Report evidence and residual uncertainty honestly. An unverified belief stated as a fact is the
  most expensive kind of error here.

## Axioms

1. A safety default must select the restrictive path.
2. A deferred no-op scaffold is unfinished work, not an implemented increment.
3. A filtered run is not full verification.
4. One sentinel must not carry two meanings.
5. A canonical source is canonical only when every consumer uses it.
6. A caveated figure must carry its caveat at the source, so every consumer gets honest data.
7. Verification against the wrong branch, server, database, or environment is not verification.
8. A branch must be checked for both excess scope and supersession before it lands.
9. Test the reported scenario, not merely the edited component.
10. User-reported observations remain acceptance criteria until individually verified or
    explicitly deferred.

## Routing

| Request | Skill |
| --- | --- |
| Product idea, "should we build this?", ambiguous architecture | `scope-change` |
| Bug, error, regression, "why is this broken?" | `investigate-bug` |
| Build, fix, modify, refactor, migrate | `implement-change` |
| Validate, test, dogfood, prove readiness | `verify-change` |
| Review, audit, check the diff | `review-change` |
| Commit, push, PR, merge, deploy | `ship-change` |

Skills live in [.agents/skills/](.agents/skills/) (Claude Code sees them through `.claude/skills`,
a symlink to the same files). When a task spans stages, run them in lifecycle order.

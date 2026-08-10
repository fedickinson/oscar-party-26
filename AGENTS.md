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

**Serverless. No backend server. No REST API.** React talks directly to Supabase over HTTPS and
WebSockets. Row Level Security is the entire authorization layer. Supabase Realtime (logical
replication) is the entire sync layer. The one server-side file is a Vercel function proxying the
Anthropic API for the AI cast (`api/anthropic/v1/messages.ts`).

```text
User action -> Supabase write -> Realtime broadcast -> all clients update state -> React re-renders
```

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
| `supabase/migrations/` | Timestamped SQL. 19 files. Additive by convention — see invariants. |
| `scripts/` | Operator and verification tooling (`.mts`, run with `npx tsx`). |
| `api/anthropic/v1/messages.ts` | The only server-side code. |
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
| Type check | `npx tsc -p tsconfig.app.json --noEmit` | Fast inner-loop check. Currently green. |
| **Build gate** | `npm run build` | `tsc -b && vite build`. Green build is the ship gate; nothing ships red. |
| Backend e2e | `npx tsx scripts/dogfood-e2e.mts` | ~50 assertions, real write shapes, **against the live database**; cleans up after itself. Required when a change touches backend writes. |
| Second player | `npx tsx scripts/ghost-screen.mts` | Joins your room as a real counterparty. |
| Room dashboard | `npx tsx scripts/gm-pulse.mts --room CODE` | Presence, declares, marks, cast liveness. |
| DB snapshot | `npx tsx scripts/snapshot-game.mts [--loop 300]` | Dumps all tables to `.private/snapshots/`. |
| Cast daemon | `npx tsx scripts/companion-daemon.mts --room CODE` | Phone-independent narrative engine. |
| Bingo seed | `node scripts/generate-bingo-migration.mjs` | After editing `src/data/bingo-master-pool.json`. |
| Deploy | `npx vercel --prod` | |
| Rollback | `npx vercel ls` then `npx vercel alias set <url> <domain>` | Seconds, no redeploy. |

**There is no test runner and no linter.** `package.json` declares `npm run lint`, but eslint is
not installed and the script fails — do not run it, and never cite it as evidence. There is no
vitest/jest/playwright. The verification surface is: type check, build, `dogfood-e2e.mts`, the
operator scripts, and a human or headless browser actually using the app. Say so plainly instead
of implying coverage that does not exist.

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
9. **This repository is public and its database is production.** There is one Supabase project
   and it is the live one. No secrets in tracked files. `docs/`, `.private/`, `.env.local`, and
   `.claude/settings.local.json` are gitignored — do not move their contents into tracked files.
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

- Name the scope of every check you ran: type-check only, build, backend e2e, or real app usage.
  A type check is not a build, a build is not behavior, and a passing script is not a screen.
- Re-run the **originally reported scenario** through the real entry point, not just the component
  you edited.
- Check every exit path a change touches: zero, empty, missing, error, cached, fallback.
- Confirm the server, database, and branch you are observing are the ones under test.
- Never convert partial evidence into a full-verification claim. Report what you did not run.

## Definition of done

1. The requested behavior works end to end, not a scaffold for it.
2. `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` are green.
3. Backend-write changes pass `npx tsx scripts/dogfood-e2e.mts`, or you state that it was not run
   and why.
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

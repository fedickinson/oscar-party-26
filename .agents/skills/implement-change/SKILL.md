---
name: implement-change
description: Build, fix, refactor, or migrate once the desired behavior is clear — features, bug fixes, schema migrations, new screens, scoring rules, operator scripts, content pipelines. Makes the smallest coherent change that fully delivers the behavior, respects the repo invariants (tokens, no emoji, additive migrations, grounded generation, phase-change navigation), and runs the right verification. Do not use when the behavior is still ambiguous (use scope-change) or when the cause of a defect is unknown (use investigate-bug).
---

# Implement a change

Deliver the whole behavior. Not a scaffold, not a broader cleanup — the thing that was asked for,
working on a phone.

## Before editing

1. Read `AGENTS.md`. Load [architecture](../../references/architecture.md) if the change touches
   state, phases, Realtime, or the database; load [design system](../../references/design-system.md)
   if it touches UI.
2. Confirm the branch and inspect `git status`. The working tree routinely holds unrelated
   in-progress work — preserve every bit of it. Never stash, revert, or clean what you did not
   create. Independent streams get a branch or a worktree.
3. Read the code you are about to change, its callers, and the canonical owner of every fact it
   depends on.

## While implementing

- **Smallest coherent change that fully delivers.** No no-op scaffolds deferred to an unnamed
  future task; no unrelated cleanup smuggled in beside it.
- **Pure logic in `src/lib/`, effects in `src/hooks/`.** If a script cannot import your logic, it
  cannot be verified headlessly — that is the reason for the split, not tidiness.
- **Shared transitions go through the database.** Write the phase to `rooms` and let the Realtime
  subscription navigate every client. Never `navigate()` a shared transition directly.
- **Subscribe before fetching.** Read Realtime state through refs or functional `setState` —
  callbacks capture stale closures.
- **New table in the sync path?** Add it to the `supabase_realtime` publication in the same
  migration, or it will never broadcast.
- **Migrations are additive** while a game can be live: `ADD COLUMN IF NOT EXISTS`, nullable or
  defaulted. Never rename, drop, retype, or repurpose an existing value's meaning. Update
  `src/types/database.ts` in the same change — there is no codegen.
- **Restrictive defaults** in every authorization, validation, redaction, or gating decision. When
  the safe answer is unknown, choose the one that shows less and writes less.
- **One sentinel, one meaning.** Do not overload `null`, `0`, or `''` to carry a second state;
  carry the state explicitly.
- **Recompute, do not duplicate.** Derived values come from their canonical owner every time. If a
  figure carries a caveat, attach the caveat at the source so every consumer inherits it.
- **Design tokens only** — no hardcoded hex, spacing, or duration. Icons from `lucide-react` or
  `src/components/ui/Icons.tsx`. No emoji anywhere, including comments and commit messages.
- **Generated prose goes through `scripts/grounded-line.mts`.** Fact block, refutation pass,
  retries with findings attached, residuals surfaced — never hand-rolled, never silently dropped.
- **Content edits** go to the source of truth, not the generated artifact: edit
  `src/data/bingo-master-pool.json` and regenerate with `node scripts/generate-bingo-migration.mjs`.
- **Layout obeys the mobile grammar** at 375×812: reserved-chrome padding, every screen scrolls,
  no flex-centered overflow, 44px touch targets, 16px inputs.

## Coverage

Vitest covers the pure layer: `src/lib/*.test.ts` and `api/_guards.test.ts`. Anything you change
in `src/lib` gets a test, and the test must **fail before your change** — write it first, or
mutate the source afterward to prove it can fail. A test that never failed is decoration.

Hooks, components, Realtime delivery and layout have no automated coverage. For those, add
assertions to `scripts/dogfood-e2e.mts` where the change is headlessly verifiable, and otherwise
say plainly which part is only human-verified.

Never edit an assertion to make broken behavior pass. If the contract genuinely changed, change
the assertion deliberately and say so in the summary.

## Verification before you call it done

`npm run test:watch` and `npx tsc -p tsconfig.app.json --noEmit` while iterating; `npm run build`
and `npm test` as the gate — nothing ships red. Backend-write changes also run
`npx tsx scripts/dogfood-e2e.mts` (it hits the live database; do not run it while real people are
in a room). For anything users will see, hand off to `verify-change` rather than declaring victory
from a green build.

## Output

What changed and why, by file · which invariants were relevant · what you ran and what it proved ·
what has no automated coverage · anything you deliberately left out of scope.

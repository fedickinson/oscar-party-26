---
name: verify-change
description: Prove that a change actually works before it ships — validate, test, dogfood, "is this ready?", "did that fix it?", pre-deploy checks. Builds a verification matrix from the acceptance criteria, re-runs the originally reported scenario through the real entry point, names the exact scope of every check, and returns a pass/fail ledger with residual risk. Use after implement-change and before ship-change. Not for finding new defects in code you have not run; that is review-change.
---

# Verify a change

Turn "it should work" into evidence. The output is a ledger, not a verdict sentence.

## Build the matrix first

List every acceptance criterion and every observation the user reported, one row each. Add a row
for each exit path the change touches: zero, empty, missing, error, cached, fallback. Nothing gets
marked verified as a group.

## Confirm you are testing the right thing

Before believing any result: is the dev server running the branch under test? Is the browser tab
on the new bundle or an old one? Are you pointed at the one live Supabase project (there is only
one — it is production), and is the room you are poking a scratch room rather than one with real
people in it? Verification against the wrong branch, server, or database is not verification.

## Name the scope of every check

| Check | Command | What it proves | What it does not |
| --- | --- | --- | --- |
| Type check | `npx tsc -p tsconfig.app.json --noEmit` | Types line up | Nothing about behavior |
| Build gate | `npm run build` | It compiles and bundles | Nothing about behavior |
| Backend e2e | `npx tsx scripts/dogfood-e2e.mts` | Real write shapes and real scoring against the live DB | Nothing about React state, Realtime delivery, or layout |
| Second client | `npx tsx scripts/ghost-screen.mts` | A real counterparty's writes arrive | Nothing about what a phone renders |
| Room state | `npx tsx scripts/gm-pulse.mts --room CODE` | What the database actually holds | Nothing about the client |
| Real usage | Two browsers, or a headless walker at 375×812 | What a player actually sees | Only the states you visited |

There is no linter and no test runner: `npm run lint` is declared in `package.json` but eslint is
not installed and the command fails. Never cite it.

## Re-run the original scenario

Through the real entry point, with its real defaults. The component you edited passing in
isolation is the weakest possible evidence for a report that came from a phone. For multiplayer
behavior that means two clients — one browser plus `ghost-screen.mts` counts, one browser does not.

## For UI work

Distinguish two claims and verify them separately: **it renders** (screenshot at 375×812, every
state, scroll position at top, no overlap under fixed chrome, no horizontal scroll) and **it
writes** (the row changed, the other client saw it). A screenshot proves nothing about the write
contract; a passing script proves nothing about the screen. The walker script is not checked in —
write a throwaway one, then read the images rather than the code.

## Honesty rules

- Partial evidence stays partial. Do not round a component test up to an end-to-end claim.
- A check you skipped is reported as skipped, with the reason.
- An unreproducible symptom is unresolved, not fixed.
- If the change can only be truly verified during a live show, say so and describe the fallback
  evidence you did gather.

## Output

A row-by-row ledger: criterion · command or action · observed result · pass / fail / unverified.
Then: what remains unverified, what could still go wrong in a live room, and whether this is ready
for `ship-change`.

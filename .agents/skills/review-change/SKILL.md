---
name: review-change
description: Independently review a diff, branch, or finished change before it lands — code review, readiness review, "check my work", a second pair of eyes after implementation. Reads the complete diff plus the contracts and consumers it affects, and reports findings ordered by severity with file and line references. Read-only unless the user explicitly asks for fixes after seeing the findings. Prefer running this as the agent that did not write the change.
---

# Review a change

You are the fresh pair of eyes. Read-only: report findings first, fix only if the user asks after
seeing them.

## Read the whole thing

The complete diff — `git diff`, `git diff --staged`, or the branch against `main` — plus the
contracts and consumers it touches: callers of every changed function, `src/types/database.ts`
against any new migration, and the scripts that import changed `src/lib/` code.

## What to look for, in priority order

1. **Correctness and data loss.** Wrong scoring, a write that overwrites concurrent state, a
   deletion without a snapshot, a migration that renames/drops/retypes while a game could be live.
2. **Authorization.** RLS is the entire authorization layer — a new table or column without a
   policy is open by default, and a policy that permits more than the feature needs is a finding.
   Check the restrictive default in every gate.
3. **Secrets and privacy.** This repository is public. Any key, password, connection string,
   personal detail, or private-doc content moved into a tracked file is a stop-the-line finding.
4. **Realtime and multiplayer correctness.** New table in the sync path but not added to the
   `supabase_realtime` publication. Fetch before subscribe. Stale closures in subscription
   callbacks. A `navigate()` on a transition that should move every phone. Host-side work with no
   reload-recovery guard.
5. **Boundary mismatches.** Row type and migration disagreeing. `.single()` where zero rows are
   possible. Unpaginated reads over 1000 rows. A write to the global `categories` table with no
   teardown.
6. **Ownership and sentinels.** A derived value cached or recomputed away from its canonical
   owner. One sentinel carrying two meanings. A caveated figure that lost its caveat on the way to
   a consumer.
7. **Invariant violations.** Hardcoded hex or spacing instead of tokens. An emoji anywhere. A
   generation surface that does not route through `scripts/grounded-line.mts`. Source-canon claims
   asserted about screen events. Layout that breaks the reserved-chrome contract or flex-centers an
   overflowing column.
8. **Verification claims.** Compare what the summary claims against what was actually run. "Tested"
   with only a type check, "verified" with only a build, or an acceptance criterion with no
   evidence behind it are each findings in their own right.
9. **Scope.** Unrelated changes riding along, or a scaffold presented as a delivered increment.

## What not to do

- No style-only comments — there is no linter here, so do not act as one.
- Do not restate what the diff plainly does.
- Changed logic in `src/lib` without a test is a finding; so is a test that would pass against the
  unchanged source. Do not demand tests for hooks, components or layout — there is no tooling for
  them. Do ask whether a headless assertion in `scripts/dogfood-e2e.mts` was possible and skipped.

## Output

Findings first, ordered by severity, each with `file:line`, the concrete failure scenario, and the
smallest correct fix. Then: which acceptance criteria have evidence and which do not, and what
coverage is missing. If nothing actionable is present, say so plainly and still name the gaps.

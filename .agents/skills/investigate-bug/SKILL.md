---
name: investigate-bug
description: Diagnose a bug report, regression, error, failed check, or unexpected behavior — "why is this broken?", "it worked last night", "the other phone never updated", "the score is wrong". Reproduces through the real entry point, traces the full path across the React/Supabase/Realtime boundary, and names one root cause. Diagnoses without editing unless the request also authorizes the fix. Do not use for building a known change; use implement-change.
---

# Investigate a bug

Find the root cause. Do not edit code unless the user also asked for the fix — a diagnosis that
arrives with unrequested edits is harder to trust, not easier.

## Inputs

The complete report, verbatim. Preserve it as an acceptance ledger: every symptom the user
mentioned is a separate item that stays open until verified or explicitly deferred.

## Workflow

1. **Reproduce through the real entry point** with its real defaults, when that is safe. Not the
   component in isolation — the actual flow: the page, the hook, the write, the subscription, the
   other client. `npx tsx scripts/ghost-screen.mts` gives you a real second player;
   `npx tsx scripts/gm-pulse.mts --room CODE` shows what the room actually contains. Never run
   either against a room with real people in it.
2. **Trace the full path across boundaries.** In this app a symptom almost never lives where it
   appears. Walk it: user action -> hook -> Supabase write (did the row change?) -> Realtime
   broadcast (is the table in the publication?) -> subscriber callback (stale closure?) -> state
   -> render. Read every early return, empty state, fallback, cached path, and error path along
   the way; the bug is usually in one of those, not in the happy path.
3. **Check the usual suspects before inventing a new theory:**
   - The table is not in `supabase_realtime` — works after refresh, never live.
   - Fetch ran before subscribe — one lost update, intermittently.
   - A Realtime callback closed over stale state — updates apply to an old snapshot.
   - An RLS policy silently filtered the write — REST returns 204 and nothing happened.
   - `.single()` on zero rows — a throw where a null was meant.
   - A mixed-version room: the phone is on an older bundle than the database.
   - The host tab reloaded and a scheduler lost its in-flight work.
   - A derived value was cached somewhere instead of recomputed.
4. **Separate the root cause from its correlates.** State the one defect and why the other
   observations follow from it. If two independent defects are needed to explain the report, say
   that explicitly rather than picking the tidier story.
5. **Verify the diagnosis before reporting it.** Read the actual rows, add a temporary log, or
   assert against `src/lib/` directly. "This is probably it" is a hypothesis, not a finding.
6. **If you cannot run the real scenario** — it needs a live room, two phones, or a broadcast —
   say exactly which component-level evidence you obtained and which part of the chain remains
   unverified. Do not round partial evidence up.

## Stopping conditions

Stop when you can name the localized cause and explain every reported symptom, or when the next
step requires an action inside the protected list in `AGENTS.md`. Ask before touching a live room.

## Output

Root cause with `file:line` · the mechanism, end to end · which reported symptoms it explains and
which it does not · the exact scenario that must pass after the fix · the regression check to add
(usually an assertion in `scripts/dogfood-e2e.mts`, since there is no test runner) · what remains
unverified. Hand off to `implement-change`.

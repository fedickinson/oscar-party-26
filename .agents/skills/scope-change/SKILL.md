---
name: scope-change
description: Turn a vague product idea, feature request, architectural question, or "should we build this?" into acceptance criteria and the smallest coherent implementation slices. Use before any ambiguous change, when the desired behavior is unclear, when a request touches multiple layers of the game (draft, prediction, bingo, chat, scoring, operator tooling), or when someone asks what should be built. Read-only — it plans and does not edit code. Do not use once the behavior is already clear and the work just needs doing; use implement-change for that.
---

# Scope a change

Resolve the ambiguity before anyone writes code. You own product judgment and acceptance
criteria here. Do not edit files.

## Inputs

The request, plus whatever the user has already observed or decided. Read `AGENTS.md` first.

## Workflow

1. **Read the ground truth.** Inspect the current implementation of every surface the request
   touches — `src/lib/` for the rules, `src/hooks/` for the orchestration, `src/types/database.ts`
   and `supabase/migrations/` for the data shape. Do not plan against what CLAUDE-era docs claim;
   plan against what the code does.
2. **Separate what you know from what you are guessing.** Write three lists: observed facts (with
   file references), inferences, unresolved decisions. Keep them separate in the output — a
   guess laundered into a fact is how a slice ships wrong.
3. **Name the canonical owner.** For every fact the change depends on, identify the one place that
   owns it. Derived values are recomputed from canonical rows, never cached or duplicated into a
   consumer. If the change would create a second owner, that is the design problem to solve first.
4. **Record every user observation as an acceptance criterion.** Verbatim. Each one stays open
   until individually verified or explicitly deferred by the user.
5. **Map the blast radius.** For this app specifically, check each of:
   - Does it change a Supabase write shape or a row type? (Then it needs a migration, and the
     migration must be additive if a game can be live.)
   - Does it change what every phone sees? (Then it is a phase or Realtime concern — check that
     the table is in the `supabase_realtime` publication.)
   - Does it change scoring? (Then `src/lib/scoring.ts` and `scripts/dogfood-e2e.mts` are both in
     scope.)
   - Does it generate prose? (Then `scripts/grounded-line.mts` is mandatory — see AGENTS.md
     invariant 8.)
   - Does it add a screen or overlay? (Then the reserved-chrome contract and 375×812 apply.)
   - Does it need a host action, and what happens when the host's phone reloads mid-flight?
6. **Enumerate the edge cases the room will actually hit**: zero players, one player, the host
   leaving, a phone reloading, a tie, an unclaimed outcome, a mixed-version room during a deploy.
7. **Slice it.** Smallest coherent increments, each one shippable and observable on a phone. A
   slice that lands a no-op scaffold is not a slice — merge it into the one that makes it real.
8. **State the verification plan per slice**: which of type-check / build / `dogfood-e2e.mts` /
   real two-client usage proves it, and what none of them can prove.

## Stopping conditions

Stop and ask the user only when an unresolved choice would materially change product behavior,
scope, or cost — a rules change players would feel, a destructive migration, a spend decision.
Everything else is a routine judgment call: make it, state it as an assumption, and continue.

## Output

A short brief: facts / inferences / open decisions · acceptance criteria (numbered, traceable to
the user's words) · affected layers and files · edge cases · slices in order · verification plan ·
the one or two questions that genuinely need the user. Hand off to `implement-change`.

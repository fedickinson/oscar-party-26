# CLAUDE.md

**[AGENTS.md](AGENTS.md) is the repository contract — read it first.** It holds the architecture
map, the verified commands, the invariants, the safety boundaries, and the definition of done.
This file only covers what is specific to running Claude here; it deliberately does not repeat it.

## Skills

The six workflow skills live in [.agents/skills/](.agents/skills/); `.claude/skills` is a symlink
to the same directory, so Claude Code discovers them without a second copy. Edit the files under
`.agents/skills/` — never create a parallel version under `.claude/`.

Route by request, and run them in lifecycle order when a task spans stages:

`scope-change` (ambiguous, product, architecture) → `investigate-bug` (why is this broken) →
`implement-change` (build it) → `verify-change` (prove it) → `review-change` (fresh eyes) →
`ship-change` (land it).

Deeper context loads on demand: [architecture](.agents/references/architecture.md) for state,
phases, Realtime, and the database; [design system](.agents/references/design-system.md) for
tokens, icons, motion, and the mobile grammar; [ROADMAP.md](ROADMAP.md) for the canonical P0-P8
build order, product contracts and acceptance gates; [RUNBOOK.md](RUNBOOK.md) for live-ops
procedure and the project's doctrine — grounding, two-canons, the settlement layer, the
operator's lens.

## Working with Claude here

- **Do not collapse the phases.** Even when one agent does everything, plan, implement, verify, and
  review as separate passes. Most of the expensive mistakes in this repo's history were a
  confident implementation that was never actually run.
- **Start platform work from the roadmap.** P0-P3 are the next-event readiness line; P4-P8 are the
  campaign extension. Never describe a planned campaign capability as implemented, and never use
  campaign work to bypass unfinished foundation verification.
- **Keep identity separate from belief.** Drafting may create a banner, favorite or rivalry, but
  Story Night players can make convictions across the whole cast. Treat the current
  `fact_source -> game_model` binding as a compatibility seam to replace through P1, not as the
  final product ontology.
- **Subagents:** use them for read-only fan-out — sweeping `src/` for every consumer of a changed
  function, or reading a long doc — not for edits to shared files. Only when the user asks.
- **Plan mode** is the right default for anything touching scoring, migrations, or a live room.
- **`npm test` covers pure functions only** — `src/lib` and the proxy guards. It says nothing about
  hooks, Realtime, or what a phone renders. There is no linter. Say what you actually ran.
- **Ask before** applying a migration, deploying, aliasing production, or writing to a room with
  real people in it. See the protected list in `AGENTS.md`.
- **Memory:** persistent notes belong in the project memory directory, not in tracked repo files.
  `docs/` and `.private/` are gitignored — never move their contents into a tracked file.

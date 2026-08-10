# Design system reference

Read before writing or reviewing any UI. The authoritative values live in `src/index.css` — this
file explains the contract, not the hex codes. If a value here ever disagrees with the stylesheet,
the stylesheet wins.

## The token contract is the theme seam

`src/index.css` defines every color, space, type size, motion duration, and shape as a `--t-*`
custom property, then maps the ones components need into Tailwind v4's `@theme` block. A whole
show theme is a block of token overrides: `:root` is the current Fire-and-blood theme,
`:root[data-theme="oscars"]` restores the original ceremony palette exactly. That only keeps
working while components reference tokens.

**Never hardcode a hex value, a px spacing, or a duration in a component.** A hardcoded color does
not just look wrong in the other theme — it silently breaks the seam that makes this a platform
rather than one party's app.

Token families, all in `src/index.css`:

- **Six-token component contract** — `--t-accent`, `--t-accent-light`, `--t-ground`,
  `--t-ground-deep`, `--t-surface`, `--t-surface-line`. Most components need nothing else.
- **Palette** — castle materials (ashlar, basalt, oak, iron, vellum, ink, mortar) and faction
  fields/devices (`--t-team-a-*`, `--t-team-b-*`, `--t-personal-*`).
- **Text and state** — `--t-text`, `--t-text-muted`, `--t-text-dim`; `--t-positive`,
  `--t-negative`, `--t-pending` plus their `-soft` fills.
- **Line, highlight, shadow, overlay** — every border and scrim.
- **Space** — `--t-space-1..5` (4/8/12/16/24px).
- **Type** — `--t-type-tab` 10 · `label` 12 · `body` 14 · `input` 16 · `metric` 18 · `title` 24 ·
  `feature` 28 · `display` 36.
- **Motion** — `--t-motion-fast` 160ms · `base` 280ms · `slow` 560ms · `persist` 1400ms ·
  `loop` 1200ms, with `--t-ease-standard`.
- **Shape** — `--t-chamfer` and the radius/ornament primitives.

## State color is faction-neutral

Correct / wrong / pending render as bone, ash, and ochre — **never green and red**. Two reasons:
the palette is a period one, and players are on teams whose colors must stay legible as team
colors. Do not reach for `text-green-500`.

## Material and relief primitives

Color and alpha texture are paired in exactly one place — the `.material-*` classes
(`stone`, `oak`, `vellum`, `iron`, `enamel`, `ink`). Depth comes from the `.relief-*` classes
(`raised`, `inset`, `carved`, `glass`, `seal`) under a single upper-left light source. Ornament
primitives: `.deckled`, `.scribe-ruled`, `.versal`, `.wax-seal`, `.motif-band`, `.ai-parchment`.

Compose these instead of inventing a new gradient or shadow. Two taste rules that survived the
design passes: **no glow** — depth comes from relief and shadow, not from emissive halos; and
**ornament over noise** — an authored device reads as craft where added grain reads as dirt.
Textures are alpha-only, applied at their published strength, and the global grain layer never
intercepts taps.

## Icons: no emoji, ever

Every icon is an SVG from `lucide-react` (58 files import it) or a custom component in
`src/components/ui/Icons.tsx`. No emoji in the UI, in code, in comments, or in commit messages.
`src/lib/category-icons.tsx` and `src/lib/film-icons.tsx` map domain concepts to icons — extend
those maps rather than inlining a one-off SVG.

## Motion

`framer-motion`, imported as `motion`. House patterns:

- Page transitions: fade + slide from the right (`x: 16 -> 0`), wrapped by `AnimatePresence` in
  `App.tsx`.
- Lists: stagger entrance, `staggerChildren` 0.05–0.1.
- Tappables: spring scale on press, `whileTap={{ scale: 0.97 }}`.
- Score changes: spring interpolation counting up.
- Sheets and modals: slide up from the bottom over a blurred backdrop.

Durations come from the motion tokens. Nothing on a live screen should animate for longer than
`--t-motion-slow` unless it is a deliberate ceremony beat.

## Avatars

`src/components/Avatar.tsx`: a gradient circle with character initials, or a portrait image when
the config supplies one, plus a small emotion badge in the bottom-right. Sizes are `sm` 32 · `md`
40 · `lg` 80 · `xl` 120 px. Emotions are `happy | sad | shocked | neutral`, derived from recent
score events by `computeEmotion()` in `src/lib/avatar-utils.ts` — the gradient angle shifts per
emotion, `AnimatePresence` crossfades between states, and the whole avatar springs on change.
Avatars appear in the lobby, draft, leaderboard, chat, and results; use the component rather than
rendering an initial circle by hand.

## The mobile grammar

375×812 is the only viewport that matters. These six rules came out of a full phone-frame
screenshot pass and every layout bug found was a violation of one of them.

1. **Reserved chrome.** Every fixed overlay (commentary desk, race strip, nav) publishes its
   height, and every content layer pads to the sum of what sits below it. When chrome can grow —
   long quotes — cap it with a max-height and fade the boundary. A soft shadow reads as
   intentional; a mid-glyph slice reads as broken.
2. **Scroll safety.** Any screen can exceed a phone. Every screen scrolls, scroll position resets
   on entry, and an overflowing column is **never** flex-centered — `justify-content: center` plus
   overflow makes the top of the content unreachable.
3. **Auto-zoom analytics.** A live time series scales to the max *so far*, not the final value;
   the early game must be as readable as the finale. Labels get collision handling: sort by value,
   enforce a minimum gap.
4. **One gesture, then quiet.** Hints teach once and retire on first use. Navigation affordances
   live at the screen edges (bottom corners, 44px), never mid-content where they fight the ledger.
5. **Cascade discipline** in single-file artifacts: keep one FINAL-OVERRIDE block at the end of the
   sheet and put corrective rules only there. A rule authored above the base rule silently loses.
6. **The walker is the QA primitive.** A short headless script that arrows through every state at
   phone size and screenshots each is the difference between believing a screen works and seeing
   it. Nothing is checked in — write a throwaway one, run it after visual changes, and read the
   images, not the code.

Layout constants: container `max-w-md mx-auto`, page padding `px-4 py-6`, cards `p-4`, list rows
`py-3`, minimum touch target 44×44px, input font-size 16px (anything smaller triggers iOS zoom on
focus), body text 14px floor, 12px for labels only, and never a horizontal scrollbar.

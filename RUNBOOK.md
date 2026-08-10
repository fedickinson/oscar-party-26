# Show-night runbook — hotfixes without losing the game

The load-bearing fact: **every piece of game state lives in Supabase, not in
the app.** Picks, marks, scores, messages, teams, episode clocks, welcomes —
all of it survives any deploy, any reload, any phone dying. The app is a
disposable window onto the database. Everything below follows from that.

## Mid-game hotfix, in order

1. **Fix locally** → `npx tsc -p tsconfig.app.json --noEmit` → `npm run build`.
   The build being green is the gate; nothing ships red.
2. If the change touches backend writes, run `npx tsx scripts/dogfood-e2e.mts`
   (50 checks against the live DB; cleans up after itself).
3. **Commit, push, deploy**: `git add -A && git commit && git push && npx vercel --prod`.
   (Vercel is on Pro as of tonight — no daily deploy cap.)
4. **Get phones onto the new code**: deploys do NOT auto-reload open tabs.
   Post in the game chat: "everyone pull down to refresh." Reload is safe by
   design — identity restores from localStorage, phase routing returns everyone
   to Live, and every host-side scheduler has a reload-recovery guard
   (intros, welcomes, companion reactions, bingo lines all re-derive from the DB).

### What a reload actually costs

- A companion message that was mid-delay when the host reloaded (one lost chat
  line, at most).
- A manual clock nudge on the sync bar (the derived clock takes back over;
  beacons re-correct within a minute).
- Nothing else.

## Mixed-version rule

Between the deploy and the last phone refreshing, old and new bundles talk to
the same DB. Therefore mid-game changes must be **backward-compatible**:
additive columns only (`ADD COLUMN IF NOT EXISTS`, nullable or defaulted),
never renames/drops/type changes, never repurposing a value's meaning. Save
destructive migrations for tomorrow.

## Rollback (seconds, no redeploy)

Aliasing an existing deployment is not a new deployment:

    npx vercel ls                      # pick the last good deployment URL
    npx vercel alias set <that-url> watch-the-dance.vercel.app

Every deploy of the night is retained — the whole evening is a rollback menu.

## Database disaster recovery

`scripts/snapshot-game.mts --loop 300` dumps all 15 tables to
`.private/snapshots/<stamp>/` every 5 minutes (runs on the host laptop during
the show; paginates past the 1000-row PostgREST page). Worst case — a bad
migration, an errant DELETE — restore the affected table from a minutes-old
snapshot with plain REST inserts, the same pattern that archived and reseeded
the Oscars data.

Code is mirrored on GitHub (`git push` after every commit — the repo is public;
remember that before committing anything sensitive).

## Division of labor during the show

The host phone runs the GM console and fires all AI companions — **keep that
tab open**; if it must reload, the recovery guards re-derive everything from
the DB. Deploys/rollbacks/snapshots run from the laptop, which is not part of
the game and can churn freely.

## The operator layer (discovered live, 8/9)

The night proved the game has three layers, and we'd only built two:

1. **The game** — what players see: declare, mark, chat, scores.
2. **The narrative engine** — the cast reacting to declared facts
   (now `scripts/companion-daemon.mts`, phone-independent).
3. **The operator's lens** — the GM's out-of-band view: who is actually
   playing, whether the engines are alive, what just happened as data, and
   the power to repair the world (restore, undo, catch-up) without touching
   the party. Tonight this layer was a dev session; its first product
   primitives are:

   - `scripts/gm-pulse.mts --room CODE` — one-shot room dashboard: per-player
     last-seen / declares / marks, the last six facts, cast liveness
   - the sentinel (anomaly alarms), snapshots (5-min undo for reality),
     and the daemon logs

   Long-term this becomes an operator UI: presence, activity feed, engine
   health, referee actions (undo with a public banner), and restore — the
   difference between hosting a game and merely being in one.

## Layer 4: the witness (vision, captured 8/9 late)

Tonight's architecture reduces the entire game to one narrow interface: "this
moment happened, attributed to this character." Humans push that button today.
The next level is an AI WATCHER that pushes it: screen/audio capture on the
laptop, frames sampled every few seconds, sent multimodal with the live board
as context ("here are the undeclared possibilities — did any just occur?").
Character ID via reference portraits (pipeline exists). Output is a PROPOSAL
card — "Vermithor just fell: declare +25?" — one tap to confirm, preserving
the honor-system social layer and absorbing hallucinations; confidence-gated
auto-declare later. Sync substrate already built (per-screen episode clocks,
drift beacons). The cast proved comprehension; perception is the only missing
organ. Ladder: humans declare → AI proposes → AI declares, humans overrule.
The clerical work leaves; the shouting stays.

## The conviction question (design, captured 8/9 post-game)

Is the game about the characters you OWN or the story you PREDICTED? Draft
scarcity buys differentiated rooting (conflicting interests make the room
loud); open predictions buy expressiveness (your theory of the night, no
dead-weight picks — and every "+N unclaimed" banner tonight was an outcome
nobody was allowed to have believed in). Synthesis: move scarcity from
characters to CONVICTION. Tiny identity draft stays (your dragon, your
banner). Main game: fixed prediction budget staked across ANY beats on the
board pre-episode — budget scarcity forces a portfolio that IS your read.
Twist that restores differentiation: lonely bets pay full, crowded bets split.
Right-and-alone is the jackpot. Architecture impact: near zero — board,
declare flow, banners, cast, witness all unchanged; "drafted by" becomes
"believed by". The choose-3 activation was already this mechanic in miniature.

## Tomorrow: the animated post-op (promised to the players, 8/9)

The deal with the friends: "I'm gonna really analyze what actually happened —
send me an update." Build a replay: the night as an animated timeline —
declarations landing as scoreboard movements over the episode's runtime, bingo
marks ticking, lead changes, the cast's best lines as pull-quotes — ending in
the winner declared like a match report. All source data is timestamped and
preserved: messages.created_at (chat + banners with caller/beneficiary),
bingo_marks.marked_at, room_winners.created_at, plus full 5-min snapshots in
.private/snapshots. Also run the calibration report (square mark-rates, beat
fire-rates vs authored odds) — same dataset, feeds the content doctrine.

## The primitives thesis (closing thought, 8/9)

Two OPPOSITE show types now modeled live: an awards ceremony (external,
structured, scheduled event stream — the app consumes reality) and a prestige
drama finale (no structure — the ROOM declares reality). What survived both
unchanged is the platform: declared-facts as the spine, the board of
possibilities, cascading scores, a character cast reacting to facts, the chat
as record, the operator's lens. What flipped between them is only WHO/WHAT
feeds the spine: broadcast schedule vs honor-system humans (vs, next, the AI
witness). That's the primitive set for "any show, any live event" — each new
show type is a new fact-source plugged into the same spine.

## The grounding doctrine (from the Cersei incident, 8/10)

Failure mode, observed three times in one night by three different authors:
SALIENCE BEATS SPECIFICITY. A player declared a beat from its title against
its trigger; the maester wrote a chronicle entry from a beat's name against
his own record; the model wrote commentary from a casting angle against the
scene's facts. Same mode every time: the vivid label outweighed the ground
truth because the two were never bound together at the point of authorship.

The live pipeline always had the contract ("FACTS COME FROM THE PROVIDED
CONTEXT") — the incident happened because a NEW generation surface (replay
commentary) did not inherit it. Rule going forward: no generated line ships
from any surface without (1) an exhaustive numbered fact block in the prompt,
(2) a refutation pass listing implied-but-absent events, (3) retries with the
findings attached, and (4) residual findings surfaced for human judgment,
never silently passed. Implemented as scripts/grounded-line.mts — import it;
do not hand-roll replay prompts again. The verifier caught both defects in
the original failing line, including one the humans had missed.

## The two-canons rule (from the Maelor incident, 8/10)

Second failure class, caught by a human on read-through: CANON CONTAMINATION.
The record said Helaena was "told of Maelor's death" — that is the book. In
the show the boy was never born; she carried him still. The claim entered the
record through recap mining: published recaps are written by book-readers, and
source-canon bleeds into their accounts of the screen silently, with full
confidence, in the same sentences as true screen facts. No refutation pass
catches it, because the fact block itself was already contaminated upstream.

The rule: **the adaptation and its source are different worlds.** Wb (book
canon) is not a warrant source for W1 (screen) claims — not even partially,
not even for "surely unchanged" details; the adaptation's whole craft is
changing exactly such details. Operationally:

- A recap-sourced claim carries a RECAP tag until cross-checked against table
  testimony (eyewitnesses who watched the screen, not the discourse).
- Where screen and book diverge, the screen wins. Where the screen is silent,
  the verdict is UNVERIFIABLE — write around the gap and say so, never fill
  it from the source material.
- Character names, family trees, and fates are the HIGHEST-risk claims, not
  the safest: they are precisely what book-readers assume and adaptations cut.

This slots into the existing framework without new machinery: it is R3
(degradation — recaps are a compression hop that leaks which-world warrant)
plus a new entry in the warrant ranking: source-material canon ranks BELOW
published record for screen events, at "attitude only" — the same rank as a
voice's own canon, and for the same reason.

## The foundation: ontology & epistemology (8/10)

ONTOLOGY — four kinds, two worlds. Events happen in W1 (the screen) or W2
(the table); the record maps both and is neither. Claims are statements about
events and carry content, author, time, and WARRANT. Labels (titles, names,
angles) are pointers with zero warrant. Voices are stances: they color
expression and assert nothing. The whole failure class was one category
error: a label used as a claim.

EPISTEMOLOGY — one law, three rules.
LAW: no assertion without provenance; no provenance from association.
Warrant sources, ranked: the screen (perception) > eyewitness > the table's
own writes (W2 only) > published record > a voice's own canon (attitude
only). Resonance is never a source.
R1 Separation: utterance = assertion + expression; only assertions need
warrant, only expression may use resonance.
R2 Binding: claim and warrant co-present at the moment of authorship —
prevention lives at the pen, not the review.
R3 Degradation: every compression hop leaks warrant; re-attach the source or
mark the hop; verdicts are true / false / UNVERIFIABLE, never two-valued.

Everything built maps onto this: drawer = R2 for thumbs; grounded-line =
R1+R2 for models; True Accounting = re-warranting claims, amendments as dated
claims-about-claims; the AI witness = a new warrant source at rank 1, no new
framework required. Closed under all planned extensions.

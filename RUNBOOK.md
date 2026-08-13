# Show-night runbook — hotfixes without losing the game

## THE DOCKET (updated 8/10 end-of-day — start here next session)

**Canonical build sequence:** [`ROADMAP.md`](ROADMAP.md) turns the doctrine below
into the prioritized P0-P8 tactical plan: close the current foundation, make the
game contract composable, prove reusable Story Night, prepare the next event,
then add season campaigns. Keep implementation status there and live-operation
truth here.

### P0 proof status — 2026-08-12

The current platform baseline has completed its P0 proof pass. The app
type-check, all 636 unit tests, production build, schema lint,
show-pack compiler/factory proofs, synthetic settlement-drop generator and the
room-scoped authority/Realtime dogfoods are green. Those database proofs cover
room phase authority, shared playback, legacy atomic draft, roster/room/chat
reconciliation, private grounding review, the operator sentinel and capability
issuance/rotation. The public doorway and generated ceremony were inspected at
375 by 812 without horizontal overflow. Authenticated host and guest lobby,
conviction and production-bundle live surfaces are also clean at that viewport,
with no horizontal overflow or runtime exceptions.

That pass repaired six concrete contract failures: the room phase guard treated
a missing authorization marker as SQL NULL instead of false; the witness queue
exported ambiguous JSON aliases; a lost welcome race crossed PostgREST as a
truthy all-null composite; playback state was inspected before exact room
membership; the legacy draft dogfood inherited the current conviction default;
and the private operator link opened the lobby rather than the live surface.
The phone pass also found three owners of the same companion-typing Realtime
topic; one shared, reference-counted transport now owns it and is covered for
React Strict Mode release/reacquire.

The protected local write boundary was explicitly authorized and completed.
Settlement, conviction, scheduled winner, scheduled spotlight, live-floor
close and the full backend suite pass. The real activation command passes its
dry-run, doubly confirmed apply, exact attestation, room bind and idempotent
replay. A host and guest complete the Story Night path from identity draft and
convictions through sourced declarations, provisional results, settlement
write-back and closure. Both identities' provisional, sealed-gate and settled
results surfaces are clean at 375 by 812 with correct player-relative labeling,
no horizontal overflow and no browser errors.

Do not erase the remaining boundary from the record: a cold headless Realtime
connection did not receive every provisional or closed phase event inside its
bounded wait. Both clients converged through the canonical reconciliation fetch
that follows subscription, and another run observed the broadcasts. That is
evidence for recovery and final convergence, not guaranteed delivery timing.
No production migration, production room, deploy or credential was touched.

The protected pass found three more contract failures and repaired them. The
canonical authoring artifact held 275 reviewed legacy signature contracts while
the seeded catalog held none; migration `20260812062700` installs them and both
seed paths now fail closed unless all 275 are valid. The activation command used
upsert semantics for its first registry insert, implicitly demanding the UPDATE
privilege intentionally revoked from service role; it now strictly inserts the
draft and leaves publication to the atomic RPC. The broad backend harness also
retained a fake room and players despite using a service cleanup key; it now
deletes its transient room state.

An approved `supabase db reset --local` replays every migration through
`20260813000100`, loads the authored legacy pack and finishes with warning-fatal
lint green. The seed temporarily drafts the immutable pack, loads its catalog,
then fails closed unless all trigger doctrine and playability checks succeed
before republishing. The clean catalog is 20 categories, 38 nominees, 38 draft
entities, 213 category links, 275 signature beats with 275 valid contracts and
75 bingo squares, with zero rooms and players. `ROADMAP.md` owns the checkbox
ledger and P1 is the next implementation boundary.

**Design/visual (Codex lanes — full specs in .private/postop/CODEX-BRIEF.md,
live status in .private/postop/HANDOFF.md):**

- Tiered all-characters muster — implemented in the reusable compiler with
  per-player impact ordering, ordinal scale, wrapped lower tiers and tappable
  wager-sheet affordances; migrate the private current-show tiers into its manifest
- Multi-quote pundit desk — implemented in the reusable compiler with required
  speaker portraits, labeled reference chips, 44px controls and cyclic takes;
  migrate the private `takes.json` voices into its manifest
- Wager-sheet trigger drawers — implemented for reviewed source-beat declarations:
  the live row freezes its canonical beat link and exact rule, settlement carries
  that provenance into the receipt, and only receipt-owned rules expand; the
  legacy private night has no retroactive provenance and remains honestly plain
- "The show begins" dedicated curtain-parting slide — implemented in the reusable
  compiler with a reversible threshold and reduced-motion path
- No-card honest-gap callout styling and betrayal death-tier emphasis — implemented
  in the reusable compiler; every no-card callout now names one receipt-owned,
  resolved unscored fact instead of authoring a second account; migrate the
  private current-show artifact after re-emitting its receipt
- Interstitial cast portrait — implemented in the reusable compiler as a required
  act asset with a 112px double-rule square frame and circular portrait; migrate
  the private current-show focal images
- Full per-square bingo lines and ledger icons — implemented in the reusable
  compiler: each receipt square stays its own row, bingo uses the grid hallmark,
  and character-scored rows use the paying portrait; migrate private `beatlines.json`

**Product debt (app):**

- Calibration report — implemented and run locally against the settled WDKH
  record; reusable command and results in "The calibration report" below
- Reclaim flow decoy-sigil bug — fixed and verified locally at 375×812:
  exact-name seats bypass the picker and restore their original sigil; duplicate
  exact names refuse automatic reclaim; unknown names in started rooms see the
  reclaim-only path instead of a decoy choice
- "Close the night" GM action — fixed and verified locally with two clients:
  the host always has a top-level, two-step `live → finished` command, including
  zero-event rooms; unresolved predictions and an empty ledger are explicit;
  one room-locked host command clears any active spotlight and moves every phone
  by Realtime to honestly provisional standings; concurrent/replayed commands
  reconcile. The entire live referee command family now also requires the
  current private room capability as well as the current host seat; direct
  browser declaration-ledger, spotlight and `live → finished` writes fail
  closed. Service-role repair remains available, and only the researched
  settlement command may write `closed`

**Platformization (each has a doctrine section below):**

1. Settlement command — one operator action: strike provisional record, write
   the true one, write it BACK to the app, close the room; a private preparation
   worksheet now bridges the room record into explicit research decisions
   without inventing verdicts, and an already-closed room can recover its
   canonical receipt read-only without replaying settlement
   ("The settlement layer" + "The write-back")
2. Show-pack factory — room-bound activation and resumable grounded prose now
   exist locally; the complete legacy catalog now has a deterministic local-only
   migration worksheet, proven 38/38 identity/portrait coverage and a checked,
   SHA-bound path from explicit human decisions through compatible schema-v3
   authoring into sealed schema-v4 publication; its
   read-only status ledger now enumerates every filled and open research lane;
   the real authoring worksheet now owns its target identity/cutoff, all 38
   entity kinds, all 20 candidate sets and prediction contracts, all 38 entity
   dossiers, eleven reviewed sources, 99 verified claims and all 75 bingo
   contracts. The 54 dragon divergences are
   closed by preserving the category-link winner universe rather than adding
   draft-only candidates. All 275 signature beats now have conservative
   schema-v3 calibration and reviewed exact trigger contracts. The 16
   gameplay-only bingo squares are explicitly classified as authored game rules,
   each with a distinct claim sealed to the exact master-pool bytes; this does
   not turn their calibration into a sourced forecast or permit authoring claims
   to ground predictions or signature beats. Global collection approvals and
   grounded commentary publication remain human boundaries; the local factory
   emits both exact review doorways. Seven cast voices and seven evidence-bound
   requests are authored without approving or generating them. The flywheel now
   also owns a sealed recap/sentiment intake: recap stays tagged until an explicit
   canonical screen cross-check, screen silence becomes unverifiable, sentiment
   enters only as discourse, and composition rebuilds the full reviewed chain.
   A resumable local factory runner now composes the receipt, seed and optional
   reviewed research in one action, emits an immutable grounded-commentary review
   doorway when prose remains, preserves blocked residuals until explicit retry,
   and accepts only publication-record continuations before compilation
3. Trigger-authoring doctrine — enforced locally at compile and catalog-write
   boundaries: every new-pack wager retains its screen rule, exclusions,
   proxy/off-screen/mention decisions, claim provenance and title approval;
   Postgres rejects privileged seed writes that omit or weaken the contract
4. Composable game contract — schema-v4 packs explicitly own commitment,
   conviction budget, identity, scarcity, visibility, settlement cadence and
   continuity. Truth authority lives on each prediction, signature beat and
   bingo trigger, so official results, operator declarations and AI proposals
   can coexist. `fact_source` remains compatibility metadata; room binding
   copies the exact contract and derives the compatibility `game_model` from
   commitment. Historical packs and rooms are backfilled from recorded
   behavior. Room contracts freeze with commitment-dependent state, and the
   activation command prints the profile before any write. Publication
   currently executes only the two proven Results Night and Story Night
   profiles; optional identity forms, variable conviction budgets and campaigns
   remain fail-closed P2/P4 work
5. Live narrative grounding — declared events, approved bingo marks and direct
   human-to-cast mention/ambient replies are implemented locally in browser and
   daemon; browser-originated companion banter is grounded too. Events project
   the GM fact, dossier and game state; bingo projects its honor-system live
   declaration and derived line state; direct replies and banter project quoted
   chat as claims-about-claims, never screen truth. The shared engine enforces
   the exact prompt-selected cast, numbered facts, refutation and bounded retry.
   Residuals never enter chat and survive in the private operator review queue;
   browser producers prove the current room capability before model work and
   again at publication, while the phone-independent daemon writes with its
   service authority.
   Six/twelve-event milestones, per-player welcomes, revisioned team changes,
   pre-show arrivals, the show-start ceremony, revisioned spotlight openings and
   the full-cast post-show farewell are grounded and durably owned in the browser
   too. Keepsake verdicts now use their own strict schema-aware grounding pass,
   exhaustive game/chat/catalog facts, one full-room durable claim and one atomic
   provenance-stamped write; residuals join the same private operator queue
6. Operator UI (layer 3) — first read-only lens implemented locally: real
   foreground/background Presence, an authoritative companion-daemon heartbeat,
   and honest cast/fact sequence evidence; its collapsed host control now derives
   one restrictive whole-room status (`Checking`, `Ready`, or one check per
   attention channel) without turning presence or sequence into stronger proof.
   The same summary now owns the grounding and witness queue signals, so pending,
   failed or not-yet-loaded private review work cannot sit below a false `Ready`;
   capability loading remains `Checking`, while a resolved missing bearer marks
   the host's Events tab for attention from every live tab;
   declaration undo is now an atomic
   host referee action that strikes the provisional fact and appends its public
   correction together; scheduled spotlight open/close is now a room-locked,
   revision-checked host command, so stale tabs cannot replace or close a newer
   ceremony and losing tabs retain a visible operator error; closing the live
   floor is likewise one idempotent room-locked command that clears the spotlight
   before Realtime moves all phones to provisional results; sealed 25-table v2 snapshots and missing-row room recovery
   now provide the first restrictive restore path. The laptop `gm-pulse` lens now
   exhausts the room transcript and room-card marks instead of sampling the latest
   global rows, exposes both private review queues, and refuses duplicate-name
   banner attribution. A read-only terminal sentinel now reduces those same complete
   observations to stable alarm channels and stays quiet until their signatures
   change; the first overwrite/delete boundary now exists for one human chat
   row at a time: an exact sealed-snapshot plan, service-only atomic
   compare-and-swap, idempotent private receipt and public correction line.
   Synthetic/cast rows, non-text drift, closed rooms and broad record replacement
   remain outside that authority. Shared playback state now uses its own
   restrictive command family too: pre-playback location and holder assignment,
   member-owned pause requests, holder-only beacons/pause/ready/resume, exact
   countdown replay checks and direct-write guards over both the room clock and
   player authority fields. Self-serve bingo now follows the same restrictive
   pattern without adding host adjudication: the database validates one
   room-pack card per seat, and a seat may atomically set or clear only its own
   non-center marks; direct browser card and mark writes fail closed. These
   validate public seat handles and database
state; they do not turn an anonymous player id into authenticated caller
identity. P1's explicit composable contract is now implemented locally; P2's
reusable Story Night options are the next implementation boundary
7. AI witness ladder (layer 4) — the one-frame proposal rung now exists locally:
   explicit operator send, private reference manifest, structured IDs only,
   exact model-time candidate seal, durable review queue and atomic one-tap
   confirmation. Review now requires a service-issued 256-bit room operator
   capability in addition to current host role. A leased continuous observer now
   samples an explicit local frame ingress into that same human-reviewed queue;
   a separate bounded macOS capture adapter can populate that ingress only after
   exact-plan review and a capture-specific privacy confirmation. Capture cannot
   authorize model send or declaration. The host queue now makes the current
   authority gap explicit: up to eight retained positive frame judgments from
   one model are temporal support, not independent corroboration, and always
   require a human ruling. When paired-character frames disagree, the host must
   explicitly choose an evidenced side; the immutable root observation stays
   intact and the chosen entity is recorded separately. Confidence-gated
   auto-declare remains a later rung
8. Conviction-portfolio redesign ("The conviction question") — implemented
   locally: one dragon identity each, 12 open authored-beat beliefs, shared-bet
   integer splits, Realtime portfolio board, full score/timeline/settlement
   evidence, operator recovery and contract-derived room models
9. Ceremony engine — the reusable settlement-drop compiler now owns the
   acts/beats grammar, beat-weight tiers, mobile navigation, impact-ranked tiered
   muster, dedicated curtain threshold, grounded pundit desk, character drawers,
   personal-edition gate, honest no-card callouts and the betrayal death-tier/ember
   treatment; edge taps now match the advertised swipe/arrow/chevron grammar and
   detail sheets inert the deck, trap focus and restore their opener; receipt-owned
   personal editions now have stable player-ID doorways, one-screen phone cards,
   fired-roster summaries and protocol-safe native-share/copy fallback; the complete
   synthetic proof has been browser-walked at 375×812 with every slide, long-scroll
   endpoint, drawer, quote state and personal doorway inspected; migrate the current
   hand-built ceremony into its manifest contract. The migration approval docket now
   has a reusable offline decision workbench: every explicit edit is bound to the exact
   docket, packet and baseline-decision hashes, local drafts are scoped to that docket,
   and a separate local builder reruns the semantic guards into an immutable candidate
   directory without replacing canonical decisions or minting a receipt. Receipt-to-beat
   binding now has its own post-settlement review packet: every canonical score event and
   resolved unscored fact must be placed once, while each legacy line is explicitly represented
   or superseded. Quote grounding now has a source-rebuilt, two-canons-safe review and planning
   stage: every replacement owns warranted screen facts, expression-only source-canon context,
   an approved pundit identity and a bounded canonical grounded-line contract without model
   access. Human generation authorization is now an offline, exact-plan review; publication
   rebuilds current packet and decision bytes, rejects stale authority, checkpoints every job,
   resumes pending work without repeating completed spend and withholds compiler-ready output on
   any residual finding. Final manifest composition now rebuilds every reviewed
   upstream artifact and passes the result through the reusable compiler; current-
   show migration remains human content and receipt work

The load-bearing fact: **every piece of game state lives in Supabase, not in
the app.** Picks, marks, scores, messages, teams, episode clocks, welcomes —
all of it survives any deploy, any reload, any phone dying. The app is a
disposable window onto the database. Everything below follows from that.

## Which database a command talks to (added 8/10)

There is now a local stack (`supabase start`), so every script announces its
target before doing anything. **The operator's lens — `gm-pulse`, `sentinel`,
`snapshot-game`, `companion-daemon` — still defaults to production**, which is
what you want on show night: nothing below changes. The scripts that WRITE test
data (`dogfood-e2e`, `ghost-screen`) now default to local, so add
`SUPABASE_TARGET=remote` if you deliberately want them against the real room.
`npm run dev` talks to the local stack; production builds are unaffected.

## Mid-game hotfix, in order

1. **Fix locally** → `npx tsc -p tsconfig.app.json --noEmit` → `npm run build`.
   The build being green is the gate; nothing ships red.
2. If the change touches backend writes, run `npx tsx scripts/dogfood-e2e.mts`
   (the full local backend suite; proves and cleans up pack isolation).
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

`scripts/snapshot-game.mts --loop 300` dumps all 25 canonical public tables to
`.private/snapshots/<stamp>/` every 5 minutes (runs on the host laptop during
the show). The stable service-only `capture_operator_snapshot_v1` RPC name is
historical; current manifests are version 2 and materialize all tables in one PostgreSQL
statement snapshot, closing both the 1,000-row REST limit and cross-table race
windows. `player_verdicts` and `avatars` are included: the earlier 20-file
format omitted both. The service-visible OpenAPI definitions must equal the
canonical table set, and every table must succeed before the temporary directory
is published. `manifest.json`
seals the exact table set, row counts, per-file hashes and the PostgREST schema
hash. OpenAPI JSON is canonicalized before hashing, and equal schema reads must
bracket the atomic data RPC; a concurrent migration invalidates the capture
instead of crossing the evidence boundary. Capture requires service-role
visibility, so an RLS-hidden row cannot be
silently certified out of existence; partial or schema-drifted evidence is not
restorable by automation.

For an errant delete, preflight one existing room from a sealed snapshot:

    npx tsx scripts/restore-room-snapshot.mts \
      --snapshot .private/snapshots/<stamp> --room CODE

The command defaults to local, reads every current table, and prints missing,
unchanged, room-drift and conflict ledgers without writing. It restores only
missing room-owned rows; exact rows are idempotent no-ops, while any divergent
row or catalog prerequisite blocks the run. It never recreates a room, restores
an engine heartbeat, updates, overwrites or deletes. Apply requires both
`--apply --confirm-room CODE`, an exact snapshot/write-target match, the service
key, and the repository's direct confirmation for any category write. Dry-run,
apply and the post-write check all use that same service visibility. Inserts
are planned from the same atomic v1 database capture used by snapshots. Inserts
run in dependency order; canonical schema guards bracket preflight, replay and
postflight. An interrupted replay is safely rerun and the command rechecks the
full plan afterward. Original 24-table version-1 seals remain automatically
readable when every sealed field and required input still matches; additive
nullable output fields are tolerated, and the new witness
support table is treated as empty. Exact service-role recovery may preserve a
pending legacy witness row, but the v2 phone queue will not synthesize missing
observation-time adjudication; the operator must resolve that historical row
with service recovery authority. Pre-seal legacy snapshots remain evidence for manual
recovery but cannot honestly pass this automated completeness gate.

For one divergent human-authored chat row, or one extra human chat row absent
from the seal, author a separate repair plan:

    npx tsx scripts/repair-room-message.mts \
      --snapshot .private/snapshots/<stamp> \
      --room CODE \
      --message UUID \
      --note "Public reason for the correction." \
      --plan-output .private/repairs/CODE-message-UUID.json

Dry run is the default. The plan freezes the sealed manifest hash, exact current
row, exact desired row, action and public correction into one canonical
SHA-256 identity. It may restore only `messages.text`; a changed author,
timestamp, row identity, room or bound show pack is a blocking conflict. A message absent from
the sealed snapshot may be deleted only when its author is a current player in
that room. Synthetic rows, system lines, cast outputs, chat already used as a
reaction source, keepsake evidence, messages from another room and closed-room
chat are rejected.

After a human reviews those exact plan bytes, apply them explicitly:

    npx tsx scripts/repair-room-message.mts \
      --snapshot .private/snapshots/<stamp> \
      --room CODE \
      --message UUID \
      --apply \
      --approved-plan .private/repairs/CODE-message-UUID.json \
      --confirm-room CODE

The service-only RPC locks the room and target row, compares the exact approved
preimage, performs the update or deletion, appends the plan's public system
correction and records an idempotency receipt in one transaction. A concurrent
edit aborts the apply. Exact replay returns the original receipt and never adds
a second correction line; later drift of either the result or correction is an
error, not a silent success. This is not a general “make the database equal the
snapshot” command. It does not repair facts, scores, settlements, identities,
system prose or cast prose. Rehearse the full local path with:

    npx tsx scripts/dogfood-message-repair.mts

Code is mirrored on GitHub (`git push` after every commit — the repo is public;
remember that before committing anything sensitive).

## Division of labor during the show

The host phone runs the GM console. The laptop runs the service-role companion
daemon under a room-scoped lease, plus deploys, rollbacks and snapshots; it is not part of
the game and can churn freely. The browser reaction path remains a deduplicated
fallback, but the operator lens should say `Daemon live` before relying on the
phone-independent engine. Human-chat reactions use a second, per-reaction
lease shared by every host tab and the daemon: the first engine to claim a
message/kind/voice key may generate, and one transaction both inserts its cast
lines and seals the claim. Unfinished work can be released or taken over after
60 seconds; completed work is never reclaimed. Ambient keys deliberately omit
the randomly chosen voice so two engines cannot answer one human through two
different characters.

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
   - `scripts/sentinel.mts --room CODE [--loop 15]` — one-shot or quiet-loop
     anomaly alarms over the room record, host identity, daemon, cast/fact
     sequence and private review queues
   - snapshots (5-min undo for reality) and the daemon logs

   Long-term this becomes an operator UI: presence, activity feed, engine
   health, referee actions (undo with a public banner), and restore — the
   difference between hosting a game and merely being in one.

`gm-pulse` now exhausts deterministically ordered pages for the complete room
transcript, roster and cards, and asks PostgREST only for marks on those exact
cards. The old command sampled the latest 200 messages and latest 100 marks
globally, so a busy or older room could disappear from its own dashboard. The
readout derives player activity and the last six facts from the complete room
record, retains the cast-sequence caveat, and reports the grounding and witness
queues through their stable capability-gated read RPCs. Public room and host
IDs alone can read neither private queue. Because declaration
actor identity survives only in public banner text, duplicate display names
produce `ambiguous` rather than crediting one line to both players. The command
remains read-only and remote-default; its focused dogfood creates two local
rooms, crosses both former cutoffs, proves cross-room mark isolation and removes
every scratch row.

`sentinel` consumes the same complete, room-scoped reader as `gm-pulse`; neither
command maintains a second pagination or queue contract. It is read-only,
requires one exact room code and defaults to production. One-shot mode exits `0`
when every monitored channel is clear, `2` when operator attention is required,
and `1` when the room cannot be observed. `--loop SECONDS` accepts 5 through
3600 and prints only when the stable anomaly signature changes, so heartbeat-age
noise does not become an alarm stream. The channels stay separate: impossible
phase/settlement identity, missing live host, missing/stale live daemon, facts
newer than cast activity, grounding review and witness review. The sequence
channel proves order only, not that the cast answered a particular fact. Like
`gm-pulse`, each poll is a complete set of paginated reads rather than one sealed
database snapshot; use the settlement receipt or atomic snapshot when exact
cross-table identity is the question. Its focused dogfood walks hostless,
healthy, quiet-after-fact, recovery, stale-daemon and pending-review states in
one disposable local room, proves unchanged loop states stay quiet and removes
the room afterward.

**First in-app operator slice (implemented locally 8/10).** Every client on the
live page now tracks room-scoped Supabase Presence; the host's Events surface
shows who has a foreground tab, who is backgrounded and who has no live signal.
The lens starts in a neutral syncing state rather than briefly calling everyone
offline, combines multiple tabs for one player, and clears stale evidence if the
channel errors or closes. It is host-only and collapsible, so the declaration
composer remains fast on a phone.

The companion daemon now claims one durable `companion_daemon` lease per room,
pulses every 15 seconds, and becomes stale after 45 seconds. A second process is
refused while the lease is current; after staleness it may take over, and only
the active instance may release. Clients can read the row and receive its
Realtime changes but cannot write the table directly; the narrow claim/release
RPCs own the shape. The host lens and `gm-pulse` report live, stale or not
running from that persisted pulse. This is an operational honor-system lease,
not cryptographic attestation of the process behind it.

Reaction ownership is narrower than daemon ownership. Rows in the private
`companion_reaction_claims` ledger serialize each human-message reaction across
the browser fallback, duplicate host tabs and the daemon. Clients never access
that ledger directly. The claim, completion and release RPCs expose only lease
arbitration, and completion inserts one to four `messages` rows in the same
transaction that records their IDs. A failed generator releases immediately;
a dead process yields after its 60-second lease. This prevents a phone and the
laptop from both answering the same prompt without pretending that a daemon
heartbeat proves any particular line was generated.

Declared-event reactions use that same ledger before any model work, with a
five-minute generation lease. The winning engine atomically inserts the
  zero-delay line and seals the complete one-to-seven-line stagger plan in
`private.companion_reaction_deliveries`. Browser timers and a three-second
browser/daemon recovery poll both call the same due-time RPC. It inserts only
immutable lines whose due time has passed and receipts each row once, so a
sleeping phone may make a line late but cannot erase ownership or duplicate it.
The daemon's old 45-second message observation remains only as compatibility
for a browser bundle loaded before this contract existed.

The narrative readout remains deliberately narrower than “engine healthy.” It shows
whether declared facts are newer than the latest companion message, or whether
cast activity happened later. Timestamp order cannot prove causation: a welcome
or ambient line may follow a fact without answering it. The UI states that it is
sequence evidence, not a response. Manual declaration is now one
capability-gated transaction: the current room bearer, current host seat,
live-room check, category, nominee link, winner and public announcement either
all commit or none do. A player ID is not itself authority. Declaration undo is
now the first referee
action: one host-only database command locks the room, strikes only a room-scoped
provisional declaration, and appends a durable public correction in the same
transaction. A failed strike cannot leave a false correction behind, and
Realtime removes the fact and publishes the banner to every phone. Sealed
snapshots plus the dry-run-first missing-row recovery command now cover the
restrictive restore case; destructive reconciliation remains deliberately
separate. The existing episode log remains the canonical activity feed.
The collapsed lens also consumes the exact grounding-review and witness-proposal
hook state rendered by the desks below it. Both queues must load clear before the
room can read `Ready`; a pending or failed queue contributes one named operator
check regardless of row count. A room/revision change hides stale queue rows and
returns the lens to `Checking` until the new private scope is known.

## Layer 4: the witness (vision, captured 8/9 late)

Tonight's architecture reduces the entire game to one narrow interface: "this
moment happened, attributed to this character." Humans push that button today.
The first rung now exists locally as `scripts/witness-once.mts`. It accepts one
operator-selected frame and a local reference manifest. Its default mode reads
and validates the live board but sends no pixels and writes nothing:

    npx tsx scripts/witness-once.mts \
      --room CODE --frame frame.webp --references .private/witness/references.json

Only the explicit privacy/spend gate contacts Anthropic and may enqueue one
proposal:

    npx tsx scripts/witness-once.mts \
      --room CODE --frame frame.webp --references .private/witness/references.json \
      --send-frame --confirm-room CODE

The next rung continuously observes a capture directory chosen by the operator:

    npx tsx scripts/witness-observer.mts \
      --room CODE --ingress .private/witness/frames \
      --references .private/witness/references.json

Plan mode ignores frames already present when it starts, samples only the newest
stable direct-child image at each interval, and sends nothing. Use
`--include-existing --once` to validate one existing frame. The privacy/spend
boundary remains explicit for a live observer:

    npx tsx scripts/witness-observer.mts \
      --room CODE --ingress .private/witness/frames \
      --references .private/witness/references.json \
      --send-frames --confirm-room CODE

One local lease per room prevents duplicate observer processes. Send mode keeps
an atomic mode-0600 gitignored journal scoped to the real ingress path. Before a
model worker starts, the exact frame hash becomes `in_flight`; only a successful
worker and unchanged bytes promote it into processed history and advance the
newest-only cursor. A crash or ambiguous worker failure therefore stops instead
of automatically repeating spend. After checking the host review queue, resolve
that uncertainty with the exact hash printed in the error:

    npx tsx scripts/witness-observer.mts \
      --room CODE --ingress .private/witness/frames \
      --references .private/witness/references.json \
      --send-frames --confirm-room CODE --skip-inflight SHA256

That recovery command clears only the named uncertainty and exits; starting or
resuming observation is a separate invocation.

Symlinks and in-progress files are never followed. The
observer invokes `witness-once` for every sample, so it can enqueue only a sealed
proposal. It cannot accept that proposal or write a canonical declaration.
Screen acquisition is a separate privacy boundary rather than an implicit side
effect of starting the observer. On macOS, first author a bounded capture plan
for exactly one display, window ID or rectangle:

    npx tsx scripts/witness-capture.mts \
      --room CODE \
      --ingress .private/witness/frames/CODE \
      --display 1 \
      --interval 15 \
      --frame-limit 40 \
      --plan-output .private/witness/CODE-capture-plan.json

Plan mode creates the private ingress if needed and writes only canonical
review bytes; it captures no pixels. After reviewing the exact target, cadence,
frame ceiling and `model_send=false` / `auto_declare=false` boundary, start the
bounded capture with the same arguments plus:

    --capture \
    --approved-plan .private/witness/CODE-capture-plan.json \
    --confirm-capture CODE

Use `--window-id ID` or `--rectangle X,Y,W,H` instead of `--display N` when a
whole display would collect more than intended. The adapter invokes only the
local macOS screenshot tool. The ingress must be owned by the current user with
no group or other permissions. Capture stages outside the watched directory,
validates each output as a PNG within the observer's 5 MiB frame ceiling, then
publishes it with an atomic no-replace link. Complete evidence is never
overwritten or deleted. The adapter stops on SIGINT/SIGTERM and always stops at
the reviewed frame limit, which is capped at 1,000. It has no database,
Anthropic or declaration path. Sending those frames still requires the
observer's independent `--send-frames --confirm-room` authority shown above.

The command copies the selected frame into the gitignored local evidence
archive and sends it with only the relevant private reference portraits. The
model may return a canonical beat ID, one of that beat's entity IDs and integer
confidence, or no proposal. It cannot author a label, trigger, point value,
announcement or other prose. Below the configured confidence threshold nothing
is written. No-proposal frames remain only in the observer's local processed
journal; they are not stored as negative votes. The first positive judgment
creates one review unit. Later distinct positive frames for the same pending
beat attach to it, up to eight retained judgments total. Agreement is temporal
support from repeated sampling, not independent corroboration; disagreement on
a paired beat names the other character for the host. Each retained row seals
the image subset actually sent; unrelated board changes may alter that subset,
while the reference manifest, model and exact candidate remain bound. The queue never
auto-declares. If retained frames select both sides of a paired beat, the accept
action stays disabled until the host chooses one of those evidenced entities;
an unevidenced entity cannot be written. Acceptance compare-and-swaps the exact
retained observation count; a newly arrived frame forces a fresh ruling. Older
browser review RPCs fail closed because they cannot represent that choice. The first observation remains the root
audit identity, while `reviewed_entity_id` records the distinct human ruling.
If new evidence lands after the desk loaded, the count precondition fails and
the phone automatically reloads the queue with no stale character selected.
Board reads exhaust every deterministically ordered PostgREST
page. Each proposal seals the exact authored candidate object shown to the model, so
a later beat, trigger, point or entity edit makes acceptance fail stale instead
of changing the proposed fact. Pending proposals are private database rows; a
database-owned room Realtime revision wakes the review queue without exposing
those rows to ordinary clients. The reviewer sees the sealed human-authored
trigger and one-taps accept or dismiss. Acceptance re-reads every canonical
field and writes the fact, winner, public announcement and proposal resolution
in one room-locked transaction while share-locking the sealed beat and entity
rows against concurrent edits. Dismissal moves no score and remains available
when the catalog has drifted. Referee undo can later strike the provisional fact while the accepted observation retains its evidence
hashes and historical declaration ID, and missing-row recovery can restore that
history without recreating the struck category.

Private operator work now requires two separate facts: the supplied player must
still equal `rooms.host_id`, and the caller must possess the current 256-bit
room capability. New-room creation mints the first bearer atomically with the
room and host seat; later laptop issuance and rotation remain service-only.
Only the SHA-256 is stored, in the private schema.
Public room and player IDs alone can no longer record, list or dismiss residual
grounding evidence, list and review witness proposals, claim browser model work,
or publish browser companion and keepsake output. The route validates a stored
bearer against the private hash before enabling an engine. Issuance and rotation
advance `rooms.operator_capability_revision`; the room Realtime subscription
therefore returns every open route to `Checking`, revalidates the local bearer,
and disables generation immediately. Claim and publication wrappers repeat the
database check, and browser mutation wrappers lock the lease and require browser
provenance, so a fabricated bearer cannot spend model tokens, a bearer rotated
during generation cannot publish, and a losing browser cannot release or complete
the daemon's lease. The service-role daemon retains the
legacy claim, completion, schedule, release and residual writer because it
already carries stronger authority. Ordinary party entry remains anonymous.

Revoking the anonymous legacy grounding writer and browser reaction primitives
is intentionally a between-show security migration: an old browser bundle can
neither preserve residual evidence nor claim or publish cast work after those
permissions are removed. Apply it only when no live room is depending on an old
bundle, then refresh the host onto the capability-aware build before the next
show. The daemon must have `SUPABASE_SERVICE_ROLE_KEY`; an anonymous-key daemon
is deliberately refused by the database after this cutover.

Provision or inspect the capability from the operator laptop. Dry run is the
default; apply requires the room code twice and an HTTPS origin (loopback HTTP
is accepted for local development):

    npx tsx scripts/issue-operator-capability.mts --room CODE

    npx tsx scripts/issue-operator-capability.mts \
      --room CODE --apply --confirm-room CODE \
      --origin https://watch-the-dance.vercel.app

Use `--rotate` only when deliberately replacing an existing bearer. The raw
token and private phone link are never printed; they are written mode `0600`
under `.private/operator-capabilities/`. Opening the link stores the capability
under that exact room ID in the host browser; the always-mounted app-shell
provider removes it from the visible URL fragment before any room screen opens.
The private link enters at the lobby route so it can authorize the first shared
phase command. `gm-pulse`
and `sentinel` read the same room token file, or the
explicit `ROOM_OPERATOR_CAPABILITY` environment value. A missing or invalid
capability makes both private review queues unavailable and therefore
contributes separate operator checks rather than producing a false `Ready` or
`CLEAR`. Treat the link as a room key: do not put it in chat, screenshots,
commits or logs.

Bounded automatic screen capture and repeated sampling now exist; audio capture
remains outside the ladder. The private review unit retains at most eight
distinct positive frame judgments for one beat. Repeated agreement is temporal
support, not independent corroboration; a paired-character disagreement is
surfaced by name and requires an explicit host choice among evidenced sides.
The root observation and human-selected entity remain separate audit facts.
Frames on which the model proposes nothing remain only in the
observer's local processed journal, not as negative votes. Confidence-gated
auto-declare remains the next rung, but the current queue deliberately marks
every proposal human-review-only, and the host still owns trigger exclusions
and edge cases. The sealed witness
candidate and host queue now carry the contract's explicit proxy, off-screen
and mention adjudication as well as the positive condition and exclusions;
new pending proposals without that complete rule are rejected. Ladder: humans
declare → AI proposes → AI declares, humans overrule. The clerical work leaves;
the shouting stays.

## The conviction portfolio (implemented locally 8/11)

Is the game about the characters you OWN or the story you PREDICTED? Draft
scarcity buys differentiated rooting (conflicting interests make the room
loud); open predictions buy expressiveness (your theory of the night, no
dead-weight picks — and every "+N unclaimed" banner tonight was an outcome
nobody was allowed to have believed in). Synthesis: move scarcity from
characters to CONVICTION. Tiny identity draft stays (your dragon, your
banner). Main game: fixed prediction budget staked across ANY beats on the
board pre-episode — budget scarcity forces a portfolio that IS your read.
Twist that restores differentiation: lonely bets pay full, crowded bets split.
Right-and-alone is the jackpot. The implemented contract is 12 equal-weight
slots per player across any authored signature beat, collisions included. A
struck beat pays `floor(authored points / believer count)` to each believer;
the integer remainder is burned. The identity draft is one dragon per player
and carries no passive score. Scheduled fact-stream packs retain the legacy
confidence game; room-declared and AI-witnessed packs select conviction when
bound. Historical rooms stay legacy. The declaration board, banners, cast and
witness remain the fact spine; score, timelines, results, receipts, settlement
preflight, authoring worksheets and operator snapshots all consume the same
conviction rows. `scripts/dogfood-conviction-command.mts` proves the database
budget, shared beliefs, one-dragon boundary, phase freeze and cleanup locally
without writing catalog tables.

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

## The calibration report (implemented and run 8/10)

`scripts/calibration-report.mts` turns a preserved snapshot plus the settled
personal record into deterministic Markdown and JSON. It is read-only and
local-filesystem-only. It reconciles every settled player card back to its
snapshot square IDs and refuses position or title mismatches. Beat outcomes are
joined to the snapshot's authored odds; optional source probabilities add a
numeric comparison without making missing values disappear.

    npx tsx scripts/calibration-report.mts \
      --snapshot .private/snapshots/2026-08-10T23-06-06 \
      --record .private/postop/personal.json \
      --beat-source hotd_s3_finale_signature_beats_v4_variety_pass.json \
      --room WDKH \
      --markdown .private/calibration-WDKH.md \
      --json .private/calibration-WDKH.json

WDKH's settled readout: 40 marks across 120 non-free card exposures and 73
unique squares. The authored order held — likely 51.4%, toss-up 33.3%, long
shot 20.0%, chaos 10.0% — but every tier landed below its exposure-weighted
authored mean by 4.9 to 17.5 percentage points. Of 149 roster-beat observations,
142 had authored categorical odds, 114 also had numeric probabilities, and 7
Ulf outcomes were excluded because the settlement recorded them only as a
bundle. Comparable beat fire rates also retained the broad order but were far
below the authored means: likely -39.1 points, toss-up -28.0, long shot -11.0,
wild -6.0.

Those figures are descriptive, not a license to retune from one episode. Bingo
rows are player-card exposures, so repeated squares measure event occurrence
plus player marking behavior. Beat rows are authored roster slots, so mirrored
or related triggers are not independent story events. A bundle never proves
that each trigger inside it fired; the report keeps those rows out of both the
fired and missed denominators.

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
the original failing line, including one the humans had missed. An auditor
clearance is valid only when its response has the exact `violations: string[]`
shape. Missing, non-array, blank, extra-field or malformed responses become a
residual finding; malformed model output can never carry the meaning "grounded."
Generated commentary is accepted only as a nonblank string in the direct
`{"text":"..."}` envelope or the shared system's exact `{"messages":[...]}`
envelope. Any other generation response spends a bounded retry without reaching
the auditor or checkpoint writer. A shared response is accepted only when it
contains one unambiguous message for the requested companion; array position can
never substitute for speaker identity.

**Honest implementation boundary (audited 8/11).** The offline show-pack and
settlement-drop authoring lane enforces that contract through
`scripts/grounded-line.mts`. The declared-event live path now uses the same
multi-speaker core (`api/_grounding.ts`, re-exported by `grounded-line.mts`) in
both the browser fallback and `companion-daemon.mts`. Its prompt projects the
GM declaration, researched dossier, draft result, relevant wagers, leader and
player predictions into one exhaustive numbered block. Every returned line is
audited in parallel; a finding retries the whole batch with speaker attribution.
Browser and daemon contend for one durable event claim before generation. The
winner atomically publishes the first grounded line and seals the later due-time
delivery plan; either process can recover delivery without regenerating prose.
After the bounded final attempt, residuals block all message persistence and
the browser or daemon records the exact facts, attempted lines and findings in
`private.companion_grounding_reviews`. Events surfaces the complete numbered
facts, attempted batch and findings. The RPCs compare a supplied player ID with
`rooms.host_id`, matching the app's present honor-system identity model; this is
not cryptographic caller authentication. Acknowledgement keeps the prose blocked.

Direct human mention and ambient replies now use the same engine after winning
their durable reaction claim. LIVE FACT 1 is the exact triggering message; up
to eight recent lines are separately qualified as CHAT RECORD statements, and
leader/event-count values are GAME RECORD facts. A quoted player assertion proves
only that the player wrote it, so neither generator nor auditor may promote
speculation into screen canon. Haiku generates for latency, Sonnet audits, one
retry is allowed, the requested companion ID is enforced, and only the cleared
reply enters the atomic completion RPC. The documented exact empty batch remains
a valid no-prose safety response; malformed output does not.

Browser-originated companion banter now follows the same contract. The target
line and up to six recent lines are qualified as CHAT RECORD statements, the
triggering line is excluded from recent context by message ID, and event-count
and optional leader values remain separate GAME RECORD facts. The selected
responder ID is enforced before atomic claim completion. The daemon does not
originate banter, so there is no second banter generation path to bind.

Approved bingo marks now follow the contract in browser and daemon. A mark is
named honestly as an honor-system LIVE DECLARATION, not a host attestation; the
derived square-or-line outcome is a separate GAME RECORD fact. Line completion
is recomputed from canonical `(marked_at, id)` chronology rather than callback
order, so close-together marks mean the same thing in both engines. Every mark
owns one durable announcement key and one durable reaction key, so competing
engines cannot duplicate either line. The winner generates only after claiming,
both engines select the responder only from cast IDs already present in durable
chat, the prompt-selected responder is enforced, an exact empty safety batch
emits no prose, and residual evidence is recorded under the `bingo` surface.

The six-event and twelve-event milestone reactions now follow the same contract
in the browser. The canonical declared-event count and complete computed
leaderboard are projected as GAME RECORD facts; player names are JSON-quoted
inside the fact block and never interpolated into instructions. Each threshold
owns one stable room reaction key, so racing host tabs cannot publish twice.
The batch requires exactly Ned, Cersei and Tyrion in that order, freezes its
staggered delivery plan, and preserves residuals under the `milestone` surface.
The initialization thresholds now match the actual six/twelve triggers, and a
client that observes a jump across a threshold records the actual observed count
and still attempts the durable claim. Awards-style milestones wait until every
pick on a resolved category has left its null scoring state before freezing the
leaderboard; room-authored events with no attached picks pass immediately.
The daemon does not originate milestone reactions.

Player welcomes now follow the contract in the browser. A capability-bearing
current host claims `players.welcomed_at` through one atomic command; the winner
then owns `welcome:<player-id>` for atomic output. The freshest player name,
allegiance, banner and exact drafted roster are JSON-quoted ROOM/GAME RECORD
facts, while the chosen house-affinity hook is labeled expression-only and can
never establish a screen event. The prompt-selected greeter is enforced, an
invented detail retries the whole one-line batch, and residuals are preserved
under the `welcome` surface. No eligible arrived companion still defers the
claim as before. A blocked or failed generation consumes the welcome slot but
publishes no fallback prose; the operator evidence is the honest recovery cue.
The daemon does not originate welcomes.

Team declarations and defections now follow the contract in the browser.
The player-owned command validates the exact room seat and rejects direct
browser writes; this constrains a public seat handle without claiming login identity.
`players.team_revision` is a database-owned monotonic identity and
`players.previous_team` retains the prior side for the latest transition; old
clients that update `team` directly now fail closed and must refresh before
defecting. Revision zero is silent inherited state. Every later revision owns separate announcement
and reaction keys, so repeated direction changes remain distinct and racing host
tabs cannot duplicate either line. A reload can recover the latest unfinished
revision. The prompt projects only the revisioned ROOM RECORD transition and
exact drafted roster, enforces the selected arrived companion, and preserves
residuals under `team_change`; it may not invent a screen event or a reason for
the player's choice. First declarations before the scheduled welcome remain
folded into that welcome, and rapid later toggles retain the existing cooldown.
The daemon does not originate team-change reactions.

Pre-show arrivals now follow the contract in the browser. The authored
Ned/Tyrion/Cersei/Daenerys/Olenna/Arya order and eight-minute offsets live in one
pure schedule. Each companion owns a separate stable key and generates one
delay-zero grounded message only when that browser timer comes due. A reload
reads durable chat, removes everyone already present and re-bases the remaining
relative offsets from the first missing arrival; racing host tabs contend per
companion. Existing unkeyed companion rows remain legacy completion sentinels,
checked both before model spend and again after audit. The exhaustive projection
contains only `show_started = false`, the synchronized quoted player/allegiance
roster, synchronized quoted draft rosters and up to six qualified prior CHAT
RECORD lines. The old recap/season preamble is no longer a warrant source for
these entrances. Unknown or degraded room/score/roster synchronization emits nothing,
and a host loss, first declared result or show-start transition during generation
cancels publication. Exact speaker and delay zero are enforced; residuals survive
under `pre_show`. The long offsets remain awake-browser timers, not database due
times, so reload recovery deliberately re-bases rather than pretending elapsed
cadence survived suspension. The daemon does not originate pre-show arrivals.

The show-start ceremony now follows the contract in the browser. The canonical
`rooms.show_started = true` transition establishes only that shared playback
began; it does not establish a screen image, line, character, location or event.
That transition and the clock around it are database-owned: a current solo
screen, named-screen holder or capability-bearing host starts through
`start_episode_for_screen_authorized`; the shared clock, pause request, park
position, ready ledger and exact resume timestamp move only through the narrow
playback RPCs. Watch locations and holder handoffs close when shared playback begins.
Direct anonymous writes to those room fields and to `players.watch_group`,
`is_remote_holder` or `episode_started_at` are rejected. This is constrained
seat authority, not login identity: player UUIDs remain visible room handles.
The exact watching roster is a separately quoted ROOM RECORD fact, and the
grounded batch enforces Ned, Arya, Joffrey and Olenna in the authored order and
cadence. Stable announcement and reaction keys prevent racing host tabs from
duplicating the divider or cast, while the durable stagger survives reload. An
existing unkeyed `Show Started` divider remains the mixed-version completion
sentinel, so a room already handled by the legacy bundle is not replayed during
a deploy. Failed new-path generation can still retry because its keyed divider
receipt is distinguishable from that legacy sentinel. Residuals are preserved
under `show_start`; the daemon does not originate this ceremony.

Spotlight openings now follow the contract in the browser. Trigger-owned
`rooms.spotlight_revision` increments on every non-null category transition and
`spotlight_opened_at` records its database time; closing preserves both, so a
later reopen of the same category is a new ceremony rather than a local-set
collision. Old clients that write only `active_spotlight_category_id` inherit the
metadata. Each revision owns a divider key and one grounded reaction key. The
opening projects only the category label as an operator question, its canonical
`category_nominees` roster and exact player wagers. A title never proves its
wording happened, and candidate membership never proves an appearance. The batch
enforces Ned then Cersei at zero/three seconds and replaces both former direct
model callers. A 300ms current-opening grace lets an old bundle's immediate
divider become the legacy sentinel; previous openings with the same text are
excluded by `spotlight_opened_at`. Missing catalog rows, degraded narrative data,
host loss, close or replacement suppress publication, including when state
changes during model work. Residuals survive under `spotlight`; the daemon does
not originate spotlight openings.

The provisional post-show farewell now follows the contract in the browser. The
reusable grounded and staggered ceremony primitive admits the complete seven-person
cast, including seven attempted lines and findings in the private review ledger.
The Results hook owns stable `ceremony:post_show` divider and reaction keys before
model work, treats an unkeyed `Final Standings` row as the mixed-version completion
sentinel, and recovers due deliveries after reload. Its exhaustive facts contain
only the provisional finished phase, exact quoted player roster, complete final
leaderboard with score components, and every wager result; authored category labels
remain game labels rather than screen claims. The batch enforces all seven speakers
at 0/6/16/30/38/46/54 seconds, suppresses settled records and degraded data, and
preserves residuals under `post_show`. The daemon does not originate this ceremony.

Keepsake verdict generation now follows the same doctrine without pretending its
schema is a chat batch. `buildVerdictsPrompt` projects an exhaustive numbered GAME
RECORD for each slot, qualified candidate CHAT RECORD chunks, and a complete
ARTWORK CATALOG RECORD whose metadata never proves a screen event. The strict
batch parser requires every player slot exactly once, unique titles, only offered
message IDs and catalog slugs, and one crest/hero choice at most. A refutation pass
audits the title, passage, highlight notes and imagery notes together; any residual
blocks the whole room and survives under `verdict` in the operator queue.

The host owns one `keepsake:verdicts:v1` claim. A complete legacy player set remains
readable during a mixed-version deploy; a partial legacy set is not completion and
is replaced by `complete_grounded_player_verdicts` in one transaction. That RPC
requires the exact current room player set, stamps the same facts/model/attempt
receipt onto every row, completes the claim atomically, and seals later ordinary
direct writes. Settled records remain suppressed. All current generated prose
surfaces are therefore behind the grounding doctrine; emoji rejection remains a
separate character-policy check, never evidence of factual grounding.

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

## The settlement layer (8/10 — the post-op, made structural)

The day after proved something the night only hinted at: **the game has three
epistemic phases, and we had only designed two.**

- **PRIOR** (authoring): the board is written against a *predicted* episode —
  triggers, odds tiers, 226 wagers. Research level: canon, trailers, discourse.
- **LIVE** (the party): declarations and marks against a *witnessed* episode —
  honor-system eyewitness. High immediacy, low precision. The scoreboard at
  the credits is PROVISIONAL.
- **RECORD** (settlement): the *researched* episode — multi-source recap sweep
  under the two-canons rule, sentiment sweep, marks re-bucketed by timestamp,
  every claim re-warranted against trigger text, ambiguities ruled, amendments
  and corrections dated, the final ledger published as artifacts. This ran in
  ~a day with two research agents. It is not an optional recap; it is the
  clearing house. Like markets: the floor trades live, settlement makes it
  true. Product shape: pre-pack → live night → **settlement drop** — three
  deliverables from one primitive set, and the drop is the thing friends
  actually share.

**Adjudication needs case law, not just contracts.** Two incidents, same
lesson from opposite sides: the Alyn miscall (vivid title, unread fine print)
and the Daeron dispute ("explicitly accepts" — but only his proxy appeared).
Trigger text cannot anticipate everything; the fix is a small body of dated
precedents kept in the record. First entry, ruled by the table 8/10 — **the
Gwayne rule**: an avowed proxy's act, unrefused on screen, accepts for the
principal.

**Trigger-authoring doctrine** (for the next pack): every wager must be
(1) screen-decidable — an eyewitness on a couch can rule it in the moment;
(2) proxy-aware — say whether agents count, deaths off-screen count, mentions
count; (3) honestly titled — the title must promise the same event the
trigger pays. The bingo pool already did this right (win_condition + "what
does not count" notes); the draft beats shipped with one bare sentence each.
Author beats like bingo squares.

**The write-back (executed 8/10 evening; corrected same night).** Settlement
is not complete until the APP agrees with the record — friends open the app,
not the artifact. First attempt routed each player's residual through their
DRAGON as a lump sum: totals landed exact, and then Vhagar — absent from the
episode — was crowned character of the night. THE RULE, from Franky directly:
**never route points through anything that didn't earn them; never move value
outside the main system's own semantics.** Settlement rows are analytics
inputs, not just arithmetic — every downstream lens (character awards, the
Reckoning, breakdowns) trusts their attribution. Final mechanism: fourteen
additive categories, one per True-Accounting ledger line, each paying the
character who actually earned it, at points chosen so the app's own scoring
(person 1.5x rounded, dragon 1x) reproduces the ledger exactly. One documented
distortion: Aegon was live-over-credited by 8 (the "Chooses Aemond" call the
True Accounting struck); additive settlement cannot subtract, so Ulf's line
absorbs -8 (212 in-app vs 220 true). Verified against the live DB: totals
505/212/211/165/55 exact; character board true; Vhagar at zero.

**The settlement command (implemented locally after the post-op).** The reusable
write-back is `scripts/settle-room.mts`. Its manifest is the complete researched
score-bearing record, not a bag of arithmetic adjustments: every resolved event
names the nominee that actually earned it; every staked prediction is explicitly
resolved or voided; bingo explicitly snapshots the approved live marks or
replaces them with a fully warranted set. Every entry carries a true verdict
and sources. `preserve_live` requires one `bingo.warrant`; the command copies it
onto each approved mark in the immutable settlement snapshot. `replace` keeps a
warrant on each authored mark.

Start the research pass with the read-only preparation command instead of
hand-copying IDs and provisional rows:

    npx tsx scripts/prepare-settlement.mts \
      --room CODE \
      --output .private/settlements/CODE-worksheet.json

The worksheet keeps the current canonical record, references and private player
context separate from `manifest_draft`. For a finished room it includes every
provisional declaration and every still-unresolved staked prediction exactly
once, plus the approved bingo marks. For a closed room it begins from the active
researched settlement so an amendment does not discard already-settled facts.
Live winners remain evidence only: new manifest outcomes, winners and warrants
are null until a researcher chooses them. Bingo mode, the exact expected player
and character ledgers, and review for additional unscored facts are explicit
queues. Output is deterministic, refuses replacement without `--force`, and is
confined to direct files under `.private/settlements/` so real names and picks
cannot enter the public tree. Production reads require both
`SUPABASE_TARGET=remote` and `--confirm-room CODE`.

After editing only `manifest_draft`, extract and validate the canonical record:

    npx tsx scripts/prepare-settlement.mts \
      --worksheet .private/settlements/CODE-worksheet.json \
      --manifest-output .private/settlements/CODE-record.json

Finalization is offline. It emits only the settlement manifest allowlist and
contacts neither Supabase nor a model. The manifest parser closes every object
boundary, so private research notes or accidental extra fields cannot alter the
settlement identity. An incomplete decision, missing warrant, or residual
worksheet integrity issue fails before a record file is written.

For a sealed legacy snapshot already represented by the settlement-drop
receipt-prerequisite packet, the equivalent offline bridge consumes its completed
decisions directly:

    npx tsx scripts/compose-settlement-drop-record.mts \
      --packet .private/reviews/CODE-settlement-drop-receipt-prerequisites.json \
      --decisions .private/reviews/CODE-settlement-drop-receipt-prerequisites-decisions.json \
      --snapshot-dir .private/snapshots/SNAPSHOT \
      --output .private/settlements/CODE-record.json

It rebuilds the packet from the exact sealed table bytes, rejects open decisions,
and computes the manifest's expected ledgers through the same pure preview owner
used by `settle-room`. Preserving marks snapshots all approved rows under the
reviewed warrant; declining preservation intentionally authors an empty
replacement ledger because this packet has no replacement-mark field. The
additional-fact boolean means whether any score-bearing facts exist beyond the
candidate rows: `false` permits composition, while `true` requires the full
worksheet so those facts cannot silently disappear. Dry-run is the default,
outputs stay under `.private/settlements`, and this offline composition neither
mints a receipt nor authorizes the separately confirmed room write.

The first invocation is read-only and defaults to the local stack:

    npx tsx scripts/settle-room.mts --room CODE --manifest record.json

Preflight re-runs the app's own scoring and refuses the manifest unless the exact
per-player totals AND exact per-character point ledger match its `expected`
block. Ledger keys, bingo players and entry winners accept stable row IDs or an
unambiguous display name; if two rows share a name, the command refuses the name
and tells the operator to use IDs. The preflight paginates every read, so the
same contract holds after the global show-pack catalog passes 1,000 rows.
Before the apply boundary, it also prints one deterministic settlement delta
from the room's current canonical record to the proposed one. An initially
finished room compares against the provisional live record; an amendment to a
closed room compares against its active settlement. Every fact is shown once as
confirmed, changed, added, voided or struck, followed by player totals,
character points and bingo marks with before/after deltas. This is an operator
lens over the same derived rows, not a second record: it changes neither the
manifest hash nor the RPC payload.
The idempotency hash includes the stable IDs and bingo card positions resolved
from the manifest. In `preserve_live`, each approved mark's timestamp is also
part of settlement identity; a corrected timeline cannot hide under an unchanged
human-readable file hash. Generated preview timestamps for replacement marks are
excluded, so an otherwise identical retry remains idempotent.
Preflight also captures the canonical player identity, confidence, draft,
bingo-card and approved-mark timestamp inputs. The checked RPC locks the room, rebuilds the same JSONB shape
inside its transaction and rejects a mismatch without creating a settlement or
closing the room. Every competing room-input write takes a compatible row lock:
either that write lands before the snapshot comparison and makes preflight
stale, or settlement closes first and the stale write is rejected. They cannot
both commit. The stale-preflight error is deliberately non-retryable; the
operator must rerun the dry run against the newly visible record.
The in-app standings, public results, keepsakes and downloadable recap exhaust
the same ordered PostgREST pages; the operator cannot approve row 1,001 and then
have a canonical consumer silently lose it.
Applying is still one operator action, but deliberately requires the room code
twice:

    npx tsx scripts/settle-room.mts --room CODE --manifest record.json --apply --confirm-room CODE

The complete command path has a dedicated local-only rehearsal:

    npx tsx scripts/dogfood-settlement-command.mts

It reuses the published seed catalog without mutating it, creates one uniquely
named scratch room and unresolved stake, prepares a private worksheet, proves
that no truth decision was inferred, finalizes an explicitly authored record,
then proves the settlement read-only preflight and applies a void-only zero-score
record through the real CLI. It verifies that a wrong room confirmation and an
occupied receipt path both stop before settlement without writing or clobbering.
It verifies the canonical receipt and re-emits byte-identical evidence on retry,
then re-prepares the now-closed room from its active researched record, forces
new title, actor, bingo and expected-ledger decisions, applies a zero-score
amendment, proves that version 2 preserves and
supersedes version 1, and proves the amended receipt is also byte-stable on
retry. Replaying version 1 after that must be rejected as superseded and cannot
emit a receipt. It removes the exact room and temporary files, snapshots the
global catalog before and after, and refuses every remote target.

Add `--receipt PATH` to that applied command when a settlement drop will be
authored. The receipt is written only after the RPC returns the actual settlement
ID and version. It itemizes every canonical draft, prediction, bingo-square,
bingo-line and blackout score event and carries the settled personal cards;
it separately carries every ordered settlement entry as a public-safe fact
timeline, including voids and resolved facts for which the board had no authored
category. Fact titles, timestamps, board status and canonical winner identities
come from the frozen settlement rows; private warrants do not. The receipt also
freezes the room's published show-pack registry ID, pack key and version for the
forward authoring handoff, plus the settlement's own creation timestamp and
nullable superseded-settlement ID. That revision block makes an amendment's
dated chain portable without duplicating the preflight comparison, which cannot
be reconstructed during an idempotent receipt re-emission. Player and character totals are derived from score
events, never copied beside
them. An existing receipt is protected unless `--force-receipt` is explicit.
Forced replacement is atomic and refuses path, symlink and hard-link aliases of
the settlement manifest. Reapplying the same active manifest is an idempotent
way to re-emit lost receipt evidence.

The database RPC is atomic and service-role-only. It appends a versioned,
room-scoped settlement, selects it as the canonical record, writes a public
closure line, and moves `rooms.phase` from `finished` to `closed`. It does not
delete the provisional live rows and never writes a global `categories` row.
Only the checked wrapper is executable by the service role; the legacy inner
function is callable by that security-definer wrapper but not by an operator
client, so the canonical input snapshot cannot be bypassed.
Both bingo modes read only versioned settlement marks after closure; later live
mark edits cannot change the final score.
Closure also freezes anonymous writes to players, draft picks, confidence
stakes, bingo cards and live bingo marks. Referenced authored categories keep
their settled points and tier. Chat, verdicts, beat activations and provisional
winners freeze with them, because those rows still feed recaps or carry the
room's historical record. This is enforced with database triggers so a stale
phone cannot revise any researched surface; service-role repair is still
possible, but any such repair must be written back as a new settlement version
before it is canonical.
After commit, the command performs a second complete read and reconstructs the
receipt from the now-frozen rows. The transactional snapshot check prevents a
stale preflight from closing; the post-close reread prevents stale evidence from
being emitted. `buildPostCloseSettlementReceipt` is the one pure assembly
boundary: it accepts only the closed room, that room's active settlement, the
bound show pack and derived evidence, and rejects any cross-row mixture before
canonical receipt validation.
Composite foreign keys prevent a room or amendment from selecting a settlement
owned by another room, including under privileged manual writes.
Reapplying the same manifest is a no-op; a changed manifest becomes a dated new
version that supersedes the previous one. Production additionally requires
`SUPABASE_TARGET=remote` and `SUPABASE_SERVICE_ROLE_KEY`; applying it remains a
protected operator action requiring explicit confirmation.

For a closed room whose receipt file was never emitted, use the read-only recovery
path instead of replaying an apply merely to recover evidence:

    npx tsx scripts/export-settlement-receipt.mts \
      --room CODE \
      --output settlement-drops/my-show/receipt.json

It uses service-role visibility, paginates the complete frozen record, and calls
the same pure `buildPostCloseSettlementReceipt` owner as `settle-room`. It accepts
only the current active settlement and brackets the read against concurrent
amendments. The bytes are identical to an idempotent receipt re-emission, but the
command performs no database write and needs no historical manifest. Existing
outputs require `--force`; production additionally requires
`SUPABASE_TARGET=remote --confirm-room CODE` and the repository's protected-room
confirmation.

Generated live-night verdict prose is deliberately suppressed under a settled
record: those rows have no settlement-version provenance, so carrying them
forward would present provisional claims as researched ones. Deterministic
titles, stats, timelines, breakdowns and character awards all recompute from the
settlement. Versioned grounded prose belongs to the show-pack factory, not this
command.

**The flywheel.** The settlement pipeline pointed backward at episode N is
the authoring pipeline pointed forward at episode N+1: the same recap mining
builds the entity list, the same sentiment mining writes the discourse
dossier that prices the odds AND feeds the cast's best takes, the same
grounded-generation ships the commentary. Post-op of one show is the
show-pack factory for the next. The witness ladder (layer 4) slots in as
progressively better LIVE warrant — it shrinks the settlement delta but never
kills the settlement phase, because part of what settlement knows (what the
audience felt, what the discourse decided) cannot be seen by any camera
watcher.

The first mechanical handoff is `scripts/generate-show-pack-flywheel.mts`.
Point it at the canonical settlement receipt:

```text
npx tsx scripts/generate-show-pack-flywheel.mts \
  --input settlement-drops/my-show/receipt.json \
  --output show-packs/research/hotd-s3e8-seed.json
```

The schema-v3 byte-stable seed emits the exact three-field predecessor object accepted by
the next pack and binds it to the receipt-attested registry identity and
version, exact settlement, manifest, canonical receipt hash and dated
supersession chain in a separate attestation block. It retains every settled fact and score event once, derives
the complete prior character impact ledger, and exposes resolved settlement
facts plus individual marked bingo squares as operator-record-backed screen-claim
candidates. Draft and prediction rows remain score consequences and do not
duplicate those facts as claims. It deliberately omits player identity, room identity
and personal cards. Adjustments and derived bingo line or blackout bonuses stay
in the evidence ledger but never become screen claims. The command performs no
network or model call, refuses synthetic receipts without `--allow-proof`, and
does not invent the next show's recap, sentiment, predictions, triggers,
portraits, or commentary. Those remain researched show-pack factory work under
the grounding doctrine and two-canons rule.

The recap/sentiment handoff now has a canonical local pen. A researcher writes a closed candidate
file, then `scripts/review-show-pack-research.mts` seals it beside the exact flywheel seed and
exposes canonical `predecessor-screen-*` claims for deliberate cross-check. Every source and claim
remains null in the decision template. `scripts/apply-show-pack-research.mts` accepts only complete
include/omit decisions with specific notes. Recap claims remain `recap` or `unverifiable` unless a
reviewer explicitly binds them to an offered canonical screen claim; sentiment enters only the
discourse canon. `compose-show-pack-flywheel.mts` accepts reviewed research only with its candidate,
packet and decision artifacts, rebuilds the exact result, and rejects detached or edited output.
The lane is local and model-free: it productizes provenance without pretending to do the human
research. Exact commands and candidate shape live in `show-packs/README.md`.

The deterministic factory handoffs now have one resumable operator action:
`scripts/run-show-pack-factory.mts`. It rebuilds the receipt-to-seed and optional reviewed-research
chains, composes the working pack, verifies deploy-owned portraits and writes one immutable run
directory. Pending prose produces the exact plan and self-contained review desk without a model
call; residual findings produce a blocked run unless a human explicitly requests a separately
budgeted retry; fully ready prose crosses the ordinary compiler into `compiled.json`. Continuations
may change only commentary publication records, may never replace an already-ready line, and replay
every step from the canonical composition through its exact reviewed plan and matching authorization
for a changed source-order job prefix. Each run manifest seals authority flags plus input and artifact hashes but
omits local paths. Exact invocation
syntax and the authorization-to-continuation loop live in `show-packs/README.md`; `--generate`
remains the separate human-reviewed model and spend boundary.

After that research has produced an otherwise complete next-show authoring
pack, compose the handoff through the receipt again:

```text
npx tsx scripts/compose-show-pack-flywheel.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --output show-packs/compiled/hotd-s3e8.json
```

The authoring file omits `pack.predecessor`, the reserved
`predecessor-settlement` source and all `predecessor-screen-*` claims, while its
dossiers, wagers and grounded commentary may cite those claim IDs. The composer
rederives the seed from the receipt, rejects any edited evidence or reserved-ID
collision, injects the canonical fields, then runs the ordinary closed-schema,
grounding, doctrine and portrait gates. Its default is a read-only dry run; it
never researches or generates prose itself.

When a pending commentary request cites an injected `predecessor-screen-*`
claim, compose a working authoring pack before generation:

```text
npx tsx scripts/compose-show-pack-flywheel.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --authoring \
  --output show-packs/research/hotd-s3e8-working.json

npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3e8-working.json \
  --output show-packs/research/hotd-s3e8-grounded.json \
  --plan-output .private/reviews/hotd-s3e8-commentary-plan.json

npx tsx scripts/generate-show-pack-commentary-review.mts \
  --plan .private/reviews/hotd-s3e8-commentary-plan.json \
  --output .private/reviews/hotd-s3e8-commentary-review.html

npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan .private/reviews/hotd-s3e8-commentary-plan.json \
  --transcript ~/Downloads/hotd-s3e8-commentary-authorization-transcript.json \
  --output .private/reviews/hotd-s3e8-commentary-authorization.json

npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3e8-working.json \
  --output show-packs/research/hotd-s3e8-grounded.json \
  --approved-plan .private/reviews/hotd-s3e8-commentary-plan.json \
  --authorization .private/reviews/hotd-s3e8-commentary-authorization.json \
  --generate

npx tsx scripts/compile-show-pack.mts \
  --input show-packs/research/hotd-s3e8-grounded.json \
  --output show-packs/compiled/hotd-s3e8.json
```

`--authoring` still enforces the receipt, closed schema, claim lanes, trigger
doctrine and portraits, but deliberately leaves the publication gate open for
pending or retryable grounded prose. Without it, composition requires every
commentary request to be ready and produces the final compiled bundle.

**Show-pack factory, first platform slice (implemented locally 8/10).** The
versioned authoring contract and deterministic compiler now live in
`src/lib/show-pack.ts` and `scripts/compile-show-pack.mts`. A pack keeps verified
screen facts, unverified recap claims, discourse and source-material canon in
separate lanes. Source canon is attitude-only and cannot appear among a screen
claim's warrants. Predictions, signature beats and bingo squares accept only
verified screen or verified discourse basis claims; recap-only, unverifiable and
source-material attitude claims fail closed rather than passing as provenance.
They also cannot compile without explicit proxy, off-screen and mention rules,
an exclusion and an approved title-honesty review; probability-bearing beats and
squares must agree with their tier. Publishable commentary must name the
shared `scripts/grounded-line.mts` pipeline, reproduce the exact verified fact
block, carry its attempt record and have zero residual refutation findings.
Screen facts cannot enter through the attitude lane. Pending or blocked prose
stops compilation.

Schema v3 also makes visual identity pack-owned. Every entity carries one
deploy-owned root-relative raster portrait and its reviewed SHA-256. Compile and
activation both resolve the file inside `public/`, refuse symlink escapes,
prove the browser-raster signature agrees with its reviewed suffix, rehash the
bytes and fail on absence, disguise or drift. The activation plan writes that
verified path to the existing nominee image field; a structurally complete new
show can no longer arrive as a roster of empty image URLs. The publication
transaction separately requires schema v3 and an exact compiled-entity-to-nominee
`pack_key` and image path match, closing the privileged manual-seed bypass;
file-byte verification remains the deploy tooling's responsibility.

The compiled trigger contract is also retained on each normalized prediction,
signature beat and bingo row. A database constraint applies the same restrictive
minimum to every non-legacy show pack, including service-role seed writes that
bypass the compiler: missing doctrine, `unspecified` adjudication or an
unapproved title is rejected. The fixed HotD legacy catalog is explicitly
grandfathered because its wagers predate the structured contract; live,
room-scoped declarations remain facts rather than authored wagers and do not
pretend to carry one. This is enforcement for every next pack without inventing
retroactive approvals for old prose.

The first invocation is a read-only local dry run:

    npx tsx scripts/compile-show-pack.mts --input PACK.json

`--output BUNDLE.json` writes byte-stable sorted JSON and reports its SHA-256;
an existing output requires explicit `--force`. Forced replacement is atomic
and refuses path, symlink and hard-link aliases of the authoring source. The
compiler has no network, model or Supabase path. The authoring schema is closed: unknown fields are
rejected at every level and the public bundle is rebuilt field-by-field, so a
private research note or raw excerpt cannot ride through compilation. Duplicate
fact or attitude references are rejected before they can overweight a claim.
`show-packs/examples/hotd-s3e8-proof.json` is labeled as a representative
migration slice, not a complete activatable pack.

**Room-bound activation (implemented locally 8/10).** `show_packs` is now the
version registry. Every room binds one published pack; authored predictions,
nominees, draft entities, signature beats and bingo squares carry that pack ID,
while live declarations carry their room ID. Existing rows and rooms backfill
to a fixed legacy HotD pack. Every client and canonical reader filters through
the room binding, and database guards reject cross-pack confidence picks, draft
picks, beat activations, bingo cards, winners, spotlights and settlement entries.
Realtime category callbacks apply the same pack-or-room predicate client-side.

`scripts/activate-show-pack.mts` is dry-run by default and requires
`--apply --confirm-room CODE` to write. It refuses partial packs that cannot deal
a 24-square card. The pure activation planner owns the exact compiled hash,
stable registry/catalog IDs and complete normalized row projection, including
candidate links, draft nomination JSON, pair beats and copied trigger doctrine;
the pure layer also owns exact installed-catalog attestation. The CLI owns only
paginated database reads, external collision checks and writes. It installs
that tested plan under a draft registry entry, rereads every pack-owned table,
and publishes only when registry bytes plus every normalized row and candidate
link match exactly. Missing, extra or drifted rows leave the pack in draft.
The pure layer emits the one closed catalog manifest accepted by Postgres. Every
privileged catalog mutation share-locks its registry; the final service-only RPC
update-locks that row, repeats the exact comparison, publishes and binds in one
transaction. A room failure therefore rolls publication back. Direct service
registry updates and the earlier bind-only RPC are revoked. Published packs are
audit-and-bind only through this command, and catalog triggers reject ordinary
service writes to published or retired rows; neither state is upserted. A
database-owner migration is the explicit break-glass path. Dry runs require the same service-visible read boundary so a hidden
draft cannot look absent. Phones retain writes only to room-scoped declarations
and their nominee links; RLS excludes authored rows and signature beats have no
anonymous write grant. The database
only permits service-role binding to a published, playable pack while the room
remains in the lobby with no pack-dependent game state. The local backend
dogfood uses one deterministic retained published fixture plus a disposable
draft probe; it refuses production and proves incomplete-pack rejection,
two-pack isolation and a rejected cross-pack draft write without weakening
published-catalog immutability.

`scripts/audit-legacy-show-pack.mts` now seals the complete local legacy catalog
into a deterministic, non-publishable migration worksheet. Its real local run
proved 20 predictions, 213 candidate links, 38 nominees, 38 draft entities, 275
signature beats, 75 bingo squares and 38 exact verified portraits with no
identity ambiguity or dangling reference. It also exposes 54 historical
divergences across all 11 dragons: the legacy roster's hand-authored nomination
lists name rider-winner categories that do not contain the dragon's nominee.
Schema v3 has one candidate owner, so the worksheet retains those as decisions
instead of choosing a payout rule. It preserves every source row and enumerates
the remaining human boundary rather than manufacturing approvals: those 54
decisions, 38 entity dossiers, 370 wager contracts, plus sources, claims,
commentary voices and grounded requests. Remaining factory work is that
researched authoring and its ordinary compile/activation gates, not catalog
discovery or asset matching.

`scripts/compose-legacy-show-pack.mts` now closes the mechanical handoff without
crossing that human boundary. Its prepare mode projects the audited inventory
into a SHA-bound authoring worksheet whose research decisions remain null or
explicitly unapproved. Its authoring mode requires exact legacy-ID coverage,
a target identity that does not reuse the published legacy source's exact key
and version, explicit candidate ownership for every prediction, complete dossiers and
trigger doctrine, all four global approvals, deploy-owned portrait bytes and a
valid schema-v3 result. Mechanical identity, portraits, titles, points, pair
membership and existing bingo calibration are always rederived from the audit.
The output remains an authoring pack: grounded commentary and ordinary compile
and activation gates still follow. Both modes are local-only, dry-run by
default, refuse input aliases and require `--force` to replace an output. Its
read-only `--status` mode reports every decision lane and open legacy ID, and
reports ready only when that same input passes the complete finalizer.
Preparation also accepts explicit target metadata, a legacy-film kind and the
`audited-category-links` candidate policy. The repository HotD authoring
worksheet uses those flags: all 11 legacy film rows are explicitly creatures,
and every candidate set preserves the category links that actually owned winner
selection and scoring. The 54 draft-nomination-only dragon rows are therefore
resolved as historical drift, not silently promoted into new outcomes.

`scripts/apply-legacy-bingo-authoring.mts` now authors the complete bingo lane
without converting game-balancing intuition into screen evidence.
It binds the immutable audit and `src/data/bingo-master-pool.json` by SHA-256,
requires the explicit 59-ID evidence approval set to exactly equal the
source-backed master rows, verifies every master source against its reviewed
show-pack source and verified claim, and separately requires the 16-ID gameplay
approval set to exactly equal the rows with no external source basis. Every
gameplay row maps to its own verified `authoring` claim, and the sole
`authoring_record` source seals the exact master-pool SHA-256. Schema validation
permits that provenance only for bingo; predictions and signature beats still
require verified screen or discourse claims. The result owns eleven sources, 99
claims and 75/75 bingo contracts. Global review seals remain null until the
complete collections receive their separate review. Dry-run is the default,
`--in-place` is explicit, and repeated application produces the same bytes.

`scripts/apply-legacy-dossier-authoring.mts` owns the next evidence-backed lane.
The audited 38-entity roster exactly matches the canonical encyclopedia's 27
character profiles and 11 dragon profiles. A SHA-bound decision manifest
explicitly approves those 38 legacy IDs; the applicator exact-copies each
profile's cutoff-safe screen state and audience reaction into separate verified
screen and discourse claims and binds those two claims as the entity dossier.
It refuses audit or encyclopedia drift, incomplete or excess coverage, target
drift, duplicates and prior conflicts. The real worksheet now carries 38/38
dossiers, two additional sources and 76 additional claims. The operation does
not generate prose and does not approve the global collections; dry-run is the
default and repeated application is byte-idempotent.

`scripts/apply-legacy-prediction-authoring.mts` owns the 20 prediction rules as
explicit product decisions rather than title-derived heuristics. Its SHA-bound
manifest gives every legacy prediction a condition, exclusions, three-way
adjudication and an approved title-honesty note. The applicator requires exact
decision and candidate-universe coverage, then derives each contract's grounding
basis from every candidate's verified screen-state dossier claim. It refuses
audit drift, unreviewed titles, unspecified adjudication, missing dossiers,
non-screen or unverified basis claims, unknown fields and conflicting prior
contracts. The real worksheet now carries 20/20 prediction contracts. Dry-run
is the default and repeated application is byte-idempotent.

`scripts/apply-legacy-signature-calibration.mts` fills the independent pricing
lane without claiming trigger review. The SHA-bound manifest maps the four
legacy odds-and-points pairs to the restrictive intersections of the published
signature-beat bands and schema-v3 tiers: Likely 60%, Coin flip 40%, Long shot
20% and Wild 9%. The one-episode WDKH calibration report remains descriptive,
per its own caveat, and does not retune these values. The applicator requires
exact pair and beat coverage, refuses audit drift, schema-inconsistent tiers and
conflicting prior calibration, and leaves every trigger contract untouched. The
real worksheet now carries 275/275 probabilities and likelihoods while all 275
beat contracts remain explicitly open. Dry-run is the default and repeated
application is byte-idempotent.

`scripts/apply-legacy-signature-death-authoring.mts` owns the first exact
signature-trigger family. The SHA-bound manifest explicitly approves the 37
audited `Dies` IDs: 26 person beats preserve their legacy condition and allow
only unambiguous off-screen confirmation, while 11 creature beats preserve the
legacy on-screen-only rule. Every contract cites its owner's verified
screen-state dossier claim, rejects ambiguous wounds, disappearances, visions
and pre-episode deaths, and carries an approved title-honesty note. The
applicator requires exact audited death-batch coverage and correct owner kind,
refuses drift and prior conflicts, and leaves all other beats null. The real
worksheet now carries 37/275 signature-beat contracts; repeated application is
byte-idempotent.

`scripts/apply-legacy-signature-batch.mts` is the reusable partial-batch path
for the remaining trigger families. Each manifest explicitly names reviewed
legacy beat IDs, preserves the audited condition verbatim, supplies exclusions,
adjudication and title review, and names every entity whose dossier grounds the
event. The applicator requires the audited owner in that basis and refuses
unknown IDs, unverified screen claims, source drift, unspecified doctrine and
prior conflicts. The first batch covers the four mirrored Rhaenyra/Mysaria
rows: both copies of their romantic interaction and both copies of Rhaenyra's
explicit rejection now share the same rule and cite both participants. The real
worksheet now carries 41/275 beat contracts and repeated application is
byte-idempotent.

The next explicit batch covers all six audited dragon sorties. Each contract
preserves its distinct legacy condition, requires the named rider and dragon to
enter an active mission, pursuit, reconnaissance, interception or battle as the
row specifies, and excludes transport, escape, ceremony and inactive patrols.
Every row cites both rider and dragon dossiers, including the mirrored Baela and
Moondancer cards. The real worksheet now carries 47/275 signature-beat
contracts; 228 remain open.

`scripts/apply-legacy-signature-family.mts` handles repeated owner-grounded
families without weakening explicit review. A compact manifest may share
doctrine across a family, but it must still list every approved legacy beat ID
and copy every audited condition under that ID; the applicator requires exact
condition-map coverage and rejects repeated IDs across families. The first
manifest reviews all 25 `Kills` rows and 24 `Clashes` rows. Kills require the
owner to personally cause a visible death, including direct command of their
own dragon but not merely ordering others. Clashes require a direct heated
on-screen confrontation with another named character and settle once per
episode. Both families reject proxy, off-screen and mention-only evidence and
cite the owner's verified screen-state claim. The real worksheet now carries
96/275 beat contracts; 179 remain open.

The explicit relational batch adds 20 two-party contracts without treating a
card's nominal owner as the whole event. It covers mirrored Daemon/Rhaenyra
reconciliation, Aemond/Alicent accusation, Aemond/Vhagar reunion,
Aegon/Sunfyre flight, the Aegon/Larys reunions, Baela/Alyn kisses,
Rhaena/Sheepstealer return and rejection, Kat/Hugh departure, Alicent/Aegon
reunion and Corlys/Alyn reunion. Every row preserves its audited condition,
cites both participants' verified screen-state claims and rejects off-screen,
mention-only, dream, vision and near-event substitutes as appropriate. The real
worksheet now carries 116/275 beat contracts; 159 remain open.

The compact family manifest now optionally carries an exact per-beat grounding
entity map. When present it must cover the same explicit ID set as the condition
map and include each row's audited owner; this lets repeated relational rules
cite every named participant without copying shared doctrine per row. The first
use is the 27-row direct-opposition family: refusals, rejections,
confrontations, defections, overrulings, circumventions and visible dragon
disobedience. Every row rejects pre-existing attitude, inferred intent, proxy,
off-screen, mention-only, dream and vision substitutes and cites its explicit
counterparts. The real worksheet now carries 143/275 beat contracts; 132 remain
open.

The 29-row explicit-declarations family separates words and declared choices
from later consequences. It covers orders, punishments, warnings, comfort,
forgiveness, stated objectives, threats, acknowledgments, requests, voluntary
choices and recommitments whose utterance or declaration is itself the audited
event. The shared exclusions reject implication, private intent, paraphrase,
proxy, off-screen and dream/vision substitutes while preserving any additional
action boundary written into a row's immutable condition. Each row cites every
named authored participant. The real worksheet now carries 172/275 beat
contracts; 103 remain open.

The 12-row visible-dragon-actions family covers physical rider interaction,
active flight, dragon-on-dragon attacks, battlefield fire, a dragon kill,
response to a rider, reappearance and an attack on the opposing faction. It
requires present-timeline screen evidence and rejects ordinary presence,
preparation, transport, inferred outcomes, proxy action, recap, report, dream
and vision substitutes. Each row cites the exact rider, dragon and target named
by its immutable condition. The real worksheet now carries 184/275 beat
contracts; 91 remain open.

The 12-row directly-visible-actions family covers observable state and physical
action without grouping in intent or downstream causation: crying, medical
treatment, regaining consciousness, returning to custody, overt magic, moving
eggs, joining an attack, guarding or wounding a captive, attempting escape,
post-battle survival and an arrow visibly hitting its target. It rejects plans,
threats, inferred states, proxy outcomes and all off-screen substitutes while
preserving the few attempts explicitly named by an immutable condition. The
real worksheet now carries 196/275 beat contracts; 79 remain open.

Six final evidence-shape families close the signature-beat ledger without a
catch-all doctrine: 10 direct two-person scenes, 11 consequential command
outcomes, 18 direct protective actions, 27 deliberate decisions, eight causal
information and plan outcomes, and five direct combat actions. Each family
preserves every immutable trigger, cites the authored participants it names and
sets a restrictive proxy/off-screen/mention rule appropriate to its settlement
evidence. All six manifests reapply byte-idempotently to the completed artifact.
The real worksheet now carries 275/275 signature-beat contracts; none remain
open. The 16 bingo squares with empty canonical `source_basis` do not borrow
unrelated dossier claims. They are approved in a separate gameplay lane as
judgeable authored game texture, with one exact claim per square and a shared
authoring record sealed to `src/data/bingo-master-pool.json`. This provenance can
warrant a bingo contract only; it says nothing about what prior screen canon
predicts. The worksheet now carries 75/75 bingo contracts with zero open IDs.

A SHA-bound commentary authoring stage now owns the next pre-generation step.
`scripts/apply-legacy-commentary-authoring.mts` validates explicit cast voices
and pending requests against the current authoring target and claim inventory,
rejects screen facts in attitude/angle lanes, rejects non-screen facts in the
fact lane, refuses generated output, preserves all four global review flags and
never calls a model. The first manifest adds the established seven-person cast
and seven requests, each with one verified screen fact and one verified audience
angle. It applies byte-idempotently; approval and grounded publication remain
separate human/model boundaries.

The authoring worksheet is now version 2 and replaces bare global-review
booleans with nullable `{sha256, note}` seals. Each seal hashes its collection
and every upstream dependency: source changes invalidate all four reviews;
claim changes invalidate claims, voices and requests; voice changes invalidate
voices and requests. Collection-mutating authoring stages clear stale dependent
seals automatically. `scripts/review-legacy-show-pack-globals.mts --plan` prints
the canonical hashes but infers no approval; applying an explicit decision
manifest verifies the expected hashes and review notes before writing. The
current worksheet was migrated with four null seals, so its approval state is
unchanged.

`scripts/review-legacy-show-pack-globals.mts --packet FILE` closes the review
handoff without crossing that human boundary. It first projects the complete
non-review worksheet through schema v3, then emits every source, claim, voice and
request with its exact dependency hash, upstream hashes, current seal state and
canon-specific review checklist. Packet v2 separates blocked collections from
an unblocked-only decision template, deliberately uses null notes, and cannot
be applied unchanged. Already-current collections are omitted from that
template; partial manifests may stop after any reviewed stage. Downstream
approvals require current upstream seals or upstream decisions earlier in the
same manifest, so claims cannot appear reviewed before sources and voices cannot
appear reviewed before claims. Packet output is alias-safe,
overwrite-protected and deterministic. Pending or blocked grounded commentary
is a hard blocker for the request seal itself; the source, claim and voice
collections may still be reviewed independently. The current HotD packet reports
11 sources, 99 claims, seven voices and seven requests, with all seven request
publications still pending.

Add `--decision-template FILE.json` to emit the exact staged null-note template
as machine-readable JSON beside the Markdown packet. Packet v3 seals that
sidecar's SHA-256 in its header. Both outputs are fully serialized and checked
before writes; the sidecar is published first and the Markdown doorway last, so
an interrupted run never publishes a packet pointing at an unwritten template.
The sidecar remains invalid until a human writes specific attestations and may
be omitted entirely. It grants no approval.

The packet now also has a standalone mobile review doorway generated by
`scripts/generate-legacy-global-review-html.mts`. The command rebuilds the
packet from the exact legacy and authoring worksheets and refuses stale
Markdown or a stale or broadened decision template before producing HTML.
Sources, claims and voices appear in dependency order; claims stay grouped into
screen, discourse, source-material and authoring canons, while unpublished
commentary requests remain visibly deferred. The artifact has no scripts,
forms, external resource loads or approval controls. It presents evidence but
does not become a second review owner.

The same command can emit a separate offline human-attestation desk with
`--attestation-output FILE.html`. The evidence doorway remains inert; the desk
shows only collections currently open and unblocked in the exact decision
sidecar. A reviewer must explicitly include a collection, acknowledge every
published check and write a nonblank attestation. Downstream review cannot skip
an open upstream collection. The desk can download a local attestation
transcript, but has no database, model, network or worksheet-write path and
never creates or applies a decision.
`scripts/build-legacy-global-review-decisions.mts` rebuilds the exact packet,
checks both sealed artifact hashes and uses the canonical pure decision builder
to turn that transcript into a decision manifest. The result still must pass
`review-legacy-show-pack-globals.mts` before a separate deliberate `--in-place`
action. Easier authorship therefore does not collapse evidence review,
attestation, decision construction, validation and application into one
authority.

**Grounded commentary batch (implemented locally 8/10).**
`scripts/publish-show-pack-commentary.mts` turns pending commentary requests into
stamped ready or blocked publications by calling only `scripts/grounded-line.mts`.
Its default is a read-only plan; `--generate` is the explicit model/cost boundary.
The authoring input and all of its filesystem aliases are protected, and the
working output is atomically checkpointed through the same safe writer after
every completed request, so a later API failure can resume
with `--resume` without paying for or rewriting finished lines. Ready requests
stay frozen. Blocked lines only retry under `--retry-blocked`. Each output carries
the exact speaker, pack-owned voice block, verified fact block, angle block,
attempt count, residual refutation findings and a SHA-256 of the complete
prompt/model/transport contract; changing any input or generation contract
invalidates the publication stamp. Older schema-v3 publications without that
digest remain readable, while every new batch writes it. Voice instructions live once in the show pack and
may cite only source-material `attitude_only` claims; screen facts cannot enter
through that lane. `grounded-line.mts` now uses a show-neutral system prompt
rather than importing the HotD companion cast. Any residual keeps the pack
non-publishable. The underlying single-line loop is
now bounded on malformed model output, parses auditor clearance through the
same restrictive pure contract, and surfaces non-2xx API responses instead of
spinning forever.

Legacy migration worksheets use the same publisher through an explicit audit
binding:

```text
npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --plan-output .private/reviews/hotd-s3-finale-commentary-plan.json
```

That mode projects a schema-v3 working pack only after every non-review lane
passes the ordinary schema and doctrine checks, then checkpoints only the
publication stamps back into a cloned legacy worksheet. Null global review
seals remain null; any stale non-null seal blocks projection. The default plan
still makes no model call and writes no working pack; `--plan-output` writes only
the hash-bound generation plan. Plan v5 lists every eligible request in source
order with the exact speaker, voice, exhaustive fact block and angle block, plus
the canonical initial model request, audit request template, retry request
template, model, token ceiling, retry count and Anthropic transport settings
that `grounded-line` will execute.
The planner and runtime import those requests from one pure prompt-contract
owner; generation consumes the validated plan jobs rather than reconstructing a
parallel batch. A plan is evidence, not permission. Render it with
`scripts/generate-show-pack-commentary-review.mts`; the standalone 375px desk
shows every voice/fact/angle block, model, retry contract, transport setting and
the complete first-pass/worst-case spend envelope. It has no network or model
path and downloads only a human review transcript. Then build a canonical
authorization with `scripts/build-show-pack-commentary-authorization.mts`.
That builder requires every planned request in source order, the exact plan
hash, the complete unchanged budget and a nonblank human note. Generation
requires both the same plan as `--approved-plan` and its separate
`--authorization`; any source bytes, target, selection, retry policy, job order,
prompt input, grounded-line contract, plan hash or budget drift fails before
the model module is imported and again inside the pure publication function.

The same artifact carries a derived spend envelope with a first-pass and
bounded worst-case count of generation calls, audit calls and configured output
token ceilings. Those values come from each job's reviewed contract. They are
not predicted usage and not a price; `currency_estimate` remains null rather
than laundering a stale rate into approval. Input-token cost is likewise not
estimated, because the artifact has no canonical tokenizer and future audit
inputs include the as-yet-unknown generated line; `input_token_estimate` remains
null. For the current seven-job HotD
batch, first pass is 7-14 calls / 4,200 maximum output tokens and the bounded
three-attempt case is 21-42 calls / 12,600 maximum output tokens. The lower
call edge represents malformed generator responses that never reach audit; the
upper edge represents every generation producing a parseable line that is
audited.

Authorization can be staged with repeatable `--request REQUEST_ID` flags. The
planner validates every ID, rejects duplicates and ineligible work, normalizes
the selected jobs into canonical pack order, and derives the budget from only
that subset. The exact normalized selection is part of the approved artifact;
generation cannot expand beyond it. For example, inspect two lines without
authorizing the other five:

```text
npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --request ned-sheepstealer-record \
  --request arya-black-aly-arrow \
  --plan-output .private/reviews/hotd-s3-finale-commentary-two-line-plan.json
```

Use the same `--request` flags with `--approved-plan`, `--authorization` and
`--generate`; changing the selection invalidates the plan before model loading.
On `--resume`, selected
IDs already stamped ready are removed automatically, so the same requested
batch can be replanned without hand-editing its selection. Unknown IDs and
blocked IDs without `--retry-blocked` still fail closed.

```text
npx tsx scripts/generate-show-pack-commentary-review.mts \
  --plan .private/reviews/hotd-s3-finale-commentary-plan.json \
  --output .private/reviews/hotd-s3-finale-commentary-review.html

npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan .private/reviews/hotd-s3-finale-commentary-plan.json \
  --transcript ~/Downloads/hotd-s3e8-commentary-authorization-transcript.json \
  --output .private/reviews/hotd-s3-finale-commentary-authorization.json

npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --approved-plan .private/reviews/hotd-s3-finale-commentary-plan.json \
  --authorization .private/reviews/hotd-s3-finale-commentary-authorization.json \
  --generate
```

Resume requires a newly emitted plan against the checkpointed output, because
the source hash and remaining-job list have changed:

```text
npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --resume \
  --plan-output .private/reviews/hotd-s3-finale-commentary-resume-plan.json

npx tsx scripts/generate-show-pack-commentary-review.mts \
  --plan .private/reviews/hotd-s3-finale-commentary-resume-plan.json \
  --output .private/reviews/hotd-s3-finale-commentary-resume-review.html

npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan .private/reviews/hotd-s3-finale-commentary-resume-plan.json \
  --transcript ~/Downloads/hotd-s3e8-commentary-authorization-transcript.json \
  --output .private/reviews/hotd-s3-finale-commentary-resume-authorization.json

npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --resume \
  --approved-plan .private/reviews/hotd-s3-finale-commentary-resume-plan.json \
  --authorization .private/reviews/hotd-s3-finale-commentary-resume-authorization.json \
  --generate
```

The planning command reads but never rewrites the checkpoint. A
commentary-complete output can still report `authoring_ready=false` until all
four collections are separately reviewed.

**Settlement-drop generator (implemented locally 8/10).**
`src/lib/settlement-drop.ts` defines the show-neutral ceremony contract and
renders it as one offline HTML file. `scripts/generate-settlement-drop.mts` is a
local dry run unless `--output` is explicit. It resolves only local image files,
embeds them as data URIs, escapes all authored text, installs a restrictive CSP,
makes no external request, and reports deterministic bytes plus SHA-256. The
legacy migration doorway is `scripts/audit-settlement-drop-migration.mts`: it
seals the current hand-built ceremony and its presentation contracts, inventories
mechanically recoverable lanes, and writes only when given an explicit local
`--output`. It never upgrades labels or layout order into settlement evidence.
The companion `scripts/extract-settlement-drop-assets.mts` has now decoded all 35
WDKH data-URI portraits and sigils into a new immutable private handoff. The
audit verifies its exact source seal, complete ID set, confined paths, raster
signatures, byte counts and file hashes before retiring extraction as a blocker;
alt text and semantic assignments remain explicit authoring work. A read-only
semantics packet now resolves exact byte-identity consumers from the true
ceremony's structured state: 23 character portraits, ten pundit placements and
five player-sigil placements. It leaves every approval null; `alyn.webp` remains
the one asset with no structured consumer or observed label.
The global migration audit now rebuilds that semantics packet from the exact
ceremony, embedded asset collection and extraction manifest before reporting 35
explicit asset approvals; the earlier broad discovery warning is retired without
authoring any alt text or assignment. A second read-only
packet now preserves the complete 29-slide source order, four act boundaries,
twelve beat slides, four running tables, all eleven runtime-proven take-group
joins and eleven of twelve scored beatline candidates. Each candidate retains
its token-overlap score and runner-up rather than claiming canonical identity.
Empty `B12` remains unresolved; every compiler act,
scene, interstitial, beat, weight, copy, portrait and join approval remains null.
The legacy player bridge is now equally explicit: the ceremony's five `PIDS`
UUIDs join exactly to the five WDKH snapshot player UUIDs, with complete tiers,
personal-edition and board coverage. One display-name variant is preserved as
evidence, not normalized. The paired decision file leaves all five canonical
names null, and the migration audit rebuilds that packet from the sealed source
and snapshot bytes before accepting it.
The nine quotes containing legacy HTML now have their own sealed review packet
too. Every case is one balanced bold span; the packet records its exact text
offset and a mechanically stripped candidate while leaving both final copy and
emphasis treatment null. The escaping compiler is unchanged, so no raw HTML is
promoted into the reusable primitive.
The last pre-settlement snapshot now has a sealed receipt-prerequisites packet:
27 candidate outcome rows, five players, 23 draft picks and 40 bingo marks, plus
five explicit schema-era gaps. Because that capture has phase `finished`, no
active settlement and no settlement rows in the reviewed inputs, it certifies that canonical receipt
recovery is impossible from those bytes alone. All settlement decisions remain
null and the missing-receipt blocker stays active.
The five review lanes now have one private approval docket. It binds the exact
migration audit plus every packet and canonical decision-file hash, verifies the
room and exact packet identity sets, and rejects unknown, missing, duplicate,
mistyped or stale decision shapes. Docket v2 distinguishes conditional required
values from optional nulls: omitted acts and beats do not demand dormant copy,
while included structure and preserved bingo evidence open their dependent
requirements. The untouched WDKH files currently expose 147 truth-bearing open
values across 96 decision units. `complete` means required values are present,
not that a lane is approved, migration-ready or settled. The docket remains only
an index: it owns no decision values and cannot approve a manifest.
That docket can now be rendered as one standalone, mobile-first private review
document. The renderer rechecks every packet and decision-file hash plus every
embedded asset's confined path, signature, byte count and digest. Each lane shows its required and
open count, with exact paths behind a native disclosure so long queues do not
bury the evidence. The document has no scripts, forms or external URLs and only
points back to the canonical decision files, so making the evidence easier to
judge does not create a competing write surface.
This matters because the hand deck places Act IV's table between beats while the
reusable grammar owns one post-act interstitial; observation is not silently
converted into a compiler decision. The WDKH audit currently blocks on the
missing canonical receipt, five explicit canonical-name approvals, ungrounded pundit copy,
receipt-unlinked ledger rows, asset semantics, nine quote copy/emphasis approvals and explicit
compiler-structure approval. Its source files
remain untouched under the post-op single-writer protocol.
The
authoring boundary is strict: the drop references the receipt emitted by
`settle-room` through a confined path and exact digest. Authored ledger lines
contain only receipt event IDs: attribution, kind, canonical label and points all
come from the receipt, every event must appear exactly once, and final totals are
derived rather than duplicated. Every nested manifest object rejects unknown fields,
so private notes, stale scores and raw model output cannot hide inside a valid drop.
The command rebuilds that evidence from a mandatory
post-close reread, after anonymous score inputs are frozen; it never emits the
provisional preflight snapshot. Player names, the complete draft-entity roster,
entity names and ownership, and personal cards also come only from the receipt.
An honest `no_card` line contains only the ID of a resolved unscored settlement
fact. The compiler supplies its visible canonical title, rejects authored
replacement text, duplicate use, void or authored-board facts, and any resolved
unscored fact omitted from the ceremony. Legacy receipts still parse, but a
no-card callout requires the receipt to be re-emitted with the fact timeline;
the forward flywheel also requires re-emission with revision provenance.
`--force` replaces the output atomically but refuses path, symlink and hard-link
aliases of the authoring manifest, receipt or an embedded source asset. Character
trigger drawers use receipt event IDs for every fired row, so their labels and
points cannot be authored a second time; only quiet hypothetical rows retain
authored copy. When a declaration came from a reviewed signature beat, its row
also freezes the exact source contract. Settlement projects that immutable link
into the receipt, and the drop renders the condition, exclusions, proxy /
off-screen / mention policy, title-review note and claim IDs from that receipt.
Manual calls and legacy beats stay non-expandable instead of borrowing prose by
name. Ownerless characters stay in the muster as `Unclaimed` and cannot receive
ledger points. Every player and every draftable entity must carry a registered
portrait asset; the compiler rejects an omitted portrait instead of silently
substituting an initials monogram. Decorative beat art remains optional.
Every receipt card has exactly one marked free cell in the center.

Muster hierarchy is derived inside each player's roster: `lead` and `support`
sort by net fired drawer points and receive a descending ordinal scale, while
`present` and `absent` wrap as smaller, quieter tiers. Impact-only, mixed and
rest-only rosters choose adaptive grids. Every character remains visible and
opens its wager sheet through an explicit chevron affordance and accessible label.

Each act also owns one registered interstitial cast portrait. The compiler renders
it as a 112px square frame with a separate offset rule and a 92px circular crop,
beside the complete running leaderboard. The frame uses no glow and cannot fall
back to a monogram because an absent or unknown act asset fails compilation.

Beat ledgers preserve receipt granularity. Every canonical `bingo-square:*` event
is a separate authored reference and therefore a separate visible row with the
bingo grid hallmark, the player who marked it and its own points. Multiple squares
cannot collapse into one sentence because the compiler requires every receipt event
exactly once. A signed correction may take the canonical player total below zero; the
ceremony preserves and ranks that value without clamping it, and calls the field level
only when the complete running table is tied at zero. Draft and character
adjustment rows use the paying character's 28px
square portrait; prediction-only rows retain the player's mark.

The pre-curtain sequence has one explicit threshold. Opening, muster and the
dedicated `begins` slide keep the self-contained velvet panels closed; advancing
from `begins` into Act I parts them. Back navigation closes them again at the same
boundary, and reduced-motion clients get the state change without animation.

Expandable full-rule trigger drawers are now implemented on the truthful path.
`categories.source_signature_beat_id` and `source_trigger_contract` are an
all-or-nothing, immutable declaration-time pair. Postgres permits the pair only
for a reviewed beat in the room's show pack and requires the frozen JSON to equal
that beat's exact canonical contract. It also keeps the declaration fact and
points bound to the beat on every update; paired collision beats permit only the
operator's two character-qualified labels. The settled-category projection
preserves both fields, receipt parsing independently rejects incomplete or
implicit rules and permits them only on character-draft events, and the ceremony
expands only receipt-owned provenance. The past private artifact
cannot acquire this history retroactively: its legacy rows stay non-expandable,
and private `trig` prose is never name-matched into a canonical receipt.

Pundit copy is admissible only with the exact `scripts/grounded-line.mts` stamp,
a non-empty fact block and zero residual refutation findings. The generated
grammar includes the opening, tiered muster, show-begins threshold, act dividers,
ordinary/death/betrayal weights, no-card honest gaps, multi-quote desk with
reference chips, act interstitials, final ranking, character trigger drawers,
personal-edition gate and closing doorway. Interstitial and final ranks follow
the live game's cascade: total score, confidence score, correct-pick count, then
highest correct pick. A true tie keeps a shared competition rank and names every
co-champion in the finale. The synthetic, non-party proof lives at
`settlement-drops/examples/proof.json`:

    npx tsx scripts/generate-settlement-drop.mts \
      --input settlement-drops/examples/proof.json --allow-proof

Writing an artifact requires `--output CEREMONY.html`; replacing one requires
`--force`. The current hand-built party ceremony remains the true shipped
artifact until its private content contracts are deliberately migrated into a
drop manifest under that artifact's single-writer protocol. `--allow-proof` is
accepted only for deliberately synthetic receipts; a real receipt emitted by
`settle-room` does not require it. Proof output is visibly labeled as synthetic
on every slide and overlay; it must never be presented as a settled room record.

Grounded pundit publication has its own authority boundary. First render the
approved quote-grounding plan with
`scripts/generate-settlement-drop-quote-authorization-review.mts`; the offline
page can only download a transcript and shows every warranted fact, omission,
prompt contract and bounded spend. Build canonical authority with
`scripts/build-settlement-drop-quote-authorization.mts`. Then run
`scripts/publish-settlement-drop-quotes.mts` without `--generate` to rebuild the
plan from the current packet and decisions and validate the whole chain without
model access. Only a deliberately authorized `--generate` run can import
`grounded-line.mts`. It checkpoints after every job, resumes only pending jobs,
preserves residual findings as blocked output and emits compiler-ready
`manifest_quote` rows only when every job is clean. A blocked quote needs revised
reviewed decisions, a new plan and new authority; the exhausted plan is not a
retry token. Exact commands and path contracts live in `settlement-drops/README.md`.

Final manifest composition is now implemented as a closed, local artifact chain.
`scripts/review-settlement-drop-final-authoring.mts` exposes only the remaining
noncanonical presentation choices and accepts portrait candidates only from approved structured
asset assignments. `scripts/compose-settlement-drop-manifest.mts` rebuilds the final-authoring and
receipt-binding packets, binds the quote packet to the exact receipt, beatlines, structure, asset
and binding bytes, accepts only a fully ready authorized quote publication, routes canonical
receipt evidence into reviewed beats, and runs the finished manifest through the real compiler.
It is dry-run by default, calls neither Supabase nor a model, and refuses source aliases or an
output whose receipt reference does not resolve to the exact supplied receipt. This closes the
factory seam from reviewed legacy evidence and a canonical settlement receipt to reusable
`drop.json`; HTML rendering remains the separate deterministic `generate-settlement-drop.mts`
step. The exact command sequence lives in `settlement-drops/README.md`.

The reusable proof was also walked in headless Chrome at 375×812 across all 13
slides, both scroll endpoints, character and trigger drawers, both quote positions,
the personal gate, valid and invalid player deep links, focus trap / restore,
Escape close and navigation boundaries. The walk found that Chrome may expose Web
Share on a standalone `file:` artifact but terminate the renderer when given its
player URL. Generated drops now call native share only for HTTP(S) URLs accepted by
`navigator.canShare`; offline files use the existing clipboard / address-bar path.

## The mobile grammar (8/10 — from the phone-frame pass)

A full screenshot pass of the ceremony at 375×812 (headless Chromium walking
every slide and stage; shots read and reviewed one by one) surfaced a set of
rules that are not artifact-specific — they are the platform's mobile grammar:

1. **The reserved-chrome contract.** Every fixed overlay (commentary desk,
   race strip, nav) must publish its height, and every content layer pads to
   the sum of what's below it. Every overlap bug found was a violation of
   this one contract. When chrome can grow (long quotes), cap it (max-height)
   and fade the boundary — a soft shadow reads as intentional; a mid-glyph
   slice reads as broken.
2. **Scroll-safety.** Any screen can exceed a phone. Every screen scrolls,
   scroll position resets on entry, and an overflowing column is NEVER
   flex-centered — `justify-content:center` + overflow makes the top of the
   content unreachable (the muster bug, twice).
3. **Auto-zoom analytics.** A live time-series scales to the max SO FAR, not
   the final value — early game must be as readable as the finale. Labels get
   collision handling (sort by value, enforce a minimum gap). This is the
   shared leaderboard-graph primitive.
4. **One gesture, then quiet.** Hints teach once and retire on first use.
   Navigation affordances live at the screen edges (bottom corners, 44px),
   never mid-content where they fight the ledger.
5. **Cascade discipline (single-file artifacts).** Iterative patches append
   CSS out of order; keep one FINAL-OVERRIDE block at the end of the sheet
   and put corrective rules only there. (A rule above the base rule silently
   loses — that was the muster fix that "didn't apply.")
6. **The walker is the QA primitive.** A ~40-line playwright script that
   arrows through every state at phone size and screenshots each is the
   difference between believing a screen works and seeing it. Run it after
   every visual change; read the images, not the code.

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

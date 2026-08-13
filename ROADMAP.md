# Platform tactical plan

**Status:** canonical build plan

**Updated:** 2026-08-12

**Doctrine and live operations:** [`RUNBOOK.md`](RUNBOOK.md)

**Repository contract:** [`AGENTS.md`](AGENTS.md)

This is the prioritized plan for turning the two proven live games into a
reusable platform and then extending that platform from one-night events to
season-long campaigns. Update the checkboxes and the decision log as work lands.
Do not create a second roadmap for the same work.

## North star

The platform is for **commitment under unfolding canon**:

> People care enough about what happens next to commit to a belief before a
> shared canon resolves it. The room witnesses the resolution, settles the
> commitments and remembers the consequences.

Winning is one form of resolution. Survival, betrayal, romance, allegiance,
identity, transformation, revelation and a long-held theory becoming true or
false are equally valid.

The product is strongest when a property has:

- a shared unfolding canon;
- named people, characters, teams or factions;
- genuine uncertainty and plausible disagreement;
- moments that materially change what people believe;
- enough emotional investment for public commitment;
- a group-viewing or recurring discussion rhythm; and
- a satisfying point at which earlier convictions can be settled.

## Product rule

**Drafting may create identity and rivalry, but it must not determine what a
player is allowed to believe.**

For story-driven shows, the default is a whole-cast conviction board. A player
may claim a dragon, faction, banner or favorite as an identity while remaining
free to make calls about every character. Exclusive character ownership is an
optional game rule, not a platform assumption.

## What is already proven

Two opposite event shapes have run on the same declared-fact spine:

| Proven model | Event shape | Truth enters through | Player commitment |
| --- | --- | --- | --- |
| Results Night | Structured slate of known outcomes | External official result | Picks and confidence |
| Story Night | Open field of possible story events | Room declaration, with an AI witness ladder | Whole-board conviction portfolio |

The reusable foundation is already substantially implemented locally:

- declared facts as the canonical spine;
- cascading scores and a room-wide record;
- settlement receipts, write-back and room closure;
- room-bound show packs and a resumable authoring factory;
- trigger-authoring doctrine and grounded generation;
- operator lens, review queues and the AI witness proposal rung;
- a twelve-slot whole-board conviction portfolio with lonely-bet payouts;
- an optional one-dragon identity draft for the current story pack; and
- a reusable settlement-drop ceremony compiler.

The live implementation still couples too much behavior to two room-level
values. A show pack has one `fact_source`, and that source selects one
`game_model`. That cannot honestly represent a hybrid event or a campaign.

## The composable dimensions

These dimensions must become independently configurable. Avoid adding a new
hard-coded game mode for every genre.

| Dimension | Initial supported choices | Canonical owner |
| --- | --- | --- |
| Truth authority | Official result; operator declaration; AI proposal with human confirmation | Proposition or trigger |
| Commitment instrument | Outcome pick; confidence allocation; open conviction; exclusive entity; long-running thesis | Show-pack game contract and authored proposition |
| Scarcity | Fixed belief budget; exclusive ownership; both; neither | Show-pack game contract |
| Identity | None; drafted emblem/entity; chosen faction/banner | Show-pack game contract plus room selection |
| Duration | One event; episodic tournament; season campaign | Campaign and installment records |
| Settlement cadence | Immediate; installment checkpoint; season finale | Proposition plus installment contract |
| Visibility | Open belief counts; sealed until lock; hidden until resolution | Show-pack game contract |
| Continuity | No carryover; cumulative standings; complete canon and character write-back | Campaign policy |

Restrictive defaults apply. Unknown truth cannot settle a commitment. AI may
propose, summarize and ground prose; it does not silently become the authority
that declares screen canon.

## Product shells

Only three primary player experiences are planned. Other genres should be
compositions of these primitives.

### Results Night

Known outcome slate, official truth and confidence allocation. Awards shows are
the reference case.

### Story Night

One episode or finale, whole-cast convictions, optional identity ceremony,
human or AI-assisted witnessing and one final settlement. Prestige television
is the reference case.

### Campaign

Multiple installment rooms joined by persistent membership, conviction history,
episode settlements, evolving canonical character state and a final season
ceremony.

Reality competitions, Eurovision, pro wrestling and narrative sports products
are hybrids built from these shells, not separate engines.

## Priority map

```text
P0  Close and prove the current platform foundation
 |
P1  Make the game contract explicit and composable
 |
P2  Productize the reusable Story Night loop
 |
P3  Author and rehearse the next real event
 |
 +-------------------- next-event readiness line --------------------+
 |
P4  Add campaigns as containers of installment rooms
 |
P5  Add historical, revisable convictions
 |
P6  Write settled canon into evolving character state
 |
P7  Build the between-installments campaign home
 |
P8  Build the season ceremony and campaign recap
```

Do not begin P4 as a substitute for completing P0-P3. The next event must be
able to use the one-night platform even if the campaign layer is unfinished.

## P0. Close and prove the current foundation

**Goal:** turn the large locally implemented platformization pass into a known,
recoverable baseline before expanding the ontology.

- [x] Reconcile the RUNBOOK docket with the actual diff and mark every item as
  implemented, partially implemented or open.
- [x] Verify settlement command, show-pack factory, trigger enforcement,
  grounded generation, operator UI, witness proposal flow, conviction scoring
  and settlement-drop generation at their real entry points.
- [x] Run the complete build and unit-test gates.
- [x] Run the relevant local database dogfoods, including settlement,
  conviction, show-pack activation and two-client phase movement.
- [x] Check the app at 375 by 812 for every changed player and host surface.
- [x] Review the complete diff with fresh eyes against authorization, Realtime,
  grounding and mixed-version invariants.
- [x] Split and land the work in recoverable, explicit commits only when the
  user authorizes shipping.
- [x] Record the exact verified and unverified surfaces in the RUNBOOK and
  handoff tracker.

### P0 verification ledger — 2026-08-12

Verified on the disposable local stack:

- app type-check, all 636 unit tests and the production build;
- complete schema migration application through `20260812062700` and
  `supabase db lint --local` with no findings;
- room phase authority (24 checks), playback authority (33), atomic legacy
  draft (14), roster synchronization (7), room synchronization (5), chat
  synchronization (7), grounding review (21), sentinel behavior (14) and
  operator capability issuance/rotation (53);
- show-pack compilation, offline factory dogfoods and synthetic
  settlement-drop generation;
- the public doorway and generated 13-slide ceremony at an emulated 375 by
  812 viewport with no horizontal overflow; and
- authenticated host and guest lobby, conviction and production-bundle live
  surfaces at 375 by 812, with no horizontal overflow or runtime exceptions.

The verification pass found and repaired: a fail-open NULL authorization
marker in the room transition trigger; ambiguous witness-queue JSON aliases;
an unsafe welcome-claim wire contract under racing host tabs; playback
membership being checked after room state; a stale conviction-default legacy
draft fixture; and an operator phone link that opened the lobby instead of the
live operator surface. The authenticated phone pass also found three owners of
one Supabase companion-typing topic; that transport is now shared and
reference-counted, including React Strict Mode release/reacquire coverage.

The protected local write pass is now complete:

- settlement, conviction, scheduled winner, scheduled spotlight, live-floor
  close and the complete backend suite pass against the disposable local
  database;
- the actual show-pack activation command passes dry-run, doubly confirmed
  apply, exact post-write attestation, room binding and idempotent replay;
- one host and one guest complete identity draft, whole-board conviction,
  bingo deal, live declarations, provisional close, settlement write-back and
  sealed closure through the real commands; and
- authenticated host and guest provisional results, closed ceremony gate and
  settled ledger render at 375 by 812 with no horizontal overflow, console
  errors or runtime exceptions. The player-relative `YOU` marker is correct on
  both clients.

The two-player cold-worker run did not receive every phase broadcast before
its bounded wait. Both clients reconciled the canonical provisional and closed
room states through the same post-subscription fetch path, and a separate run
did observe the broadcasts. This proves recovery and final convergence, not a
guarantee that every cold Realtime connection receives every event.

The pass found and fixed three additional foundation defects: the legacy seed
had 275 reviewed trigger contracts in the canonical authoring artifact but
published none of them; the activation command's first registry upsert required
an UPDATE privilege deliberately revoked from the service role; and the broad
backend harness retained its fake room and players despite having safe cleanup
authority. The seed now fails closed unless all 275 contracts are installed,
activation uses a strict first insert before atomic publication, and transient
harness rooms are deleted.

Clean-install evidence and recovery note: an approved `supabase db reset
--local` now replays every migration through `20260812062700` and loads the
authored catalog successfully. The seed generator temporarily returns the
legacy pack to draft while loading its immutable catalog, then fails closed
unless all 275 signature beats carry valid doctrine and the pack is playable
before publishing it again. The resulting local
catalog has 20 categories, 38 nominees, 38 draft entities, 213 category links,
275 signature beats and 75 bingo squares; rooms and players begin empty.
`show_pack_is_playable` is true and warning-fatal schema lint reports no
findings.

**Exit criteria**

1. `npm run build` and `npm test` are green.
2. Relevant backend-write dogfoods pass against the intended local project.
3. One host and one second client complete the current Story Night path.
4. The room can be settled, written back, closed and rendered as a reusable
   ceremony without hand-editing generated output.
5. Remaining risks are named rather than hidden inside a broad “done” label.

## P1. Make the game contract explicit and composable

**Goal:** stop deriving all play behavior from `fact_source` and stop treating
Results Night versus Story Night as an indivisible binary.

- [x] Define a versioned show-pack game contract covering commitment,
  conviction budget, identity, scarcity, visibility, cadence and continuity.
- [x] Put truth authority on each authored proposition or trigger so one show
  can mix official, operator-declared and AI-proposed facts.
- [x] Preserve `fact_source` as compatibility metadata until every consumer uses
  the new canonical contract.
- [x] Replace the automatic `fact_source -> game_model` binding for new packs
  with contract-driven room configuration.
- [x] Keep all historical rooms on their recorded behavior.
- [x] Make room configuration immutable once commitments begin.
- [x] Validate contract completeness in the show-pack compiler and at atomic
  publication.
- [x] Expose an operator-readable summary of the selected contract before a room
  starts.

### P1 implementation ledger — 2026-08-13

Schema-v3 packs remain accepted as compatibility inputs and compile into sealed
schema-v4 bundles. New schema-v4 packs must declare every game-contract
dimension and a truth authority on every prediction, signature beat and bingo
trigger. The activation command prints the selected contract before it can
write, atomic publication attests it, and room binding copies it before deriving
the compatibility `game_model` from commitment rather than `fact_source`.

The database backfills existing packs from their historical `fact_source` and
existing rooms from their recorded `game_model`; it does not recompute a room's
history. Room contracts and compatibility models can change only as part of a
lobby show-pack rebind and are frozen once any commitment-dependent state
exists.

The contract vocabulary intentionally runs ahead of the current execution
engine. Publication currently accepts only the proven Results Night and Story
Night profiles. Variable conviction budgets, no-draft or chosen-faction
identity, and campaign continuity remain P2/P4 work and fail closed rather than
claiming to work.

Verification on the disposable local stack: clean migration replay through
`20260813000100` plus authored seed; warning-level schema lint; 641 unit tests
and production build; 22 offline factory checks; 12 real activation checks with
scheduled compatibility metadata deliberately paired to an explicit Story
contract; and 35 scheduled-winner checks using an explicit Results contract
whose compatibility metadata is deliberately room-declared. The scheduled
spotlight suite passes all canonical state and authority assertions, but a cold
local Realtime observer missed its bounded opening event on two runs and
received it on one immediate rerun. Preserve the P0 delivery-timing caveat.

The broad `dogfood-e2e.mts` still creates two impossible hybrid fixtures by
changing `game_model` without changing the room contract. Its covered Story and
Results behaviors pass in the focused contract-consistent suites above; migrate
those legacy setup sections before restoring the broad harness as a P1 gate.

**Initial contract defaults**

| Shell | Commitment | Identity | Truth | Settlement |
| --- | --- | --- | --- | --- |
| Results Night | Confidence allocation | Optional entity draft | Official | Immediate per outcome |
| Story Night | Whole-board convictions | Optional emblem, faction or entity | Operator declaration plus AI proposals | Immediate facts and final event close |
| Campaign | Episode convictions plus season theses | Persistent optional identity | Mixed per proposition | Episode checkpoints plus season close |

**Exit criteria**

1. A new pack selects behavior without code changes or a new union literal.
2. A pack can contain at least two truth-authority types.
3. Omitting a required contract field prevents publication.
4. Existing scheduled and room-declared fixtures behave exactly as before.

## P2. Productize the reusable Story Night loop

**Goal:** make the whole-cast prestige experience the reliable default for an
arbitrary one-night story event.

- [ ] Retain the fixed whole-board portfolio; make its budget pack-configurable
  instead of a hard-coded twelve.
- [ ] Make the identity phase optional and non-scoring by default.
- [ ] Support no identity draft, chosen faction/banner and exclusive identity
  draft without restricting access to convictions.
- [ ] Keep lonely-bet payout as the first scoring policy; do not add multiple
  speculative economies before another live test.
- [ ] Allow the show-pack factory to author and validate all required Story
  Night contract data.
- [ ] Make every operator action and generated line consume the room-bound pack
  and settled fact record.
- [ ] Ensure one command can finish the live floor and the researched settlement
  command can truthfully close the room.
- [ ] Generate the complete settlement drop from the receipt, with no hand patch.

**Required loop**

```text
Create show pack
-> configure game contract
-> open room
-> optional identity ceremony
-> make whole-board commitments
-> observe and declare facts
-> settle and write back
-> generate recap and ceremony
-> close
```

**Exit criteria**

1. Players can make calls about any authored character regardless of identity.
2. A Story Night with no identity draft can start and finish normally.
3. A Story Night with an identity draft gives differentiated rooting without
   passive score or exclusive prediction rights.
4. A second property can complete the loop without application-code edits.

## P3. Author and rehearse the next real event

**Goal:** arrive at the next watch event with a tested pack and an operator who
has already run the exact night once.

- [ ] Select the property, installment, screen-canon cutoff and expected group
  size.
- [ ] Choose a product shell and fill its game contract deliberately.
- [ ] Build the roster, propositions, exact trigger contracts, calibration,
  bingo, cast dossiers, visual assets and commentary requests through the
  factory.
- [ ] Perform the required source, canon, trigger-title, portrait and grounded
  prose reviews.
- [ ] Activate the published pack in a local rehearsal room.
- [ ] Rehearse with a host and at least one second client at 375 by 812.
- [ ] Exercise missing players, incomplete portfolios, rapid declarations,
  mistaken declarations, blocked AI prose, host reload and room closure.
- [ ] Produce and inspect a full settlement receipt and ceremony from synthetic
  rehearsal facts.
- [ ] Write the show-specific operator checklist and rollback path.

**Next-event readiness gate**

The next event is ready only when a new property can be authored, rehearsed,
played, settled and rendered without a developer modifying the app during the
event.

## P4. Add Campaign as a container of installment rooms

**Goal:** create durable season continuity without stretching one room and its
phase machine across many weeks.

- [ ] Add a campaign record with property, season, membership, policy and
  lifecycle.
- [ ] Add ordered installments that each bind one independently recoverable
  room and show-pack version.
- [ ] Preserve the existing room phases inside every installment.
- [ ] Derive campaign standings from immutable installment settlements rather
  than caching a second mutable score owner.
- [ ] Carry persistent player identity and optional faction/banner across rooms.
- [ ] Define what happens when someone joins late, misses an installment or
  leaves the campaign.
- [ ] Make settlement versioning and amendments flow into campaign projections.

**Exit criteria**

1. Three installment rooms can belong to one campaign.
2. Each room remains playable and recoverable on its own.
3. Campaign standings reproduce exactly from the three canonical receipts.
4. Correcting one receipt deterministically updates the campaign projection.

## P5. Add conviction lifecycles

**Goal:** preserve what every player believed and how that belief changed over
the season.

- [ ] Distinguish episode convictions from season theses.
- [ ] Give each thesis an explicit lifecycle: open, held, strengthened, revised,
  abandoned, confirmed, refuted or expired unresolved.
- [ ] Record revisions append-only; never overwrite or silently reset an earlier
  belief.
- [ ] Add commitment and revision windows owned by the installment schedule.
- [ ] Preserve the author, exact wording, target, opening installment and every
  later revision.
- [ ] Keep the first campaign scoring simple: existing installment score plus
  cumulative standings.
- [ ] Surface early calls, persistence and reversals as recap honors before
  considering score multipliers.

**Exit criteria**

1. A player can open a thesis in installment one, hold it, revise it in three
  and resolve it in six without losing any historical state.
2. A late change of mind cannot appear to have been an early correct call.
3. Closed commitment windows reject new or revised positions.
4. Season honors can be reproduced from the append-only record.

## P6. Write settled canon into evolving character state

**Goal:** make settlement of installment N truthfully author the starting state
for installment N+1.

- [ ] Define evidence-bound state fields for status, location, allegiance,
  relationships, possessions or office, and open questions.
- [ ] Distinguish screen fact, source-material context, room interpretation and
  unresolved state.
- [ ] Project state changes only from canonical settlement receipts and their
  amendments.
- [ ] Retain the exact receipt entry and warrant behind every state change.
- [ ] Let AI propose a state summary, but require grounded review and prevent it
  from becoming the canonical owner.
- [ ] Feed the resulting state into the next pack's dossiers, propositions,
  companion prompts and recap context.
- [ ] Represent contradictions and reversals explicitly instead of editing
  history.

**Exit criteria**

1. Every displayed character-state fact names its settlement provenance.
2. Replaying the same receipts produces the same state.
3. Amending a receipt produces a traceable superseding state projection.
4. Episode N+1 generation cannot cite an unconfirmed AI proposal as screen canon.

## P7. Build the between-installments campaign home

**Goal:** make the campaign useful between watch nights, not only during them.

- [ ] Show the latest installment settlement and current cumulative standings.
- [ ] Show canonical character changes with provenance.
- [ ] Separate open, resolved and revised convictions.
- [ ] Surface “you called this in installment N” history.
- [ ] Show the next installment, commitment deadline and revision availability.
- [ ] Support absent and late-joining players honestly.
- [ ] Apply the mobile grammar at 375 by 812, including reserved chrome and
  scroll behavior.

**Exit criteria**

1. A returning player can understand what changed, what they still believe and
   what they must do next without reading chat history.
2. No score or character fact on the screen has a second mutable owner.
3. A player who missed an installment sees an honest absence rather than zero
   being mistaken for participation.

## P8. Build the season ceremony

**Goal:** turn the accumulated campaign record into the emotional payoff.

- [ ] Extend the reusable ceremony grammar from one receipt to an ordered set of
  installment receipts and conviction revisions.
- [ ] Produce the season timeline, lead changes, character arcs and decisive
  turning points from canonical records.
- [ ] Add evidence-derived honors such as earliest correct call, boldest lonely
  conviction, longest-held correct thesis and most consequential reversal.
- [ ] Ground all generated connective prose through the shared grounding engine.
- [ ] Produce both a shared edition and personal editions.
- [ ] Preserve honest gaps when the record cannot support a desired story beat.

**Exit criteria**

1. The ceremony can be regenerated deterministically from the campaign record.
2. Every factual claim traces to receipts, commitment history or qualified chat.
3. Personal editions do not reveal sealed or private information improperly.
4. No slide requires hand-authored corrections after generation.

## Cross-cutting acceptance criteria

These user observations remain requirements until verified or explicitly
deferred:

1. “Everyone can choose what they think will be the path for any of the
   characters.”
2. Players do not need to choose only one character.
3. Character selection may still exist when it makes a particular game more
   fun.
4. The difference between an awards-night ceremony and an uncertain,
   character-driven story must be modeled without duplicating the platform.
5. A game may last an entire season and update characters over that season.
6. Settlement of installment N must truthfully author installment N+1.
7. The next real event must be playable without rebuilding the product around
   that event.

## Verification matrix for every implementation slice

| Changed layer | Required evidence |
| --- | --- |
| Pure rules in `src/lib` | A test observed failing without the change, then passing; full `npm test` |
| Types, API proxy or build configuration | `npm run build` |
| Supabase writes or guards | Additive migration, updated row types, targeted dogfood and full backend e2e when safe |
| Realtime shared state | Subscribe-before-fetch review plus real host and second-client use |
| Phase behavior | Both clients move because the room phase changed, including reload recovery |
| Generated prose | Shared grounded-line path, refutation behavior and residual review evidence |
| New or changed UI | Real 375 by 812 inspection including empty, loading, error and overflow states |
| Settlement or ceremony | Receipt binding, deterministic regeneration and honest-gap review |

Passing one row never implies the others passed. Each completed roadmap item
must record exactly which evidence exists and what remains unverified.

## Edge cases that stay in scope

Every relevant slice must consider:

- zero, one and many players;
- late joiners and absent campaign members;
- incomplete commitments when the host starts anyway;
- ties, voided propositions and unresolved season theses;
- the host leaving or reloading mid-action;
- another phone being stale or disconnected;
- duplicate or concurrent declarations;
- mistaken facts followed by amendment;
- a mixed-version room during deployment;
- AI silence, malformed output and residual grounding findings;
- an installment skipped, postponed or watched out of order; and
- a character fact contradicted by later canon.

## Deliberately deferred until after a campaign test

- Sports-stat feeds and licensing-dependent integrations
- Trades, waivers and fantasy-style transfer markets
- A general-purpose relationship graph
- Confidence-gated AI auto-declaration without human review
- Multiple competing conviction-scoring economies
- Native-app packaging
- White-label and business-model work
- Separate hard-coded implementations for individual genres

Sports remains a viable later product only if it emphasizes story, meaning and
memory rather than recreating a conventional statistical fantasy league.

## Candidate test properties

When choosing the next expansion test, prefer the smallest property that proves
a new primitive:

1. A new prestige episode or finale proves reusable Story Night authoring.
2. A three-installment simulated prestige season proves campaign continuity.
3. A reality competition proves mixed official and interpretive truth.
4. An adaptation proves the two-canons rule across repeated installments.
5. Eurovision or pro wrestling proves a hybrid event shape.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-08-12 | The product primitive is commitment under unfolding canon. | “Who wins” was too narrow for character and story investment. |
| 2026-08-12 | Whole-cast conviction is the Story Night default. | Players should be able to call any character's path. |
| 2026-08-12 | Identity and prediction access are separate. | Drafting creates rooting and rivalry without constraining belief. |
| 2026-08-12 | Campaigns contain installment rooms. | Existing room phases and settlement recovery remain bounded and proven. |
| 2026-08-12 | Conviction revisions are append-only. | The timing and evolution of belief are part of the product's value. |
| 2026-08-12 | Settled receipts, not AI summaries, own evolving canon. | Grounding and reproducibility require provenance. |
| 2026-08-12 | P0-P3 define next-event readiness. | Campaign work must not delay a reusable one-night game. |

## How to maintain this plan

At the end of each build slice:

1. Check only work that is implemented and verified at the stated scope.
2. Link the relevant RUNBOOK doctrine when a new invariant is discovered.
3. Add product decisions to the decision log instead of burying them in status
   prose.
4. Record deferred acceptance criteria explicitly.
5. Reorder priorities only when live evidence changes them.
6. Keep private show-specific data in `.private/`; this public roadmap contains
   only platform intent and non-sensitive status.

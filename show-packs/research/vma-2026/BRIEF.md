# 2026 MTV Video Music Awards — P3 event brief

**Status:** scoped, not implemented. This is the `ROADMAP.md` P3 slice ("author and
rehearse the next real event") applied to one concrete property.

**Show:** Sunday, September 27, 2026, Peacock Theater, Los Angeles. Live on CBS, simulcast
on MTV, streamed on Paramount+. Nominations announced August 18; social categories
September 18. Host: Snoop Dogg. Video Vanguard: Nirvana.

**Shell:** Results Night. Schema-v4 show pack with the exact Results Night contract profile
that `assertActivatableShowPack` and `results_night_game_contract()` already accept:
`confidence_allocation`, exclusive entity draft with ensemble scoring, ranked allocation,
sealed until lock, immediate per outcome, no carryover. Room model derives to
`legacy_ensemble`.

**Goal:** one high-fidelity remote game for four to ten players on their own phones, hosted by
the operator, with **no developer touching the app during the show**. Public launch,
payments and a pack picker are explicitly out of scope. The shareable outcome is the
settlement receipt, the public recap route and the settlement-drop ceremony.

## 1. Decisions (locked)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Unit of play | The **artist**. Draft pool is artists. Every category's candidates are artists. If one artist has two entries in one category they collapse into one candidate. |
| D2 | Category slate | Every category MTV names an official winner for, including off-air and the four social categories. Tiered: marquee on-air categories high, genre and craft mid, social low. Off-air winners are declared by the host from MTV's official post at the end of the night. |
| D3 | Truth authority | `official_result` on every prediction and signature beat. Bingo triggers also carry `official_result` as metadata; the runtime treats bingo as honor-system self-marks. |
| D4 | Bingo | Live-show moments only, self-marked, 40 to 48 squares, probabilities authored against 2023 to 2025 VMA history. Host-adjudicated bingo is **not** built for this show (see section 8). |
| D5 | Cast | Five original fictional people posting to a live feed, no real person: Priya, The Desk (narrator, a fictional results-desk anchor); Jojo, The Superfan (seat 14R, openly partisan); Dev, The Insider (ex-label campaign strategist, explains the mechanism); Wren, The Rocker (frontwoman of a fictional touring band, watches as a musician, carries the long memory; the eliminated rock category is one grievance among many); Sasha, The Carpet (red carpet correspondent). First names only; the title is the prominent label. |
| D6 | Group | Four to ten players, remote, possibly people the host half knows. |
| D7 | Viewing | Async is the model. Host declares on the fastest feed. Chat will spoil slower feeds; the invite says so. Players who do not watch still receive full confidence and draft scoring and a recap; they forfeit bingo. |
| D8 | Draft pricing | Set by simulation (see `SIMULATION.md`): marquee categories 3 draft points, every other category 2. The 8/6 placeholder let draft slot one win 42 percent of six-player nights; 3/2 gives 27 percent, and 31 percent with Taylor Swift absent, with draft at 8 percent of total score. Ranked confidence unchanged. |
| D9 | Portraits | Generated abstract tiles per artist, committed under `public/`, so the portrait contract is met with nothing rights-encumbered. |
| D10 | Signature beats | The minimum the activation gate requires, authored as official-result wagers. On Results Night no player-facing surface activates or declares beats, so they are inert and unscored for this show; no player copy may mention beats or activation. Revisit when a Results Night beat surface exists. |

## 2. Acceptance criteria

Each stays open until individually verified on a phone or explicitly deferred.

1. A player in a Results Night room can make ranked confidence picks for every category and lock them. (Today the confidence route renders the Story Night activation screen.)
2. The draft runs as a timed snake over artists; an absent player's turn is skipped by the timer rather than stalling the room, except the final pick, which is never skipped.
3. The host declares a winner from the Winners tab and every phone's leaderboard moves without a reload.
4. The host can undo a mistaken declaration and every phone shows the correction.
5. A player who never opens the app during the show still has a full confidence and draft score afterward.
6. The cast reacts to declared winners, bingo marks and direct chat through the laptop daemon with no browser fallback needed.
7. Post-show farewells and keepsakes work with the pack's own voice IDs.
8. The room can be closed by the settlement command, the receipt exported, and the ceremony generated with no hand edits.
9. No page a player sees says House of the Dragon, dragon, Oscars or film encyclopedia.
10. The whole path above is rehearsed with a host and one second client at 375 by 812 before invites go out.

## 3. Code work (Codex lane)

Ordered. Each item names its verification. No migration is required by any item; the
protected list in `AGENTS.md` is untouched.

1. **Restore the confidence page for `legacy_ensemble` rooms.** `src/pages/PredictionPhase.tsx`
   renders `Conviction` for portfolio rooms and `Activate` for everything else.
   `src/pages/Confidence.tsx` and `src/hooks/useConfidence.ts` are imported by nothing, yet
   scoring, settlement and the receipt still read `confidence_picks`. Route `legacy_ensemble`
   to `Confidence`, keep `Activate` for whatever still needs it, and confirm the lock action
   moves the room phase through the capability-gated command rather than a direct write.
   Verify: two phones, picks locked, `confidence_picks` rows present, phase moves by Realtime.
2. **Widen the keepsake guard to pack voices.** `api/_grounding.ts` `validVerdictContracts`
   requires `COMPANION_IDS.has(contract.companionId)`, the seven legacy IDs, while
   `src/lib/runtime-narrative-prompts.ts` builds contracts from pack voice IDs and the
   database side (`complete_grounded_runtime_player_verdicts_authorized`) is already
   pack-aware. Accept the room's projected runtime cast IDs. Verify: unit test that fails
   on a pack voice ID before the change; `dogfood-companion-claims.mts` still green.
3. **Add the missing `toss_up` label** to `ODDS_LABELS` in `src/pages/Activate.tsx` and any
   other odds label map; activation writes `toss_up` into `signature_beats.odds`.
4. **Fix the Results Night dogfood pack path.** `scripts/lib/results-night-dogfood-pack.mts`
   uses `mkdtempSync('/private/tmp/...')`, which is macOS-only. Use `os.tmpdir()`.
5. **Write a real Results Night example pack** at `show-packs/examples/results-night-proof.json`
   (schema v4, contract profile above, at least 24 bingo squares in the 7/9/6/2 tier mix, at
   least two candidates per prediction, portraits under `public/`, four runtime voices with
   exactly one narrator and complete `post_show`). It must pass
   `npx tsx scripts/compile-show-pack.mts --input ...` and a local
   `activate-show-pack.mts` dry run. This is the template the VMA pack is authored from.
6. **Pack-driven copy for the surfaces a stranger sees.** Landing (`src/pages/Home.tsx`),
   `src/pages/HowItWorks.tsx`, the draft's "Claim a dragon" sub-draft copy in
   `src/pages/Draft.tsx` (keyed on `type === 'film'`; a VMA pack has only `person`
   entities so the round should not appear), the "Film Encyclopedia" affordances in
   `ChatSection.tsx` and `NomineeDetailSheet.tsx`, the "24 Oscar categories" string in
   `QuickStats.tsx`, and the dead `/ceremony.html` link in `LiveHomeView.tsx`. Derive
   labels from the room-bound pack title and property; hide legacy-only affordances for
   non-legacy packs. Verify: walk every player route at 375 by 812 in a VMA-bound room.
7. **Simulation script** (section 6). Pure, imports `src/lib/scoring.ts` and
   `src/lib/bingo-utils.ts`, no Supabase.
8. **Doc drift.** `AGENTS.md` still lists `categories` as global with no `room_id`; since
   migration `20260810190400` a category is scoped by exactly one of `show_pack_id` or
   `room_id`. Correct the protected-list wording.
9. **Rehearsal** per section 7, then the `verify-change` ledger.

Out of scope for Codex on this event: a host-facing pack picker, host-adjudicated bingo,
auto-declaration, payments, auth. The room is bound by the operator from a terminal with
`activate-show-pack.mts --apply --confirm-room CODE` while it is in `lobby`.

## 4. Content work (authoring lane)

The pack is hand-authored schema-v4 JSON fed straight to `compile-show-pack.mts` then
`activate-show-pack.mts`. The resumable factory needs a predecessor receipt and does not
apply to a first-of-property pack.

What the compiler and database require, so nothing is discovered on Thursday:

- `sources[]` and `claims[]`: every prediction, beat and bingo square needs `basis_claim_ids`
  that resolve to a **verified screen or verified discourse** claim. Research packet
  citations become sources; individual facts become claims.
- `entities[]`: one per nominated artist, `kind` person, `draftable: true`, a dossier of
  claim IDs, and a portrait `{path, sha256}` under `public/` (`.avif`, `.jpg`, `.png` or
  `.webp`, exact lowercase SHA-256).
- `predictions[]`: one per category, `points` and `tier` per D8, at least two
  `candidate_entity_ids`, `condition`, non-empty `exclusions[]`, explicit
  `adjudication.{proxies, offscreen, mentions}` (never `unspecified`), `title_review.status:
  approved`, `truth_authority: official_result`.
- `signature_beats[]`: per D10, entities must all be draftable.
- `bingo_squares[]`: 40 to 48, `probability_pct` whose derived band matches
  `likelihood_tier` exactly (60 likely, 40 toss_up, 20 long_shot, else chaos),
  `why_it_is_fun`, `storyline_tags[]`, same wager doctrine as above.
- `commentary_voices[]`: four voices, every one with a `runtime` block (`slot`, `role`,
  lowercase `aliases`), exactly one `narrator`, no overlapping aliases, and `post_show` on
  all four with contiguous farewell order and strictly increasing delays from zero.
- `commentary_requests[]` may be empty for this show. Any published line needs a
  `grounded-line.mts` stamp; skip pre-authored commentary unless time allows.
- `runtime_ceremonies`: optional. If authored, milestones at increasing declared-event
  counts with the same four voices.

Activation gate: at least 24 bingo squares, at least one draftable entity, every beat naming
one or two draftable entities, contract byte-equal to the Results Night profile.

## 5. Research packets (send today, each with a cutoff date and a source URL per line)

Fact packets, no decision dependency:

1. **Slate.** The complete official 2026 nominee list per category in MTV's exact wording,
   including the four social categories. For 2023, 2024 and 2025: which categories were
   presented on air, which in the preshow, which posted to social afterward and when.
2. **Artist dossiers.** For every nominated artist: five verifiable facts, VMA history and
   prior wins, confirmed attendance or performance status, and the nominated works by
   category.
3. **Odds.** Per category: bookmaker lines if any, prior fan-vote outcomes, follower scale
   for social-category nominees, and a stated probability per candidate with the reasoning.
   This is the simulation input.
4. **Run of show.** Announced performers, presenters, the Nirvana Vanguard segment, expected
   length, and anything MTV has said about format changes.
5. **Moments history.** For 2023 to 2025: base rates for winner cries, speech cut off,
   wardrobe incident, stage invasion, audience reaction shots of specific artists, tribute
   segments, overrun, categories dumped to social. Each with the year it happened.
6. **Discourse.** What went viral and what people complained about at the 2024 and 2025
   VMAs. Feeds bingo texture and the cast's attitude-only lane. Never a screen-fact source.

Two-canons rule applies: the broadcast is the screen. A social-media winner post is an
official result, not a screen event. Recap claims stay tagged until cross-checked.

Suggested prompt header for each packet:

> You are researching the 2026 MTV Video Music Awards (Sunday, September 27, 2026, CBS).
> Return a table. Every row must carry a source URL and the date you checked it. Mark
> anything unconfirmed as UNCONFIRMED rather than guessing. Do not include facts you cannot
> cite. Cutoff: today's date.

## 6. Simulation (gated on packet 3)

One script, `scripts/simulate-results-night.mts`, filesystem-only:

- Input: the compiled pack plus an odds file mapping each prediction ID to a probability per
  candidate, and a player count from 4 to 10.
- Draw a random draft order, play a four-round snake with a simple value-greedy pick policy,
  assign random ranked confidence picks weighted by odds, sample winners from the odds,
  deal balanced bingo cards and sample marks from authored square probabilities, then score
  through the real `computeLeaderboard`, `findDraftPointsForWinner` and
  `computeBingoScore`.
- Ten thousand nights. Output one table: win rate by draft slot, share of total score from
  confidence, draft and bingo, mean and p10/p90 bingo card score, share of players on zero
  bingo.
- Decision rule: change the D8 point scale only if draft slot one wins more than about a
  third of nights or draft exceeds a third of total score. Otherwise leave it.
- Rerun after the bingo pool is authored to confirm the mean card lands near the design
  target with nobody on zero.

## 7. Rehearsal checklist (P3, before invites)

Local stack, activated pack, host phone plus one second client at 375 by 812:

- lobby, ready-up, timed draft with one absent player skipped by the timer (the final pick is never skipped, so a present player must take it);
- confidence picks made and locked on both phones;
- live: three declarations, one undo with public correction, one spotlight open and close;
- bingo: deal, mark, unmark, a completed line;
- daemon running from the laptop with the room's operator capability; declared-fact, bingo and
  direct-chat reactions observed; a blocked line lands in the private review queue;
- host phone reload mid-live; every scheduler recovers from the database;
- close the live floor; provisional results on both phones;
- `prepare-settlement.mts`, `settle-room.mts --apply`, receipt export, ceremony generation;
- public recap route and personal recap route for both players.

Record what was run and what was not in the `verify-change` ledger.

## 8. Deferred (recorded, not forgotten)

- **Host-adjudicated bingo.** The Oscars build had pending marks with host approval; the
  August platformization replaced it with self-serve seat authority. The enum values
  `pending` and `denied` survive with no writer. If wanted later it belongs as a contract
  dimension, and every v4 bingo trigger already carries a `truth_authority` field the
  runtime currently ignores. Settlement's `preserve_live` versus `replace` modes are the
  adjudication layer for this show.
- A public correction line for the scheduled winner undo. `undo_scheduled_winner` strikes the
  winner and recomputes scores but appends no chat correction; only the Story Night referee undo
  does. Needs a between-show migration. The host posts the correction by hand this show.
- Host-facing pack picker; every new room is born bound to the legacy pack by column default.
- Auto-declaration from an official feed.
- Payments, auth, public landing.

## 9. Known risks

- Stream delay across CBS, MTV and Paramount+ spoils chat for slower feeds (D7).
- The daemon is mandatory for a pack cast; if the laptop sleeps, live reactions stop.
  Browser ceremonies continue. Keep the laptop awake and the sentinel looping.
- Off-air winners arrive as a batch at the end; declare them one at a time so the cast
  cadence and the timeline stay legible.
- A cold Realtime connection may miss a bounded phase event; the reconciliation fetch
  recovers it. This is documented P0 behavior, not a new risk.

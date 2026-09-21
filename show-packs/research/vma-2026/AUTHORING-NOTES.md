# 2026 VMA show pack - authoring notes

Companion to `vma-2026-authoring.json` (schema v4, `pack.id` `vma-2026`, `pack.version` 1).

**Evidence grade of the whole pack.** All six research packets under `research/` state at the
top that direct page fetches were blocked by the network egress proxy and that every fact came
from web-search result summaries plus the URLs those summaries cite. No primary page was read.
Every `sources[]` record in the pack therefore carries the string
`search-summary grade; round-two source verification pending`, and nothing in this pack should
be treated as verified against a source page until the round-two pass in section 6 is done.

The schema has no `note` field on a source (`{id, kind, title, locator}` only), so the caveat
lives at the end of each source `title`, which is the only free-text field a consumer sees. The
pack test `src/lib/vma-2026-pack.test.ts` asserts the string is present on all seven sources.

---

## 1. What each packet contributed

| Packet | Used for | Source record in the pack |
| --- | --- | --- |
| `research/01-slate.md` | Cross-check on the category slate, the category-existence dispute (Best Rock and Best Afrobeats dropped; Best Pop Artist, Push Performance and Video for Good unresolved), the 2023-2025 on-air/preshow/social presentation split, and the nomination-count conflicts. | `vma-2026-slate-packet` (`operator_record`) |
| `research/02-artists.md` | Every entity display name, the per-artist nomination lines, the Tier-A five-facts dossiers, the DISCOURSE lines, and the show-level facts table. | `vma-2026-artist-packet` (`operator_record`) |
| `research/03-odds.json` | **The slate shape.** Every prediction title, every candidate list, every entity id. Also the estimated per-candidate probabilities that price the signature beats. | `vma-2026-odds-packet` (`operator_record`) |
| `research/03-odds.md` | The 23-category architecture (13 fan-voted / 6 craft / 4 social), the honorary-award list, and the reasoning behind the `presented` estimates. | same as above |
| `research/04-run-of-show.md` | Date, venue, CBS two-hour 7:30-9:30 p.m. ET window, live coast to coast, Snoop Dogg hosting, the Nirvana Vanguard segment and its three unknowns, the announced performer list, the format changes, and the fact that no presenters and no running order exist. | `vma-2026-run-of-show-packet` (`operator_record`) |
| `research/05-moments.md` | **Every bingo probability.** One claim per packet row used, quoting the row's own evidence and caveat. | `vma-2026-moments-packet` (`screen`) |
| `research/06-discourse.md` sections A-D | Bingo texture and five entity discourse dossiers. Never a prediction basis. | `vma-2026-discourse-packet` (`sentiment`) |
| `research/06-discourse.md` section E | The four commentary voices' attitude-only claims and their instruction text. | `vma-2026-voice-attitude-guide` (`source_material`) |

**Deviation from the brief's "one source per packet".** Packet 6 needed two source records, not
one. The compiler rejects a `discourse` claim whose source kind is `source_material`, and
rejects a `source_material` / `attitude_only` claim whose source kind is anything else
(`src/lib/show-pack.ts`, claim-canon validation). Section E is explicitly attitude-only
authoring guidance and sections A-D are audience discourse, so they are registered as two
sources over the same file with different locators. Seven sources total.

**Claim canon lanes actually used:** 144 `screen`/`verified`, 13 `discourse`/`verified`,
4 `source_material`/`attitude_only`. No `recap`, `unverifiable` or `authoring` claim exists in
the pack. Every prediction basis is a `screen` claim only; discourse appears only as bingo
texture, voice attitude and entity dossier material. The test asserts both.

---

## 2. Conflicts between packets, and how each was resolved

| # | Conflict | Resolution | Where it lives in the pack |
| --- | --- | --- | --- |
| C1 | **Madonna 13 vs 11 nominations; Taylor Swift 11 vs 9.** Packet 4's timeline gives the 18 Aug figures as Madonna 11 / Swift 9; packets 1, 2 and 6 give the post-social figures as Madonna 13 / Swift 11. | Both stated, with the distinction named. The 18 Aug numbers are the main-slate figures and the higher numbers are the all-in figures after the 18 Sept social round. | Claim `show-nomination-leaders` |
| C2 | **Bruno Mars 7 vs 6 nominations.** Packet 1 records both and says adding social categories cannot explain a count moving *down*. | Recorded as an open discrepancy in the same claim rather than picked. | Claim `show-nomination-leaders` |
| C3 | **Best Collaboration's sixth nominee.** Packet 1 recovered only five and flagged the category as elevated risk; packets 2 and 3 both carry six, the sixth being Teyana Taylor with Lucky Daye ("Hard Part"). | Followed `03-odds.json` per the brief: six candidates including `teyana-taylor`. Packet 1's own note also says a sixth is missing rather than that only five exist. | Prediction `best-collaboration` |
| C4 | **Song of Summer titles.** Packet 2 lists nine nominees with three titles UNCONFIRMED; `03-odds.json` lists fifteen with four UNCONFIRMED. | Followed `03-odds.json`: fifteen candidates. UNCONFIRMED work titles are carried verbatim, including the literal string `UNCONFIRMED`, inside the slate claims. | Prediction `song-of-summer`, claims `slate-*` |
| C5 | **Distinct artist count: 88 (packet 2) vs 85 (packet 1) vs 67 (odds file).** | 67 is correct *for this pack*, because decision D1 keys each collaboration entry to the primary credited artist so the draft pool stays a pool of artists. The 88 and 85 figures count collaborators individually. | Every `slate-*` claim states the D1 keying rule |
| C6 | **Broadcast window: 7:30-9:30 p.m. ET (packet 4, CBS press release) vs 8:00-10:00 p.m. ET (packet 1).** | 7:30-9:30 used, because packet 4 traces it to the CBS release and packet 1 itself says to resolve against that release. The conflict is stated in the claim, and the one bingo square that depends on the clock names 9:30 p.m. ET explicitly. | Claim `show-date-venue-broadcast`, square `the-show-runs-past-its-window` |
| C7 | **Nirvana: performs or not.** Packet 2's show-level table (Gold Derby) says Nirvana "will perform and accept". Packet 4 C3/C4/C7 say who accepts, whether there is a performance, and the segment format are all unannounced. | Both recorded in one claim. The three Vanguard bingo squares are written so that a segment with no live performance resolves them NO rather than leaving them unresolvable. | Claim `show-vanguard-nirvana` |
| C8 | **Latin Icon Award 2026.** `03-odds.md` section 0.2/0.3 lists "Ricky Martin receives the first Latin Icon Award" among 2026 honorary awards. Packet 4 D3c and packet 5 row 34 both place Ricky Martin's inaugural Latin Icon in **2025** and say no 2026 recipient has been announced. | Treated as a 2025 fact mis-scoped in the odds packet. **No square or beat asserts Ricky Martin appears in 2026.** The honorary-award square is written in the general form the moments packet supports ("a second honorary award besides the Vanguard", 85). | Claims `show-honorary-awards-open`, `moments-row-34`; square `a-second-honorary-award` |
| C9 | **Taylor Swift "Artist Director Honors".** `03-odds.md` (source S12) and `06-discourse.md` C.5 (Hollywood Reporter URL) both record an inaugural Artist Director Honors announced for Taylor Swift. Packet 4, the run-of-show packet, does not list it among the announced 2026 segments. | Recorded as a claim that names the disagreement. It is **not** authored as a standalone bingo square, because packet 5 gives no base rate for it; it grounds the general second-honorary-award square instead. It is excluded from every signature beat's win count. | Claim `show-artist-director-honors` |
| C10 | **Shakira has two entries in Best Latin** (packet 2). `03-odds.json` lists her once in Best Latin. | Followed the odds file. This is exactly the D1 collapse the brief specifies, and it is recorded as a fact rather than lost. | Claim `shakira-two-latin-entries` |

---

## 3. UNCONFIRMED material that landed in the pack

Everything below is in the pack **and is flagged in the pack itself**, not silently promoted.

1. **Every nominee list.** Packet 1's own heading says category wording is not verbatim, that
   the search summarizer demonstrably conflated years, and that nominee lists may be truncated.
   Every prediction's `title_review.note` says the category string is search-summary grade and
   must be checked against `vote.mtv.com`.
2. **Song of Summer works** for `sombr`, `stella-lefty`, `slayyyter`, `tame-impala` (literal
   `UNCONFIRMED` in the odds file), plus `katseye` "Hootie Fruity" / "Hootie Frutti" and
   `sabrina-carpenter` "House Tour", both marked title-UNCONFIRMED.
3. **Taylor Swift's eleventh nomination** (Song of Summer, "I Knew It, I Knew You") and
   **Sabrina Carpenter's ninth**. Packet 2 says these are implied by the published counts, not
   sourced. They are in the slate because the odds file carries them.
4. **Rauw Alejandro / Yahritza y su Esencia, "La Perla"** - credit marked UNCONFIRMED in the
   odds file; carried verbatim.
5. **Charli xcx's fourth nomination** - three of four identified in packet 2. The pack gives her
   four candidate slots because the odds file does; the fourth is not separately evidenced.
6. **First-time-nominee status** for `pinkpantheress`, `gener8ion`, `cortis` - absence of a
   search result is not a source. Claim `cortis-first-noms` says so in the claim text.
7. **Bruno Mars's pre-2025 VMA wins** (low-quality aggregator) and **BTS's 10-win career total**
   (a social-media post) - both carried with the weak-source caveat inside the claim text.
8. **Harry Styles's two song titles** ("Aperture" vs "Dance No More") and the **Lady Gaga /
   Doechii "RUNAWAY" vs "RUNWAY" spelling** - carried as explicit flag claims, and neither title
   appears in a wager condition.
9. **Nirvana Vanguard segment shape** - who accepts, whether there is a performance, and the
   format are all unannounced (packet 4 C3/C4/C7); packet 2 conflicts. Three bingo squares turn
   on this.
10. **The `presented` field** in the odds file (on_air / preshow / social) is the odds author's
    estimate except for the four social categories. It is **not** used anywhere in the pack: no
    prediction condition depends on where a category is announced, precisely because the split
    is unverified. Every prediction resolves from "broadcast, preshow, or MTV's official
    post-show winners post".
11. **Several packet 5 base rates are placeholders, not findings**, and are used anyway because
    the brief calls for the packet's conservative numbers. The packet says so in each case and
    so does the corresponding claim: row 4 (speech played off, 40), row 12 (host names a feud or
    romance, 50, "the weakest row in the table"), row 20 (show over-runs, 60, runtime figures
    unverified), row 28 (pet on the carpet, 15, no evidence either way).
12. **Row 14's Vanguard medley base rates** (90 / 65 / 35) are 2022-2025 rates for a *living,
    performing* honoree. 2026's honoree is a posthumously-fronted band with no announced
    performance and no direct modern VMA precedent (packet 4 C9). The claim text
    `moments-row-14` says this explicitly. **These three squares are the pack's weakest
    pricing** and are the first thing to re-tune if the Vanguard format is announced before
    Sunday.

### Deliberately dropped

- **The Vanguard speech-length square** (packet 5 row 15), as the packet recommends: no outlet
  publishes stopwatch timings, so a timed square cannot be resolved fairly.
- **Row 13's "a tribute or legacy medley of any kind" reading at 90.** It duplicates row 33
  (legacy medley anchors the show, 85), which has cleaner 4-of-4 evidence. Only row 13's
  narrower deceased-artist memorial reading (35) is on the card.
- **Ricky Martin / Latin Icon 2026 as a named event** - see C8.
- **Any square naming a presenter.** No presenter list existed at the research cutoff.

---

## 4. Authoring decisions

### Entities (67)

One per distinct `artist_id` in `03-odds.json`, ids exactly as that file spells them so the
simulation joins without a mapping table. All `kind: person`, all `draftable: true`. Display
names come from packet 2's summary table; the single id mismatch is `asap-rocky` (odds file)
against `a-ap-rocky` (packet 2), resolved to the odds-file id with packet 2's display name
"A$AP Rocky".

`entity.group` is rendered as `film_name` on draft and roster rows, so it carries the artist's
headline nominated work, taken from the highest-tier category they appear in whose `work` is not
just the category name and is not marked UNCONFIRMED. Seven entities whose only entries are
category-name works get the literal string `2026 VMA nominee`: `bella-kay`, `flo`,
`magnus-ferrell`, `malcolm-todd`, `myles-smith`, `rauw-alejandro`, `sienna-spiro`.

Dossiers: every entity has exactly one `slate-<id>` claim listing its candidate slots and their
works. 20 entities carry additional sourced fact claims from packet 2's Tier-A dossiers and
flagged Tier-B lines; 5 carry discourse claims. 47 entities are nomination-only stubs with the
single slate claim, which is what packet 2 supports and nothing more.

Portraits: generated with
`npx tsx scripts/generate-portrait-tiles.mts --pack vma-2026 --entities <all 67 ids>`, committed
under `public/portraits/vma-2026/`, and sealed by the exact printed SHA-256. The generator is
deterministic; a rerun reproduces byte-identical files.

### Predictions (23)

One per odds-file category, `title` exactly the odds file's category string, candidates that
category's `artist_ids` with duplicates collapsed (D1; the odds file in fact has no intra-category
duplicates, so 155 rows collapse to 155 links). 23 is inside the 24-category cap the
`confidence_picks` check constraint imposes on a ranked confidence number.

D8 placeholder pricing, asserted by the test:

- **tier 1, 8 points** - Video of the Year, Artist of the Year, Song of the Year, Best New Artist
- **tier 2, 6 points** - the other nine fan-voted categories: Best Collaboration, Best Pop,
  Best Hip-Hop, Best R&B, Best Alternative, Best Dance, Best Country, Best Latin, Best K-Pop
- **tier 3, 6 points** - the six craft categories and the four social categories

Every prediction: `truth_authority: official_result`; adjudication `proxies: count`,
`offscreen: count`, `mentions: do_not_count`; three exclusions (four for the social categories,
four for Best New Artist whose voting reportedly stays open into the broadcast);
`title_review.status: approved` with a note that names the wording risk.

### Signature beats (12)

All official-result, all single-entity per the brief (a "first-time nominee wins Best New
Artist" beat cannot name one entity, so it is authored as `cortis-wins-best-new-artist`
instead). Probabilities are derived from the odds file's own per-candidate numbers by treating
categories as independent and computing the exact Poisson-binomial tail - no new judgment is
introduced, and `likelihood_tier` is derived exactly from the result.

| Beat | Entity | Pct | Tier | Points |
| --- | --- | --- | --- | --- |
| `madonna-wins-three-or-more` | madonna | 81 | likely | 12 |
| `taylor-swift-wins-three-or-more` | taylor-swift | 60 | likely | 12 |
| `sabrina-carpenter-wins-at-least-one` | sabrina-carpenter | 62 | likely | 12 |
| `bruno-mars-wins-at-least-one` | bruno-mars | 50 | toss_up | 20 |
| `pinkpantheress-wins-at-least-one` | pinkpantheress | 50 | toss_up | 20 |
| `lisa-wins-at-least-one` | lisa | 47 | toss_up | 20 |
| `gener8ion-wins-at-least-one` | gener8ion | 44 | toss_up | 20 |
| `madonna-wins-five-or-more` | madonna | 35 | long_shot | 30 |
| `bts-wins-two-or-more` | bts | 33 | long_shot | 30 |
| `cortis-wins-best-new-artist` | cortis | 33 | long_shot | 30 |
| `ariana-grande-wins-two-or-more` | ariana-grande | 30 | long_shot | 30 |
| `taylor-swift-takes-both-top-fan-awards` | taylor-swift | 19 | chaos | 45 |

Points scale is `likely 12 / toss_up 20 / long_shot 30 / chaos 45`, which matches the example
pack's single data point (55% toss_up priced at 20). Every beat excludes honorary and
non-competitive awards - including the Vanguard and any inaugural honor - from its win count.

### Bingo (46)

Live-broadcast moments only (D4), self-marked, so **every square carries
`adjudication.{proxies, offscreen, mentions}` all `do_not_count`**. `probability_pct` is the
packet 5 row's conservative base rate verbatim and `likelihood_tier` is derived exactly
(>=60 likely, >=40 toss_up, >=20 long_shot, else chaos). Every square has a basis claim quoting
its packet 5 row, `why_it_is_fun` and `storyline_tags`.

Tier mix: **24 likely, 13 toss_up, 6 long_shot, 3 chaos** - comfortably above the 7/9/6/2 board
mix `BOARD_TIER_MIX` needs to deal a full card.

The two rows packet 5 says swing 40+ points on wording alone are **pinned to the on-broadcast
reading**, because bingo is a live self-mark:

- `an-absent-artist-wins-on-air` - row 30 at **40**, not 85. Its exclusions say a category the
  telecast never announces does not count and to judge from the broadcast only.
- `one-artist-wins-three-on-air` - row 31 at **55**, not 85. Its exclusions exclude preshow and
  winners-post categories and honorary awards from the total.

Squares built from packet 4's run-of-show record: the Nirvana Vanguard trio
(`the-vanguard-segment-includes-a-performance`, `...runs-six-songs`, `...runs-eight-songs`),
`an-unreleased-song-is-debuted` (two announced slots are billed as premieres),
`a-host-bit-lands` (Snoop Dogg), `the-show-runs-past-its-window` (the 9:30 p.m. ET hard end of
the two-hour window), `a-category-is-dumped-to-social`, `a-legacy-act-reunites-on-stage` (the
honest form of the Nirvana-reunion question) and `a-second-honorary-award`.

### Commentary (4 voices)

Structure copied from `show-packs/examples/results-night-proof.json`: four voices, exactly one
`narrator`, complete `post_show` on all four with farewell orders 1-4 and delays 0/14/29/47.
Placeholder ids and names `tally`, `flare`, `archivum`, `glimmer` - **the operator renames these
before the show (brief D5)**. Instruction text is written from packet 6 section E's
attitude-only guidance; the four attitude claims are `source_material` / `attitude_only` and
quote section E's five-point briefs. Source-material attitudes may reference the 1984-2022
moments in section D but carry no factual authority. No voice is or represents a real person.
`commentary_requests` is empty - no line is generated, so no `grounded-line.mts` stamp is
required. `runtime_ceremonies` has two milestones, at `declared_event_count` 5 and 12, each
with all four voices, first delay zero and strictly increasing.

---

## 5. Verification run while authoring

| Check | Result |
| --- | --- |
| `npx tsx scripts/compile-show-pack.mts --input show-packs/research/vma-2026/vma-2026-authoring.json` | `publishable=true`, sources 7, claims 161, entities 67, portraits 67 verified, predictions 23, beats 12, bingo 46, voices 4 |
| `npx vitest run src/lib/vma-2026-pack.test.ts` | 13 passed |
| Mutation check | Changing one square's `probability_pct` off its tier, and separately deleting a prediction and mispricing another, both fail the test |
| Portrait regeneration | Rerun prints identical SHA-256s and leaves byte-identical files |
| Odds cross-check | 23/23 categories, 155/155 candidate rows, 67/67 artists resolve; no pack-only category or entity |
| `npx tsc -p tsconfig.app.json --noEmit` | clean |
| `npm test` | 759 passed across 96 files |

Not run: `npm run build`, `activate-show-pack.mts`, `scripts/simulate-results-night.mts`, and
anything touching Supabase or a phone.

---

## 6. Round two - the exact verification queue

Ordered by what breaks the game if it is wrong. Each row names the file and the field to edit.

### 6.1 Category slate and wording (highest priority)

| # | Verify against | Then edit |
| --- | --- | --- |
| 1 | `vote.mtv.com` or the Paramount Press Express nominations release: **MTV's exact string for all 23 categories**. Packet 1 says trade press normalizes capitalization and hyphenation ("Best Long Form Video" vs "Best Long-Form Video"). | `vma-2026-authoring.json` -> `predictions[].title`, and the matching `predictions[].condition` (the title is interpolated into it). The prediction `id` slug should follow. |
| 2 | Whether the slate really is **23 categories**. Packet 1 leaves Best Pop Artist, MTV Push Performance of the Year and Video for Good unresolved - dropped, or merely unannounced. If any exists, the pack is missing a category. | Add a `predictions[]` entry (and stay at or below 24 - the `confidence_picks` check constraint caps a confidence number at 24). Add any new candidate to `entities[]` and to that entity's `slate-*` claim. |
| 3 | **Best Collaboration's full nominee list.** Packet 1 recovered five, packets 2/3 six, and one Octagon summary refers to "seven nominated collaborations". | `predictions[id=best-collaboration].candidate_entity_ids` and `.basis_claim_ids`; add any new `entities[]` + `slate-*` claim. |
| 4 | **Song of Summer's full slate and work titles**, including whether Sabrina Carpenter, Taylor Swift ("I Knew It, I Knew You"), Slayyyter, sombr, Tame Impala & JENNIE and Stella Lefty are actually on it, and KATSEYE's title ("Hootie Frutti" vs "Hootie Fruity"). | `predictions[id=song-of-summer].candidate_entity_ids`; the work strings inside the affected `slate-*` claim texts. |
| 5 | **Best Visual Effects** (only four candidates) and **Best Long Form Video** (only four) - packet 1 flags both as possibly truncated, and packet 2 records two different Best Long Form Video lists. | `predictions[id=best-visual-effects]` and `[id=best-long-form-video]` candidate lists. |
| 6 | **Charli xcx's fourth nomination**, **Harry Styles's "Aperture" vs "Dance No More"**, and the **"RUNAWAY" vs "RUNWAY"** spelling. | `slate-charli-xcx`, `harry-styles-title-flag`, `lady-gaga-title-flag` claim texts; the work strings in `slate-harry-styles`, `slate-lady-gaga`. |
| 7 | **Nomination counts**: Madonna 13/11, Taylor Swift 11/9, Bruno Mars 7/6, and whether Sabrina Carpenter's *Man's Best Friend* really is a 2026 Best Album nominee given her 2025 Best Album win. | Claim `show-nomination-leaders`; `slate-sabrina-carpenter`. |

### 6.2 Candidate lists and entity identity

| # | Verify | Then edit |
| --- | --- | --- |
| 8 | That each **collaboration entry's primary credited artist** is the one this pack drafts (D1). The pack keys `Madonna & Sabrina Carpenter` to `madonna`, `Shakira & Burna Boy` to `shakira`, `Clipse, Kendrick Lamar, Pusha T & Malice` to `clipse`, `PinkPantheress + Zara Larsson` to `pinkpantheress`, `Lady Gaga & Doechii` to `lady-gaga`, `HUNTR/X` to `huntr-x`, and so on. A wrong key silently moves draft value between players. | `entities[].id` and every `predictions[].candidate_entity_ids` that uses it. Changing an id also changes its portrait filename - rerun `generate-portrait-tiles.mts` and re-paste the SHA-256. |
| 9 | **Display names** as MTV spells them: `SOMBR` vs `sombr`, `SIENNA SPIRO` vs `Sienna Spiro`, `KAROL G` vs `Karol G`, `Tyler, the Creator` vs `Tyler, The Creator`, `twenty one pilots`. | `entities[].name`. Ids and portraits are unaffected. |
| 10 | The seven entities whose `group` is the placeholder `2026 VMA nominee` (`bella-kay`, `flo`, `magnus-ferrell`, `malcolm-todd`, `myles-smith`, `rauw-alejandro`, `sienna-spiro`) - a nominated work would read better on a draft card. | `entities[].group`. |
| 11 | The 47 nomination-only stub dossiers. Packet 2 says 68 artists never got a dedicated source check. | Add claims and extend `entities[].dossier.fact_claim_ids`. |

### 6.3 Bingo base rates

| # | Verify | Then edit |
| --- | --- | --- |
| 12 | **Row 14, the Vanguard medley**, is the pack's weakest pricing: 2022-2025 rates applied to a posthumously-fronted band with no announced performance. Re-check packet 4 C3/C4/C7 for a 2026 announcement, and the packet 2 vs packet 4 conflict on whether Nirvana performs. | `bingo_squares` ids `the-vanguard-segment-includes-a-performance` (90), `the-vanguard-performance-runs-six-songs` (65), `the-vanguard-performance-runs-eight-songs` (35): `probability_pct` **and** `likelihood_tier`, which must stay exactly derived. Also claim `moments-row-14` and `show-vanguard-nirvana`. |
| 13 | **Row 12** (host names a feud or romance, 50) - packet 5 calls this the weakest row in the table, with no evidence for any year. | `bingo_squares[id=the-host-names-a-feud-or-romance]`, claim `moments-row-12`. |
| 14 | **Row 4** (speech played off, 40) - explicitly a placeholder, not a finding. | `bingo_squares[id=a-speech-gets-played-off]`, claim `moments-row-04`. |
| 15 | **Row 20** (show over-runs, 60) - the 11:18 p.m. and 11:03 p.m. sign-off times are unverified search-summary assertions, and the square is written against a 9:30 p.m. ET end that depends on conflict C6. | `bingo_squares[id=the-show-runs-past-its-window]` condition and `probability_pct`; claims `moments-row-20` and `show-date-venue-broadcast`. |
| 16 | **Row 28** (pet on the carpet, 15) and **row 8** (wardrobe incident, 30) - no evidence either way in the years reached. | `bingo_squares` ids `a-pet-on-camera`, `a-wardrobe-incident-on-stage`; claims `moments-row-28`, `moments-row-08`. |
| 17 | **Rows 2, 17, 26** (God thank-you, on-camera kiss, partner shout-out) - packet 5's open-questions list says the MTV acceptance-speech compilations would settle all three quickly if video review is possible. | `bingo_squares` ids `a-winner-thanks-god`, `a-kiss-on-camera`, `a-shout-out-to-a-partner`; claims `moments-row-02`, `moments-row-17`, `moments-row-26`. |
| 18 | **Row 32** (first and last award to one artist, 35) - packet 5 could not establish the literal running order of the first and last awards in 2023 and 2024. | `bingo_squares[id=first-and-last-award-to-one-artist]`, claim `moments-row-32`. |
| 19 | Whether **Rock the Bells Visionary** or **Latin Icon** returns in 2026, and whether the **Artist Director Honors** segment is real and televised (conflicts C8, C9). If an honorary award is confirmed, `a-second-honorary-award` at 85 can be tightened or a named square added - but only with a base rate. | `bingo_squares[id=a-second-honorary-award]`; claims `show-honorary-awards-open`, `show-artist-director-honors`. |

Anything that changes `probability_pct` must change `likelihood_tier` with it: the compiler
rejects a tier that is not exactly derived, and the test asserts the derivation independently.

### 6.4 Run of show

| # | Verify | Then edit |
| --- | --- | --- |
| 20 | **The presenter list** - nothing was announced at the research cutoff, and packet 4 calls this its largest hole. No square currently names a presenter. | New `bingo_squares[]` only if a base rate supports them; otherwise leave alone. |
| 21 | **Madonna's unnamed opening special guests** and any late performer additions. | Claims `show-madonna-opens`, `show-announced-performers`. |
| 22 | **Whether any regular category is presented off air** (packet 4 D2h, unannounced). The pack deliberately does not depend on this, but it is the single biggest driver of how the live floor feels. | Nothing in the pack; it affects operator pacing and the D8 revisit only. |

### 6.5 After round two

Re-run, in this order:

```text
npx tsx scripts/generate-portrait-tiles.mts --pack vma-2026 --entities <ids>   # only if ids changed
npx tsx scripts/compile-show-pack.mts --input show-packs/research/vma-2026/vma-2026-authoring.json
npx vitest run src/lib/vma-2026-pack.test.ts
npx tsx scripts/simulate-results-night.mts ...                                  # brief section 6
```

The test hard-codes 67 entities, 23 categories, 12 beats and 155 candidate links. Those numbers
are assertions about this slate, not about the schema - update them deliberately when round two
changes the slate, and say in the commit which packet row moved.

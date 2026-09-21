# Packet 3 — Odds: 2026 MTV Video Music Awards

**Event:** Sunday, September 27, 2026, Peacock Theater, Los Angeles. Live on CBS
7:30-9:30 p.m. ET / 4:30-6:30 p.m. PT (a two-hour show), simulcast on MTV, streaming on
Paramount+. Host: Snoop Dogg. Video Vanguard: Nirvana.

**Cutoff / date checked for every row below:** 2026-09-21.

**Every probability in this document is my ESTIMATE.** None of them is a bookmaker price
unless the row says so. They are a modelling input for
`scripts/simulate-results-night.mts`, not a published market.

---

## 0. Method, and an honest statement of its limits

### 0.1 How these pages were read (read this before trusting any row)

The sandbox's egress proxy blocked direct page fetches for **every** domain I tried
(billboard.com, rollingstone.com, deadline.com, variety.com, en.wikipedia.org, mtv.com,
vote.mtv.com, cbsnews.com, goldderby.com). Every fact below therefore comes from **search-engine
summaries of those pages, not from the pages themselves.** The URLs are real and are the
provenance of the claim, but I did not see the rendered article.

Consequence for the authoring lane: **the nominee slate in this packet is good enough to build
and simulate against, but it is not yet a verified screen/discourse claim.** Packet 1 (Slate)
must re-derive the list from the primary source — the Paramount Press Express releases (S7, S6)
or vote.mtv.com (S8) — before any `basis_claim_ids` in the show pack point at it. Where two
sources disagreed I say so inline and mark it UNCONFIRMED.

### 0.2 Inputs I used, each cited

| Input | What I actually found | Source | Status |
| --- | --- | --- | --- |
| Bookmaker / prediction-market lines | Kalshi runs a 2026 VMA market group (S14). The only numbers I could recover through search summaries were Video of the Year Taylor Swift ~1.73x (~57% implied) and Madonna ~4.51x (~21%), and an Artist of the Year pair (Swift ~43%, Madonna ~44%) that does not internally cohere. Octagon (S15) reports a Best Collaboration market but its summary claims "three contenders priced above 75% implied" in a mutually exclusive market, which is impossible. | S14, S15 | **UNCONFIRMED — low fidelity.** Treated as a weak directional tiebreak only, never as the primary weight. No traditional sportsbook line for the 2026 VMAs was locatable. |
| Prior fan-vote outcomes 2023-2025 | 2023: Taylor Swift won 9 including Video of the Year ("Anti-Hero"), Artist of the Year, Song of the Year, Best Pop, Album. 2024: Swift won 7 of 12 including Video and Artist of the Year ("Fortnight"), becoming the most-awarded solo artist in VMA history. 2025 (Swift absent): Lady Gaga led with 4 (Artist of the Year, Best Collaboration, Best Direction, Best Art Direction); Ariana Grande won 3 (Video of the Year, Best Long Form Video, Best Pop for "Brighter Days Ahead"); Sabrina Carpenter won 3 (Best Album for *Short n' Sweet*, Best Pop Artist, Best Visual Effects). | S19, S18, S16, S17 | Sourced. The governing pattern: **when Swift is in the field and present, she converts fan votes at a rate nobody else matches; when she is absent the field opens up.** |
| Fandom scale as a vote-mobilization proxy | I could not retrieve Instagram / TikTok / Spotify monthly-listener figures for any nominee within the session's search budget. | none | **UNCONFIRMED.** I substituted a qualitative mobilization ranking built from observed fan-vote history: Swifties, BTS ARMY, BLINKs, Beliebers, the twenty one pilots Clique, Harries and Team Breezy are the blocs with a documented record of winning open fan votes. Every row that leans on this says so, and no row leans on it alone. |
| Precursors: Grammys, charts, streaming | 68th Grammys, Feb 1 2026: Bad Bunny won Album of the Year for *DeBÍ TiRAR MáS FOToS*; Kendrick Lamar with SZA won Record of the Year for "luther"; Kendrick led with 9 nominations. Billboard notes that four of the six Video of the Year nominees carry hits: "hate that i made you love me" (Grande), "I Just Might" (Mars) and "The Fate of Ophelia" (Swift) all reached No. 1 on the Hot 100, and "Tears" (Carpenter) peaked at No. 3. | S28, S1 | Sourced, but note the Grammy window (2025 recordings) only partially overlaps the VMA video-eligibility window, so Grammy results are a weak precursor here. Per-song streaming totals: **UNCONFIRMED.** |
| Confirmed attendance / performance | Madonna opens the show — her first VMA performance in 23 years (S9). Also announced to perform: LISA, RAYE, Shaboozey, Gunna, GENER8ION and Sienna Spiro (S10, S11). Taylor Swift will receive the **inaugural MTV VMA Artist Director Honors** (S12), which all but confirms she is in the room. Ricky Martin receives the first Latin Icon Award (S31). Nirvana receives the Video Vanguard (S13). **Sabrina Carpenter and Ariana Grande were not on the performer list as of Sept 18** (S10). | S9-S13, S31 | Sourced. Attendance is loaded as a modest upward nudge on on-air categories, consistent with the historical pattern that MTV's televised awards skew toward people who are in the building. |

### 0.3 Category architecture for 2026 (23 categories)

- **13 fan-voted categories** at vote.mtv.com, closing **Thu Sept 25, 6:00 p.m. ET**, except
  **Best New Artist**, which stays open into the live broadcast (S1, S8).
  These are: Video of the Year, Artist of the Year, Song of the Year, Best New Artist,
  Best Collaboration, Best Pop, Best Hip-Hop, Best R&B, Best Alternative, Best Dance,
  Best Country, Best Latin, Best K-Pop.
- **6 professional / craft categories** decided by industry voters, not fans: Best Direction,
  Best Choreography, Best Cinematography, Best Editing, Best Visual Effects, Best Art Direction
  (S1, S26). **This is the single most important structural fact in this packet** — the seven
  categories Madonna is strongest in are the ones Swifties cannot vote in.
- **4 social categories**, voted entirely on MTV's Instagram Stories, announced Sept 18 (S5, S6):
  - Best Group — three-round bracket, opens Mon Sept 21 11:00 a.m. ET, closes Thu Sept 24 11:00 a.m. ET
  - Best Long Form Video — one round, tap to vote, Thu Sept 24 to Fri Sept 25, 11:00 a.m. ET
  - Best Album — one round, Fri Sept 25 to Sat Sept 26, 11:00 a.m. ET
  - Song of Summer — one round, Sat Sept 26 to Sun Sept 27, 11:00 a.m. ET
- **Dropped for 2026:** Best Rock, gone for the first time in nearly four decades — rock entrants
  are folded into Best Alternative (S20). Best Afrobeats is also scrapped after one year (S21).
  Best Pop Artist, Best Group as a telecast category and Push Performance of the Year are not in
  the 2026 fan-voted slate; Best Group survives only as a social category (S1, S5).
- **Honorary, not competitive, so not modelled here:** Video Vanguard (Nirvana), Latin Icon Award
  (Ricky Martin), Artist Director Honors (Taylor Swift).

### 0.4 The `presented` field is my estimate, not MTV's running order

MTV has published no running order. The only hard facts are the two-hour window and the four
social categories. I have therefore assigned:

- `on_air_expected` to the six categories a two-hour telecast almost certainly makes room for
  (Video of the Year, Artist of the Year, Song of the Year, Best New Artist, Best Collaboration,
  Best Pop);
- `preshow_expected` to the other seven fan-voted genre categories and to all six craft
  categories, which at recent VMAs have been handed out off-air or in the pre-show;
- `social_expected` to the four Instagram categories.

A two-hour show carrying a Vanguard segment, a Latin Icon Award, an Artist Director Honors and
seven-plus performances has very little award time left. **If the operator needs this split to be
right, it must be re-checked against MTV's own run-of-show on the day — see packet 4.** Treat the
`presented` value as a tiering hint for draft pricing, not as truth.

### 0.5 Overall confidence

- **Slate completeness: medium-high.** 23 categories, 152 candidate rows. Two known gaps, both
  flagged inline: Best Collaboration (Octagon refers to "seven nominated collaborations" but only
  six are nameable from the lists I saw), and five Song of Summer work titles.
- **Probability quality: medium for the top of each card, low for the tail.** The favorites are
  reasoned from a real and consistent historical pattern. The 4-8% rows are shaped guesses.
- **The thing most likely to make this packet wrong:** a single unsourced assumption that Taylor
  Swift's Artist Director Honors means she attends and campaigns. If she does not show, Video of
  the Year, Artist of the Year, Best Pop, Best Album and Song of Summer all move sharply toward
  Madonna, Sabrina Carpenter and Ariana Grande. The simulation should be run a second time with a
  "Swift absent" variant before the point scale in D8 is locked.

### 0.6 Strongest favorites and true toss-ups

**Strongest favorites (my estimate >= 0.40):** Madonna for Best Long Form Video (0.55); BTS for
Best Group (0.45); Taylor Swift for Video of the Year (0.46), Artist of the Year (0.42) and Best
Album (0.42).

**True toss-ups (leader under 0.35 with at least two live rivals):** Best Choreography
(Madonna 0.26 / GENER8ION 0.24), Best Hip-Hop (Drake 0.28 / Cardi B 0.22 / Megan Thee Stallion
0.19), Best R&B (Bruno Mars 0.28 / Justin Bieber 0.21 / Kehlani 0.18 / Chris Brown 0.17), Best
Country (Ella Langley 0.32 / Shaboozey 0.28), Best New Artist (CORTIS 0.33 with four others
alive), Best Collaboration (Madonna & Sabrina Carpenter 0.34 over two 0.20-plus rivals), Best
Dance (Madonna 0.32 / Lady Gaga 0.22 / Harry Styles 0.17) and Best Art Direction (Madonna 0.28
over a flat field). These are the categories worth the highest confidence spread in the game.

---

## Source key

Every table row cites by key. Full URLs, all checked 2026-09-21:

- **S1** Billboard, "Madonna Leads 2026 MTV VMA Nominations: Full Updated List" — https://www.billboard.com/lists/2026-mtv-vma-nominations-list-madonna-video-music-awards/
- **S2** Rolling Stone, "2026 MTV VMAs: Full List of Nominees" — https://www.rollingstone.com/music/music-news/2026-mtv-vmas-nominees-full-list-taylor-swift-madonna-1235610787/
- **S3** Deadline, "MTV Video Music Awards 2026 Nominations" — https://deadline.com/lists/mtv-video-music-awards-2026-nominations-vma/
- **S4** Variety, "Madonna Leads VMAs Nominations With 11" — https://variety.com/2026/music/news/madonna-leads-vmas-nominations-taylor-swift-1236837092/
- **S5** Billboard, "Madonna, BTS & More Receive 2026 VMAs Nominations in Social Categories" — https://www.billboard.com/lists/2026-mtv-vmas-nominations-social-categories-list/
- **S6** Paramount Press Express, "Social Categories Revealed for the 2026 MTV VMAs" — https://www.paramountpressexpress.com/cbs-entertainment/shows/2026-mtv-video-music-awards-vmas/releases/?view=113265-social-categories-revealed-for-the-2026-mtv-video-music-awards-vmas-sunday-sept-27-on-cbs
- **S7** Paramount Press Express, "Nominations Revealed for 2026 MTV VMAs" — https://www.paramountpressexpress.com/mtv/shows/2026-mtv-video-music-awards-vmas/releases/?view=113133-nominations-revealed-for-2026-mtv-video-music-awards-vmas-airing-live-from-los-angeles-sunday-sept-27-on-cbs
- **S8** MTV official voting portal — https://vote.mtv.com/
- **S9** Billboard, "Madonna to Open 2026 VMAs" — https://www.billboard.com/music/awards/madonna-2026-vmas-opening-performer-1236341723/
- **S10** Billboard, "LISA, RAYE, Sienna Spiro & More Added as Performers" — https://www.billboard.com/music/awards/2026-vmas-additional-performers-announced-lisa-raye-1236342221/
- **S11** Rolling Stone, "Lisa, Shaboozey, Gunna Join 2026 VMAs Performers Lineup" — https://www.rollingstone.com/music/music-news/lisa-shaboozey-gunna-mtv-video-music-awards-performers-1235628383/
- **S12** The Hollywood Reporter, "2026 VMAs: Taylor Swift to Receive Inaugural Artist Director Honors" — https://www.hollywoodreporter.com/music/music-news/2026-vmas-taylor-swift-artist-director-honors-1236706910/
- **S13** Billboard, "Nirvana Is the MTV Video Vanguard Recipient for 2026" — https://www.billboard.com/music/awards/nirvana-mtv-video-vanguard-recipient-2026-1236336360/
- **S14** Kalshi, VMA prediction markets — https://kalshi.com/category/culture/vma
- **S15** Octagon, "VMA Collab Market Upended" — https://www.octagonai.co/news/mtv-vma-best-collaboration-odds-2026
- **S16** Variety, 2025 VMAs full winners list — https://variety.com/2025/awards/news/2025-vmas-winners-list-mtv-1236511226/
- **S17** Billboard, all 2025 MTV VMAs winners — https://www.billboard.com/music/awards/vmas-winners-list-2025-1236060866/
- **S18** Variety, 2024 VMAs winners list — https://variety.com/2024/awards/news/2024-vmas-winners-list-mtv-1236141425
- **S19** Billboard, 2023 MTV VMAs winners list — https://www.billboard.com/music/awards/2023-mtv-vmas-winners-list-1235411480/
- **S20** WCSX, "Rock Loses Its Own MTV VMAs Category After Nearly Four Decades" — https://wcsx.com/2026/08/25/rock-loses-its-own-mtv-vmas-category-after-nearly-four-decades/
- **S21** Premium Times, "Burna Boy, Tems secure 2026 MTV VMAs nominations despite scrapped Afrobeats category" — https://www.premiumtimesng.com/entertainment/music/904093-burna-boy-tems-secure-2026-mtv-vmas-nominations-despite-scrapped-afrobeats-category.html
- **S22** Soompi, "BTS, BLACKPINK, CORTIS, LE SSERAFIM, KATSEYE, And HUNTR/X Nominated" — https://www.soompi.com/article/1863718wpp/bts-blackpink-cortis-le-sserafim-katseye-and-huntr-x-nominated-for-2026-mtv-video-music-awards
- **S23** Korea JoongAng Daily, "BTS, HUNTR/X and Blackpink's Lisa lead K-pop nominees" — https://www.koreajoongangdaily.com/entertainment/bts-huntrx-lisa-lead-kpop-nominees-at-2026-mtv-vmas/12831596
- **S24** Holler, "MTV VMAs 2026: Ella Langley, Noah Kahan and All the Country & Folk Nominations" — https://holler.country/news/general/mtv-vmas-2026-ella-langley-noah-kahan-and-all-the-country-and-folk-nominations/
- **S25** Hola, "Bruno Mars, Shakira, Bad Bunny, Karol G and more Latinos earn 2026 MTV VMAs nominations" — https://www.hola.com/us/entertainment/20260819918722/2026-mtv-vmas-latinos-full-list-nominations/
- **S26** Gold Derby, 2026 MTV VMA nominations full list — https://www.goldderby.com/music/2026/2026-mtv-video-music-awards-nominations-full-list-madonna-taylor-swift/
- **S27** Billboard, "2026 VMAs Video of the Year Nominees: Who Should Win?" — https://www.billboard.com/music/awards/2026-mtv-vmas-video-of-the-year-nominees-poll-vote-1236319512/
- **S28** Recording Academy, 2026 Grammys full winners and nominees — https://www.grammy.com/news/2026-grammys-nominations-full-winners-nominees-list/
- **S29** Billboard Canada, "Tate McRae, Drake and Justin Bieber Earn 2026 VMA Nominations" — https://ca.billboard.com/music/awards/tate-mcrae-vmas-2026
- **S30** E! Online, "MTV VMAs 2026: Nominees Full List" — https://www.eonline.com/news/1435125/mtv-vmas-2026-nominees-full-list
- **S31** TVInsider, "2026 Video Music Awards: Host, Nominees, Performers, Air Date" — https://www.tvinsider.com/1258685/mtv-video-music-awards-2026-host-nominees-performers-vanguard/
- **S32** The FADER, "This year's VMAs nominations lean pop, legacy, and white" — https://www.thefader.com/2026/08/20/vmas-2026-nominations-takeaways
- **S33** In Music Blog, "MTV VMAs Add Ella Langley, Bruno Mars and Harry Styles to Best Album" — https://inmusicblog.com/news/mtv-vmas-2026-best-album-new-nominees/
- **S34** Men's Journal, "Madonna Leads 2026 MTV VMA Nominations, Taylor Swift Is One Win From History" — https://www.mensjournal.com/entertainment/madonna-leads-2026-mtv-vma-nominations-taylor-swift-is-one-win-from-history

---

# Part A — Fan-voted categories (vote.mtv.com, closes Sept 25 6:00 p.m. ET)

## 1. Video of the Year

Presented: **on_air_expected**. Fan-voted. Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Taylor Swift — "The Fate of Ophelia" | **0.46** | Won Video of the Year in 2022, 2023 and 2024; no artist converts an open fan vote at her rate. Hot 100 No. 1. Receiving the inaugural Artist Director Honors, so she is in the room, and one win makes her the most-awarded artist in VMA history — an on-air moment MTV is built to want. Kalshi's recoverable VOTY line reads roughly 57% for Swift (UNCONFIRMED, S14). | S1, S12, S14, S18, S19, S34 | 2026-09-21 |
| Madonna — "Confessions II – The Film" | **0.24** | Leading nominee (11 competitive, 13 with social) and she opens the show for the first time in 23 years, so the night is built around her. Discounted because Video of the Year is a pure fan vote and her audience is broad rather than vote-brigading, and because the craft categories are where her sweep is likelier. | S1, S4, S9, S14 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.12** | Defending Video of the Year winner (2025, "Brighter Days Ahead") and a Hot 100 No. 1 this cycle. Discounted: not on the announced performer list as of Sept 18, and last year's field lacked Swift. | S1, S10, S16, S17 | 2026-09-21 |
| Sabrina Carpenter — "Tears" | **0.11** | Seven competitive nominations, a very live current fanbase, and three wins at the 2025 show. "Tears" peaked at No. 3 rather than No. 1, and she is not on the performer list. | S1, S10, S16 | 2026-09-21 |
| Bruno Mars — "I Just Might" | **0.05** | Hot 100 No. 1 and enormous global streaming, but a long record of under-converting in VMA fan votes; his 2025 win came as a featured collaborator on Lady Gaga's "Die With a Smile". | S1, S16 | 2026-09-21 |
| GENER8ION — "STORM starring Yung Lean" | **0.02** | The critics' entry: nominated for direction and choreography too, and GENER8ION performs on the night. No mass fan-vote base. | S1, S11, S32 | 2026-09-21 |

## 2. Artist of the Year

Presented: **on_air_expected**. Fan-voted. Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Taylor Swift | **0.42** | Won Artist of the Year in 2022, 2023 and 2024. *The Life of a Showgirl* cycle is at full strength and she is attending. | S1, S12, S18, S19 | 2026-09-21 |
| Madonna | **0.25** | Lead nominee, opening performer, and the whole telecast is staged as her return; that narrative pull is real even in a fan vote. Kalshi's Artist of the Year pair (Swift ~43%, Madonna ~44%) is internally incoherent and is treated as noise, not signal. | S1, S9, S14 | 2026-09-21 |
| Sabrina Carpenter | **0.14** | Won Best Pop Artist and Best Album in 2025; the most mobilized fanbase in the field after Swift's. | S1, S16, S17 | 2026-09-21 |
| Ariana Grande | **0.09** | Three wins in 2025 but lost Artist of the Year to Lady Gaga that night; no confirmed attendance. | S1, S10, S16 | 2026-09-21 |
| Bruno Mars | **0.06** | Vast streaming footprint, weak fan-vote conversion at this specific show. | S1, S16 | 2026-09-21 |
| Morgan Wallen | **0.04** | Largest raw streaming numbers of anyone here, but country audiences have never organized an MTV fan vote, and he has no VMA win history. | S1, S24 | 2026-09-21 |

## 3. Song of the Year

Presented: **on_air_expected**. Fan-voted. Seven nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| BTS — "Swim" | **0.33** | ARMY is the most reliable bloc in any open MTV fan vote; BTS won Song of the Year in 2021 and Best Group four years running 2019-2022. First eligible cycle since the hiatus ended, which historically produces a surge. | S1, S5, S22, S23 | 2026-09-21 |
| HUNTR/X (EJAE, Audrey Nuna, REI AMI) — "Golden" | **0.19** | The largest song in the field by cultural reach this cycle. Discounted because a fictional on-screen group has no single fandom to mobilize a vote, which is exactly the failure mode fan votes punish. | S1, S22 | 2026-09-21 |
| Madonna & Sabrina Carpenter — "Bring Your Love" | **0.19** | Two of the three biggest vote-getters in the building on the same record, on Madonna's night; also up for Best Collaboration. | S1, S4, S9 | 2026-09-21 |
| RAYE — "WHERE IS MY HUSBAND!" | **0.10** | Performing on the telecast, which historically correlates with an on-air win; strong critical and chart year. | S1, S10 | 2026-09-21 |
| Olivia Dean — "Man I Need" | **0.09** | Breakout of the cycle with a Best Album nomination alongside this; audience is broad but young and online. | S1, S5 | 2026-09-21 |
| PinkPantheress + Zara Larsson — "Stateside" | **0.06** | Five nominations apiece signals MTV's regard, but the song's vote base is thinner than the field leaders'. | S1, S29 | 2026-09-21 |
| Ella Langley — "Choosin' Texas" | **0.04** | Five nominations across four lanes marks her as MTV's push act, but country entries do not win the marquee fan-voted song award. | S1, S24 | 2026-09-21 |

## 4. Best New Artist

Presented: **on_air_expected**. Fan-voted and **stays open into the live broadcast**, which
historically rewards whichever fandom can sustain real-time voting. Seven nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| CORTIS | **0.33** | A HYBE rookie group also nominated for Best K-Pop and Best Group. A vote that stays open during the telecast is the exact format K-pop fandoms dominate. | S1, S5, S22, S23 | 2026-09-21 |
| Sienna Spiro | **0.18** | The only Best New Artist nominee confirmed to perform on the show; MTV giving a newcomer the stage is usually a tell. | S1, S10 | 2026-09-21 |
| Myles Smith | **0.16** | Largest streaming base among the non-K-pop nominees and an established awards-circuit newcomer. | S1, S30 | 2026-09-21 |
| Stella Lefty | **0.14** | Triple-nominated (Best New Artist, Best Country, Song of Summer), which is the widest institutional push in the category. | S1, S5, S24 | 2026-09-21 |
| Malcolm Todd | **0.09** | Real online following, no second nomination to amplify him. | S1, S30 | 2026-09-21 |
| Bella Kay | **0.06** | Single nomination, limited mainstream profile. UNCONFIRMED whether she has any additional MTV promotion. | S1 | 2026-09-21 |
| Magnus Ferrell | **0.04** | Smallest measurable base in the field. | S1 | 2026-09-21 |

## 5. Best Collaboration

Presented: **on_air_expected**. Fan-voted. **Six nominees are nameable from the published lists;
Octagon's market write-up refers to "seven nominated collaborations" (S15). A seventh nominee may
exist — UNCONFIRMED. Packet 1 must resolve this before the pack is compiled.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna & Sabrina Carpenter — "Bring Your Love" | **0.34** | Two top-four nominees on one record on the night MTV built around Madonna; also a Song of the Year nominee. Octagon reports this was the early market favorite before a repricing it describes incoherently, so the repricing is discounted. | S1, S4, S9, S15 | 2026-09-21 |
| Shakira & Burna Boy — "Dai Dai" | **0.21** | Official song of the 2026 FIFA World Cup, which is being staged across North America — the widest global reach of any record in the category, over two large and geographically distinct fanbases. | S1, S21, S25 | 2026-09-21 |
| Clipse, Kendrick Lamar, Pusha T & Malice — "Chains & Whips" | **0.20** | Kendrick led the 2026 Grammys with nine nominations and took Record of the Year; the most critically weighted entry and a genuine fan-vote force. | S1, S28 | 2026-09-21 |
| PinkPantheress + Zara Larsson — "Stateside" | **0.13** | Five nominations each across pop, dance, art direction and visual effects; a real contender, without a single dominant fandom. | S1, S29 | 2026-09-21 |
| Teyana Taylor & Lucky Daye — "Hard Part" | **0.07** | Critically admired R&B pairing. Octagon claims a 92% implied probability here after an 88-point move, which cannot be right in a mutually exclusive market and is disregarded (S15). | S1, S15 | 2026-09-21 |
| French Montana x Max B — "Ever Since U Left Me" | **0.05** | Strong story, smallest active voting base in the category. | S1 | 2026-09-21 |

## 6. Best Pop

Presented: **on_air_expected**. Fan-voted. Seven nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Taylor Swift — "The Fate of Ophelia" | **0.37** | Won Best Pop in 2023; Hot 100 No. 1 this cycle; present and campaigning. | S1, S12, S19 | 2026-09-21 |
| Sabrina Carpenter — "House Tour" | **0.16** | Won Best Pop Artist in 2025; the strongest non-Swift pop fanbase in the field. | S1, S16, S17 | 2026-09-21 |
| LISA — "Dream feat. Kentaro Sakaguchi" | **0.15** | Four nominations, and she performs on the telecast. BLINK and LISA-specific fandoms are among the most effective fan-vote blocs, which matters more here than genre fit. | S1, S10, S22, S23 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.14** | Defending Best Pop winner with a Hot 100 No. 1; no confirmed attendance. | S1, S10, S16 | 2026-09-21 |
| Olivia Rodrigo — "drop dead" | **0.09** | Large and loyal base, but her vote is likely split with her Best Alternative nomination for "the cure", which is the entry her audience treats as the flagship. | S1, S2 | 2026-09-21 |
| Tate McRae — "Nobody's Girl" | **0.05** | Three nominations for the same video (pop, dance, choreography), which reads as craft regard rather than vote strength. | S1, S29 | 2026-09-21 |
| Charli xcx — "SS26" | **0.04** | Critically loud, also up for art direction and long form; her fanbase has never converted this award. | S1, S5 | 2026-09-21 |

## 7. Best Hip-Hop

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Six nominees. **A genuine toss-up.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Drake — "Janice STFU" | **0.28** | The largest raw fanbase in the category and a repeat VMA hip-hop winner; also up for Best Album with *Iceman*. Discounted for the reputational drag of the Kendrick feud on exactly the young, online voters this category draws. | S1, S5, S29 | 2026-09-21 |
| Cardi B ft. Kehlani — "Safe" | **0.22** | Peak-cycle visibility and a fanbase with a strong record in open fan votes; Kehlani's own nomination in Best R&B doubles her presence on the ballot. | S1, S2 | 2026-09-21 |
| Megan Thee Stallion — "LOVER GIRL" | **0.19** | Multiple prior VMA wins and a Hotties bloc that reliably turns out. | S1, S2 | 2026-09-21 |
| Travis Scott — "DUMBO" | **0.13** | Enormous streaming, historically weak VMA fan-vote conversion. | S1, S2 | 2026-09-21 |
| Tyler, The Creator — "SUGAR ON MY TONGUE" | **0.12** | Best-reviewed entry and a devoted base, but a smaller one than the three leaders. | S1, S2 | 2026-09-21 |
| Don Toliver — "E85" | **0.06** | Solid streaming year, no comparable mobilization. | S1, S2 | 2026-09-21 |

## 8. Best R&B

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Six nominees. **The flattest card of the
night.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Bruno Mars — "I Just Might" | **0.28** | The only Hot 100 No. 1 in the category and also a Video of the Year and Best Album nominee — the biggest record in a field of comparable fanbases. | S1, S5 | 2026-09-21 |
| Justin Bieber — "YUKON" | **0.21** | Beliebers remain one of the most durable fan-vote blocs and his current cycle re-activated them. | S1, S29 | 2026-09-21 |
| Kehlani — "Folded" | **0.18** | The category's breakout streaming story, and she also appears on Cardi B's Best Hip-Hop entry. | S1, S2 | 2026-09-21 |
| Chris Brown — "It Depends/Obvious" | **0.17** | Team Breezy has a documented history of winning open fan votes out of proportion to chart position; this is the category's live upset. | S1, S2 | 2026-09-21 |
| Mariah the Scientist & Kali Uchis — "Is It a Crime" | **0.09** | Two rising acts with real online followings but no fan-vote track record. | S1, S2 | 2026-09-21 |
| Dave & Tems — "Raindance" | **0.07** | Tems' only nomination this year after Best Afrobeats was scrapped; a UK-weighted base in a US-weighted vote. | S1, S21 | 2026-09-21 |

## 9. Best Alternative

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Seven nominees. Absorbs the rock field
now that Best Rock has been retired (S20).

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Olivia Rodrigo — "the cure" | **0.34** | By far the largest fanbase in the category, and the video's Video of the Year snub became its own news story, which tends to drive corrective fan voting. | S1, S2, S20 | 2026-09-21 |
| twenty one pilots — "Drag Path" | **0.22** | The Clique has won this category before and is one of the few blocs that can outvote a pop superstar in a genre lane; also nominated for Best Group. | S1, S5 | 2026-09-21 |
| sombr — "Homewrecker" | **0.16** | The cycle's biggest alternative streaming breakout, with a second nomination in art direction and a Song of Summer slot. | S1, S5 | 2026-09-21 |
| Tame Impala — "Dracula" | **0.10** | Long-established festival audience, also on the Song of Summer ballot with JENNIE, but a diffuse voting base. | S1, S5 | 2026-09-21 |
| Noah Kahan — "The Great Divide" | **0.08** | Large and devoted live audience that has not historically shown up in MTV fan votes. | S1, S24 | 2026-09-21 |
| mgk & Fred Durst — "FIX UR FACE" | **0.06** | The nostalgia play and the closest thing to a rock entry; mgk has won here before but his current base is smaller. | S1, S20 | 2026-09-21 |
| Geese — "Taxes" | **0.04** | The critics' record of the year and a Best Group nominee, with the smallest voting bloc in the field. | S1, S5, S32 | 2026-09-21 |

## 10. Best Dance

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Returns for the first time in seven years.
Seven nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.32** | Billboard explicitly frames this as the category she has never won and may well win this year, on a night built around her, in the genre that is her home ground. | S1, S9 | 2026-09-21 |
| Lady Gaga & Doechii — "RUNAWAY" | **0.22** | Gaga led the 2025 VMAs with four wins including Artist of the Year; Little Monsters plus Doechii's rising base is a serious combination. | S1, S16, S17 | 2026-09-21 |
| Harry Styles — "Aperture" | **0.17** | Harries are a top-tier fan-vote bloc and this is his return cycle; he is also up for Best Album and Best Choreography. | S1, S5 | 2026-09-21 |
| PinkPantheress + Zara Larsson — "Stateside" | **0.11** | The most natural genre fit on the card and a five-nomination showing, without a dominant fandom. | S1, S29 | 2026-09-21 |
| Tate McRae — "Nobody's Girl" | **0.09** | One of three nominations for this video; strong dance credentials, mid-tier vote scale. | S1, S29 | 2026-09-21 |
| Bebe Rexha & Faithless — "New Religion" | **0.05** | Credible dance record, small active voting base. | S1, S2 | 2026-09-21 |
| Slayyyter — "DANCE…" | **0.04** | Intense niche following, also on the Song of Summer ballot; too small to win an open vote. | S1, S5 | 2026-09-21 |

## 11. Best Country

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Seven nominees. **Toss-up between two.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Ella Langley — "Choosin' Texas" | **0.32** | Five nominations across four lanes (country, Song of the Year, Best Long Form Video, Best Album, Song of Summer) — the widest institutional push of any country act MTV has ever run, and she led the 2026 CMA nominations. | S1, S5, S24, S26 | 2026-09-21 |
| Shaboozey — "Cowgirl" | **0.28** | Performing on the telecast, which is the single strongest attendance signal in this category, plus a second nomination in cinematography. The most MTV-native country artist in the field. | S1, S11, S24 | 2026-09-21 |
| Lainey Wilson — "Somewhere Over Laredo" | **0.12** | Largest mainstream country-awards profile here; no MTV-specific mobilization. | S1, S24 | 2026-09-21 |
| Luke Combs — "Back in the Saddle" | **0.11** | Biggest raw audience in the category, least online of the field. | S1, S24 | 2026-09-21 |
| Kacey Musgraves — "Dry Spell" | **0.08** | Crossover credibility with the young online audience that votes here, smaller current cycle. | S1, S24 | 2026-09-21 |
| Tucker Wetmore — "Brunette" | **0.05** | Fast-rising streaming act, first VMA cycle. | S1, S24 | 2026-09-21 |
| Stella Lefty — "Boston" | **0.04** | Triple-nominated newcomer whose realistic win is Best New Artist, not this. | S1, S5, S24 | 2026-09-21 |

## 12. Best Latin

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Seven nominees. **Nominee attribution for
"La Perla" is UNCONFIRMED** — one source credits Rauw Alejandro with Yahritza y su Esencia, another
credits Rosalía with Yahritza y su Esencia. Packet 1 must resolve this.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Bad Bunny — "Nuevayol" | **0.31** | Won Album of the Year at the 2026 Grammys for *DeBÍ TiRAR MáS FOToS*, the first primarily Spanish-language album to do so; a prior VMA Artist of the Year winner and the largest Latin fanbase on earth. | S1, S25, S28 | 2026-09-21 |
| KAROL G — "Papasito" | **0.22** | The most consistent Latin fan-vote converter at this show over the last four cycles. | S1, S25 | 2026-09-21 |
| Shakira & Burna Boy — "Dai Dai" | **0.19** | World Cup record with two enormous fanbases; competing against itself in Best Collaboration, which may split effort. Ricky Martin's Latin Icon Award means the Latin segment gets airtime. | S1, S25, S31 | 2026-09-21 |
| Anitta & Shakira — "Choka Choka" | **0.11** | Anitta has won this category before and Brazilian fan mobilization is formidable; Shakira appearing twice on the card splits her own vote. | S1, S25 | 2026-09-21 |
| Fuerza Regida — "Tu Sancho" | **0.08** | Regional Mexican's biggest streaming act and a Best Group nominee, so MTV is investing in them. | S1, S5, S25 | 2026-09-21 |
| Rauw Alejandro & Yahritza y su Esencia — "La Perla" | **0.05** | Credit line UNCONFIRMED (see note above); the most critically decorated entry either way, with a modest vote base. | S1, S25 | 2026-09-21 |
| Ryan Castro — "LA VILLA" | **0.04** | Smallest US-facing profile in the category. | S1, S25 | 2026-09-21 |

## 13. Best K-Pop

Presented: **preshow_expected** (ESTIMATE). Fan-voted. Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| BTS — "Swim" | **0.38** | First eligible cycle after the hiatus, and ARMY's record in MTV fan votes (Best Group 2019-2022, Song of the Year 2021) is the strongest in the show's modern history. | S1, S5, S22, S23 | 2026-09-21 |
| BLACKPINK — "JUMP" | **0.22** | BLINKs match ARMY for scale if not for discipline; a full-group comeback cycle. | S1, S5, S22 | 2026-09-21 |
| LISA — "Dream feat. Kentaro Sakaguchi" | **0.16** | Four nominations, performing on the telecast, and a prior winner in this lane. Her own fanbase overlaps and competes with BLACKPINK's on the same ballot. | S1, S10, S22, S23 | 2026-09-21 |
| KATSEYE — "PINKY UP" | **0.11** | The fastest-rising global group in the category, also up for Best Group, Best Choreography and Song of Summer. | S1, S5, S22 | 2026-09-21 |
| LE SSERAFIM feat. j-hope — "SPAGHETTI" | **0.08** | The j-hope feature pulls some ARMY votes, but most of that bloc will be spent on BTS proper. | S1, S22, S23 | 2026-09-21 |
| CORTIS — "RedRed" | **0.05** | Rookie group whose fandom is better spent on Best New Artist, where the vote stays open during the show. | S1, S22, S23 | 2026-09-21 |

---

# Part B — Professional / craft categories (industry-voted, not on vote.mtv.com)

These six are the structural counterweight to the fan vote. Madonna's "Confessions II – The Film"
is a feature-length, high-budget production nominated in all six; craft voters at this show have
consistently rewarded scale and ambition (Lady Gaga took both Best Direction and Best Art Direction
in 2025; Taylor Swift took direction, cinematography and visual effects in 2023). **If this packet
is wrong anywhere systematically, it is here** — I could not source how the 2026 professional vote
is constituted, only that these categories are absent from the 13 on vote.mtv.com (S1, S8).
Treat every Part B row as lower confidence than Part A.

## 14. Best Direction

Presented: **preshow_expected** (ESTIMATE, likely off-air). Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.38** | Most ambitious directorial object in the field by a wide margin, from the show's leading nominee. | S1, S4, S26 | 2026-09-21 |
| Taylor Swift — "Opalite" | **0.22** | Directs her own videos and is being handed the inaugural Artist Director Honors the same night, which is MTV stating its view of her direction in public. Slightly discounted because the honorary award may be read as the institution's payment in full. | S1, S12, S26 | 2026-09-21 |
| GENER8ION — "STORM starring Yung Lean" | **0.15** | The auteur entry, and the one a professional jury is likeliest to prefer over two pop monuments. | S1, S11, S32 | 2026-09-21 |
| Sabrina Carpenter — "House Tour" | **0.10** | Strong concept-driven video, also nominated for editing. | S1, S26 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.09** | Four craft nominations this year; has never taken this one. | S1, S26 | 2026-09-21 |
| Bruno Mars — "I Just Might" | **0.06** | Well-made and popular, not a directorial statement. | S1, S26 | 2026-09-21 |

## 15. Best Choreography

Presented: **preshow_expected** (ESTIMATE). Six nominees. **The closest craft category.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.26** | Dance is the spine of the film and of her whole legacy; the night's framing helps. | S1, S9 | 2026-09-21 |
| GENER8ION — "STORM starring Yung Lean" | **0.24** | Choreography by Damien Jalet, a contemporary-dance name a professional jury recognizes instantly. This is the category where the craft vote most plausibly breaks away from the stars. | S1, S32 | 2026-09-21 |
| Taylor Swift — "The Fate of Ophelia" | **0.18** | A large-ensemble set piece from the year's biggest video. | S1, S26 | 2026-09-21 |
| Tate McRae — "Nobody's Girl" | **0.14** | McRae is a trained dancer and this is the third of three nominations for the same video, which suggests genuine craft regard. | S1, S29 | 2026-09-21 |
| KATSEYE — "PINKY UP" | **0.10** | K-pop choreography is technically the strongest on the card but rarely converts with this electorate. | S1, S22 | 2026-09-21 |
| Harry Styles — "Dance No More" | **0.08** | Charming rather than technical. | S1 | 2026-09-21 |

## 16. Best Cinematography

Presented: **preshow_expected** (ESTIMATE). Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.32** | Feature-scale shoot; the default craft favorite. | S1, S26 | 2026-09-21 |
| Taylor Swift — "The Fate of Ophelia" | **0.20** | Won Best Cinematography in 2023; the most lavishly shot pop video of the cycle. | S1, S19 | 2026-09-21 |
| LISA — "Dream feat. Kentaro Sakaguchi" | **0.15** | A deliberately cinematic, location-shot piece and one of four LISA nominations. | S1, S22, S23 | 2026-09-21 |
| A$AP Rocky — "PUNK ROCKY" | **0.14** | His only nomination, and it is the kind of formally showy image-making this category exists to reward. | S1, S26 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.11** | Handsome but conventional next to the field. | S1, S26 | 2026-09-21 |
| Shaboozey — "Cowgirl" | **0.08** | Strong landscape work; he performs on the night, which matters less in an industry vote. | S1, S11, S24 | 2026-09-21 |

## 17. Best Editing

Presented: **preshow_expected** (ESTIMATE). Six nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.30** | Long-form assembly is the hardest editing job on the card. | S1, S26 | 2026-09-21 |
| Taylor Swift — "The Fate of Ophelia" | **0.18** | Consistent craft support across four technical nominations. | S1, S26 | 2026-09-21 |
| Sabrina Carpenter — "House Tour" | **0.16** | A structurally driven concept video where the cut is the idea — the most editing-forward entry. | S1, S26 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.14** | Narrative video with a dense cut. | S1, S26 | 2026-09-21 |
| LISA — "Dream feat. Kentaro Sakaguchi" | **0.12** | Pacing is a real strength of the piece. | S1, S22 | 2026-09-21 |
| Bruno Mars — "I Just Might" | **0.10** | Clean and classical, not showy. | S1, S26 | 2026-09-21 |

## 18. Best Visual Effects

Presented: **preshow_expected** (ESTIMATE). **Only four nominees — the shortest card of the night
and therefore the highest per-candidate probability floor.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.32** | Scale again, across a feature runtime. | S1, S26 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.27** | The most effects-dependent single video in the field. | S1, S26 | 2026-09-21 |
| PinkPantheress + Zara Larsson — "Stateside" | **0.22** | Heavily processed, design-led imagery; also nominated in art direction. | S1, S29 | 2026-09-21 |
| JISOO X ZAYN — "Eyes Closed" | **0.19** | The only nomination for either artist this year, which usually means the craft branch genuinely liked the work. | S1, S22 | 2026-09-21 |

## 19. Best Art Direction

Presented: **preshow_expected** (ESTIMATE). Six nominees. **Flattest craft card.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.28** | Leading nominee, biggest build. Discounted below her other craft numbers because this field has three genuinely design-led rivals. | S1, S26 | 2026-09-21 |
| Charli xcx — "SS26" | **0.18** | A fashion-object video whose entire proposition is art direction. | S1, S26 | 2026-09-21 |
| Taylor Swift — "The Fate of Ophelia" | **0.17** | Period-tableau staging; broad craft support. | S1, S26 | 2026-09-21 |
| Lady Gaga & Doechii — "RUNAWAY" | **0.16** | Gaga won this exact category in 2025 and the video is built around its sets. | S1, S16, S17 | 2026-09-21 |
| PinkPantheress + Zara Larsson — "Stateside" | **0.12** | Strong world-building on a smaller budget. | S1, S29 | 2026-09-21 |
| sombr — "My Body Isn't Ready" | **0.09** | The indie entry; distinctive but small. | S1, S26 | 2026-09-21 |

---

# Part C — Social categories (MTV Instagram Stories only)

Per D2 and the two-canons rule in the brief: these winners arrive as **official results on MTV's
social accounts, not as screen events.** The host declares them from MTV's post.

Format note that affects the odds: **Best Group is a three-round bracket**, which is the format
K-pop fandoms are best at and which adds seeding variance no one has published. The other three
are single-round tap-to-vote with very short windows, which rewards raw follower count over
organization (S5, S6).

## 20. Best Group

Presented: **social_expected**. Bracket voting Mon Sept 21 11:00 a.m. ET to Thu Sept 24
11:00 a.m. ET. Eight nominees.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| BTS | **0.45** | Won Best Group four consecutive years 2019-2022 and this is their first nomination since the hiatus ended. A multi-round bracket on Instagram is the exact mechanism ARMY has historically dominated. | S1, S5, S22, S23 | 2026-09-21 |
| BLACKPINK | **0.27** | The only fandom in the world that can plausibly out-vote ARMY in a bracket, in a full-group comeback year. | S5, S22 | 2026-09-21 |
| KATSEYE | **0.10** | Fast-growing global group with three other nominations; a plausible bracket spoiler if seeded away from BTS and BLACKPINK. | S5, S22 | 2026-09-21 |
| twenty one pilots | **0.07** | The Clique is the strongest non-K-pop bloc on the card. | S5 | 2026-09-21 |
| CORTIS | **0.05** | Rookie fandom, real but thin; their effort is likelier aimed at Best New Artist. | S5, S22 | 2026-09-21 |
| Fuerza Regida | **0.03** | Huge streaming numbers, minimal Instagram-bracket organization. | S5, S25 | 2026-09-21 |
| FLO | **0.02** | Critically admired, small voting base. | S5 | 2026-09-21 |
| Geese | **0.01** | Critics' band with no fan-vote apparatus. | S5, S32 | 2026-09-21 |

## 21. Best Long Form Video

Presented: **social_expected**. Single round, Thu Sept 24 to Fri Sept 25, 11:00 a.m. ET.
**Only four nominees.**

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Madonna — "Confessions II – The Film" | **0.55** | The definitional nominee in a category that has only been presented four times. Madonna won the first one in 1991 for *The Immaculate Collection* and would become its first two-time winner, a storyline Billboard is already running. The field's other three entries have a fraction of her reach. | S5, S9 | 2026-09-21 |
| Charli xcx — "Music, Fashion, Film" | **0.20** | The most online fanbase in the category and the format suits her audience. | S5 | 2026-09-21 |
| Ella Langley — "Choosin' Texas" | **0.14** | Part of MTV's five-nomination push for her; country voters are less active on Instagram Stories. | S5, S24 | 2026-09-21 |
| GENER8ION — "STORM starring Yung Lean" | **0.11** | Performing on the telecast, but voting closes two days before the show, so that exposure cannot help here. | S5, S11 | 2026-09-21 |

## 22. Best Album

Presented: **social_expected**. Single round, Fri Sept 25 to Sat Sept 26, 11:00 a.m. ET.
Nine nominees (three added a day after the initial announcement, per S33).

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Taylor Swift — *The Life of a Showgirl* | **0.42** | Won Best Album in 2023 for *Midnights*. A 24-hour single-round Instagram poll is the purest possible test of raw fandom size, which is the contest Swift wins. | S5, S19, S33 | 2026-09-21 |
| Madonna — *Confessions II* | **0.18** | Leading nominee, the night's centerpiece, and her most commercially resonant album in years. | S5, S9 | 2026-09-21 |
| Sabrina Carpenter — *Man's Best Friend* | **0.13** | Defending winner in this category (*Short n' Sweet*, 2025). | S5, S16, S17 | 2026-09-21 |
| Harry Styles — *Kiss All the Time. Disco, Occasionally* | **0.07** | Harries are formidable, but a late-added nominee with a short window is at a structural disadvantage. | S5, S33 | 2026-09-21 |
| Olivia Rodrigo — *You Seem Pretty Sad for a Girl So in Love* | **0.06** | Large young Instagram-native base, spread across three other ballots. | S5 | 2026-09-21 |
| Drake — *Iceman* | **0.05** | Biggest raw streaming album here; his fandom under-indexes on this specific mechanism. | S5, S29 | 2026-09-21 |
| Bruno Mars — *The Romantic* | **0.04** | Broad appeal, low mobilization. | S5, S33 | 2026-09-21 |
| Ella Langley — *Dandelion* | **0.03** | The push act again, in the wrong format for her audience. | S5, S24, S33 | 2026-09-21 |
| Olivia Dean — *The Art of Loving* | **0.02** | Critical favorite of the cycle with the smallest fandom on the card. | S5 | 2026-09-21 |

## 23. Song of Summer

Presented: **social_expected**. Single round, Sat Sept 26 to Sun Sept 27, 11:00 a.m. ET — the
last vote to close, hours before air. Fifteen nominees, the largest card of the night.
**Work titles for Slayyyter, sombr, Stella Lefty and Tame Impala & JENNIE are UNCONFIRMED**, and
Sabrina Carpenter's entry is reported as "House Tour" but that may be a search-summary conflation
with her Best Pop entry — packet 1 must confirm.

| Nominee | Probability (ESTIMATE) | Key reasons | Sources | Checked |
| --- | ---: | --- | --- | --- |
| Taylor Swift — "I Knew It, I Knew You" | **0.30** | Won Song of Summer in 2024 for "Fortnight"; a single-round popularity poll with fifteen entries fragments everyone's vote except the largest fandom's. | S5, S18 | 2026-09-21 |
| Ariana Grande — "hate that i made you love me" | **0.13** | Previous Song of Summer winner (2019) and a Hot 100 No. 1 this cycle. | S1, S5 | 2026-09-21 |
| KATSEYE — "Hootie Fruity" (title UNCONFIRMED) | **0.10** | A K-pop fandom in a fifteen-way split is structurally advantaged; organized blocs beat diffuse popularity in fragmented fields. | S5, S22 | 2026-09-21 |
| Olivia Rodrigo — "Stupid Song" | **0.09** | Large Instagram-native audience. | S5 | 2026-09-21 |
| Sabrina Carpenter — "House Tour" (UNCONFIRMED, see note) | **0.09** | Top-tier fandom; genuinely a summer record. | S5 | 2026-09-21 |
| Morgan Wallen — "Been By Now" | **0.07** | Probably the most-streamed song on the card; his audience is the least likely to vote on an Instagram Story. | S5 | 2026-09-21 |
| Olivia Dean — "So Easy (To Fall in Love)" | **0.05** | The cycle's sleeper hit with genuine summer association. | S5 | 2026-09-21 |
| Bruno Mars — "Risk It All" | **0.04** | Broad reach, weak conversion. | S5 | 2026-09-21 |
| sombr — title UNCONFIRMED | **0.04** | Young, extremely online fanbase, which is the right shape for this format. | S5 | 2026-09-21 |
| Latto ft. Doja Cat — "Okayyy" | **0.02** | Two strong names, neither with a dedicated voting apparatus. | S5 | 2026-09-21 |
| Charli xcx — "Camera" | **0.02** | Her vote is likelier spent on Best Long Form Video, which closes first. | S5 | 2026-09-21 |
| Tame Impala & JENNIE — title UNCONFIRMED | **0.02** | The JENNIE feature brings some BLINK attention. | S5 | 2026-09-21 |
| Ella Langley — "Choosin' Texas" | **0.01** | Fifth nomination; wrong format. | S5, S24 | 2026-09-21 |
| Stella Lefty — title UNCONFIRMED | **0.01** | Newcomer, thin base. | S5, S24 | 2026-09-21 |
| Slayyyter — title UNCONFIRMED | **0.01** | Devoted niche following, far too small for a fifteen-way open poll. | S5 | 2026-09-21 |

---

## Appendix — how to use this file

- `03-odds.json` is the machine-readable twin of these tables and is the file
  `scripts/simulate-results-night.mts` should consume. It carries the same numbers, the same
  candidate set and a `presented` tier per category.
- `artist_id` values are kebab-case and stable across categories. For a collaboration the id is
  the **primary credited artist** (for example Madonna & Sabrina Carpenter is `madonna`), which
  keeps the draft pool a pool of artists per decision D1 in the brief.
- Per D1, no artist appears twice inside one category, so no candidate collapse was needed.
- Before the pack is compiled, packet 1 must resolve: the possible seventh Best Collaboration
  nominee, the "La Perla" credit, and the four or five unconfirmed Song of Summer work titles.
- Re-run the simulation with a **"Taylor Swift does not attend"** variant before the D8 point
  scale is locked. Her presence is the largest single assumption in this file.

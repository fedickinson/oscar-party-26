# VMA 2026 draft pricing simulation

Run with `scripts/simulate-results-night.mts` against `vma-2026-authoring.json` and the
research odds file `research/03-odds.json`, six players, 3,000 nights, seed 7, on
2026-09-21. The "Swift absent" column uses the same odds with every Taylor Swift probability
scaled to one quarter and the category renormalized, the stress case the odds packet asked for.

The model is the strongest case for first-pick advantage: every drafter values artists
identically and picks greedily, and confidence picks are drawn from the same distribution for
every player, so draft position is the only systematic difference between players. Real
players differ in prediction skill, which dilutes these figures.

| Point scale (marquee / other) | Slot 1 wins, baseline | Slot 2 wins, baseline | Slot 1 wins, Swift absent | Draft share of score |
| --- | ---: | ---: | ---: | ---: |
| 8 / 6 (placeholder) | 41.8% | 26.8% | 54.0% | 18.7% |
| 4 / 3 | 32.5% | 23.6% | 39.3% | 11.5% |
| 3 / 2 (chosen) | 27.1% | 22.6% | 31.4% | 7.9% |
| 2 / 2 | 25.6% | 21.0% | 29.6% | 7.2% |
| 1 / 1 (floor) | not run | not run | 24.8% | 5.1% |

Ten players on the 8/6 placeholder: slot one 34.8%, slot two 25.0%, draft 13.9% of score.

In every run confidence is 55 to 73 percent of a player's score, the bingo card averages 27
points with p10 15 and p90 45 and nobody on zero, which matches the design target recorded in
`src/lib/bingo-utils.ts`.

Decision: 3 / 2. It is the flattest scale that keeps a marquee premium and holds draft slot one
at or under a third of nights in both the baseline and the stress case. The structural floor
for a snake draft with one dominant artist is about a quarter; going below 3 / 2 buys little
fairness and removes the reason to want the first pick.

Rerun after round-two research changes the odds or the slate:

```text
npx tsx scripts/simulate-results-night.mts \
  --pack show-packs/research/vma-2026/vma-2026-authoring.json \
  --odds show-packs/research/vma-2026/research/03-odds.json \
  --players 6 --nights 3000 --seed 7
```

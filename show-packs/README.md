# Show packs

A show pack is the versioned, reviewable authoring input for one broadcast or
episode. It keeps four worlds separate:

- verified screen facts;
- recap claims that have not yet been cross-checked;
- audience discourse;
- source-material canon, which is attitude-only and never a warrant for a
screen event.

Schema version 4 adds the explicit composable game contract and truth authority
on every wager. The resumable factory authors that layer from a separately
sealed contract artifact. Schema version 3 added a required deploy-owned,
SHA-sealed raster portrait for every entity; schema version 2 added the
pack-owned commentary voice roster and full speaker/voice/fact/angle publication
stamp. Older inputs are accepted only through their explicit compatibility lane,
never by silently losing cast identity or falling back to the current show's
cast prompt.

The pack also owns the prediction slate, draft entities, signature beats,
bingo pool, commentary voice roster, and grounded commentary requests. Every wager carries explicit
proxy, off-screen, and mention policy plus a human title-honesty sign-off.
Each entity portrait is a root-relative `.avif`, `.jpg`, `.jpeg`, `.png`, or
`.webp` path under this deployment's `public/` tree plus the exact lowercase
SHA-256 reviewed with the pack. External URLs, SVG, traversal and unsealed files
are rejected. Both compilation and activation resolve symlinks inside the public
root, require a regular file, prove its JPEG, PNG, WebP or AVIF signature agrees
with the reviewed suffix, and rehash its bytes. Activation projects the
verified path into `nominees.image_url`; it never manufactures an empty portrait.
Draft and live-roster views derive that portrait from the one nominee with the
same `show_pack_id` and stable entity `pack_key`. They never guess by display
name; legacy or ambiguous rows keep the local icon fallback.
Settled player keepsakes fetch only that player's roster portraits, inline the
verified files as data URIs, and omit any image that was not successfully
embedded. Downloaded HTML never depends on a deployment URL to keep its roster.
The same pack-scoped identity owns ensemble scoring, live scored/in-play status,
quick stats and recap accounting. Versioned packs never join these rows by
display name; only the fixed legacy catalog retains its historical name/title
compatibility lane.

Validate and compile without writing anything:

```text
npx tsx scripts/compile-show-pack.mts --input show-packs/examples/hotd-s3e8-proof.json
```

Write a byte-stable publishable bundle only after that dry run passes:

```text
npx tsx scripts/compile-show-pack.mts --input pack.json --output compiled.json
```

Existing outputs are not overwritten unless `--force` is explicit. Forced
replacement is atomic and refuses path, symlink, or hard-link aliases of the
authoring input, so publication cannot rewrite its own source. The compiler does
not contact Supabase or a model. Commentary can enter a publishable bundle
only with a `scripts/grounded-line.mts` record whose speaker, voice, fact and
angle blocks exactly match the current request and whose refutation findings are empty.
The JSON contract is closed at every object boundary and compiled output is
constructed from an explicit public allowlist. Put raw excerpts and private
research notes beside the authoring pack, never inside it; an unknown field is a
compile error rather than content that can leak into the public bundle.

`examples/hotd-s3e8-proof.json` is deliberately a representative migration
slice of the hand-authored HotD material, not the full activatable catalog. It
proves the contract and compiler without presenting partial content as a show.

Before reauthoring the complete grandfathered catalog, seal its real local
inventory into a migration worksheet:

```text
npx tsx scripts/audit-legacy-show-pack.mts
npx tsx scripts/audit-legacy-show-pack.mts \
  --output show-packs/research/hotd-s3-finale-legacy-worksheet.json
```

The command is local-only and read-only. It exhausts every catalog page, retains
the exact prediction, candidate-link, nominee, draft-entity, signature-beat and
bingo rows. Entity/nominee identity uses the same fixed-legacy matcher as
scoring, while portraits require one exact display-label match against the
deployment's real raster bytes. Output is deterministic and no existing file
is replaced without `--force`. The proven inventory counts are sealed into the
audit, so a truncated local catalog fails instead of yielding a smaller
apparently complete worksheet.

The worksheet is deliberately not a schema-v3 pack. It lists the sources,
claims, commentary, dossiers and trigger contracts that still require human
research and approval; it never converts a historical trigger into a reviewed
contract or manufactures a grounding stamp. Feed completed authoring through
the ordinary compiler rather than renaming the worksheet to look publishable.
It also keeps legacy draft-nomination/category-candidate divergences as an
explicit decision queue. The old catalog hand-authored those two surfaces
separately; schema v3 has one candidate owner and therefore cannot preserve both
by silently guessing.

Prepare the checked authoring surface from that immutable audit:

```text
npx tsx scripts/compose-legacy-show-pack.mts \
  --worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output show-packs/research/hotd-s3-finale-authoring.json
```

Preparation remains restrictive by default. Known migration decisions may be
made explicit in the same action instead of hand-editing hundreds of rows:

```text
npx tsx scripts/compose-legacy-show-pack.mts \
  --worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --target-id hotd-s3e8 \
  --target-version 1 \
  --target-title "House of the Dragon Season 3 Finale" \
  --canon-cutoff "End of House of the Dragon Season 3, Episode 7" \
  --legacy-film-kind creature \
  --candidate-policy audited-category-links \
  --output show-packs/research/hotd-s3-finale-authoring.json
```

Those flags are preparation-only and cannot be combined with `--authoring`.
Target metadata is copied exactly as supplied. The film-kind decision applies
only to legacy `film` rows; it exists because that compatibility type represented
dragons in this catalog. `audited-category-links` makes the existing category
candidate links the explicit schema-v3 candidate owner. It does not add the 54
dragons found only in stale draft-nomination JSON, because those rows were never
selectable winners and did not drive legacy scoring. The command reports the
number of divergences resolved under that policy.

The prepared file carries every audited legacy row but leaves every human
boundary visibly unapproved: canon cutoff, global research collections, entity
dossiers and non-person kinds, prediction candidate ownership, every trigger
contract, signature-beat likelihood, and a target identity that does not reuse
the published legacy source's exact key and version.

The HotD bingo pool has a narrower evidence-backed migration lane. Its reviewed
legacy wording, calibration, rationale, tags and source labels are canonical in
`src/data/bingo-master-pool.json`; the explicit approvals and source-to-claim
decisions live in
`show-packs/research/hotd-s3-finale-bingo-decisions.json`. Apply them dry first,
then write the validated bytes back to the authoring worksheet:

```text
npx tsx scripts/apply-legacy-bingo-authoring.mts
npx tsx scripts/apply-legacy-bingo-authoring.mts --in-place
```

The applicator binds both source files by SHA-256, exact-matches all 75 master
rows to the audit, and refuses partial approval, unknown source labels, source
or claim conflicts, target drift and conflicting prior contracts. The current
decision manifest keeps the 59 squares with external evidence on verified
screen/discourse claims. It separately approves all 16 source-free rows as
judgeable authored game texture: each receives one exact `authoring` claim, and
the sole `authoring_record` source seals the master-pool bytes. That provenance
is valid only for bingo and does not assert that the event is forecast by prior
screen canon. The result contains eleven sources, 99 claims and 75/75 contracts,
but does not create any global review seal; collection review remains a separate
human boundary. Repeating the command is byte-idempotent.

Entity dossiers use the same restrictive pattern. The audited roster is an
exact 38-name match for the 27 character profiles and 11 dragon profiles in
`src/data/westeros-encyclopedia.ts`. The decision manifest binds that source's
bytes and explicitly approves all 38 legacy entity IDs:

```text
npx tsx scripts/apply-legacy-dossier-authoring.mts
npx tsx scripts/apply-legacy-dossier-authoring.mts --in-place
```

The applicator copies each profile's cutoff-safe screen state and audience
reaction exactly into separate verified screen and discourse claims, then gives
the matching entity a one-claim-per-lane dossier. It refuses source drift,
missing or extra profiles, incomplete approval, target drift, duplicate names or
IDs, and conflicting prior sources, claims or dossiers. The current manifest
fills 38/38 dossiers, adds two sources and 76 claims, and leaves the global
source/claim review flags unchanged. No prose is generated.

Prediction contracts are authored separately because their rules are product
decisions, not facts to infer from category titles. The manifest at
`show-packs/research/hotd-s3-finale-prediction-decisions.json` explicitly owns
all 20 conditions, exclusions, adjudication choices and title-honesty notes:

```text
npx tsx scripts/apply-legacy-prediction-authoring.mts
npx tsx scripts/apply-legacy-prediction-authoring.mts --in-place
```

The applicator binds the legacy audit by SHA-256, requires exact coverage of the
20 audited prediction IDs and their approved candidate universes, and derives
each grounding basis from every candidate's verified screen-state dossier
claim. It refuses unspecified adjudication, unapproved titles, missing dossiers,
unknown fields, source drift and conflicting prior contracts. The current
manifest fills 20/20 prediction contracts without changing sources, claims or
global review flags. Repeating the command is byte-idempotent.

Signature-beat pricing is a separate mechanical lane from trigger adjudication.
The calibration manifest maps the four legacy odds-and-points pairs to the
restrictive intersections of the published beat bands and schema-v3 tiers:

```text
npx tsx scripts/apply-legacy-signature-calibration.mts
npx tsx scripts/apply-legacy-signature-calibration.mts --in-place
```

The current mapping is Likely 60%, Coin flip 40%, Long shot 20% and Wild 9%.
It deliberately does not retune from the one-episode WDKH report, whose source
caveat says that evidence is descriptive only. The applicator binds the legacy
audit by SHA-256, requires exact odds-pair and beat coverage, rejects
schema-inconsistent tiers and prior conflicts, and fills 275/275 probabilities
and likelihoods. By itself it does not touch trigger contracts; the separate
death-family lane below reviews 37 of them.

The first reviewed signature-trigger family is the exact audited `Dies` batch:

```text
npx tsx scripts/apply-legacy-signature-death-authoring.mts
npx tsx scripts/apply-legacy-signature-death-authoring.mts --in-place
```

Its explicit manifest lists all 37 legacy death-beat IDs. The 26 person beats
preserve their audited condition and allow only an unambiguous off-screen death
confirmation; the 11 dragon beats remain on-screen-only. Every contract cites
the owner's verified screen-state dossier claim and excludes ambiguous wounds,
disappearances, visions and pre-episode deaths. The applicator requires exact
batch coverage and owner kinds, refuses source drift and prior conflicts, and
leaves the other 238 beat contracts null. Repeating the command is
byte-idempotent.

Further reviewed trigger families use the reusable explicit-batch applicator:

```text
npx tsx scripts/apply-legacy-signature-batch.mts --decisions BATCH.json
npx tsx scripts/apply-legacy-signature-batch.mts --decisions BATCH.json --in-place
```

Every decision must name an audited beat ID, preserve its audited condition
verbatim, provide complete doctrine, and explicitly list the legacy entities
whose verified screen-state dossier claims ground the event. The audited owner
must be included. The first batch,
`show-packs/research/hotd-s3-finale-signature-mirrors.json`, reviews four
mirrored Rhaenyra/Mysaria rows and cites both participants for each copy. The
worksheet now carries 41/275 signature-beat contracts; 234 remain open.

The second batch,
`show-packs/research/hotd-s3-finale-signature-sorties.json`, reviews all six
audited dragon sorties. Each row cites both rider and dragon, preserves its
distinct active-mission condition, and excludes transport, escape, ceremony and
inactive patrols. The worksheet now carries 47/275 beat contracts; 228 remain
open.

Family manifests may also provide
`basis_legacy_entity_ids_by_beat_id`. That map must exactly cover the family's
explicit beat IDs and include each audited owner, allowing repeated relational
rules to cite every named participant. The direct-opposition manifest uses this
for 27 refusals, rejections, confrontations, defections, overrulings,
circumventions and visible disobedience events. The worksheet now carries
143/275 beat contracts; 132 remain open.

Repeated owner-grounded trigger families use a second compact form that still
keeps every row explicit:

```text
npx tsx scripts/apply-legacy-signature-family.mts --decisions FAMILY.json
npx tsx scripts/apply-legacy-signature-family.mts --decisions FAMILY.json --in-place
```

Each family lists every approved legacy beat ID and stores the exact audited
condition under that ID; shared exclusions, adjudication and title review may
then live once at family level. The applicator requires exact condition-map
coverage, rejects duplicate IDs across families, and grounds every row in its
owner's verified screen-state claim. The first manifest reviews all 25 `Kills`
and 24 `Clashes` rows. The worksheet now carries 96/275 beat contracts; 179
remain open.

The explicit relational batch,
`show-packs/research/hotd-s3-finale-signature-relations.json`, reviews 20
two-party reconciliation, accusation, reunion, flight, romantic, rejection and
departure rows. Each decision cites both participants rather than only the
legacy card owner. The worksheet now carries 116/275 beat contracts; 159 remain
open.

The direct-opposition family reviews 27 refusals, rejections, confrontations,
defections, overrulings, circumventions and visible disobedience events with
per-row counterpart grounding. The explicit-declarations family then reviews
29 orders, punishments, warnings, comfort, forgiveness, stated objectives,
threats, acknowledgments, requests, voluntary choices and recommitments. It
preserves each row's additional action requirements and cites every named
authored participant. The worksheet now carries 172/275 beat contracts; 103
remain open.

The visible-dragon-actions family reviews 12 present-timeline physical dragon
events: rider interaction, active flight, dragon attacks, battlefield fire, a
dragon kill, rider response and reappearance. It rejects ordinary presence,
preparation, transport, inferred outcomes, proxy action, recap, report, dream
and vision substitutes, and grounds every named rider, dragon and target. The
worksheet now carries 184/275 beat contracts; 91 remain open.

The directly-visible-actions family reviews 12 observable state or physical
action beats: crying, medical treatment, regaining consciousness, returning to
custody, overt magic, moving eggs, joining an attack, guarding or wounding a
captive, attempting escape, post-battle survival and an arrow visibly hitting
its target. It rejects plans, threats, inferred states, proxy outcomes and all
off-screen substitutes. The worksheet now carries 196/275 beat contracts; 79
remain open.

Six final evidence-shape families close the remaining signature ledger: direct
two-person scenes, consequential command outcomes, direct protective actions,
deliberate decisions, causal information and plan outcomes, and direct combat
actions. Every row retains its immutable condition, exact authored participant
grounding, and a restrictive proxy/off-screen/mention doctrine suited to its
evidence. The manifests reproduce the completed artifact byte-for-byte. The
worksheet now carries 275/275 signature-beat contracts; none remain open. The 16
gameplay-only bingo squares retain empty canonical `source_basis` rather than
inheriting unrelated evidence. Their separate, hash-bound authoring claims state
only that each reviewed rule belongs in the game; the compiler permits that
claim canon for bingo and rejects it for predictions and signature beats. The
bingo ledger is now 75/75 with zero open rows.

`scripts/apply-legacy-commentary-authoring.mts` applies a SHA-bound, local-only
manifest of explicit voices and pending commentary requests. It validates the
target and claim canon, refuses generated publication content, preserves the
global approval flags and never calls a model. The current authoring worksheet
contains seven established cast voices and seven pending requests, each grounded
in one verified screen fact and one verified discourse angle. Generation and
approval remain later explicit boundaries.

## Hash-bound global review

Legacy authoring worksheet version 2 stores each global approval as either
`null` or a `{sha256, note}` review seal. The digest covers the collection and
its upstream dependencies, so a source edit invalidates source, claim, voice and
request review; a claim edit invalidates claim, voice and request review; and a
voice edit invalidates voice and request review. Authoring stages that mutate
those collections clear stale dependent seals automatically.

Print the current review hashes without approving or writing anything:

```text
npx tsx scripts/review-legacy-show-pack-globals.mts --plan
```

Generate a deterministic human review packet after every non-review authoring
lane passes schema-v3 projection:

```text
npx tsx scripts/review-legacy-show-pack-globals.mts \
  --packet .private/reviews/hotd-s3-finale-global-review.md \
  --decision-template .private/reviews/hotd-s3-finale-global-review-decisions.json
```

The packet exhaustively embeds all four collections, their exact dependency
hashes, upstream hash chain, current seal state and a canon-specific checklist.
Packet v2 grants no approval and ends with a deferred-collection ledger plus an
intentionally invalid template containing only currently open, unblocked
collections whose notes are null. Already-current collections are omitted;
partial manifests are valid. Existing packets require `--force`; the output cannot
alias either worksheet. Pending or blocked grounded commentary appears as an
explicit request-review blocker, and the applicator refuses to seal that
collection until every publication is ready with no residual findings. Sources,
claims and voices remain independently reviewable before generation.
The optional JSON sidecar is the exact null-note template embedded in the
packet. Packet v3 records its SHA-256; the sidecar is written before the packet,
and equal/aliased targets are refused. It is still intentionally invalid and
cannot grant approval without human attestations.

Render the sealed packet as a read-only mobile review document:

```text
npx tsx scripts/generate-legacy-global-review-html.mts \
  --legacy show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --authoring show-packs/research/hotd-s3-finale-authoring.json \
  --packet .private/reviews/hotd-s3-finale-global-review.md \
  --decision-template .private/reviews/hotd-s3-finale-global-review-decisions.json \
  --output .private/reviews/hotd-s3-finale-global-review.html \
  --attestation-output .private/reviews/hotd-s3-finale-global-review-attestations.html
```

The generator first rebuilds the packet and null-note template from both
worksheets and requires exact byte equality with the supplied files. It renders
sources, canon-grouped claims and voices in dependency order, then shows pending
or blocked commentary requests as a deferred rung. The HTML contains no script,
form, external resource load or review-note control; approvals remain owned by
the JSON decision manifest and the existing applicator.

The optional attestation output is a distinct offline desk rather than an
editing mode inside the evidence document. It exposes only open, unblocked
collections from the exact sidecar, requires every review check plus a specific
human note, and enforces upstream dependencies in the downloaded order. Its
only effect is a browser download of a sealed local attestation transcript. It
cannot create or apply a decision, rewrite either worksheet, contact Supabase or
call a model. Build the decision through the canonical pure contract, then
validate it before considering a separate in-place apply:

```text
npx tsx scripts/build-legacy-global-review-decisions.mts \
  --legacy show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --authoring show-packs/research/hotd-s3-finale-authoring.json \
  --packet .private/reviews/hotd-s3-finale-global-review.md \
  --decision-template .private/reviews/hotd-s3-finale-global-review-decisions.json \
  --attestations ~/Downloads/hotd-s3e8-global-review-attestations.json \
  --output .private/reviews/hotd-s3-finale-reviewed-decisions.json
```

The builder exact-rebuilds the packet and template, verifies the transcript's
two artifact hashes, rechecks every checklist and dependency, and writes no file
unless `--output` is explicit. Its output is still only a decision manifest.

After an actual human review, create an explicit
`legacy-global-review-decisions` manifest containing each reviewed collection,
the exact printed `expected_sha256`, and a nonblank attestation note. Validate it
read-only, then apply it deliberately:

```text
npx tsx scripts/review-legacy-show-pack-globals.mts --decisions review.json
npx tsx scripts/review-legacy-show-pack-globals.mts --decisions review.json --in-place
```

No command infers approval from collection presence or an `--approve-all`
shortcut. A changed dependency, duplicate collection, malformed hash, or
conflicting current note fails closed. Staged manifests must keep dependency
order: sources before claims, claims before voices, and voices before requests,
unless each upstream collection already has a current seal.

Review progress without writing or pretending partial work is publishable:

```text
npx tsx scripts/compose-legacy-show-pack.mts \
  --worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --authoring show-packs/research/hotd-s3-finale-authoring.json \
  --status
```

Status mode reports filled and open counts plus the exact legacy IDs for
target identity, cutoff, four global approvals, entity kinds and dossiers,
prediction candidates and contracts, signature-beat calibration and contracts,
and bingo contracts. It emits `authoring_ready=true` only when every lane is
filled and that same input passes the full schema-v3 finalizer. Source drift,
coverage loss, immutable-context edits and closed-object contract errors surface
immediately. Cross-reference and full schema errors surface when every lane is
filled or during composition. A filled count therefore means an explicit value
exists; only `authoring_ready=true` means the complete artifact is valid. Status
is read-only and cannot be combined with `--output` or `--force`.

After the status ledger is ready, compose a schema-v3 authoring pack:

```text
npx tsx scripts/compose-legacy-show-pack.mts \
  --worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --authoring show-packs/research/hotd-s3-finale-authoring.json \
  --output show-packs/research/hotd-s3-finale-v3.json
```

Composition is local-only and fails if the audit bytes changed, a legacy ID is
missing or duplicated, a prediction cites an unknown nominee, an approval is
still absent, or the result violates schema v3. Entity names and sealed
portraits, legacy titles and points, pair-beat membership, and the existing
bingo calibration remain derived from the audit rather than recopied by hand.
The result is still authoring: pending commentary must pass the grounded
publisher and the ordinary compiler before publication. Existing outputs are
never replaced without `--force`, and output aliases of either input are
refused.

## Settlement-to-research flywheel

A closed show can hand its canonical evidence to the next pack without copying
private room data or pretending future content has already been researched:

```text
npx tsx scripts/generate-show-pack-flywheel.mts \
  --input settlement-drops/my-show/receipt.json \
  --output show-packs/research/hotd-s3e8-seed.json
```

Dry-run by omitting `--output`. Existing outputs require `--force`; even then,
the safe writer refuses a path, symlink, or hard-link alias of the receipt. The
command canonicalizes and hashes the receipt, then emits a deterministic,
closed projection containing the receipt-attested predecessor registry identity
and an exact three-field `pack.predecessor` value for the next pack. Registry
version, manifest, receipt proof and the settlement's dated supersession chain
remain in the sibling `attestation` block. The schema-v3 seed also carries one `operator_record` source, the complete ordered
settled-fact timeline, verified screen-claim candidates, all settled score events,
and the complete prior character impact ledger. It omits
players, rooms and personal cards.

Every resolved settlement fact becomes a screen claim, including facts that had
no authored board category. Individual marked bingo-square occurrences also
become claims. Draft and correct-prediction events remain visible as score
consequences but do not duplicate the same settled fact; adjustments and bingo
line or blackout bonuses likewise cannot warrant a future wager.
The seed is research input, not a playable pack: recap cross-checking,
sentiment, future entities, portraits, wagers and grounded commentary still
must be authored and reviewed before `compile-show-pack.mts` can accept the
next pack. Synthetic proof receipts require the explicit `--allow-proof` flag.
Legacy receipts emitted before show-pack attestation, the settled-fact timeline,
or revision provenance must be re-emitted by `settle-room.mts`; the flywheel
never accepts a caller-supplied substitute.

Recap and sentiment now have a first-class intake instead of an unsealed research handoff. A
researcher authors a closed candidate file with this shape:

```json
{
  "candidate_version": 1,
  "artifact": "show-pack-research-candidates",
  "target": {
    "pack_id": "predecessor-pack",
    "settlement_id": "settlement-uuid",
    "settlement_version": 1
  },
  "sources": [],
  "claims": []
}
```

Sources are recap or sentiment records only. Candidate screen claims may cite recap sources and
name canonical `predecessor-screen-*` claims offered for cross-check; discourse claims require a
sentiment source. Build the review packet and null decision template locally:

```text
npx tsx scripts/review-show-pack-research.mts \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --candidates show-packs/research/hotd-s3e8-research-candidates.json \
  --packet .private/reviews/hotd-s3e8-research-packet.json \
  --decision-template .private/reviews/hotd-s3e8-research-decisions.json
```

The packet seals the exact seed and candidate bytes, includes the canonical settlement source and
every eligible screen claim, and authors no decision. Each source and claim must be included or
omitted with a specific note. An included recap claim stays `recap` by default, may be marked
`unverifiable` where the screen is silent, and can become `verified` only with an explicitly
approved canonical screen cross-check. Sentiment enters only as discourse and cannot borrow screen
claims as its warrant. Source-material candidates are not accepted in this lane; they remain
attitude-only under the ordinary show-pack contract.

After human review, validate and materialize the selected public-safe research:

```text
npx tsx scripts/apply-show-pack-research.mts \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --candidates show-packs/research/hotd-s3e8-research-candidates.json \
  --packet .private/reviews/hotd-s3e8-research-packet.json \
  --decisions .private/reviews/hotd-s3e8-research-decisions.json \
  --output show-packs/research/hotd-s3e8-reviewed-research.json
```

Dry-run is the default. The result seals packet and decision hashes and contains only included
sources and claims, plus one `operator_record` source when a recap claim is promoted to verified.
That source locator binds the exact packet and decision hashes; the decision artifact retains the
specific canonical screen claim IDs used in each cross-check. Composition requires all research
artifacts together and exact-rebuilds the result, so a standalone result file cannot launder
edited claims:

```text
npx tsx scripts/compose-show-pack-flywheel.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --research show-packs/research/hotd-s3e8-reviewed-research.json \
  --research-candidates show-packs/research/hotd-s3e8-research-candidates.json \
  --research-packet .private/reviews/hotd-s3e8-research-packet.json \
  --research-decisions .private/reviews/hotd-s3e8-research-decisions.json \
  --authoring \
  --output show-packs/research/hotd-s3e8-working.json
```

These commands are filesystem-only and call neither a network nor a model. They productize the
research boundary; they do not perform the human recap or sentiment judgment.

### Resumable show-pack factory

Once the future-show authoring pack exists, one local runner owns the deterministic path from the
predecessor receipt through the commentary boundary:

```text
node --import tsx scripts/run-show-pack-factory.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --game-contract show-packs/research/hotd-s3e8-game-contract.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --research show-packs/research/hotd-s3e8-reviewed-research.json \
  --research-candidates show-packs/research/hotd-s3e8-research-candidates.json \
  --research-packet .private/reviews/hotd-s3e8-research-packet.json \
  --research-decisions .private/reviews/hotd-s3e8-research-decisions.json \
  --output-dir .private/show-pack-factory
```

The runner rederives the seed from the exact receipt, exact-rebuilds the optional research chain,
injects both into the authoring pack, applies the required game-contract authoring artifact,
verifies portraits, and reduces the result to one of three explicit stages. The base authoring
pack remains schema v3 and must omit `game_contract`; the factory is the only step that upgrades
it to schema v4 and writes truth authority onto every wager. Start from
`show-packs/examples/story-night-game-contract.json`, replace its exact target, choose a positive
budget no larger than the authored beat count, and select one identity pair:

- `none` with scarcity `none`;
- `chosen_faction` with scarcity `shared` and at least two distinct authored entity groups; or
- `exclusive_entity_draft` with scarcity `exclusive`.

`truth_authority.default` covers every prediction, signature beat and bingo square. Closed
`overrides` rows identify one exact wager by `kind` and `id` when a show mixes official results,
operator declarations and AI proposals with human confirmation. Duplicate or unknown overrides,
target drift, incomplete contracts, unsupported profiles and undersized beat boards fail before
commentary planning. The runner prints the resolved contract and seals the exact authoring
artifact hash in `run.json`.

The three explicit stages are:

- `awaiting_commentary_authorization` writes `working.json`, the exact commentary plan, and a
  self-contained review desk. It prints the bounded call envelope and calls no model.
- `blocked_grounding` preserves residual findings and emits no automatic retry plan. After human
  judgment, `--retry-blocked` creates a separate bounded authorization doorway.
- `publishable` passes the ordinary compiler and writes `compiled.json`.

Every write lands in an immutable run directory keyed by the working-pack hash and the complete
invocation hash. `run.json` seals input and output digests without recording local paths. An exact
rerun verifies and reuses the existing directory; changed evidence or retry authority creates a new
run. A drifted artifact set or changed byte fails instead of being overwritten. Dry-run remains the
default when `--output-dir` is omitted.

For an authorization-stage run, open `commentary-review.html`, complete its human review, then use
the existing authorization builder and grounded publisher against that run's exact files:

```text
npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan .private/show-pack-factory/RUN/commentary-plan.json \
  --transcript ~/Downloads/hotd-s3e8-commentary-authorization-transcript.json \
  --output .private/show-pack-factory/authorizations/hotd-s3e8-commentary-authorization.json

npx tsx scripts/publish-show-pack-commentary.mts \
  --input .private/show-pack-factory/RUN/working.json \
  --output .private/show-pack-factory/hotd-s3e8-grounded.json \
  --approved-plan .private/show-pack-factory/RUN/commentary-plan.json \
  --authorization .private/show-pack-factory/authorizations/hotd-s3e8-commentary-authorization.json \
  --generate
```

The `--generate` command is still the explicit model and spend boundary. Feed its checkpoint or
completed pack back to the factory rather than compiling it by hand:

```text
node --import tsx scripts/run-show-pack-factory.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --game-contract show-packs/research/hotd-s3e8-game-contract.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --continuation .private/show-pack-factory/hotd-s3e8-grounded.json \
  --approved-plan .private/show-pack-factory/RUN/commentary-plan.json \
  --authorization .private/show-pack-factory/authorizations/hotd-s3e8-commentary-authorization.json \
  --research show-packs/research/hotd-s3e8-reviewed-research.json \
  --research-candidates show-packs/research/hotd-s3e8-research-candidates.json \
  --research-packet .private/reviews/hotd-s3e8-research-packet.json \
  --research-decisions .private/reviews/hotd-s3e8-research-decisions.json \
  --output-dir .private/show-pack-factory
```

Each continuation must be canonical schema-v4 bytes and may change only commentary publication
records. It cannot edit facts, sources, wagers, voices, request definitions, or any already-ready
line. The runner replays the continuation chain from the canonical composition, rebuilds each plan
against the preceding step, requires the byte-identical `--approved-plan` and matching authorization,
and accepts only a non-empty source-order prefix of those authorized publication changes. That admits
the publisher's durable checkpoint after an interrupted batch while rejecting later-only or arbitrary
subsets. For later checkpoints or an explicitly reviewed blocked retry, repeat the three flags in
source order: `--continuation`, `--approved-plan`, `--authorization`. The runner proves every prior
step rather than trusting an intermediate pack. Supply the same four research arguments whenever
research was part of the canonical composition.

Once recap and sentiment research, future entities, portraits, wagers and
grounded commentary are complete, bind that authored work back to its canonical
evidence:

```text
npx tsx scripts/compose-show-pack-flywheel.mts \
  --input show-packs/research/hotd-s3e8-authoring.json \
  --seed show-packs/research/hotd-s3e8-seed.json \
  --receipt settlement-drops/my-show/receipt.json \
  --output show-packs/compiled/hotd-s3e8.json
```

The authoring input must omit `pack.predecessor`, the
`predecessor-settlement` source and every `predecessor-screen-*` claim. It may
already cite those claim IDs from entity dossiers, trigger basis lists or
grounded commentary; the composer injects them before validation. The seed is
rederived from the supplied canonical receipt and must match exactly, closing
the hand-edit gap. Reserved-ID collisions fail rather than merge.

Composition runs the same complete compiler and deploy-owned portrait verifier
as `compile-show-pack.mts`. A successful dry run therefore proves the result is
publishable, not merely mergeable. `--output` writes deterministic bytes,
existing outputs require `--force`, and no output may alias the authoring pack,
seed or receipt by path, symlink or hard link. Synthetic inputs require
`--allow-proof`. The command has no Supabase, network or model path.

There is one intentional two-stage lane. If pending commentary cites an
injected `predecessor-screen-*` claim, it cannot be grounded before that claim
exists in the working pack. Compose the authoring pack first:

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

`--authoring` still verifies the receipt, reserved ownership, closed schema,
claim lanes, trigger doctrine and portrait bytes. It alone defers the final
commentary publication gate so the existing grounded-line publisher can fill
pending or retryable requests. Default composition remains the stronger
one-step compiled mode for packs whose commentary is already ready.

Activation is a separate, narrower gate. A playable pack needs at least 24
bingo squares, at least one draftable entity, and only single-entity or explicit
pair beats because those are the shapes the current game tables can represent.
Preflight a compiled pack against a lobby room without writing:

```text
npx tsx scripts/activate-show-pack.mts --input compiled.json --room CODE
```

Applying requires the exact room code twice:

```text
npx tsx scripts/activate-show-pack.mts --input compiled.json --room CODE --apply --confirm-room CODE
```

The writer defaults to local Supabase. It derives stable row IDs from
`pack.id@version`, installs the normalized catalog idempotently, then rereads
every pack-owned table across all PostgREST pages. Publication requires an exact
row-for-row match with the compiled plan: missing, unexpected, or drifted
registry rows, nominees, predictions, candidate links, draft entities, beats,
or bingo squares leave the pack in draft. The same closed manifest then enters
one service-only Postgres transaction. Catalog writers share-lock the registry;
the transaction update-locks it, repeats the exact row-set comparison, publishes
the draft and binds the room together. A bind failure rolls publication back.
That transaction also requires schema v3 and proves every compiled entity has
exactly one nominee whose `pack_key` and `image_url` match the sealed portrait;
a privileged hand-seed cannot publish an empty or substituted image path.
Direct service updates to the registry and the earlier bind-only RPC are revoked.
A published pack is never upserted by the command; it must pass the same exact
attestation before it can be rebound. Retired packs fail closed. Postgres permits that binding
only for a published pack while the room is still in the lobby and has no
pack-dependent game state. Production additionally requires the explicit
`SUPABASE_TARGET=remote` authority boundary. Even a dry run requires service-role
read visibility so an RLS-hidden draft registry cannot be mistaken for an absent pack.

The deterministic write shape is owned by
`src/lib/show-pack-activation.ts`, not the CLI. Its pure activation planner
recompiles the pack, hashes the exact bundle, derives every stable registry and
catalog ID, projects nominees, categories, candidate links, draft nominations,
pair beats and bingo rows, checks within-table collisions, and owns the pure
installed-catalog attestation. The CLI adds only paginated database reads,
external collision checks and the explicit write authority.
This keeps the complete normalized plan testable without writing `categories`.

Phones may insert, update or remove only room-scoped declarations and their
nominee links. Authored predictions and candidate links are excluded by RLS;
signature beats, bingo squares, nominees and draft entities expose no anonymous
write grant. The service role retains deliberate catalog-repair authority, but
every such mutation participates in the registry lock and a later publication
or rebind must attest the repaired rows exactly.

Activation retains the exact compiled trigger contract beside every normalized
prediction, signature beat and bingo square. Postgres independently rejects a
non-legacy catalog row with missing doctrine, an `unspecified` adjudication
dimension, an empty exclusion or claim basis, or an unapproved title. This also
closes privileged direct-seed bypasses. The fixed legacy catalog is explicitly
grandfathered; do not use its pack ID for new content or manufacture retroactive
review stamps for its bare historical triggers.

Claim provenance is also a semantic gate, not merely a foreign key. Every wager
`basis_claim_ids` entry must be a verified screen or verified discourse claim.
Unverified recap claims, explicitly unverifiable claims, and source-material
attitudes cannot warrant a prediction, signature beat, or bingo square. Source
material remains available only to the commentary voice lane.

## Grounded commentary batch

`commentary_voices` is the single owner of generated cast identity. Each voice
has a stable ID, display name, expression-only instruction, and optional
source-material `attitude_only` claims. A request's `speaker` must reference one
of those IDs. Screen claims are forbidden from the voice lane; verified screen
facts remain in `fact_claim_ids`, while event-specific discourse remains in the
request's angle lane. Source-material claims are rejected from request angles,
so the same attitude cannot enter twice. The canonical publisher constructs all four blocks rather
than letting individual scripts assemble prompts differently.

A voice may also opt into the live daemon through a `runtime` block with an
explicit `slot` (`narrator` or `rotating`), display `role`, and lowercase mention
`aliases`. Runtime projection is all-or-nothing: every voice in the pack must
carry that block, exactly one must be the narrator, and names, IDs and aliases
must be unambiguous across the cast. A complete projection powers grounded
declared-fact, bingo and direct-chat reactions from the operator daemon, plus
pre-show, show-start, spotlight and player-welcome ceremonies from the
authorized host browser. A partial or ambiguous projection remains
commentary-only and stops both engines before a model call.

Schema-v4 packs may add a separate `runtime_ceremonies` contract:

```json
{
  "runtime_ceremonies": {
    "milestones": [{
      "id": "first-turn",
      "declared_event_count": 3,
      "voices": [{
        "voice_id": "archivist",
        "delay_seconds": 0,
        "instruction": "Name the checkpoint and judge only the recorded standings."
      }]
    }],
    "identity_change": {
      "voices": [{
        "voice_id": "archivist",
        "instruction": "Judge the public revision without inventing its motive."
      }]
    }
  }
}
```

Milestone thresholds and IDs are unique and strictly increasing in authored
order. Each milestone's voices are unique, its first delay is zero and later
delays strictly increase. Identity-change voices are unique. Every voice ID must
belong to the complete runtime cast, and each instruction governs expression
only; canonical event counts, standings and identity transitions come from the
room database. Omitting either sub-contract keeps that surface silent.

Post-show generation is a separate explicit opt-in on every runtime voice:

```json
{
  "runtime": {
    "slot": "narrator",
    "role": "The room's exact closing role",
    "aliases": ["archivist"],
    "post_show": {
      "farewell": {
        "order": 1,
        "delay_seconds": 0,
        "instruction": "Close the room in this voice's authored manner."
      },
      "keepsake": {
        "instruction": "Judge one player's night from the grounded game record."
      }
    }
  }
}
```

If one runtime voice supplies `post_show`, every runtime voice must supply it.
Farewell orders must be contiguous from one. Delays are whole seconds from zero
through ninety, start at zero and strictly increase in farewell order. A complete
contract enables grounded provisional farewells and keepsakes using the exact
authored voice IDs. Keepsake authors rotate deterministically in farewell order.
Generic keepsake imagery is empty until the show-pack format defines its own
artwork catalog; it never borrows the legacy property's assets.

Plan a batch without calling a model or writing a working pack:

```text
npx tsx scripts/publish-show-pack-commentary.mts --input pack.json --output working.json --plan-output review-plan.json
```

Use repeatable `--request REQUEST_ID` flags to stage a smaller authorization.
IDs are validated and normalized to pack source order; the plan, prompt
contracts and spend envelope contain only the selected jobs. Pass the identical
selection flags back during generation. An approved subset cannot expand into
other pending lines.

The plan is inspection evidence, not permission. Render it as a standalone
mobile review desk, record a human transcript only after checking every job and
the full bounded spend envelope, then build the canonical authorization:

```text
npx tsx scripts/generate-show-pack-commentary-review.mts \
  --plan review-plan.json --output review-plan.html
npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan review-plan.json --transcript authorization-transcript.json \
  --output authorization.json
```

The HTML has no network or model path. The builder binds the exact canonical
plan bytes, all request IDs in source order, the source hash, complete budget
and a nonblank human note. It cannot broaden a subset or authorize an empty
plan. Authorize generation explicitly with `--generate`, the exact inspected
plan and its separate authorization.
The source remains
untouched; source aliases are refused and the output is atomically checkpointed
through the same safe writer after every completed request:

```text
npx tsx scripts/publish-show-pack-commentary.mts --input pack.json --output working.json --approved-plan review-plan.json --authorization authorization.json --generate
```

If a later request hits a network or model failure, completed requests remain
in the valid working file. Continue from it with `--resume`. Ready requests are
not regenerated; blocked requests require the separate `--retry-blocked` choice.
Every result records the exact speaker, voice, fact and angle blocks, attempt
count, pipeline identity, residual findings and a SHA-256 of the complete
prompt/model/transport contract. Editing any input or generation contract
invalidates the publication stamp. Older schema-v3 publications without that
digest remain readable; every newly generated line carries it. A final residual produces a visible `blocked` publication
and a non-publishable exit rather than an apparently successful line. The
refutation boundary clears a line only for the exact `{"violations":[]}` shape;
a missing, non-array, blank, extra-field or malformed auditor response becomes
a residual finding and can never mean that the line is grounded.
The generator uses a show-neutral system contract; no current-show companion
prompt is imported. Its response boundary accepts only a nonblank string in the direct
`{"text":"..."}` envelope or the legacy-compatible exact `{"messages":[...]}`
envelope. Malformed generation output retries within the configured bound and
never reaches the auditor or checkpoint writer. Shared responses must contain
one unambiguous message whose `companion_id` matches the requested speaker;

For a legacy migration worksheet, bind the immutable audit so the publisher can
project and validate the schema-v3 working surface without granting collection
approval:

```text
npx tsx scripts/publish-show-pack-commentary.mts \
  --input show-packs/research/hotd-s3-finale-authoring.json \
  --legacy-worksheet show-packs/research/hotd-s3-finale-legacy-worksheet.json \
  --output .private/reviews/hotd-s3-finale-grounded.json \
  --plan-output .private/reviews/hotd-s3-finale-commentary-plan.json
```

Checkpoint outputs remain legacy authoring worksheets and change only request
publication stamps. Null review seals stay open, stale non-null seals fail, and
the command reports commentary publishability separately from whole-authoring
readiness. Planning remains read-only; `--generate` remains the explicit
model/cost boundary. Plan v5 carries the exact initial model request, audit
template, retry template, model, token ceiling, retry count and Anthropic
transport settings produced by the same pure contract the runtime consumes.
Every generation run must pass that exact inspected plan back with
`--approved-plan` plus its separate `--authorization`; drift in the source digest,
target, retry policy, job order, speaker, voice, facts, angle or grounded-line
prompt contract stops before the model caller loads. The publisher executes the
validated plan jobs and revalidates authorization inside the pure publication
function, so inspection, permission and execution cannot be collapsed or bypassed
by a second caller.
It also carries a derived first-pass and bounded worst-case envelope for
generation-call ceilings, audit-call ranges, total-call ranges and configured
maximum output tokens. Malformed generator responses may consume an attempt
without reaching audit, so the artifact does not pretend audits are exact. The caveat
lives in the artifact: these are ceilings, not predicted usage or a price, and
`currency_estimate` stays null. Input tokens are not estimated without a
canonical tokenizer or the future generated audit text, so
`input_token_estimate` is null as well. Resume plans recompute the envelope from only
the remaining eligible jobs. Repeatable `--request REQUEST_ID` flags make
approval request-scoped. The exact normalized selection is bound into the plan,
and unselected pending requests remain untouched. On resume, selected IDs
already ready in the checkpoint are removed before the new plan and budget are
emitted; unknown, duplicate or otherwise ineligible selections fail closed.
After an interrupted run, emit and inspect a new plan against the checkpointed
output because completed jobs and the source digest differ:

```text
npx tsx scripts/publish-show-pack-commentary.mts \
  --input pack.json --output working.json --resume \
  --plan-output resume-plan.json
npx tsx scripts/generate-show-pack-commentary-review.mts \
  --plan resume-plan.json --output resume-review.html
npx tsx scripts/build-show-pack-commentary-authorization.mts \
  --plan resume-plan.json --transcript resume-transcript.json \
  --output resume-authorization.json
npx tsx scripts/publish-show-pack-commentary.mts \
  --input pack.json --output working.json --resume \
  --approved-plan resume-plan.json --authorization resume-authorization.json --generate
```

Resume planning reads but never rewrites the checkpoint.
message order cannot confer speaker identity.

# Settlement drops

A settlement drop is a self-contained, offline ceremony compiled from one closed room's canonical
settlement. The settlement owns final truth and scores; the drop manifest owns only the order and
presentation of that record. `scripts/settle-room.mts` writes the receipt that joins the two.

When migrating a hand-built ceremony, audit its legacy presentation inputs before authoring a
manifest. The audit is read-only unless `--output` is supplied, seals every source file by SHA-256,
and inventories recoverable muster, pundit, board, personal-edition and portrait lanes without
promoting them to settlement truth:

```sh
npx tsx scripts/audit-settlement-drop-migration.mts \
  --room CODE \
  --source-dir .private/postop \
  --output .private/reviews/CODE-settlement-drop-migration-audit.json
```

Legacy inputs remain blocked until a canonical receipt exists, quote grounding is present, ledger
rows are linked to receipt evidence, embedded assets are extracted to confined local files, player
identities are explicit, and acts and beats are deliberately authored. The audit never infers any
of those joins from matching labels or presentation order. Pass `--receipt PATH` only when a real
receipt is already available; it must validate and belong to the requested room. Existing audit
files require `--force` for atomic replacement, and an output may not alias any audited source.

Embedded legacy raster assets have a separate mechanical handoff. Dry-run first, then choose a new
private output directory; completed directories are immutable and cannot be merged or replaced:

```sh
npx tsx scripts/extract-settlement-drop-assets.mts \
  --room CODE \
  --input .private/postop/assets.json

npx tsx scripts/extract-settlement-drop-assets.mts \
  --room CODE \
  --input .private/postop/assets.json \
  --output-dir .private/settlement-drops/CODE/assets-v1
```

The extractor validates the declared MIME type against the actual raster signature, writes a
deterministically named confined file for every asset, and seals each file plus the exact source
collection in `asset-extraction.json`. It does not author alt text or decide which portraits belong
to players, characters, speakers or interstitials. Feed the completed handoff back into the audit:

```sh
npx tsx scripts/audit-settlement-drop-migration.mts \
  --room CODE \
  --source-dir .private/postop \
  --asset-extraction .private/settlement-drops/CODE/assets-v1/asset-extraction.json \
  --output .private/reviews/CODE-settlement-drop-migration-audit.json \
  --force
```

Before retiring the extraction blocker, the audit rechecks the source seal, exact ID coverage,
path confinement, byte counts, raster signatures and SHA-256 of every local file. It then surfaces
semantic asset assignments and alt text as a separate authoring decision.

Prepare that decision from the true hand-built ceremony without guessing from filenames:

```sh
npx tsx scripts/review-settlement-drop-asset-semantics.mts \
  --room CODE \
  --ceremony .private/postop/the-ceremony.html \
  --assets .private/postop/assets.json \
  --extraction .private/settlement-drops/CODE/assets-v1/asset-extraction.json \
  --packet .private/reviews/CODE-settlement-drop-asset-semantics.json \
  --decision-template .private/reviews/CODE-settlement-drop-asset-semantics-decisions.json
```

The packet extracts only exact byte-identity assignments from the ceremony's structured
`CHARS.img`, `PUNDITS.img` and `PDATA.sigil` records. It separately inventories static image
classes, empty alt uses and observed non-empty labels. Those observations become candidate alt
texts, never approvals. The paired decision template has one row per extracted asset with null alt
text, null assignment approval and null note; it cannot authorize a manifest unchanged. Outputs
are source-alias-safe and overwrite-protected. The decision template is published first and the
packet doorway last, and each decision file seals the exact packet SHA-256 it reviews.
Add `--asset-semantics PACKET.json` alongside `--asset-extraction` in the migration audit. The
audit rebuilds the packet from the exact ceremony, embedded asset collection and extraction
manifest, then replaces broad semantic discovery with explicit per-asset alt-text and assignment
approvals. It does not consume or infer those approvals.

Recover the hand-built deck's presentation order through its own sealed review packet:

```sh
npx tsx scripts/review-settlement-drop-presentation-structure.mts \
  --room CODE \
  --ceremony .private/postop/the-ceremony.html \
  --beatlines .private/postop/beatlines.json \
  --takes .private/postop/takes.json \
  --packet .private/reviews/CODE-settlement-drop-presentation-structure.json \
  --decision-template .private/reviews/CODE-settlement-drop-presentation-structure-decisions.json
```

The packet preserves every slide in source order, classifies observed act dividers, beat slides,
running-table interstitials and the personal doorway, and records act membership from the actual
divider boundaries. Beatline groups become review candidates only when one ledger-text signature
has a unique best slide; the packet records its shared-token score and runner-up, while empty or
ambiguous groups stay unresolved and every approval remains null. Take groups join only after proving the ceremony runtime indexes
`PUNDITS` by slide number, preserving every runtime speaker while allowing the expanded multi-take
authoring file to add later pundits. The null decision template still requires explicit show copy,
act IDs, supported scenes, interstitial placement and portraits, beat IDs, copy, weights, portraits
and join approvals. Observed classes and text are evidence, not compiler authoring.

Add `--presentation-structure PACKET.json` to the migration audit. It rebuilds the packet from the
current sealed ceremony, beatlines and takes inside the pure validation boundary; stale,
substituted or parsed/raw-divergent handoffs fail before the broad structure blocker can retire.

Resolve legacy display-name drift through an exact player-ID review, never a fuzzy name join:

```sh
npx tsx scripts/review-settlement-drop-player-identity.mts \
  --room CODE \
  --ceremony .private/postop/the-ceremony.html \
  --tiers .private/postop/tiers.json \
  --personal .private/postop/personal.json \
  --board .private/postop/board.json \
  --rooms .private/snapshots/SNAPSHOT/rooms.json \
  --players .private/snapshots/SNAPSHOT/players.json \
  --packet .private/reviews/CODE-settlement-drop-player-identity.json \
  --decision-template .private/reviews/CODE-settlement-drop-player-identity-decisions.json
```

The packet requires the ceremony `PIDS` keys and snapshot player IDs to match exactly. It then
attributes names seen in tiers, personal editions and board records only when each name is an exact
snapshot or ceremony variant for that UUID. Unknown or ambiguous names fail closed. The paired
decision template leaves every canonical name null. Supply the packet to the migration audit with
all three `--player-identity`, `--snapshot-rooms` and `--snapshot-players` arguments; the audit
rebuilds the packet from the sealed bytes before replacing the mismatch blocker with an explicit
canonical-name approval blocker.

Inventory legacy inline quote emphasis before moving copy into the escaping compiler:

```sh
npx tsx scripts/review-settlement-drop-quote-markup.mts \
  --room CODE \
  --takes .private/postop/takes.json \
  --packet .private/reviews/CODE-settlement-drop-quote-markup.json \
  --decision-template .private/reviews/CODE-settlement-drop-quote-markup-decisions.json
```

The packet accepts only balanced legacy `<b>` spans, records their exact plain-text offsets, and
shows the compiler consequence: authored text is escaped, so unreviewed tags would become visible
characters. Stripping the tags produces a mechanical candidate, not approved copy. Unsupported,
nested, empty or unbalanced markup fails closed. Add `--quote-markup PACKET.json` to the migration
audit; it rebuilds the packet from the sealed `takes.json` before replacing the broad markup warning
with nine explicit copy-and-emphasis approvals.

For a legacy snapshot taken before settlement existed, inventory receipt prerequisites without
pretending the snapshot is a receipt:

```sh
npx tsx scripts/review-settlement-drop-receipt-prerequisites.mts \
  --room CODE \
  --snapshot-dir .private/snapshots/SNAPSHOT \
  --packet .private/reviews/CODE-settlement-drop-receipt-prerequisites.json \
  --decision-template .private/reviews/CODE-settlement-drop-receipt-prerequisites-decisions.json
```

The packet seals the original game tables, validates room-scoped player, winner, draft and bingo
joins, and exposes outcome rows only as candidates. A `finished` room with no active settlement or
provided settlement rows is explicitly marked `canonical_receipt_recoverable=false`. Every title,
actor, outcome, warrant, timestamp, bingo policy and additional-fact decision remains null. Supply
both `--receipt-prerequisites PACKET.json` and `--receipt-snapshot-dir DIR` to the migration audit;
the packet is rebuilt, but the missing-receipt blocker deliberately remains.

Once all five packets and their canonical decision files exist, build one read-only review index:

```sh
npx tsx scripts/build-settlement-drop-approval-docket.mts \
  --room CODE \
  --audit .private/reviews/CODE-settlement-drop-migration-audit.json \
  --receipt-prerequisites PACKET.json --receipt-prerequisites-decisions DECISIONS.json \
  --player-identity PACKET.json --player-identity-decisions DECISIONS.json \
  --asset-semantics PACKET.json --asset-semantics-decisions DECISIONS.json \
  --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json \
  --presentation-structure PACKET.json --presentation-structure-decisions DECISIONS.json \
  --output .private/reviews/CODE-settlement-drop-approval-docket.json
```

The docket is a derived index, not an approval surface. It binds the exact audit, packet and
decision-file hashes, proves each decision file targets its supplied packet and room, and
validates the exact packet identity set and admissible decision shape for every lane. Docket v2
reports conditional truth-bearing requirements and exact open paths rather than counting every
raw null: excluded acts and beats may truthfully retain null details, optional notes never become
blockers, while an included structure choice or preserved bingo record opens its dependent
requirements. `complete` means all required values are present; it does not mean approved,
migration-ready or settled. Reviewers still edit the canonical lane decision files; regenerate
the docket afterward to reflect their new hashes.

Render those sealed inputs into one private, mobile-first review document without creating a
second decision owner:

```sh
npx tsx scripts/generate-settlement-drop-approval-review.mts \
  --docket .private/reviews/CODE-settlement-drop-approval-docket.json \
  --asset-root .private/reviews/CODE-settlement-drop-assets \
  --receipt-prerequisites RECEIPT-PACKET.json --receipt-prerequisites-decisions RECEIPT-DECISIONS.json \
  --player-identity IDENTITY-PACKET.json --player-identity-decisions IDENTITY-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json --asset-semantics-decisions ASSET-DECISIONS.json \
  --quote-markup QUOTE-PACKET.json --quote-markup-decisions QUOTE-DECISIONS.json \
  --presentation-structure STRUCTURE-PACKET.json --presentation-structure-decisions STRUCTURE-DECISIONS.json \
  --output .private/reviews/CODE-settlement-drop-approval-review.html
```

The standalone HTML verifies every packet and decision-file hash named by the docket and every
embedded asset's confined path, signature, byte count and digest. It contains no scripts, forms
or external URLs.
It presents source-bound evidence, each lane's required/open count and a script-free disclosure
of the exact open paths. It names the canonical decision files but cannot record an approval.
Regenerate it after either a packet or decision file changes; pass `--force` only when
intentionally replacing an older private review artifact.

When the evidence has been reviewed, generate the separate offline decision workbench from the
same docket, packets, decisions and extracted asset root:

```sh
npx tsx scripts/generate-settlement-drop-approval-workbench.mts \
  --docket .private/reviews/CODE-settlement-drop-approval-docket.json \
  --asset-root .private/settlement-drops/CODE/assets-v1 \
  --receipt-prerequisites RECEIPT-PACKET.json --receipt-prerequisites-decisions RECEIPT-DECISIONS.json \
  --player-identity IDENTITY-PACKET.json --player-identity-decisions IDENTITY-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json --asset-semantics-decisions ASSET-DECISIONS.json \
  --quote-markup QUOTE-PACKET.json --quote-markup-decisions QUOTE-DECISIONS.json \
  --presentation-structure STRUCTURE-PACKET.json --presentation-structure-decisions STRUCTURE-DECISIONS.json \
  --output .private/reviews/CODE-settlement-drop-approval-workbench.html
```

The workbench never guesses or validates a decision in the browser. Its collapsed 44px rows expose
all source evidence and all 16px decision fields, retain an in-progress draft only under the exact
docket hash in local browser storage, and download a transcript containing only explicit edits.
It has no network path and cannot write the canonical templates.

Validate that transcript locally before creating any decision output. Dry-run is the default:

```sh
npx tsx scripts/build-settlement-drop-approval-decisions.mts \
  --docket .private/reviews/CODE-settlement-drop-approval-docket.json \
  --transcript ~/Downloads/code-settlement-drop-approval-transcript.json \
  --receipt-prerequisites RECEIPT-PACKET.json --receipt-prerequisites-decisions RECEIPT-DECISIONS.json \
  --player-identity IDENTITY-PACKET.json --player-identity-decisions IDENTITY-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json --asset-semantics-decisions ASSET-DECISIONS.json \
  --quote-markup QUOTE-PACKET.json --quote-markup-decisions QUOTE-DECISIONS.json \
  --presentation-structure STRUCTURE-PACKET.json --presentation-structure-decisions STRUCTURE-DECISIONS.json
```

The builder requires the unchanged docket, every exact packet and every exact baseline decision
file. It rejects stale hashes, duplicate or immutable paths, no-op edits and invalid semantic
values, then reruns the same cross-lane decision inspector and reports residual open work. Add
`--output-dir NEW-DIRECTORY` only to publish an immutable set of candidate decision files plus an
`approval-build.json` receipt; it will not replace the canonical files. Rebuild the docket against
those candidates before any deliberate canonical replacement. A complete decision set still does
not mint a settlement receipt or authorize a room write.

Receipt binding is deliberately a second review stage. It cannot exist until the room has a
canonical receipt and the presentation structure decisions are complete, because receipt event
IDs—not legacy labels or point totals—own the final ledger:

```sh
npx tsx scripts/review-settlement-drop-receipt-binding.mts \
  --receipt settlement-drops/my-show/receipt.json \
  --presentation-structure .private/reviews/CODE-settlement-drop-presentation-structure.json \
  --presentation-decisions .private/reviews/CODE-settlement-drop-presentation-structure-decisions.json \
  --asset-semantics .private/reviews/CODE-settlement-drop-asset-semantics.json \
  --beatlines .private/postop/beatlines.json \
  --packet .private/reviews/CODE-settlement-drop-receipt-binding.json \
  --decision-template .private/reviews/CODE-settlement-drop-receipt-binding-decisions.json
```

The packet inventories every receipt score event and every resolved unscored fact as a required
target, every included compiler beat, and every legacy presentation line. Approved beatline joins
become source-bound candidate beat IDs only. The paired decision template leaves every receipt
target placement and every legacy-line disposition null. A reviewer must place each canonical
target on one included beat, then rule each legacy line either `represented` by a compatible
target on its approved candidate beat or `superseded` with a specific note. This lets the old deck
remain evidence without making matching text or arithmetic authoritative. Complete decisions
must leave no included beat empty; draft, adjustment, bingo and honest no-card lines cannot cross
kind boundaries or change points.

The command recomputes and validates every supplied file seal, requires the presentation decisions to target the
exact supplied structure packet, and refuses incomplete structure decisions, receipt-room drift,
changed beatlines, output aliases and accidental replacement. It is local-only and writes the
decision template before publishing the packet doorway. The packet is not a finished drop and
does not solve quote grounding; grounded quote publication remains its own mandatory stage before
manifest compilation.

Grounded pundit publication begins with a separate, model-free review packet. It requires the
canonical receipt and completed presentation, asset-semantics and quote-markup decisions, then
rebuilds all three upstream packets from the exact ceremony, beatlines, takes, embedded asset
collection and extraction manifest:

```sh
npx tsx scripts/review-settlement-drop-quote-grounding.mts \
  --receipt settlement-drops/my-show/receipt.json \
  --ceremony .private/postop/the-ceremony.html \
  --beatlines .private/postop/beatlines.json \
  --takes .private/postop/takes.json \
  --legacy-assets .private/postop/assets.json \
  --extraction .private/settlement-drops/CODE/assets-v1/asset-extraction.json \
  --presentation-structure PRESENTATION-PACKET.json \
  --presentation-decisions PRESENTATION-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json \
  --asset-decisions ASSET-DECISIONS.json \
  --quote-markup MARKUP-PACKET.json \
  --quote-markup-decisions MARKUP-DECISIONS.json \
  --receipt-binding RECEIPT-BINDING-PACKET.json \
  --receipt-binding-decisions RECEIPT-BINDING-DECISIONS.json \
  --packet .private/reviews/CODE-settlement-drop-quote-grounding.json \
  --decision-template .private/reviews/CODE-settlement-drop-quote-grounding-decisions.json
```

Only take groups explicitly approved on included compiler beats enter the packet. The receipt
binding packet is rebuilt too, and any settlement-record warrant must resolve to a canonical
event or unscored fact placed on that same beat. Legacy speaker,
copy, portrait match and reference names remain visible candidates, never canonical facts. Each
quote decision must either `omit` the take with a specific reason or `replace` it with an approved
pundit identity, receipt-character reference chips, an expression-only voice and angle, and an
exhaustive screen-fact block whose every fact carries warrants. `screen_capture`,
`table_testimony`, `operator_record` and exact `settlement_record` labels can warrant screen facts;
`recap` can only corroborate one of those stronger sources. Source-material canon is isolated in
`source_material_attitude` and never enters the fact block. A settlement-record warrant uses a
typed key such as `settled_fact:door-opens` or `score_event:draft:wolf:1`, so one raw ID cannot
carry two meanings.

After editing the canonical decision file, validate it and produce the exact bounded generation
plan without calling a model:

```sh
npx tsx scripts/review-settlement-drop-quote-grounding.mts \
  ...the same sealed inputs... \
  --decisions .private/reviews/CODE-settlement-drop-quote-grounding-decisions.json \
  --plan .private/reviews/CODE-settlement-drop-quote-grounding-plan.json
```

The plan seals the exact packet and decision bytes, retains every fact warrant beside the prompt
fact block, materializes the canonical `scripts/grounded-line.mts` prompt contract, and reports
first-pass and worst-case call and output-token ceilings. This command never calls a model. A
valid plan is evidence of reviewed inputs, not permission to spend or proof of grounded output.

Render the exact plan as an offline authorization page. It exposes every prompt contract, fact
warrant, explicit omission and bounded call/token ceiling; its restrictive content policy permits
no network access, and its only action downloads a human transcript:

```sh
npx tsx scripts/generate-settlement-drop-quote-authorization-review.mts \
  --plan .private/reviews/CODE-settlement-drop-quote-grounding-plan.json \
  --output .private/reviews/CODE-settlement-drop-quote-authorization-review.html

npx tsx scripts/build-settlement-drop-quote-authorization.mts \
  --plan .private/reviews/CODE-settlement-drop-quote-grounding-plan.json \
  --transcript ~/Downloads/CODE-quote-authorization-transcript.json \
  --output .private/reviews/CODE-settlement-drop-quote-authorization.json
```

The builder accepts only a complete, ordered acknowledgement of the exact plan hash, every job,
every omission and the full bounded budget. It calls no model. Before generation, validate the
entire chain in dry-run mode:

```sh
npx tsx scripts/publish-settlement-drop-quotes.mts \
  --packet .private/reviews/CODE-settlement-drop-quote-grounding.json \
  --decisions .private/reviews/CODE-settlement-drop-quote-grounding-decisions.json \
  --approved-plan .private/reviews/CODE-settlement-drop-quote-grounding-plan.json \
  --authorization .private/reviews/CODE-settlement-drop-quote-authorization.json \
  --checkpoint .private/reviews/CODE-settlement-drop-quote-publication-checkpoint.json \
  --output .private/reviews/CODE-settlement-drop-quote-publication.json
```

The publication command rebuilds the approved plan from the current packet and decision bytes,
then validates the canonical authorization and any checkpoint. It imports the model runner only
when `--generate` is present. An authorized run writes the checkpoint after every completed job;
rerunning the same command with the same checkpoint skips ready and blocked jobs and resumes only
pending work, so an interruption does not repeat completed spend. Residual refutation findings
remain visible as `blocked`, produce exit status 2 and prevent the final publication file. Further
work on a blocked quote requires revised reviewed decisions, a rebuilt plan and new authorization;
the exhausted contract cannot be silently retried. A complete publication contains compiler-ready
`manifest_quote` records plus the exact warrant and prompt-contract provenance needed for audit:

```sh
npx tsx scripts/publish-settlement-drop-quotes.mts \
  --packet .private/reviews/CODE-settlement-drop-quote-grounding.json \
  --decisions .private/reviews/CODE-settlement-drop-quote-grounding-decisions.json \
  --approved-plan .private/reviews/CODE-settlement-drop-quote-grounding-plan.json \
  --authorization .private/reviews/CODE-settlement-drop-quote-authorization.json \
  --checkpoint .private/reviews/CODE-settlement-drop-quote-publication-checkpoint.json \
  --output .private/reviews/CODE-settlement-drop-quote-publication.json \
  --generate
```

Generation is a deliberate external-spend boundary. Do not add `--generate` until the human has
reviewed the authorization page and the canonical authorization file exists.

Final composition now has one last model-free authoring packet for fields that no canonical
upstream artifact owns: player house, accent and sigil; character kind, muster tier and portrait;
quiet hypothetical drawer rows; and the optional closing return path. Build it only after player
identity, asset semantics and presentation decisions are complete:

```sh
npx tsx scripts/review-settlement-drop-final-authoring.mts \
  --receipt settlement-drops/my-show/receipt.json \
  --presentation-structure PRESENTATION-PACKET.json \
  --presentation-decisions PRESENTATION-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json \
  --asset-decisions ASSET-DECISIONS.json \
  --player-identity IDENTITY-PACKET.json \
  --player-identity-decisions IDENTITY-DECISIONS.json \
  --packet .private/reviews/CODE-settlement-drop-final-authoring.json \
  --decision-template .private/reviews/CODE-settlement-drop-final-authoring-decisions.json
```

The packet derives players and characters only from the canonical receipt. Portrait candidates
come only from structured assignments explicitly approved in the asset lane; names must match the
receipt exactly. The template authors no default values. After review, rerun the command with
`--decisions FINAL-DECISIONS.json` to validate completeness without writing.

Compose the compiler manifest from the entire exact chain:

```sh
npx tsx scripts/compose-settlement-drop-manifest.mts \
  --receipt settlement-drops/my-show/receipt.json \
  --receipt-reference receipt.json \
  --presentation-structure PRESENTATION-PACKET.json \
  --presentation-decisions PRESENTATION-DECISIONS.json \
  --asset-semantics ASSET-PACKET.json \
  --asset-decisions ASSET-DECISIONS.json \
  --player-identity IDENTITY-PACKET.json \
  --player-identity-decisions IDENTITY-DECISIONS.json \
  --final-authoring FINAL-PACKET.json \
  --final-decisions FINAL-DECISIONS.json \
  --receipt-binding RECEIPT-BINDING-PACKET.json \
  --receipt-binding-decisions RECEIPT-BINDING-DECISIONS.json \
  --quote-packet QUOTE-PACKET.json \
  --quote-decisions QUOTE-DECISIONS.json \
  --quote-plan QUOTE-PLAN.json \
  --quote-authorization QUOTE-AUTHORIZATION.json \
  --quote-publication QUOTE-PUBLICATION.json \
  --beatlines beatlines.json \
  --output settlement-drops/my-show/drop.json
```

Dry-run is the default. Composition rebuilds the final-authoring and receipt-binding packets,
requires every reviewed decision set to be complete, proves the quote packet seals the same
receipt, beatlines, structure, assets and binding artifacts, and accepts only an exact authorized
publication with every quote ready. It then routes every receipt event and honest no-card fact to
one reviewed beat, derives fired drawer rows from receipt events, and passes the resulting manifest
through the real settlement-drop compiler before writing. `--receipt-reference` must resolve below
the output directory to the exact supplied receipt. Existing output requires `--force`; source
aliases are refused. No command in this final stage contacts Supabase or a model.

The resulting `drop.json` is the input to `scripts/generate-settlement-drop.mts`. Asset paths in the
approved asset packet must resolve relative to that manifest when the HTML generator embeds them.

For a legacy pre-settlement snapshot, completed receipt-prerequisite decisions can now be
materialized into the exact settlement record consumed by the live command without copying score
arithmetic into the migration lane:

```sh
npx tsx scripts/compose-settlement-drop-record.mts \
  --packet .private/reviews/CODE-settlement-drop-receipt-prerequisites.json \
  --decisions .private/reviews/CODE-settlement-drop-receipt-prerequisites-decisions.json \
  --snapshot-dir .private/snapshots/SNAPSHOT
```

Dry-run is the default. The composer rebuilds the packet from every sealed snapshot table,
requires the decision file to target those exact packet bytes, rejects every open truth field,
and feeds the approved outcomes through the same pure resolution, scoring, receipt-evidence and
input-snapshot preview used by `settle-room.mts`. `preserve_snapshot_marks=true` snapshots every
approved mark under the reviewed warrant. `false` is an explicit decision to replace them with an
empty ledger; this packet version has no replacement-mark authoring surface. Set
`additional_fact_review=false` only when review found no score-bearing facts beyond the packet's
candidate rows. `true` fails closed and requires the full settlement worksheet so those facts can
be authored rather than dropped.

Add `--output .private/settlements/CODE-record.json` to write the validated manifest. Outputs are
confined to direct children of `.private/settlements/`, overwrite-protected unless `--force`, and
cannot alias either source file. The command is offline and never contacts Supabase. The emitted
file is still only a record proposal: applying it remains the separately confirmed, protected
`settle-room.mts` action.

Prepare a private settlement worksheet from a finished or closed room before authoring the
canonical record:

```sh
npx tsx scripts/prepare-settlement.mts \
  --room CODE \
  --output .private/settlements/CODE-worksheet.json
```

The read-only command defaults to local and writes only to direct files under
`.private/settlements/`. It separates provisional evidence from an intentionally incomplete
`manifest_draft`: outcomes, winners, warrants, bingo policy and expected ledgers remain explicit
research decisions. Closed-room worksheets preserve already-settled entries but reopen the new
version's title, actor, bingo policy and expected ledgers. After those fields are authored,
finalize the public contract offline:

```sh
npx tsx scripts/prepare-settlement.mts \
  --worksheet .private/settlements/CODE-worksheet.json \
  --manifest-output .private/settlements/CODE-record.json
```

Finalization emits only the closed settlement-manifest schema. Unknown fields and private
worksheet context cannot enter the record or alter its identity.

After an authorized settlement apply, emit its canonical receipt alongside the ceremony inputs:

```sh
npx tsx scripts/settle-room.mts \
  --room CODE \
  --manifest record.json \
  --apply \
  --confirm-room CODE \
  --receipt settlement-drops/my-show/receipt.json
```

The apply RPC first locks the room and proves that player, confidence, draft and bingo-card inputs
still match the command's preflight snapshot. If they changed, it rejects without closing and the
operator reruns the dry run; settlement and a competing input write can never both commit. The
receipt is written only after the database confirms the actual settlement ID, version and
manifest hash, closes the room, and a second read reconstructs the frozen record. It contains the
canonical player names, complete draft-entity roster and ownership, itemized score events,
settled personal cards, every ordered settlement fact, and the settlement's creation timestamp
plus nullable superseded-settlement ID. The fact timeline includes voids and
resolved facts for which no board category existed, but omits private warrants. It also attests
the room's exact published show-pack registry ID, pack key
and version, so downstream tools never accept an operator-supplied predecessor identity; totals and
standings are derived from those events. Re-running the same
settlement is idempotent and can emit the same receipt. Existing receipt files require
`--force-receipt`; forced replacement is atomic and cannot follow a symlink or hard link onto the
settlement manifest.

If a closed room predates that receipt file, recover the same canonical bytes without replaying
or applying settlement:

```sh
npx tsx scripts/export-settlement-receipt.mts \
  --room CODE \
  --output settlement-drops/my-show/receipt.json
```

This command requires service-role visibility, exhausts every paginated receipt input, and calls
the same `buildPostCloseSettlementReceipt` boundary as settlement itself. It accepts only a closed
room with one active settlement and brackets the multi-table read with the room's active version;
an amendment during export fails instead of producing cross-version evidence. It performs no
database write. Production reads additionally require `SUPABASE_TARGET=remote` and
`--confirm-room CODE`; running it against a real room remains a protected operator action.
Existing outputs fail closed unless `--force` atomically replaces them.

Validate a manifest and preview its output facts without writing a file:

```sh
npx tsx scripts/generate-settlement-drop.mts \
  --input settlement-drops/examples/proof.json \
  --allow-proof
```

Write an artifact explicitly:

```sh
npx tsx scripts/generate-settlement-drop.mts \
  --input settlement-drops/examples/proof.json \
  --output /tmp/settlement-drop-proof.html \
  --allow-proof
```

The drop references that receipt by confined relative path and SHA-256. A scored manifest line
contains only a receipt event ID; the compiler supplies its player, character, kind, canonical
label and points, and rejects missing, duplicate or invented events. Personal cards are likewise
receipt-owned rather than copied into the manifest. Player names, character names, ownership, and
the presence of every character are receipt-bound too. Every nested authoring object has a closed
field set: private notes, stale scores, raw model output and other undeclared metadata fail before
an artifact can compile. A fired character-drawer row contains only
its character score-event ID; only a quiet hypothetical row may author its own label and points.
Final and interstitial standings use the game cascade: total, confidence points, correct-pick
count, then highest correct pick, with shared competition ranks for a true tie. A correction may
take a player's canonical total below zero; the drop retains that signed total and ranks it rather
than rejecting or clamping the settled record. Running tables say the field is level only for an
all-zero full-table tie; a positive tie shares the lead and zero still leads a negative correction.
The compiler rejects negative draft, prediction or
bingo evidence; only an explicit adjustment event may carry a negative correction. The compiler also
requires every pundit line to have a clean
`scripts/grounded-line.mts` publication stamp, all assets resolve inside the drop directory, and
each receipt card is a complete 5 by 5 board with exactly one marked free cell in the center.
Ownerless characters remain visible in the muster as `Unclaimed` and cannot receive ledger
points. Every player and every draftable entity must name a registered portrait asset; a finished
drop cannot silently replace either with an initials monogram. Decorative beat art remains
optional, and the generic `Unclaimed` grouping is not a person or draftable entity. The generated
file embeds every asset as a data URI, carries a restrictive Content
Security Policy and makes no external request. `--force` atomically replaces an existing output
artifact, but refuses path, symlink and hard-link aliases of the source manifest, settlement
receipt or an embedded asset.

Reviewed signature-beat declarations carry one further receipt-owned field. The declaration
freezes its canonical source beat ID and exact trigger contract while the database keeps its fact
and points bound to that beat. The settlement receipt retains that pair only beside each resulting
character-draft event. Its wager-sheet row is then a 44-pixel-or-larger
disclosure that exposes the full condition, exclusions, proxy/off-screen/mention policy,
title-review note, and claim IDs. A manual declaration or legacy beat has no such disclosure.
The compiler never infers provenance from a matching title and never accepts private trigger
copy in place of the sealed rule.

Beat ledgers never bundle settled bingo squares. Each receipt-owned `bingo-square:*` event must
be referenced exactly once and renders as its own row with player attribution, points and the
four-cell bingo hallmark. Character-scored draft and adjustment rows use the paying character's
compact square portrait; prediction-only rows retain the player's mark.

The muster is complete and impact-ranked within each player's roster. `lead` and `support`
characters sort by their net fired drawer points and receive a descending ordinal size; `present`
and `absent` characters wrap in smaller, quieter tiers instead of disappearing into horizontal
scroll. Impact-only, mixed and rest-only rosters each select their own grid, and every character
chip carries a visible drawer chevron, an accessible label and a tappable wager sheet.

The opening sequence owns a single curtain threshold. Opening, muster and the dedicated
`begins` slide keep the embedded velvet panels closed; advancing into the first act parts
them, while back navigation closes them at the same boundary. Reduced-motion clients get
the same state change without a transition.

The offline deck supports the same complete navigation grammar without a framework: 56-pixel
edge taps, horizontal swipes, keyboard arrows and the two persistent 48-pixel chevrons all move
the record and retire the teaching hint. Interactive controls are excluded from edge handling.
Opening a character or personal sheet makes the deck and chrome inert, moves focus to Close,
traps keyboard focus inside the modal, blocks every deck-navigation path, and restores the
original opener on dismissal.

Every personal edition also has a stable `?player=<receipt-player-id>` doorway. A valid ID jumps
to that player's full-height, screenshot-safe appendix; an unknown ID opens nothing and leaves the
ordinary ceremony intact. Choosing a banner establishes the same URL without reloading. The
edition derives its total, complete 5 by 5 card, roster ownership, fired count and character
points from the settlement receipt, while every roster row still opens the detailed wager sheet.
`Share this edition` uses the native share sheet when available, falls back to copying that exact
personal URL, and leaves the link visible in the address bar if neither capability succeeds.

Every act requires an `interstitial.portrait_asset` from the registered asset map. Its
running-table slide pairs the complete leaderboard with a 112-pixel square double-rule frame
and a 92-pixel circular cast portrait. Missing or unknown focal art is a compile error; the
finished interstitial never substitutes a monogram or glow.

The ceremony grammar also preserves the record's weight without pretending every moment was
predicted. A `no_card` authoring line contains only `kind` and the `fact_id` of one resolved,
unscored receipt fact. The compiler supplies its canonical visible title, requires every such
fact exactly once, and rejects authored replacement text, duplicates, void facts and scored-board
facts. It renders as a muted, dashed, explicitly labeled aside: an honest gap in the board, never
a score event or error. Legacy receipts remain readable, but must be re-emitted before they can
support a no-card callout. `death` and `betrayal` beats run the theater-dim entrance;
betrayal additionally receives the larger title tier and a self-contained low-noise ember canvas.
The canvas stops whenever the slide changes, and reduced-motion clients get a static field with no
entrance animation.

Every pundit take remains grounded and also names a registered `portrait_asset`. The desk keeps
speaker, portrait, quote and labeled reference chips in one active panel; 44-pixel Previous and
Next controls cycle the complete stack and wrap at either end. The asset requirement prevents a
speaker from silently falling back to a monogram in a supposedly finished ceremony.

The synthetic proof is deliberately not a real party record. Its receipt says `synthetic-proof`,
so the compiler refuses it without explicit `--allow-proof`; an actual settlement receipt never
needs that flag. Every proof slide and overlay carries a persistent synthetic-record label. Copy
the proof as an authoring example, then replace its receipt, ledger, copy and local assets with the
closed room's material. Never copy score fields or personal cards into the drop: reference receipt
event IDs, because the receipt is the only score and card owner.

The same canonical receipt can begin the next show's evidence handoff with
`scripts/generate-show-pack-flywheel.mts`. That projection is intentionally
public-safe: its schema-v3 artifact carries the dated settlement revision, complete
settled fact timeline, score evidence and character impact, but removes
players, room identity and personal cards before show-pack research begins.

import type { SettlementDropApprovalDocket, SettlementDropApprovalLaneKind } from './settlement-drop-approval-docket'
import type { SettlementDropAssetSemanticsPacket } from './settlement-drop-asset-semantics'
import type { SettlementDropPlayerIdentityPacket } from './settlement-drop-player-identity'
import type { SettlementDropPresentationStructurePacket } from './settlement-drop-presentation-structure'
import type { SettlementDropQuoteMarkupPacket } from './settlement-drop-quote-markup'
import type { SettlementDropReceiptPrerequisitesPacket } from './settlement-drop-receipt-prerequisites'
import { sha256Hex } from './sha256'

type Packets = {
  receipt_prerequisites: SettlementDropReceiptPrerequisitesPacket
  player_identity: SettlementDropPlayerIdentityPacket
  asset_semantics: SettlementDropAssetSemanticsPacket
  quote_markup: SettlementDropQuoteMarkupPacket
  presentation_structure: SettlementDropPresentationStructurePacket
}

export interface SettlementDropApprovalReviewInput {
  docket_raw: string
  packet_raw: Record<SettlementDropApprovalLaneKind, string>
  decision_raw: Record<SettlementDropApprovalLaneKind, string>
  asset_data_urls: Record<string, string>
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseObject<T>(raw: string, label: string): T {
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return parsed as T
}

function lane(docket: SettlementDropApprovalDocket, kind: SettlementDropApprovalLaneKind) {
  const result = docket.lanes.find((entry) => entry.kind === kind)
  if (!result) throw new Error(`docket is missing ${kind}`)
  return result
}

function sealBlock(docket: SettlementDropApprovalDocket, kind: SettlementDropApprovalLaneKind): string {
  const row = lane(docket, kind)
  const requirements = row.open_items.length === 0
    ? '<p class="decision-complete">All required values are present. This means complete, not approved or migration-ready.</p>'
    : `<p class="attention-text">${row.open_values} of ${row.required_values} required values remain open.</p><details class="open-disclosure"><summary>Show exact open paths</summary><ol class="open-items">${row.open_items.map((item) => `<li><code>${esc(item)}</code></li>`).join('')}</ol></details>`
  return `<div class="seal"><span>Canonical decisions · ${esc(row.decision_status)}</span><code>${esc(row.decisions.name)}</code><small>${esc(row.decisions.sha256)}</small>${requirements}</div>`
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`
}

function renderPlayers(docket: SettlementDropApprovalDocket, packet: SettlementDropPlayerIdentityPacket): string {
  const cards = packet.players.map((player) => `<article class="evidence-card">
    <p class="eyebrow">${esc(player.player_id)}</p>
    <h3>${esc(player.snapshot_name)}</h3>
    <div class="compare"><div><span>Snapshot</span><b>${esc(player.snapshot_name)}</b></div><div><span>Ceremony</span><b>${esc(player.ceremony_name)}</b></div></div>
    <p class="status ${player.exact_name_match ? 'quiet-status' : 'attention'}">${player.exact_name_match ? 'Exact display match' : 'Canonical display name requires approval'}</p>
    <dl><dt>Tiers</dt><dd>${esc(player.observed_names.tiers.join(', ') || 'Missing')}</dd><dt>Personal</dt><dd>${esc(player.observed_names.personal.join(', ') || 'Missing')}</dd><dt>Board</dt><dd>${esc(player.observed_names.board.join(', ') || 'Missing')}</dd></dl>
  </article>`).join('')
  return `<section id="player-identity"><header><p class="eyebrow">Lane 1</p><h2>Player identity</h2><p>UUID equality proves who is who. Display spelling remains a human choice.</p></header>
    <div class="metrics">${metric('exact UUID joins', packet.coverage.exact_uuid_joins)}${metric('name variants', packet.coverage.display_name_variants)}</div>
    ${sealBlock(docket, 'player_identity')}<div class="card-grid">${cards}</div></section>`
}

function renderAssets(
  docket: SettlementDropApprovalDocket,
  packet: SettlementDropAssetSemanticsPacket,
  dataUrls: Record<string, string>,
): string {
  const cards = packet.assets.map((asset) => {
    const uri = dataUrls[asset.id]
    if (!uri) throw new Error(`approval review is missing embedded asset ${asset.id}`)
    const assignments = asset.structured_assignments.length === 0
      ? '<span class="tag attention">No structured assignment</span>'
      : asset.structured_assignments.map((assignment) => `<span class="tag">${esc(assignment.kind)} · ${esc(assignment.consumer)}</span>`).join('')
    const candidates = asset.candidate_alt_texts.length > 0
      ? asset.candidate_alt_texts.map((text) => `<li>${esc(text)}</li>`).join('')
      : '<li class="attention-text">No observed alt candidate</li>'
    return `<article class="asset-card"><img src="${esc(uri)}" alt="" role="presentation"><div><p class="eyebrow">${esc(asset.id)} · ${esc(asset.mime_type)}</p><h3 class="asset-path">${esc(asset.path)}</h3><div class="tags">${assignments}</div><p class="mini-label">Observed candidates, not approvals</p><ul>${candidates}</ul><small>${asset.html_evidence.image_uses} image uses · ${asset.html_evidence.empty_alt_uses} empty alt uses</small></div></article>`
  }).join('')
  return `<section id="asset-semantics"><header><p class="eyebrow">Lane 2</p><h2>Asset semantics</h2><p>Exact image bytes and observed consumers are proven. Alt text and manifest assignments are not.</p></header>
    <div class="metrics">${metric('assets', packet.coverage.assets)}${metric('character uses', packet.coverage.character_assignments)}${metric('pundit uses', packet.coverage.pundit_assignments)}${metric('player sigils', packet.coverage.player_sigil_assignments)}</div>
    ${sealBlock(docket, 'asset_semantics')}<div class="asset-grid">${cards}</div></section>`
}

function emphasizedQuote(quote: SettlementDropQuoteMarkupPacket['quotes'][number]): string {
  let result = ''
  let index = 0
  for (const span of quote.emphasis_spans) {
    result += esc(quote.plain_text_candidate.slice(index, span.plain_text_start))
    result += `<mark>${esc(span.text)}</mark>`
    index = span.plain_text_end
  }
  result += esc(quote.plain_text_candidate.slice(index))
  return result
}

function renderQuotes(docket: SettlementDropApprovalDocket, packet: SettlementDropQuoteMarkupPacket): string {
  const cards = packet.quotes.map((quote) => `<article class="quote-card"><p class="eyebrow">Take ${esc(quote.quote_key)} · ${esc(quote.speaker)}</p><div class="copy-block"><span>Legacy source</span><p>${esc(quote.source_text)}</p></div><div class="copy-block candidate"><span>Mechanical candidate with observed emphasis</span><blockquote>${emphasizedQuote(quote)}</blockquote></div><p class="status attention">Copy and emphasis treatment require approval</p></article>`).join('')
  return `<section id="quote-markup"><header><p class="eyebrow">Lane 3</p><h2>Quote markup</h2><p>The compiler escapes HTML. These comparisons show exactly what would otherwise become visible tag text.</p></header>
    <div class="metrics">${metric('quotes', packet.coverage.quotes)}${metric('affected', packet.coverage.quotes_with_markup)}${metric('emphasis spans', packet.coverage.emphasis_spans)}</div>
    ${sealBlock(docket, 'quote_markup')}<div class="stack">${cards}</div></section>`
}

function renderStructure(docket: SettlementDropApprovalDocket, packet: SettlementDropPresentationStructurePacket): string {
  const acts = packet.acts.map((act) => {
    const slides = packet.slides.filter((slide) => slide.observed_act_ordinal === act.observed_act_ordinal && slide.kind === 'beat')
      .map((slide) => `<li><span>${esc(slide.kicker ?? `Slide ${slide.slide_index}`)}</span><b>${esc(slide.title ?? 'Untitled')}</b><small>Ledger candidate ${esc(slide.beatline_group_candidate ?? 'unresolved')} · Take ${esc(slide.take_group ?? 'none')}</small></li>`).join('')
    return `<article class="act-card"><p class="eyebrow">Observed act ${act.observed_act_ordinal} · divider ${act.divider_slide_index}</p><h3>${esc(act.title)}</h3><p>${esc(act.subtitle)}</p><ol>${slides}</ol><p class="status attention">Compiler act, beat, scene and interstitial decisions remain open</p></article>`
  }).join('')
  return `<section id="presentation-structure"><header><p class="eyebrow">Lane 4</p><h2>Presentation structure</h2><p>Source order and candidate joins are evidence. The reusable ceremony grammar still needs explicit authorship.</p></header>
    <div class="metrics">${metric('slides', packet.coverage.slides)}${metric('acts', packet.coverage.acts)}${metric('beats', packet.coverage.beats)}${metric('unresolved', packet.coverage.unresolved_beatline_groups.length)}</div>
    ${sealBlock(docket, 'presentation_structure')}<div class="stack">${acts}</div></section>`
}

function renderReceipt(docket: SettlementDropApprovalDocket, packet: SettlementDropReceiptPrerequisitesPacket): string {
  const entries = packet.candidate_entries.map((entry) => `<tr><td><span>${esc(entry.entry_key)}</span>${esc(entry.category_name)}</td><td>${esc(entry.winner_name)}${entry.tie_winner_name ? ` / ${esc(entry.tie_winner_name)}` : ''}</td><td>${esc(entry.points)}</td></tr>`).join('')
  const gaps = packet.schema_gaps.map((gap) => `<span class="tag attention">${esc(gap)}</span>`).join('')
  return `<section id="receipt-prerequisites"><header><p class="eyebrow">Lane 5</p><h2>Receipt prerequisites</h2><p>The snapshot is useful evidence, but it cannot be promoted into the canonical settlement record.</p></header>
    <div class="truth-callout"><strong>Canonical receipt recoverable: no</strong><p>Snapshot phase ${esc(packet.canonical_state.snapshot_phase)} · room not closed · no active settlement · no settlement rows supplied.</p></div>
    <div class="metrics">${metric('candidate outcomes', packet.coverage.candidate_entries)}${metric('players', packet.coverage.players)}${metric('draft picks', packet.coverage.draft_picks)}${metric('approved marks', packet.coverage.approved_bingo_marks)}</div>
    ${sealBlock(docket, 'receipt_prerequisites')}<p class="mini-label">Schema-era gaps</p><div class="tags">${gaps}</div><div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Observed winner</th><th>Pts</th></tr></thead><tbody>${entries}</tbody></table></div></section>`
}

export function renderSettlementDropApprovalReview(input: SettlementDropApprovalReviewInput): string {
  const docket = parseObject<SettlementDropApprovalDocket>(input.docket_raw, 'approval docket')
  if (docket.artifact !== 'settlement-drop-approval-docket') throw new Error('approval docket artifact is invalid')
  if (docket.docket_version !== 2) throw new Error('approval docket version is not supported')
  const packets = {} as Packets
  for (const kind of ['receipt_prerequisites', 'player_identity', 'asset_semantics', 'quote_markup', 'presentation_structure'] as SettlementDropApprovalLaneKind[]) {
    const raw = input.packet_raw[kind]
    if (typeof raw !== 'string') throw new Error(`approval review is missing packet ${kind}`)
    const docketLane = lane(docket, kind)
    if (sha256Hex(raw) !== docketLane.packet.sha256) throw new Error(`${kind} packet does not match the docket hash`)
    const decisionRaw = input.decision_raw[kind]
    if (typeof decisionRaw !== 'string') throw new Error(`approval review is missing decisions ${kind}`)
    if (sha256Hex(decisionRaw) !== docketLane.decisions.sha256) {
      throw new Error(`${kind} decisions do not match the docket hash`)
    }
    const parsed = parseObject<Packets[typeof kind]>(raw, `${kind} packet`)
    if (parsed.target.room_code !== docket.target.room_code) throw new Error(`${kind} packet room does not match docket`)
    packets[kind] = parsed as never
  }
  const blockers = docket.blockers.map((blocker) => `<li><span>${esc(blocker.code)}</span><b>${esc(blocker.detail)}</b><p>${esc(blocker.required_action)}</p></li>`).join('')
  const laneLinks = [
    ['player-identity', 'Identity'], ['asset-semantics', 'Assets'], ['quote-markup', 'Quotes'],
    ['presentation-structure', 'Structure'], ['receipt-prerequisites', 'Receipt'],
  ].map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>${esc(docket.target.room_code)} settlement-drop review</title><style>
.asset-path{font-size:18px;line-height:1.1;word-break:break-all}.seal>p{margin:12px 0 0;font-size:13px}.decision-complete{color:var(--muted)}.open-disclosure{margin-top:8px}.open-disclosure summary{min-height:44px;display:flex;align-items:center;width:max-content;max-width:100%;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase;cursor:pointer}.open-items{margin:2px 0 8px;padding-left:22px;columns:1}.open-items li{padding:3px 0;color:var(--madder-light)}.open-items code{color:var(--vellum);font-size:10px;overflow-wrap:anywhere}
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--madder-light:#c0614c;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html{background:var(--jet);color:var(--vellum);scroll-behavior:smooth}body{margin:0;font-family:var(--serif);background:radial-gradient(circle at 50% 0,rgba(185,134,63,.1),transparent 28rem),var(--jet)}a{color:inherit}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 34px) 18px calc(env(safe-area-inset-bottom) + 60px)}.hero{padding:12vh 0 42px;border-bottom:1px solid var(--line)}.eyebrow,.mini-label{margin:0 0 8px;color:var(--beacon);font:700 10px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;overflow-wrap:anywhere}h1,h2,h3,p{overflow-wrap:anywhere}h1{font-size:clamp(46px,15vw,78px);font-weight:500;line-height:.95;margin:0 0 18px}h2{font-size:clamp(36px,11vw,56px);font-weight:500;line-height:1;margin:0 0 12px}h3{font-size:22px;margin:0 0 10px}p{line-height:1.5}.hero>p{color:var(--muted);font-size:18px;max-width:40rem}.summary-strip{display:flex;gap:8px;overflow-x:auto;padding:18px 0}.summary-strip a{min-height:44px;display:grid;place-items:center;border:1px solid var(--line);padding:0 14px;text-decoration:none;white-space:nowrap;font:700 10px var(--mono);text-transform:uppercase}.audit{padding:28px 0}.audit ol{list-style:none;padding:0;display:grid;gap:9px}.audit li{border-left:3px solid var(--madder-light);background:var(--iron);padding:13px}.audit li span{display:block;color:var(--madder-light);font:700 9px var(--mono);text-transform:uppercase}.audit li b{display:block;margin:5px 0}.audit li p{margin:0;color:var(--muted);font-size:13px}section{padding:54px 0;border-top:1px solid var(--line)}section>header>p{color:var(--muted)}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:18px 0}.metric{border:1px solid var(--line);background:var(--iron);padding:12px}.metric strong{display:block;font:700 24px var(--mono);color:var(--beacon)}.metric span{display:block;color:var(--muted);font:9px var(--mono);text-transform:uppercase}.seal{border-block:1px solid var(--beacon);padding:12px 0;margin:18px 0 22px}.seal span,.seal code,.seal small{display:block}.seal span{font:700 9px var(--mono);color:var(--beacon);text-transform:uppercase}.seal code{margin:5px 0;font:12px var(--mono);overflow-wrap:anywhere}.seal small{color:var(--muted);font:9px var(--mono);overflow-wrap:anywhere}.card-grid,.stack,.asset-grid{display:grid;gap:10px}.evidence-card,.asset-card,.quote-card,.act-card{background:var(--iron);border:1px solid var(--line);padding:15px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:8px}.compare div,.copy-block{background:var(--jet);padding:10px;border:1px solid var(--line)}.compare span,.copy-block>span{display:block;color:var(--muted);font:9px var(--mono);text-transform:uppercase;margin-bottom:5px}.compare b{font-size:15px}dl{display:grid;grid-template-columns:70px 1fr;gap:5px;margin-bottom:0}dt{color:var(--muted);font:9px var(--mono);text-transform:uppercase}dd{margin:0;font-size:13px}.status{font:700 10px var(--mono);text-transform:uppercase}.attention,.attention-text{color:var(--madder-light)}.quiet-status{color:var(--muted)}.asset-card{display:grid;grid-template-columns:78px minmax(0,1fr);gap:12px}.asset-card img{width:78px;height:98px;object-fit:cover;background:var(--jet);border:1px solid var(--line)}.asset-card ul{padding-left:17px;margin:7px 0}.asset-card small{color:var(--muted);font:9px var(--mono)}.tags{display:flex;flex-wrap:wrap;gap:5px}.tag{display:inline-block;border:1px solid var(--line);padding:5px 7px;font:9px var(--mono)}.tag.attention{border-color:var(--madder)}.copy-block p,.copy-block blockquote{margin:0;font-size:15px;line-height:1.45}.copy-block.candidate{margin-top:8px;border-left:3px solid var(--beacon)}mark{background:transparent;color:var(--beacon);font-weight:700}.act-card>p{color:var(--muted)}.act-card ol{padding-left:20px}.act-card li{padding:8px 0}.act-card li span,.act-card li b,.act-card li small{display:block}.act-card li span,.act-card li small{color:var(--muted);font:9px var(--mono)}.truth-callout{border:1px solid var(--madder);border-left-width:5px;padding:16px;background:rgba(142,59,46,.12)}.truth-callout strong{font-size:21px}.truth-callout p{margin-bottom:0;color:var(--muted)}.table-wrap{overflow:auto;margin-top:16px;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;min-width:560px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}th{color:var(--beacon);font:9px var(--mono);text-transform:uppercase}td{font-size:13px}td span{display:block;color:var(--muted);font:8px var(--mono)}footer{padding-top:40px;color:var(--muted);font:10px/1.6 var(--mono);overflow-wrap:anywhere}@media(min-width:620px){.metrics{grid-template-columns:repeat(4,1fr)}.card-grid{grid-template-columns:1fr 1fr}.asset-grid{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main><header class="hero"><p class="eyebrow">Settlement-drop approval docket · ${esc(docket.target.room_code)}</p><h1>The record waits for judgment</h1><p>This surface assembles source-bound evidence. It cannot approve a name, rewrite a quote, assign an image, author a ceremony, or mint a settlement receipt.</p><nav class="summary-strip" aria-label="Review lanes">${laneLinks}</nav></header><aside class="audit"><p class="eyebrow">Current blockers · ${docket.blockers.length}</p><ol>${blockers}</ol></aside>${renderPlayers(docket, packets.player_identity)}${renderAssets(docket, packets.asset_semantics, input.asset_data_urls)}${renderQuotes(docket, packets.quote_markup)}${renderStructure(docket, packets.presentation_structure)}${renderReceipt(docket, packets.receipt_prerequisites)}<footer>Docket ${esc(sha256Hex(input.docket_raw))}<br>Audit ${esc(docket.audit.sha256)}<br>Generated from sealed local artifacts. Canonical decisions remain in the files named above.</footer></main></body></html>`
}

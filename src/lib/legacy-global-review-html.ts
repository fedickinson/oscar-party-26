import type {
  LegacyGlobalReviewCollection,
  LegacyGlobalReviewPacket,
} from './legacy-global-review'
import {
  serializeLegacyGlobalReviewDecisionTemplate,
  serializeLegacyGlobalReviewPacket,
} from './legacy-global-review'
import type {
  ShowPackClaim,
  ShowPackCommentaryRequest,
  ShowPackCommentaryVoice,
  ShowPackSource,
} from './show-pack'
import { sha256Hex } from './sha256'

export interface LegacyGlobalReviewHtmlInput {
  packet: LegacyGlobalReviewPacket
  packet_markdown: string
  packet_markdown_sha256: string
  decision_template_raw: string
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function section(
  packet: LegacyGlobalReviewPacket,
  collection: LegacyGlobalReviewCollection,
): LegacyGlobalReviewPacket['collections'][number] {
  const value = packet.collections.find((candidate) => candidate.collection === collection)
  if (!value) throw new Error(`global review packet is missing ${collection}`)
  return value
}

function seal(sectionValue: LegacyGlobalReviewPacket['collections'][number]): string {
  const dependencies = sectionValue.dependencies.length === 0
    ? '<span class="dependency">No upstream collection</span>'
    : sectionValue.dependencies.map((dependency) => (
      `<span class="dependency">${esc(dependency.collection)} · ${esc(dependency.sha256.slice(0, 12))}</span>`
    )).join('')
  const checks = sectionValue.review_checks.map((check) => `<li>${esc(check)}</li>`).join('')
  return `<div class="seal"><p class="seal-state">Canonical review · ${esc(sectionValue.current_review)}</p><code>${esc(sectionValue.sha256)}</code><div class="dependencies">${dependencies}</div><details><summary>Review checklist</summary><ol>${checks}</ol></details></div>`
}

function renderSources(packet: LegacyGlobalReviewPacket): string {
  const value = section(packet, 'sources')
  const claims = section(packet, 'claims').entries as ShowPackClaim[]
  const cards = (value.entries as ShowPackSource[]).map((source) => {
    const claimCount = claims.filter((claim) => claim.source_ids.includes(source.id)).length
    return `<article class="card source-card"><p class="eyebrow">${esc(source.kind)} · ${claimCount} claim${claimCount === 1 ? '' : 's'}</p><h3>${esc(source.title)}</h3><code>${esc(source.id)}</code><p class="locator">${esc(source.locator)}</p></article>`
  }).join('')
  return `<section id="sources"><header><p class="eyebrow">Rung 1 · source register</p><h2>What may warrant a claim</h2><p>Titles and locators identify evidence. They do not enlarge what that evidence proves.</p></header>${seal(value)}<div class="grid">${cards}</div></section>`
}

function renderClaims(packet: LegacyGlobalReviewPacket): string {
  const value = section(packet, 'claims')
  const sources = new Map((section(packet, 'sources').entries as ShowPackSource[])
    .map((source) => [source.id, source]))
  const claims = value.entries as ShowPackClaim[]
  const canons = ['screen', 'discourse', 'source_material', 'authoring'] as const
  const groups = canons.map((canon) => {
    const rows = claims.filter((claim) => claim.canon === canon)
    if (rows.length === 0) return ''
    const cards = rows.map((claim) => {
      const sourceChips = claim.source_ids.map((sourceId) => {
        const source = sources.get(sourceId)
        return `<span class="chip">${esc(sourceId)}${source ? ` · ${esc(source.kind)}` : ''}</span>`
      }).join('')
      return `<article class="card claim-card"><p class="eyebrow">${esc(claim.status)}</p><h3>${esc(claim.id)}</h3><p class="claim-text">${esc(claim.text)}</p><div class="chips">${sourceChips}</div></article>`
    }).join('')
    return `<div class="canon-group"><div class="canon-heading"><h3>${esc(canon.replace('_', ' '))}</h3><span>${rows.length}</span></div><div class="stack">${cards}</div></div>`
  }).join('')
  return `<section id="claims"><header><p class="eyebrow">Rung 2 · two-canons ledger</p><h2>What each source is allowed to say</h2><p>Screen, discourse, source-material and authoring claims stay in separate worlds.</p></header>${seal(value)}${groups}</section>`
}

function renderVoices(packet: LegacyGlobalReviewPacket): string {
  const value = section(packet, 'commentary_voices')
  const claims = new Map((section(packet, 'claims').entries as ShowPackClaim[])
    .map((claim) => [claim.id, claim]))
  const cards = (value.entries as ShowPackCommentaryVoice[]).map((voice) => {
    const attitudes = voice.attitude_claim_ids.length === 0
      ? '<p class="quiet">No source-material attitude claims.</p>'
      : voice.attitude_claim_ids.map((claimId) => {
        const claim = claims.get(claimId)
        return `<div class="attitude"><code>${esc(claimId)}</code><p>${esc(claim?.text ?? 'Missing claim')}</p></div>`
      }).join('')
    return `<article class="card voice-card"><p class="eyebrow">${esc(voice.id)}</p><h3>${esc(voice.name)}</h3><blockquote>${esc(voice.instruction)}</blockquote><p class="mini-label">Attitude only</p>${attitudes}</article>`
  }).join('')
  return `<section id="commentary-voices"><header><p class="eyebrow">Rung 3 · expression boundary</p><h2>How the cast may speak</h2><p>A voice controls expression. It cannot smuggle an event into the fact block.</p></header>${seal(value)}<div class="grid">${cards}</div></section>`
}

function renderDeferredRequests(packet: LegacyGlobalReviewPacket): string {
  const value = section(packet, 'commentary_requests')
  const requests = value.entries as ShowPackCommentaryRequest[]
  const statusCounts = requests.reduce<Record<string, number>>((counts, request) => {
    counts[request.publication.status] = (counts[request.publication.status] ?? 0) + 1
    return counts
  }, {})
  const blockers = value.review_blockers.map((blocker) => `<li>${esc(blocker)}</li>`).join('')
  const rows = requests.map((request) => `<article class="request-row"><div><p class="eyebrow">${esc(request.publication.status)} · ${esc(request.speaker)}</p><h3>${esc(request.id)}</h3></div><p>${esc(request.angle)}</p><div class="chips">${request.fact_claim_ids.map((id) => `<span class="chip fact">fact · ${esc(id)}</span>`).join('')}${request.angle_claim_ids.map((id) => `<span class="chip angle">angle · ${esc(id)}</span>`).join('')}</div></article>`).join('')
  return `<section id="deferred"><header><p class="eyebrow">Deferred rung · grounded publication</p><h2>Requests stay deferred</h2><p>Authored context is visible now. The collection cannot be reviewed until every line has passed grounded generation and refutation.</p></header>${seal(value)}<div class="blocker"><strong>${requests.length} requests · ${statusCounts.pending ?? 0} pending · ${statusCounts.blocked ?? 0} blocked · ${statusCounts.ready ?? 0} ready</strong><ul>${blockers}</ul></div><div class="stack">${rows}</div></section>`
}

export function assertLegacyGlobalReviewArtifacts(input: LegacyGlobalReviewHtmlInput): void {
  const packet = input.packet
  if (packet.packet_version !== 3 || packet.artifact !== 'legacy-global-review-packet') {
    throw new Error('global review packet identity is invalid')
  }
  if (input.packet_markdown !== serializeLegacyGlobalReviewPacket(packet)
    || sha256Hex(input.packet_markdown) !== input.packet_markdown_sha256) {
    throw new Error('global review Markdown does not match the packet')
  }
  if (packet.decision_template_sha256 === null
    || sha256Hex(input.decision_template_raw) !== packet.decision_template_sha256) {
    throw new Error('decision template does not match the packet hash')
  }
  let parsed: unknown
  try { parsed = JSON.parse(input.decision_template_raw) } catch {
    throw new Error('decision template is not valid JSON')
  }
  if (canonical(parsed) !== canonical(packet.decision_template)) {
    throw new Error('decision template approvals do not match the packet')
  }
  if (input.decision_template_raw !== serializeLegacyGlobalReviewDecisionTemplate(packet)) {
    throw new Error('decision template bytes do not match the packet')
  }
  const collections = packet.collections.map((value) => value.collection)
  if (collections.length !== 4 || new Set(collections).size !== 4
    || !['sources', 'claims', 'commentary_voices', 'commentary_requests'].every((value) => collections.includes(value as LegacyGlobalReviewCollection))) {
    throw new Error('global review packet collection coverage is invalid')
  }
  const deferred = section(packet, 'commentary_requests')
  if (deferred.review_blockers.length > 0
    && packet.decision_template.approvals.some((approval) => approval.collection === 'commentary_requests')) {
    throw new Error('commentary requests must remain deferred while publication blockers exist')
  }
}

export function renderLegacyGlobalReviewHtml(input: LegacyGlobalReviewHtmlInput): string {
  assertLegacyGlobalReviewArtifacts(input)
  const packet = input.packet
  const sourceCount = section(packet, 'sources').entries.length
  const claimCount = section(packet, 'claims').entries.length
  const voiceCount = section(packet, 'commentary_voices').entries.length
  const requestCount = section(packet, 'commentary_requests').entries.length
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>${esc(packet.target.pack_id)} global review</title><style>
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--madder-light:#c0614c;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html{background:var(--jet);color:var(--vellum);scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 50% 0,rgba(185,134,63,.11),transparent 30rem),var(--jet);font-family:var(--serif)}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 34px) 18px calc(env(safe-area-inset-bottom) + 60px)}.hero{padding:11vh 0 42px}.eyebrow,.mini-label{margin:0 0 8px;color:var(--beacon);font:700 10px/1.4 var(--mono);letter-spacing:.13em;text-transform:uppercase;overflow-wrap:anywhere}h1,h2,h3,p,code{overflow-wrap:anywhere}h1{font-size:clamp(46px,14vw,74px);font-weight:500;line-height:.95;margin:0 0 18px}h2{font-size:clamp(36px,10vw,54px);font-weight:500;line-height:1;margin:0 0 12px}h3{font-size:20px;margin:0 0 9px}p{line-height:1.5}.hero>p,section>header>p{color:var(--muted);font-size:17px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:24px 0}.metric{background:var(--iron);border:1px solid var(--line);padding:12px}.metric strong{display:block;color:var(--beacon);font:700 24px var(--mono)}.metric span{color:var(--muted);font:9px var(--mono);text-transform:uppercase}.ladder{display:flex;gap:7px;overflow-x:auto;padding:4px 0 16px}.ladder a{min-height:44px;display:grid;place-items:center;white-space:nowrap;border:1px solid var(--line);padding:0 13px;color:inherit;text-decoration:none;font:700 9px var(--mono);text-transform:uppercase}section{padding:54px 0;border-top:1px solid var(--line)}.seal{margin:20px 0 22px;padding:13px 0;border-block:1px solid var(--beacon)}.seal-state{margin:0;color:var(--beacon);font:700 9px var(--mono);text-transform:uppercase}.seal>code{display:block;margin:6px 0;color:var(--muted);font:9px var(--mono)}.dependencies,.chips{display:flex;flex-wrap:wrap;gap:5px}.dependency,.chip{border:1px solid var(--line);padding:5px 7px;font:9px var(--mono)}details{margin-top:8px}summary{min-height:44px;display:flex;align-items:center;width:max-content;max-width:100%;cursor:pointer;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase}details ol{padding-left:22px;color:var(--muted)}details li{padding:4px 0}.grid,.stack{display:grid;gap:10px}.card,.request-row{background:var(--iron);border:1px solid var(--line);padding:15px}.card>code{display:block;color:var(--muted);font:9px var(--mono)}.locator{margin-bottom:0;color:var(--muted);font:11px/1.5 var(--mono)}.canon-group{margin-top:24px}.canon-heading{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);margin-bottom:10px}.canon-heading h3{text-transform:capitalize}.canon-heading span{color:var(--beacon);font:700 18px var(--mono)}.claim-text{font-size:16px}.voice-card blockquote{margin:12px 0;padding-left:12px;border-left:3px solid var(--beacon);font-size:17px;line-height:1.45}.attitude{background:var(--jet);border:1px solid var(--line);padding:10px;margin-top:7px}.attitude code{font:9px var(--mono);color:var(--beacon)}.attitude p,.quiet{margin:5px 0 0;color:var(--muted);font-size:13px}.blocker{border:1px solid var(--madder);border-left-width:5px;background:rgba(142,59,46,.12);padding:16px;margin:20px 0}.blocker strong{font-size:18px}.blocker ul{padding-left:20px;color:var(--muted)}.request-row>p{color:var(--muted)}.chip.fact{border-color:var(--beacon)}.chip.angle{border-color:var(--madder)}footer{padding-top:38px;color:var(--muted);font:9px/1.7 var(--mono);overflow-wrap:anywhere}@media(min-width:620px){.metrics{grid-template-columns:repeat(4,1fr)}.grid{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main><header class="hero"><p class="eyebrow">Show-pack factory · global review</p><h1>Review the warrant before the voice</h1><p>This surface assembles sealed evidence in dependency order. It grants no approval and cannot write a review note.</p><div class="metrics"><div class="metric"><strong>${sourceCount}</strong><span>sources</span></div><div class="metric"><strong>${claimCount}</strong><span>claims</span></div><div class="metric"><strong>${voiceCount}</strong><span>voices</span></div><div class="metric"><strong>${requestCount}</strong><span>deferred requests</span></div></div><nav class="ladder" aria-label="Review ladder"><a href="#sources">Sources</a><a href="#claims">Claims</a><a href="#commentary-voices">Voices</a><a href="#deferred">Deferred</a></nav></header>${renderSources(packet)}${renderClaims(packet)}${renderVoices(packet)}${renderDeferredRequests(packet)}<footer>Target ${esc(packet.target.pack_id)}@${packet.target.pack_version}<br>Legacy worksheet ${esc(packet.legacy_worksheet_sha256)}<br>Authoring worksheet ${esc(packet.authoring_worksheet_sha256)}<br>Markdown packet ${esc(input.packet_markdown_sha256)}<br>Decision template ${esc(packet.decision_template_sha256)}</footer></main></body></html>`
}

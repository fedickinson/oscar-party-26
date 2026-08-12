import {
  LEGACY_GLOBAL_REVIEW_COLLECTIONS,
  type LegacyGlobalReviewCollection,
  type LegacyGlobalReviewDecisionManifest,
  type LegacyGlobalReviewPacket,
} from './legacy-global-review'
import {
  assertLegacyGlobalReviewArtifacts,
  type LegacyGlobalReviewHtmlInput,
} from './legacy-global-review-html'

export interface LegacyGlobalReviewAttestation {
  collection: LegacyGlobalReviewCollection
  note: string
  acknowledged_checks: string[]
}

export interface LegacyGlobalReviewAttestationManifest {
  manifest_version: 1
  artifact: 'legacy-global-review-attestations'
  target: { pack_id: string; pack_version: number }
  packet_markdown_sha256: string
  decision_template_sha256: string
  attestations: LegacyGlobalReviewAttestation[]
}

function exactKeys(value: object, expected: string[], labelValue: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${labelValue} fields are invalid`)
  }
}

function section(
  packet: LegacyGlobalReviewPacket,
  collection: LegacyGlobalReviewCollection,
): LegacyGlobalReviewPacket['collections'][number] {
  const value = packet.collections.find((candidate) => candidate.collection === collection)
  if (!value) throw new Error(`global review packet is missing ${collection}`)
  return value
}

function exactAcknowledgements(expected: string[], actual: string[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((check) => actual.includes(check))
}

function buildLegacyGlobalReviewDecisionDraft(
  packet: LegacyGlobalReviewPacket,
  attestations: LegacyGlobalReviewAttestation[],
): LegacyGlobalReviewDecisionManifest {
  if (packet.packet_version !== 3 || packet.artifact !== 'legacy-global-review-packet') {
    throw new Error('global review packet identity is invalid')
  }
  if (!Array.isArray(attestations) || attestations.length === 0) {
    throw new Error('at least one explicit global review attestation is required')
  }
  const duplicate = attestations.find((attestation, index) => (
    attestations.findIndex((candidate) => candidate.collection === attestation.collection) !== index
  ))
  if (duplicate) throw new Error(`${duplicate.collection} review attestation is duplicated`)

  const attestationByCollection = new Map(attestations.map((value) => [value.collection, value]))
  const approvals: LegacyGlobalReviewDecisionManifest['approvals'] = []
  for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    const attestation = attestationByCollection.get(collection)
    if (!attestation) continue
    const packetSection = section(packet, collection)
    const templateApproval = packet.decision_template.approvals.find((approval) => (
      approval.collection === collection
    ))
    if (!templateApproval || packetSection.current_review !== 'open'
      || packetSection.review_blockers.length > 0) {
      throw new Error(`${collection} is not open and unblocked in this review packet`)
    }
    if (templateApproval.expected_sha256 !== packetSection.sha256) {
      throw new Error(`${collection} decision-template hash does not match its review section`)
    }
    for (const dependency of packetSection.dependencies) {
      const dependencySection = section(packet, dependency.collection)
      if (dependencySection.sha256 !== dependency.sha256) {
        throw new Error(`${collection} dependency hash for ${dependency.collection} is stale`)
      }
      if (dependencySection.current_review === 'current') continue
      if (!attestationByCollection.has(dependency.collection)) {
        throw new Error(`${collection} review requires ${dependency.collection} in the same decision draft`)
      }
    }
    if (!Array.isArray(attestation.acknowledged_checks)
      || !exactAcknowledgements(packetSection.review_checks, attestation.acknowledged_checks)) {
      throw new Error(`${collection} review checklist is incomplete`)
    }
    if (typeof attestation.note !== 'string' || attestation.note.trim() === '') {
      throw new Error(`${collection} review note must be text`)
    }
    approvals.push({
      collection,
      expected_sha256: packetSection.sha256,
      note: attestation.note.trim(),
    })
  }
  if (approvals.length !== attestations.length) {
    throw new Error('global review attestation collection is invalid')
  }
  return {
    manifest_version: 1,
    artifact: 'legacy-global-review-decisions',
    target: { ...packet.target },
    legacy_worksheet_sha256: packet.legacy_worksheet_sha256,
    approvals,
  }
}

export function buildLegacyGlobalReviewDecisionDraftFromAttestations(
  input: LegacyGlobalReviewHtmlInput,
  value: unknown,
): LegacyGlobalReviewDecisionManifest {
  assertLegacyGlobalReviewArtifacts(input)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('global review attestation transcript must be an object')
  }
  const manifest = value as Record<string, unknown>
  exactKeys(manifest, [
    'manifest_version', 'artifact', 'target', 'packet_markdown_sha256',
    'decision_template_sha256', 'attestations',
  ], 'global review attestation transcript')
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-global-review-attestations') {
    throw new Error('global review attestation transcript identity is invalid')
  }
  if (manifest.target === null || typeof manifest.target !== 'object'
    || Array.isArray(manifest.target)) {
    throw new Error('global review attestation target must be an object')
  }
  exactKeys(manifest.target, ['pack_id', 'pack_version'], 'global review attestation target')
  const target = manifest.target as Record<string, unknown>
  if (target.pack_id !== input.packet.target.pack_id
    || target.pack_version !== input.packet.target.pack_version) {
    throw new Error('global review attestation target does not match the packet')
  }
  if (manifest.packet_markdown_sha256 !== input.packet_markdown_sha256) {
    throw new Error('global review attestation packet hash does not match')
  }
  if (manifest.decision_template_sha256 !== input.packet.decision_template_sha256) {
    throw new Error('global review attestation decision-template hash does not match')
  }
  if (!Array.isArray(manifest.attestations)) {
    throw new Error('global review attestations must be an array')
  }
  const attestations = manifest.attestations.map((candidate, index) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`global review attestation ${index + 1} must be an object`)
    }
    exactKeys(candidate, [
      'collection', 'note', 'acknowledged_checks',
    ], `global review attestation ${index + 1}`)
    const record = candidate as Record<string, unknown>
    if (!LEGACY_GLOBAL_REVIEW_COLLECTIONS.includes(record.collection as LegacyGlobalReviewCollection)) {
      throw new Error(`global review attestation ${index + 1} collection is invalid`)
    }
    if (!Array.isArray(record.acknowledged_checks)
      || record.acknowledged_checks.some((check) => typeof check !== 'string')) {
      throw new Error(`global review attestation ${index + 1} checks are invalid`)
    }
    return {
      collection: record.collection as LegacyGlobalReviewCollection,
      note: record.note as string,
      acknowledged_checks: record.acknowledged_checks as string[],
    }
  })
  return buildLegacyGlobalReviewDecisionDraft(input.packet, attestations)
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

function label(collection: LegacyGlobalReviewCollection): string {
  return collection.replace(/_/g, ' ')
}

export function renderLegacyGlobalReviewAttestationHtml(
  input: LegacyGlobalReviewHtmlInput,
): string {
  assertLegacyGlobalReviewArtifacts(input)
  const packet = input.packet
  const open = packet.decision_template.approvals.map((approval) => {
    const packetSection = section(packet, approval.collection)
    return {
      collection: approval.collection,
      sha256: packetSection.sha256,
      dependencies: packetSection.dependencies,
      review_checks: packetSection.review_checks,
      entry_count: packetSection.entries.length,
    }
  })
  const cards = open.map((value) => {
    const dependencies = value.dependencies.length === 0
      ? 'No upstream review'
      : value.dependencies.map((dependency) => `${label(dependency.collection)} · ${dependency.sha256.slice(0, 12)}`).join(' / ')
    const checks = value.review_checks.map((check, index) => (
      `<label class="check"><input type="checkbox" data-check="${esc(value.collection)}" value="${index}"><span>${esc(check)}</span></label>`
    )).join('')
    return `<section class="attestation" data-collection="${esc(value.collection)}"><header><p class="eyebrow">${value.entry_count} entries · ${esc(dependencies)}</p><h2>${esc(label(value.collection))} review attestation</h2><code>${esc(value.sha256)}</code></header><label class="include"><input type="checkbox" data-include="${esc(value.collection)}"><span>Include this collection in the attestation transcript</span></label><fieldset disabled><legend>Required review checklist</legend>${checks}<label class="note"><span>Specific human attestation</span><textarea data-note="${esc(value.collection)}" rows="5" placeholder="Name what you checked and the warrant boundary you confirmed."></textarea></label></fieldset><p class="state" data-state="${esc(value.collection)}">Not included</p></section>`
  }).join('')
  const deferred = packet.deferred_collections.map((value) => (
    `<li><strong>${esc(label(value.collection))} remain deferred</strong><span>${esc(value.blockers.join('; '))}</span></li>`
  )).join('')
  const browserPacket = {
    target: packet.target,
    legacy_worksheet_sha256: packet.legacy_worksheet_sha256,
    packet_markdown_sha256: input.packet_markdown_sha256,
    decision_template_sha256: packet.decision_template_sha256,
    open,
    current: packet.collections.filter((value) => value.current_review === 'current')
      .map((value) => value.collection),
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><title>${esc(packet.target.pack_id)} global review attestations</title><style>
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html{background:var(--jet);color:var(--vellum)}body{margin:0;background:radial-gradient(circle at 50% 0,rgba(185,134,63,.11),transparent 30rem),var(--jet);font-family:var(--serif)}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 38px) 18px calc(env(safe-area-inset-bottom) + 128px)}.hero{padding:8vh 0 38px}.eyebrow{margin:0 0 8px;color:var(--beacon);font:700 10px/1.4 var(--mono);letter-spacing:.13em;text-transform:uppercase;overflow-wrap:anywhere}h1,h2,p,code,span{overflow-wrap:anywhere}h1{font-size:clamp(44px,13vw,70px);font-weight:500;line-height:.96;margin:0 0 18px}h2{font-size:clamp(30px,9vw,46px);font-weight:500;line-height:1;margin:0 0 10px}.hero>p{color:var(--muted);font-size:17px;line-height:1.5}.boundary{border-left:5px solid var(--madder);background:rgba(142,59,46,.12);padding:15px;margin-top:22px}.boundary strong{display:block;font-size:18px}.boundary span{display:block;color:var(--muted);font-size:14px;line-height:1.5;margin-top:6px}.attestation{border-top:1px solid var(--line);padding:42px 0}.attestation header>code{display:block;color:var(--muted);font:9px/1.5 var(--mono)}.include,.check{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:start}.include{min-height:56px;align-items:center;border:1px solid var(--beacon);padding:10px;margin:18px 0}.include span{font-size:16px}.check{min-height:44px;padding:10px 0;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px;line-height:1.45}input[type=checkbox]{appearance:none;width:22px;height:22px;margin:0;border:1px solid var(--beacon);background:var(--jet);display:grid;place-items:center}input[type=checkbox]:checked:after{content:'';width:10px;height:6px;border-left:2px solid var(--vellum);border-bottom:2px solid var(--vellum);transform:rotate(-45deg) translate(1px,-1px)}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--beacon);outline-offset:3px}fieldset{border:0;padding:0;margin:0}fieldset:disabled{opacity:.38}legend{padding:0 0 6px;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase}.note{display:block;margin-top:18px}.note>span{display:block;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase;margin-bottom:7px}textarea{width:100%;min-height:112px;resize:vertical;border:1px solid var(--line);border-radius:0;background:var(--iron);color:var(--vellum);padding:12px;font:16px/1.45 var(--serif)}.state{min-height:22px;margin:9px 0 0;color:var(--muted);font:10px/1.5 var(--mono)}.state.ready{color:var(--beacon)}.deferred{border-top:1px solid var(--line);padding:38px 0}.deferred h2{font-size:30px}.deferred ul{list-style:none;padding:0}.deferred li{border-left:5px solid var(--madder);background:rgba(142,59,46,.12);padding:14px}.deferred li span{display:block;color:var(--muted);font-size:14px;margin-top:5px}.export{position:fixed;z-index:3;left:0;right:0;bottom:0;padding:12px 18px calc(env(safe-area-inset-bottom) + 12px);background:rgba(12,12,16,.96);border-top:1px solid var(--line)}.export-inner{width:min(100%,724px);margin:auto;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.export p{margin:0;color:var(--muted);font:10px/1.4 var(--mono)}button{min-height:48px;border:1px solid var(--beacon);background:var(--beacon);color:var(--jet);padding:0 14px;font:700 10px var(--mono);text-transform:uppercase}button:disabled{background:var(--iron);border-color:var(--line);color:var(--muted)}footer{padding-top:24px;color:var(--muted);font:9px/1.7 var(--mono);overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><main><header class="hero"><p class="eyebrow">Show-pack factory · human authority</p><h1>Attest only what you reviewed</h1><p>Keep the sealed evidence doorway open beside this desk. Include a collection only after reading every entry and completing its published checklist.</p><div class="boundary"><strong>This desk records a local attestation transcript. It does not create or apply a decision.</strong><span>No database, model, network or authoring worksheet is reachable from this file. The local decision builder and existing validator remain the application boundary.</span></div></header>${cards}${deferred ? `<section class="deferred"><p class="eyebrow">Outside present authority</p><h2>Deferred collections</h2><ul>${deferred}</ul></section>` : ''}<footer>Target ${esc(packet.target.pack_id)}@${packet.target.pack_version}<br>Legacy worksheet ${esc(packet.legacy_worksheet_sha256)}<br>Authoring worksheet ${esc(packet.authoring_worksheet_sha256)}<br>Markdown packet ${esc(input.packet_markdown_sha256)}<br>Decision template ${esc(packet.decision_template_sha256)}</footer></main><div class="export"><div class="export-inner"><p id="draft-state" role="status">Select a collection to begin.</p><button id="download" type="button" disabled>Download attestations</button></div></div><script>
(function(){'use strict';var packet=${safeJson(browserPacket)};var order=['sources','claims','commentary_voices','commentary_requests'];var button=document.getElementById('download');var draftState=document.getElementById('draft-state');function selected(name){var input=document.querySelector('[data-include="'+name+'"]');return !!input&&input.checked}function section(name){for(var i=0;i<packet.open.length;i+=1){if(packet.open[i].collection===name)return packet.open[i]}return null}function isCurrent(name){return packet.current.indexOf(name)!==-1}function read(){var attestations=[];var error='';for(var i=0;i<order.length;i+=1){var name=order[i];var value=section(name);if(!value||!selected(name))continue;for(var d=0;d<value.dependencies.length;d+=1){var dependency=value.dependencies[d].collection;if(!isCurrent(dependency)&&!selected(dependency)){error=name.replace(/_/g,' ')+' requires '+dependency.replace(/_/g,' ')+' in this transcript';break}}var checks=[].slice.call(document.querySelectorAll('[data-check="'+name+'"]'));if(!error&&checks.some(function(check){return !check.checked}))error=name.replace(/_/g,' ')+' checklist is incomplete';var note=document.querySelector('[data-note="'+name+'"]').value.trim();if(!error&&!note)error=name.replace(/_/g,' ')+' needs a specific attestation';attestations.push({collection:name,note:note,acknowledged_checks:checks.filter(function(check){return check.checked}).map(function(check){return value.review_checks[Number(check.value)]})})}return {error:error,manifest:{manifest_version:1,artifact:'legacy-global-review-attestations',target:packet.target,packet_markdown_sha256:packet.packet_markdown_sha256,decision_template_sha256:packet.decision_template_sha256,attestations:attestations}}}function update(){var included=0;for(var i=0;i<packet.open.length;i+=1){var name=packet.open[i].collection;var active=selected(name);var card=document.querySelector('[data-collection="'+name+'"]');card.querySelector('fieldset').disabled=!active;var state=card.querySelector('[data-state="'+name+'"]');if(active)included+=1;var checks=[].slice.call(card.querySelectorAll('[data-check]'));var checked=checks.filter(function(check){return check.checked}).length;var note=card.querySelector('[data-note]').value.trim();state.textContent=active?(checked+'/'+checks.length+' checks · '+(note?'note written':'note required')):'Not included';state.className='state'+(active&&checked===checks.length&&note?' ready':'')}var value=read();button.disabled=included===0||!!value.error;draftState.textContent=included===0?'Select a collection to begin.':value.error||included+' collection'+(included===1?'':'s')+' ready to record.'}document.addEventListener('change',update);document.addEventListener('input',update);button.addEventListener('click',function(){var value=read();if(value.error||value.manifest.attestations.length===0)return;var bytes=JSON.stringify(value.manifest,null,2)+'\\n';var blob=new Blob([bytes],{type:'application/json'});var href=URL.createObjectURL(blob);var link=document.createElement('a');link.href=href;link.download=packet.target.pack_id+'-global-review-attestations.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(href)},0);draftState.textContent='Attestation transcript downloaded. Build and validate its decision separately.'});update()})();
</script></body></html>`
}

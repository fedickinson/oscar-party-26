import {
  assertShowPackCommentaryAuthorizationCurrent,
  buildShowPackCommentaryBudget,
  serializeShowPackCommentaryPlan,
  type ShowPackCommentaryAuthorization,
  type ShowPackCommentaryBudget,
  type ShowPackCommentaryPlan,
} from './show-pack-commentary'
import { buildGroundedLinePromptContract } from './grounded-line-contract'
import { sha256Hex } from './sha256'

const SHA256 = /^[a-f0-9]{64}$/

export interface ShowPackCommentaryAuthorizationTranscript {
  transcript_version: 1
  artifact: 'show-pack-commentary-authorization-transcript'
  target: { pack_id: string; pack_version: number }
  plan_sha256: string
  acknowledged_request_ids: string[]
  acknowledged_budget: ShowPackCommentaryBudget
  note: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function parsePlan(raw: string): ShowPackCommentaryPlan {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`commentary plan is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value)) throw new Error('commentary plan must be an object')
  exactKeys(value, [
    'plan_version', 'artifact', 'target', 'source_sha256', 'retry_blocked',
    'selected_request_ids', 'budget', 'jobs',
  ], 'commentary plan')
  if (value.plan_version !== 5 || value.artifact !== 'show-pack-commentary-plan') {
    throw new Error('commentary plan identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('commentary plan target must be an object')
  exactKeys(value.target, ['pack_id', 'pack_version'], 'commentary plan target')
  if (typeof value.target.pack_id !== 'string' || value.target.pack_id.trim() === ''
    || !Number.isInteger(value.target.pack_version) || Number(value.target.pack_version) < 1) {
    throw new Error('commentary plan target is invalid')
  }
  if (typeof value.source_sha256 !== 'string' || !SHA256.test(value.source_sha256)) {
    throw new Error('commentary plan source SHA-256 is invalid')
  }
  if (typeof value.retry_blocked !== 'boolean') {
    throw new Error('commentary plan retry flag is invalid')
  }
  if (!Array.isArray(value.jobs)) throw new Error('commentary plan jobs must be an array')
  const jobs = value.jobs.map((job, index) => {
    if (!isRecord(job)) throw new Error(`commentary plan job ${index + 1} must be an object`)
    exactKeys(job, [
      'request_id', 'publication_status', 'speaker', 'voice', 'facts', 'angle',
      'prompt_contract',
    ], `commentary plan job ${index + 1}`)
    if (typeof job.request_id !== 'string' || job.request_id.trim() === '') {
      throw new Error(`commentary plan job ${index + 1} request id is invalid`)
    }
    if (job.publication_status !== 'pending' && job.publication_status !== 'blocked') {
      throw new Error(`commentary plan job ${index + 1} publication status is invalid`)
    }
    if (typeof job.speaker !== 'string' || job.speaker.trim() === ''
      || typeof job.voice !== 'string' || job.voice.trim() === ''
      || typeof job.angle !== 'string' || job.angle.trim() === '') {
      throw new Error(`commentary plan job ${index + 1} prompt blocks are invalid`)
    }
    if (!Array.isArray(job.facts) || job.facts.length === 0
      || job.facts.some((fact) => typeof fact !== 'string' || fact.trim() === '')) {
      throw new Error(`commentary plan job ${index + 1} facts are invalid`)
    }
    if (!isRecord(job.prompt_contract)) {
      throw new Error(`commentary plan job ${index + 1} prompt contract is invalid`)
    }
    const expectedContract = buildGroundedLinePromptContract({
      speaker: job.speaker,
      voice: job.voice,
      facts: job.facts,
      angle: job.angle,
    })
    if (canonical(job.prompt_contract) !== canonical(expectedContract)) {
      throw new Error(`commentary plan job ${index + 1} prompt contract is not canonical`)
    }
    return job as unknown as ShowPackCommentaryPlan['jobs'][number]
  })
  const requestIds = jobs.map((job) => job.request_id)
  if (new Set(requestIds).size !== requestIds.length) {
    throw new Error('commentary plan jobs must not contain duplicate request ids')
  }
  if (value.selected_request_ids !== null) {
    if (!Array.isArray(value.selected_request_ids)
      || value.selected_request_ids.some((id) => typeof id !== 'string')
      || !equalStrings(value.selected_request_ids, requestIds)) {
      throw new Error('commentary plan request selection does not match its jobs')
    }
  }
  if (!isRecord(value.budget)
    || canonical(value.budget) !== canonical(buildShowPackCommentaryBudget(jobs))) {
    throw new Error('commentary plan budget is not canonical')
  }
  if (serializeShowPackCommentaryPlan(value as unknown as ShowPackCommentaryPlan) !== raw) {
    throw new Error('commentary plan bytes are not canonical')
  }
  return value as unknown as ShowPackCommentaryPlan
}

function parseTranscript(value: unknown): ShowPackCommentaryAuthorizationTranscript {
  if (!isRecord(value)) throw new Error('commentary authorization transcript must be an object')
  exactKeys(value, [
    'transcript_version', 'artifact', 'target', 'plan_sha256',
    'acknowledged_request_ids', 'acknowledged_budget', 'note',
  ], 'commentary authorization transcript')
  if (value.transcript_version !== 1
    || value.artifact !== 'show-pack-commentary-authorization-transcript') {
    throw new Error('commentary authorization transcript identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('commentary authorization target must be an object')
  exactKeys(value.target, ['pack_id', 'pack_version'], 'commentary authorization target')
  if (!Array.isArray(value.acknowledged_request_ids)
    || value.acknowledged_request_ids.some((id) => typeof id !== 'string')) {
    throw new Error('commentary authorization request acknowledgements are invalid')
  }
  if (!isRecord(value.acknowledged_budget)) {
    throw new Error('commentary authorization budget acknowledgement is invalid')
  }
  return value as unknown as ShowPackCommentaryAuthorizationTranscript
}

function equalStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function buildShowPackCommentaryAuthorization(
  planRaw: string,
  transcriptInput: unknown,
): ShowPackCommentaryAuthorization {
  const plan = parsePlan(planRaw)
  if (plan.jobs.length === 0) {
    throw new Error('commentary authorization requires at least one planned request')
  }
  const transcript = parseTranscript(transcriptInput)
  const planSha256 = sha256Hex(planRaw)
  if (transcript.target.pack_id !== plan.target.pack_id
    || transcript.target.pack_version !== plan.target.pack_version) {
    throw new Error('commentary authorization transcript target does not match the plan')
  }
  if (transcript.plan_sha256 !== planSha256) {
    throw new Error('authorization transcript plan hash does not match')
  }
  const plannedIds = plan.jobs.map((job) => job.request_id)
  if (!equalStrings(transcript.acknowledged_request_ids, plannedIds)) {
    throw new Error('authorization must acknowledge every planned request in source order')
  }
  if (canonical(transcript.acknowledged_budget) !== canonical(plan.budget)) {
    throw new Error('authorization transcript budget does not match the plan')
  }
  if (typeof transcript.note !== 'string' || transcript.note.trim() === '') {
    throw new Error('commentary authorization note must be text')
  }
  return {
    authorization_version: 1,
    artifact: 'show-pack-commentary-authorization',
    target: { ...plan.target },
    plan_sha256: planSha256,
    source_sha256: plan.source_sha256,
    authorized_request_ids: plannedIds,
    authorized_budget: structuredClone(plan.budget),
    note: transcript.note.trim(),
  }
}

export function serializeShowPackCommentaryAuthorization(
  authorization: ShowPackCommentaryAuthorization,
): string {
  return `${JSON.stringify(authorization, null, 2)}\n`
}

export { assertShowPackCommentaryAuthorizationCurrent }

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

function number(value: number): string {
  return value.toLocaleString('en-US')
}

export function renderShowPackCommentaryPlanReviewHtml(planRaw: string): string {
  const plan = parsePlan(planRaw)
  if (plan.jobs.length === 0) throw new Error('commentary plan has no work to review')
  const planSha256 = sha256Hex(planRaw)
  const jobs = plan.jobs.map((job, index) => {
    const facts = job.facts.map((fact, factIndex) => `<li><span>${factIndex + 1}</span>${esc(fact)}</li>`).join('')
    const transport = job.prompt_contract.transport
    const request = (title: string, value: typeof job.prompt_contract.initial_model_request) => (
      `<div class="request"><h3>${esc(title)}</h3><p class="request-meta">${esc(value.model)} · ${number(value.maxTokens)} output tokens</p><h4>System prompt</h4><pre>${esc(value.system)}</pre><h4>User prompt</h4><pre>${esc(value.user)}</pre></div>`
    )
    return `<section class="job" data-job="${esc(job.request_id)}"><header><p class="eyebrow">Request ${index + 1} of ${plan.jobs.length} · ${esc(job.publication_status)}</p><h2>${esc(job.request_id)}</h2><p class="speaker">${esc(job.speaker)}</p></header><details open><summary>Prompt blocks</summary><div class="block"><h3>Voice · expression only</h3><pre>${esc(job.voice)}</pre></div><div class="block"><h3>Facts · exhaustive</h3><ol>${facts}</ol></div><div class="block"><h3>Angle · expression only</h3><pre>${esc(job.angle)}</pre></div></details><details><summary>Exact execution contract</summary><dl><div><dt>Retries</dt><dd>${job.prompt_contract.max_retries}</dd></div><div><dt>Length hint</dt><dd>${esc(job.prompt_contract.length_hint)}</dd></div><div><dt>Transport</dt><dd>${esc(JSON.stringify(transport))}</dd></div></dl>${request('Initial generation request', job.prompt_contract.initial_model_request)}${request('Audit request template', job.prompt_contract.audit_model_request_template)}${request('Retry request template', job.prompt_contract.retry_model_request_template)}</details><label class="ack"><input type="checkbox" data-ack="${esc(job.request_id)}"><span>I reviewed this request's speaker, voice, facts, angle and exact execution contract.</span></label></section>`
  }).join('')
  const transcriptSeed = {
    transcript_version: 1,
    artifact: 'show-pack-commentary-authorization-transcript',
    target: plan.target,
    plan_sha256: planSha256,
    acknowledged_budget: plan.budget,
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><title>${esc(plan.target.pack_id)} commentary authorization</title><style>
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html{background:var(--jet);color:var(--vellum)}body{margin:0;background:radial-gradient(circle at 50% 0,rgba(185,134,63,.11),transparent 30rem),var(--jet);font-family:var(--serif)}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 38px) 18px calc(env(safe-area-inset-bottom) + 132px)}.hero{padding:8vh 0 38px}.eyebrow{margin:0 0 8px;color:var(--beacon);font:700 10px/1.4 var(--mono);letter-spacing:.13em;text-transform:uppercase;overflow-wrap:anywhere}h1,h2,h3,h4,p,pre,code,dd{overflow-wrap:anywhere}h1{font-size:clamp(44px,13vw,70px);font-weight:500;line-height:.96;margin:0 0 18px}h2{font-size:clamp(28px,8vw,42px);font-weight:500;line-height:1;margin:0 0 8px}.hero>p{color:var(--muted);font-size:17px;line-height:1.5}.boundary{border-left:5px solid var(--madder);background:rgba(142,59,46,.12);padding:15px;margin-top:22px}.boundary strong{display:block;font-size:18px}.boundary span{display:block;color:var(--muted);font-size:14px;line-height:1.5;margin-top:6px}.budget{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:28px 0}.budget article{background:var(--iron);border:1px solid var(--line);padding:13px}.budget strong{display:block;color:var(--beacon);font:700 18px/1.2 var(--mono)}.budget span{display:block;color:var(--muted);font:9px/1.4 var(--mono);text-transform:uppercase;margin-top:5px}.caveat{color:var(--muted);font-size:13px;line-height:1.5}.job{border-top:1px solid var(--line);padding:44px 0}.speaker{color:var(--beacon);font:700 11px var(--mono);text-transform:uppercase}.job details{border-block:1px solid var(--line);margin-top:12px}.job details+details{border-top:0;margin-top:0}.job summary{min-height:48px;display:flex;align-items:center;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase;cursor:pointer}.block,.request{background:var(--iron);border:1px solid var(--line);padding:13px;margin:0 0 10px}.block h3,.request h3{margin:0 0 8px;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase}.block pre{white-space:pre-wrap;margin:0;color:var(--vellum);font:14px/1.5 var(--serif)}.request h4{margin:12px 0 6px;color:var(--muted);font:700 9px var(--mono);text-transform:uppercase}.request pre{white-space:pre-wrap;margin:0;color:var(--vellum);font:11px/1.55 var(--mono)}.request-meta{color:var(--muted);font:10px/1.4 var(--mono)}ol{list-style:none;padding:0;margin:0}ol li{display:grid;grid-template-columns:24px 1fr;gap:8px;color:var(--vellum);font-size:14px;line-height:1.5;margin:8px 0}ol li span{color:var(--beacon);font:700 10px var(--mono)}dl{margin:0 0 12px}dl div{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}dt{color:var(--muted);font:10px var(--mono);text-transform:uppercase}dd{margin:0;font:11px/1.5 var(--mono)}.ack,.budget-ack{min-height:56px;display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:center;border:1px solid var(--beacon);padding:10px;margin-top:16px;font-size:15px;line-height:1.4}input[type=checkbox]{appearance:none;width:22px;height:22px;margin:0;border:1px solid var(--beacon);background:var(--jet);display:grid;place-items:center}input[type=checkbox]:checked:after{content:'';width:10px;height:6px;border-left:2px solid var(--vellum);border-bottom:2px solid var(--vellum);transform:rotate(-45deg) translate(1px,-1px)}input:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--beacon);outline-offset:3px}.attest{border-top:1px solid var(--line);padding:42px 0}.attest textarea{width:100%;min-height:120px;resize:vertical;border:1px solid var(--line);background:var(--iron);color:var(--vellum);padding:12px;font:16px/1.5 var(--serif)}.attest label>span{display:block;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase;margin:14px 0 7px}.export{position:fixed;z-index:3;left:0;right:0;bottom:0;padding:12px 18px calc(env(safe-area-inset-bottom) + 12px);background:rgba(12,12,16,.96);border-top:1px solid var(--line)}.export-inner{width:min(100%,724px);margin:auto;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.export p{margin:0;color:var(--muted);font:10px/1.4 var(--mono)}button{min-height:48px;border:1px solid var(--beacon);background:var(--beacon);color:var(--jet);padding:0 13px;font:700 10px var(--mono);text-transform:uppercase}button:disabled{background:var(--iron);border-color:var(--line);color:var(--muted)}footer{padding-top:28px;color:var(--muted);font:9px/1.7 var(--mono);overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><main><header class="hero"><p class="eyebrow">Show-pack factory · model authority</p><h1>Review the spend before the voice</h1><p>This is the exact grounded-generation plan. Review every prompt block and the complete bounded spend envelope before recording authorization.</p><div class="boundary"><strong>This desk records review. It never calls a model.</strong><span>The downloaded transcript must pass the local authorization builder. Generation separately requires both the unchanged plan and its authorization.</span></div><div class="budget"><article><strong>${plan.budget.first_pass.total_calls_min}–${plan.budget.first_pass.total_calls_max} calls</strong><span>First pass · ${number(plan.budget.first_pass.max_output_tokens)} output-token ceiling</span></article><article><strong>${plan.budget.worst_case.total_calls_min}–${plan.budget.worst_case.total_calls_max} calls</strong><span>Worst case · ${number(plan.budget.worst_case.max_output_tokens)} output-token ceiling</span></article></div><p class="caveat">${esc(plan.budget.caveat)} Input-token and currency estimates are unavailable.</p></header>${jobs}<section class="attest"><p class="eyebrow">Final human boundary</p><h2>Authorization attestation</h2><label class="budget-ack"><input id="budget-ack" type="checkbox"><span>I reviewed the first-pass and worst-case call and output-token ceilings, including the missing input-token and currency estimates.</span></label><label><span>Specific authorization note</span><textarea id="note" rows="5" placeholder="Name the jobs, prompt boundaries and spend envelope you authorize."></textarea></label></section><footer>Target ${esc(plan.target.pack_id)}@${plan.target.pack_version}<br>Source ${esc(plan.source_sha256)}<br>Plan ${planSha256}</footer></main><div class="export"><div class="export-inner"><p id="state" role="status">Review every request to continue.</p><button id="download" type="button" disabled>Download authorization transcript</button></div></div><script>
(function(){'use strict';var seed=${safeJson(transcriptSeed)};var ids=${safeJson(plan.jobs.map((job) => job.request_id))};var button=document.getElementById('download');var state=document.getElementById('state');function read(){var acknowledged=ids.filter(function(id){var input=document.querySelector('[data-ack="'+id+'"]');return input&&input.checked});var budget=document.getElementById('budget-ack').checked;var note=document.getElementById('note').value.trim();var error=acknowledged.length!==ids.length?'Review every request to continue.':!budget?'Acknowledge the spend envelope.':!note?'Write a specific authorization note.':'';return {error:error,transcript:{transcript_version:seed.transcript_version,artifact:seed.artifact,target:seed.target,plan_sha256:seed.plan_sha256,acknowledged_request_ids:acknowledged,acknowledged_budget:seed.acknowledged_budget,note:note}}}function update(){var value=read();button.disabled=!!value.error;state.textContent=value.error||ids.length+' requests ready to authorize.'}document.addEventListener('change',update);document.addEventListener('input',update);button.addEventListener('click',function(){var value=read();if(value.error)return;var bytes=JSON.stringify(value.transcript,null,2)+'\\n';var blob=new Blob([bytes],{type:'application/json'});var href=URL.createObjectURL(blob);var link=document.createElement('a');link.href=href;link.download=seed.target.pack_id+'-commentary-authorization-transcript.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(href)},0);state.textContent='Transcript downloaded. Build the authorization before generation.'});update()})();
</script></body></html>`
}

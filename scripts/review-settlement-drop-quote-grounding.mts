#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import {
  buildSettlementDropQuoteGroundingPacket,
  buildSettlementDropQuoteGroundingPlan,
  inspectSettlementDropQuoteGroundingDecisions,
  serializeSettlementDropQuoteGroundingDecisionTemplate,
  serializeSettlementDropQuoteGroundingPacket,
  serializeSettlementDropQuoteGroundingPlan,
} from '../src/lib/settlement-drop-quote-grounding'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  receipt: string
  ceremony: string
  beatlines: string
  takes: string
  legacyAssets: string
  extraction: string
  presentationStructure: string
  presentationDecisions: string
  assetSemantics: string
  assetDecisions: string
  quoteMarkup: string
  quoteMarkupDecisions: string
  receiptBinding: string
  receiptBindingDecisions: string
  decisions?: string
  packet?: string
  decisionTemplate?: string
  plan?: string
  force: boolean
}

const VALUE_OPTIONS = new Set([
  '--receipt', '--ceremony', '--beatlines', '--takes', '--legacy-assets', '--extraction',
  '--presentation-structure', '--presentation-decisions', '--asset-semantics',
  '--asset-decisions', '--quote-markup', '--quote-markup-decisions', '--receipt-binding',
  '--receipt-binding-decisions', '--decisions', '--packet', '--decision-template', '--plan',
])

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-quote-grounding.mts --receipt RECEIPT.json --ceremony CEREMONY.html --beatlines BEATLINES.json --takes TAKES.json --legacy-assets ASSETS.json --extraction EXTRACTION.json --presentation-structure PACKET.json --presentation-decisions DECISIONS.json --asset-semantics PACKET.json --asset-decisions DECISIONS.json --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json --receipt-binding PACKET.json --receipt-binding-decisions DECISIONS.json [--decisions QUOTE-GROUNDING-DECISIONS.json] [--packet PACKET.json --decision-template TEMPLATE.json] [--plan PLAN.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>()
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (VALUE_OPTIONS.has(arg)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (values.has(arg)) throw new Error(`${arg} may be supplied only once`)
      values.set(arg, value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  const required = (option: string): string => {
    const value = values.get(option)
    if (!value) usage()
    return value
  }
  const packet = values.get('--packet')
  const decisionTemplate = values.get('--decision-template')
  const decisions = values.get('--decisions')
  const plan = values.get('--plan')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  if (plan && !decisions) throw new Error('--plan requires --decisions')
  if (force && !packet && !plan) throw new Error('--force requires an output')
  return {
    receipt: required('--receipt'),
    ceremony: required('--ceremony'),
    beatlines: required('--beatlines'),
    takes: required('--takes'),
    legacyAssets: required('--legacy-assets'),
    extraction: required('--extraction'),
    presentationStructure: required('--presentation-structure'),
    presentationDecisions: required('--presentation-decisions'),
    assetSemantics: required('--asset-semantics'),
    assetDecisions: required('--asset-decisions'),
    quoteMarkup: required('--quote-markup'),
    quoteMarkupDecisions: required('--quote-markup-decisions'),
    receiptBinding: required('--receipt-binding'),
    receiptBindingDecisions: required('--receipt-binding-decisions'),
    decisions, packet, decisionTemplate, plan, force,
  }
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function sealed(path: string): SealedTextArtifact {
  const bytes = readFileSync(path)
  return {
    raw: bytes.toString('utf8'),
    seal: {
      name: basename(path),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const paths = {
    receipt: existingFile(options.receipt, 'settlement receipt'),
    ceremony: existingFile(options.ceremony, 'legacy ceremony'),
    beatlines: existingFile(options.beatlines, 'legacy beatlines'),
    takes: existingFile(options.takes, 'legacy takes'),
    legacyAssets: existingFile(options.legacyAssets, 'legacy asset collection'),
    extraction: existingFile(options.extraction, 'asset extraction manifest'),
    presentationPacket: existingFile(options.presentationStructure, 'presentation structure packet'),
    presentationDecisions: existingFile(options.presentationDecisions, 'presentation structure decisions'),
    assetPacket: existingFile(options.assetSemantics, 'asset semantics packet'),
    assetDecisions: existingFile(options.assetDecisions, 'asset semantics decisions'),
    quoteMarkupPacket: existingFile(options.quoteMarkup, 'quote markup packet'),
    quoteMarkupDecisions: existingFile(options.quoteMarkupDecisions, 'quote markup decisions'),
    receiptBindingPacket: existingFile(options.receiptBinding, 'receipt binding packet'),
    receiptBindingDecisions: existingFile(options.receiptBindingDecisions, 'receipt binding decisions'),
  }
  const decisionsPath = options.decisions
    ? existingFile(options.decisions, 'quote grounding decisions')
    : undefined
  const outputs = [
    ['packet', options.packet ? resolve(options.packet) : undefined],
    ['decision template', options.decisionTemplate ? resolve(options.decisionTemplate) : undefined],
    ['plan', options.plan ? resolve(options.plan) : undefined],
  ] as const
  const outputCanonical = outputs.flatMap(([label, path]) => (
    path ? [{ label, path: canonicalProspectivePath(path) }] : []
  ))
  const duplicateOutput = outputCanonical.find((entry, index) => (
    outputCanonical.some((other, otherIndex) => otherIndex < index && other.path === entry.path)
  ))
  if (duplicateOutput) throw new Error('packet, decision template and plan outputs must use different paths')
  const sources = [
    ...Object.entries(paths).map(([label, path]) => ({ label, path })),
    ...(decisionsPath ? [{ label: 'quote grounding decisions', path: decisionsPath }] : []),
  ]
  for (const [label, path] of outputs) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) {
      throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
    }
  }
  const packet = buildSettlementDropQuoteGroundingPacket({
    receipt: sealed(paths.receipt),
    ceremony: sealed(paths.ceremony),
    beatlines: sealed(paths.beatlines),
    legacyAssets: sealed(paths.legacyAssets),
    extraction: sealed(paths.extraction),
    takes: sealed(paths.takes),
    presentationPacket: sealed(paths.presentationPacket),
    presentationDecisions: sealed(paths.presentationDecisions),
    assetPacket: sealed(paths.assetPacket),
    assetDecisions: sealed(paths.assetDecisions),
    quoteMarkupPacket: sealed(paths.quoteMarkupPacket),
    quoteMarkupDecisions: sealed(paths.quoteMarkupDecisions),
    receiptBindingPacket: sealed(paths.receiptBindingPacket),
    receiptBindingDecisions: sealed(paths.receiptBindingDecisions),
  })
  const packetBytes = serializeSettlementDropQuoteGroundingPacket(packet)
  const templateBytes = serializeSettlementDropQuoteGroundingDecisionTemplate(packet)
  let planBytes: string | undefined
  console.log('[settlement-drop-quote-grounding] target=local-filesystem')
  console.log(`[settlement-drop-quote-grounding] mode=${outputs.some(([, path]) => path) ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-quote-grounding] room=${packet.target.room_code} settlement=${packet.target.settlement_id}@${packet.target.settlement_version}`)
  console.log(`[settlement-drop-quote-grounding] groups=${packet.coverage.approved_take_groups} quotes=${packet.coverage.quotes} marked_up=${packet.coverage.quotes_with_legacy_markup}`)
  console.log(`[settlement-drop-quote-grounding] pundit_identities=${packet.coverage.approved_pundit_assets} receipt_characters=${packet.coverage.receipt_characters}`)
  console.log(`[settlement-drop-quote-grounding] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${createHash('sha256').update(packetBytes).digest('hex')}`)
  console.log(`[settlement-drop-quote-grounding] template_bytes=${Buffer.byteLength(templateBytes)} sha256=${createHash('sha256').update(templateBytes).digest('hex')}`)
  if (decisionsPath) {
    const decisionsRaw = readFileSync(decisionsPath, 'utf8')
    const decisionsValue: unknown = JSON.parse(decisionsRaw)
    const status = inspectSettlementDropQuoteGroundingDecisions(packet, decisionsValue)
    console.log(`[settlement-drop-quote-grounding] decision_status=${status.status} required=${status.required_values} open=${status.open_values}`)
    if (status.open_items.length > 0) {
      console.log(`[settlement-drop-quote-grounding] open_items=${status.open_items.join(',')}`)
    } else {
      const plan = buildSettlementDropQuoteGroundingPlan(packet, decisionsRaw)
      planBytes = serializeSettlementDropQuoteGroundingPlan(plan)
      console.log(`[settlement-drop-quote-grounding] jobs=${plan.jobs.length} omissions=${plan.omissions.length}`)
      console.log(`[settlement-drop-quote-grounding] first_pass_calls=${plan.budget.first_pass.total_calls_min}-${plan.budget.first_pass.total_calls_max} first_pass_max_output_tokens=${plan.budget.first_pass.max_output_tokens}`)
      console.log(`[settlement-drop-quote-grounding] worst_case_calls=${plan.budget.worst_case.total_calls_min}-${plan.budget.worst_case.total_calls_max} worst_case_max_output_tokens=${plan.budget.worst_case.max_output_tokens}`)
      console.log(`[settlement-drop-quote-grounding] plan_bytes=${Buffer.byteLength(planBytes)} sha256=${createHash('sha256').update(planBytes).digest('hex')}`)
    }
  }
  if (options.plan && !planBytes) {
    throw new Error('plan output requires complete quote grounding decisions')
  }
  if (!outputs.some(([, path]) => path)) {
    console.log('[settlement-drop-quote-grounding] valid=true; no file written; no model called')
    return
  }
  if (options.decisionTemplate) writeUtf8FileSafely(resolve(options.decisionTemplate), templateBytes, options.force)
  if (options.packet) writeUtf8FileSafely(resolve(options.packet), packetBytes, options.force)
  if (options.plan && planBytes) writeUtf8FileSafely(resolve(options.plan), planBytes, options.force)
  if (options.decisionTemplate) console.log(`[settlement-drop-quote-grounding] wrote_decision_template=${resolve(options.decisionTemplate)}`)
  if (options.packet) console.log(`[settlement-drop-quote-grounding] wrote_packet=${resolve(options.packet)}`)
  if (options.plan) console.log(`[settlement-drop-quote-grounding] wrote_plan=${resolve(options.plan)}`)
  console.log('[settlement-drop-quote-grounding] no model called')
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-quote-grounding] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

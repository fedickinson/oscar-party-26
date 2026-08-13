#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import { assessLegacyShowPackAuthoringWorksheet, serializeLegacyShowPackAuthoringWorksheet, type LegacyShowPackAuthoringWorksheet } from '../src/lib/legacy-show-pack-authoring'
import { applyLegacySignatureDeathDecisions, type LegacySignatureDeathDecisionManifest } from '../src/lib/legacy-signature-death-authoring'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options { legacy: string; authoring: string; decisions: string; output?: string; force: boolean; inPlace: boolean }
function parse(argv: string[]): Options {
  const o: Options = { legacy: 'show-packs/research/hotd-s3-finale-legacy-worksheet.json', authoring: 'show-packs/research/hotd-s3-finale-authoring.json', decisions: 'show-packs/research/hotd-s3-finale-signature-death-decisions.json', force: false, inPlace: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--legacy') o.legacy = argv[++i] ?? ''
    else if (a === '--authoring') o.authoring = argv[++i] ?? ''
    else if (a === '--decisions') o.decisions = argv[++i] ?? ''
    else if (a === '--output') o.output = argv[++i] ?? ''
    else if (a === '--force') o.force = true
    else if (a === '--in-place') o.inPlace = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (!o.legacy || !o.authoring || !o.decisions) throw new Error('input paths must not be empty')
  if (o.force && !o.output) throw new Error('--force requires --output')
  if (o.inPlace && (o.output || o.force)) throw new Error('--in-place cannot be combined with --output or --force')
  return o
}
function file(path: string, label: string): string { const p = resolve(path); if (!existsSync(p)) throw new Error(`${label} does not exist: ${p}`); return p }
function json(path: string, label: string): { raw: string; value: unknown } { const raw = readFileSync(path, 'utf8'); try { return { raw, value: JSON.parse(raw) } } catch { throw new Error(`${label} is not valid JSON`) } }
function sha(value: string): string { return createHash('sha256').update(value).digest('hex') }

function main(): void {
  const o = parse(process.argv.slice(2)); const legacyPath = file(o.legacy, 'legacy worksheet'); const authoringPath = file(o.authoring, 'authoring worksheet'); const decisionsPath = file(o.decisions, 'death decisions')
  const output = o.inPlace ? authoringPath : o.output ? resolve(o.output) : undefined
  const inputs = [{ label: 'legacy worksheet', path: legacyPath }, { label: 'authoring worksheet', path: authoringPath }, { label: 'death decisions', path: decisionsPath }]
  if (output) { assertOutputDoesNotAliasSource(output, o.inPlace ? inputs.filter((x) => x.path !== authoringPath) : inputs); if (!o.inPlace && existsSync(output) && !o.force) throw new Error(`output already exists: ${output}; pass --force`) }
  const legacyInput = json(legacyPath, 'legacy worksheet'); const authoringInput = json(authoringPath, 'authoring worksheet'); const decisionsInput = json(decisionsPath, 'death decisions'); const legacySha = sha(legacyInput.raw)
  console.log('[legacy-signature-death-authoring] target=local-filesystem'); console.log(`[legacy-signature-death-authoring] mode=${o.inPlace ? 'write-in-place' : output ? 'write' : 'dry-run'}`)
  const result = applyLegacySignatureDeathDecisions({ legacy: legacyInput.value as LegacyShowPackMigrationWorksheet, legacyWorksheetSha256: legacySha, authoring: authoringInput.value as LegacyShowPackAuthoringWorksheet, manifest: decisionsInput.value as LegacySignatureDeathDecisionManifest })
  const status = assessLegacyShowPackAuthoringWorksheet(legacyInput.value as LegacyShowPackMigrationWorksheet, legacySha, result.worksheet); if (status.issues.length) throw new Error(`authoring status has issues: ${status.issues[0]}`)
  const bytes = serializeLegacyShowPackAuthoringWorksheet(result.worksheet)
  console.log(`[legacy-signature-death-authoring] applied=${result.applied_beat_ids.length}`); console.log(`[legacy-signature-death-authoring] contracts=${status.lanes.signature_beat_contract.filled}/${status.lanes.signature_beat_contract.total}`); console.log(`[legacy-signature-death-authoring] bytes=${Buffer.byteLength(bytes)} sha256=${sha(bytes)}`)
  if (!output) { console.log('[legacy-signature-death-authoring] no file written'); return }
  writeUtf8FileSafely(output, bytes, o.force || o.inPlace); console.log(`[legacy-signature-death-authoring] wrote=${output}`)
}
try { main() } catch (error) { console.error(`[legacy-signature-death-authoring] ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exit(1) }

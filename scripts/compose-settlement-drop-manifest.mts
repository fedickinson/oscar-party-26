#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { composeSettlementDropFinalManifest } from '../src/lib/settlement-drop-final-composer'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

const VALUE_ARGS = [
  '--receipt', '--receipt-reference', '--presentation-structure', '--presentation-decisions',
  '--asset-semantics', '--asset-decisions', '--player-identity', '--player-identity-decisions',
  '--final-authoring', '--final-decisions', '--receipt-binding', '--receipt-binding-decisions',
  '--quote-packet', '--quote-decisions', '--quote-plan', '--quote-authorization',
  '--quote-publication', '--beatlines', '--output',
] as const

type ValueArg = typeof VALUE_ARGS[number]

function usage(): never {
  console.error(`Usage: npx tsx scripts/compose-settlement-drop-manifest.mts
  --receipt RECEIPT.json --receipt-reference receipt.json
  --presentation-structure PACKET.json --presentation-decisions DECISIONS.json
  --asset-semantics PACKET.json --asset-decisions DECISIONS.json
  --player-identity PACKET.json --player-identity-decisions DECISIONS.json
  --final-authoring PACKET.json --final-decisions DECISIONS.json
  --receipt-binding PACKET.json --receipt-binding-decisions DECISIONS.json
  --quote-packet PACKET.json --quote-decisions DECISIONS.json --quote-plan PLAN.json
  --quote-authorization AUTHORIZATION.json --quote-publication PUBLICATION.json
  --beatlines BEATLINES.json [--output DROP.json] [--force]`)
  process.exit(1)
}

function parseArgs(argv: string[]): { values: Map<ValueArg, string>; force: boolean } {
  const allowed = new Set<string>(VALUE_ARGS)
  const values = new Map<ValueArg, string>()
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (allowed.has(arg)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      values.set(arg as ValueArg, value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  for (const name of VALUE_ARGS.filter((candidate) => candidate !== '--output')) {
    if (!values.has(name)) throw new Error(`${name} is required`)
  }
  if (force && !values.has('--output')) throw new Error('--force requires --output PATH')
  return { values, force }
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function main(): void {
  const { values, force } = parseArgs(process.argv.slice(2))
  const sourceArgs = VALUE_ARGS.filter((name) => name !== '--receipt-reference' && name !== '--output')
  const sources = new Map<ValueArg, string>(sourceArgs.map((name) => [
    name,
    existingFile(values.get(name) as string, name.slice(2).replaceAll('-', ' ')),
  ]))
  const receiptReference = values.get('--receipt-reference') as string
  const outputPath = values.get('--output') ? resolve(values.get('--output') as string) : undefined
  const receiptPath = sources.get('--receipt') as string
  if (outputPath) {
    const referenced = resolve(dirname(outputPath), receiptReference)
    const fromRoot = relative(dirname(outputPath), referenced)
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('--receipt-reference must resolve to a file below the manifest directory')
    }
    if (!existsSync(referenced) || realpathSync(referenced) !== receiptPath) {
      throw new Error('--receipt-reference must resolve to the exact supplied receipt beside the future manifest')
    }
    assertOutputDoesNotAliasSource(outputPath, [...sources.entries()].map(([name, path]) => ({
      label: name.slice(2).replaceAll('-', ' '), path,
    })))
    if (existsSync(outputPath) && !force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }
  const read = (name: ValueArg): string => readFileSync(sources.get(name) as string, 'utf8')
  const result = composeSettlementDropFinalManifest({
    receiptRaw: read('--receipt'),
    receiptPath: receiptReference,
    presentationPacketRaw: read('--presentation-structure'),
    presentationDecisionsRaw: read('--presentation-decisions'),
    assetPacketRaw: read('--asset-semantics'),
    assetDecisionsRaw: read('--asset-decisions'),
    playerIdentityPacketRaw: read('--player-identity'),
    playerIdentityDecisionsRaw: read('--player-identity-decisions'),
    finalAuthoringPacketRaw: read('--final-authoring'),
    finalAuthoringDecisionsRaw: read('--final-decisions'),
    receiptBindingPacketRaw: read('--receipt-binding'),
    receiptBindingDecisionsRaw: read('--receipt-binding-decisions'),
    quoteGroundingPacketRaw: read('--quote-packet'),
    quoteGroundingDecisionsRaw: read('--quote-decisions'),
    quoteGroundingPlanRaw: read('--quote-plan'),
    quoteAuthorizationRaw: read('--quote-authorization'),
    quotePublicationRaw: read('--quote-publication'),
    beatlinesRaw: read('--beatlines'),
  })
  const ledgerRows = result.manifest.acts.flatMap((act) => act.beats).reduce((sum, beat) => sum + beat.ledger.length, 0)
  const quoteRows = result.manifest.acts.flatMap((act) => act.beats).reduce((sum, beat) => sum + beat.quotes.length, 0)
  console.log('[settlement-drop-final-manifest] target=local-filesystem')
  console.log(`[settlement-drop-final-manifest] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-final-manifest] settlement=${result.compiled.settlement.settlement_id}@${result.compiled.settlement.settlement_version}`)
  console.log(`[settlement-drop-final-manifest] players=${result.manifest.players.length} characters=${result.manifest.characters.length} acts=${result.manifest.acts.length}`)
  console.log(`[settlement-drop-final-manifest] ledger_rows=${ledgerRows} quotes=${quoteRows}`)
  console.log(`[settlement-drop-final-manifest] bytes=${Buffer.byteLength(result.manifestRaw)} sha256=${sha256Hex(result.manifestRaw)}`)
  if (!outputPath) {
    console.log('[settlement-drop-final-manifest] compiler_valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, result.manifestRaw, force)
  console.log(`[settlement-drop-final-manifest] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-final-manifest] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

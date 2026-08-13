#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyShowPackResearchIntake,
  buildShowPackResearchIntakePacket,
  serializeShowPackResearchIntakePacket,
  serializeShowPackResearchIntakeDecisions,
  serializeShowPackResearchIntakeResult,
} from '../src/lib/show-pack-research-intake'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : null
}

function required(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function main(): void {
  const seedPath = existingFile(required('--seed'), 'flywheel seed')
  const candidatesPath = existingFile(required('--candidates'), 'research candidates')
  const packetPath = existingFile(required('--packet'), 'research intake packet')
  const decisionsPath = existingFile(required('--decisions'), 'research intake decisions')
  const outputArg = arg('--output')
  const outputPath = outputArg ? resolve(outputArg) : undefined
  const force = process.argv.includes('--force')
  if (force && !outputPath) throw new Error('--force requires --output PATH')
  const sources = [
    { label: 'flywheel seed', path: seedPath },
    { label: 'research candidates', path: candidatesPath },
    { label: 'research intake packet', path: packetPath },
    { label: 'research intake decisions', path: decisionsPath },
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && !force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }
  const packet = buildShowPackResearchIntakePacket(
    readFileSync(seedPath, 'utf8'),
    readFileSync(candidatesPath, 'utf8'),
  )
  const packetRaw = serializeShowPackResearchIntakePacket(packet)
  if (readFileSync(packetPath, 'utf8') !== packetRaw) {
    throw new Error('research intake packet is stale relative to the seed and candidates')
  }
  const decisionsRaw = readFileSync(decisionsPath, 'utf8')
  const decisions = JSON.parse(decisionsRaw) as unknown
  if (serializeShowPackResearchIntakeDecisions(decisions) !== decisionsRaw) {
    throw new Error('research intake decision bytes are not canonical')
  }
  const result = applyShowPackResearchIntake(packet, decisions)
  const resultRaw = serializeShowPackResearchIntakeResult(result)
  console.log('[show-pack-research-apply] target=local-filesystem')
  console.log(`[show-pack-research-apply] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-research-apply] predecessor=${result.target.pack_id} settlement=${result.target.settlement_id}@${result.target.settlement_version}`)
  console.log(`[show-pack-research-apply] sources=${result.sources.length} claims=${result.claims.length}`)
  console.log(`[show-pack-research-apply] packet_sha256=${result.packet_sha256} decisions_sha256=${result.decisions_sha256}`)
  console.log(`[show-pack-research-apply] bytes=${Buffer.byteLength(resultRaw)} sha256=${sha256Hex(resultRaw)}`)
  if (!outputPath) {
    console.log('[show-pack-research-apply] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, resultRaw, force)
  console.log(`[show-pack-research-apply] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[show-pack-research-apply] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

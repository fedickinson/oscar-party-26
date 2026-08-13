#!/usr/bin/env -S node --import tsx

/**
 * Exercise the real show-pack activation command against the local stack.
 *
 * The activation catalog is immutable once published, so this dogfood retains
 * one deterministic local fixture. A final `supabase db reset --local` removes
 * it and proves that the authored seed remains the clean-install baseline.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parseShowPack } from '../src/lib/show-pack'
import { buildShowPackActivationPlan } from '../src/lib/show-pack-activation'
import { supabaseConfig } from './lib/env.mts'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspace = mkdtempSync('/private/tmp/show-pack-activation-')
const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('show-pack activation dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const browser = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
let checks = 0
let roomId: string | null = null

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function runActivation(args: string[]): string {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/activate-show-pack.mts', ...args],
    { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 },
  )
  if (result.error) throw result.error
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.status !== 0) {
    throw new Error(`activation command exited ${result.status ?? 'without a status'}`)
  }
  return output
}

async function main(): Promise<void> {
  console.log('────────────────────────────────────────────────────────────')
  console.log(`  target: ${target}  ${url}`)
  console.log('────────────────────────────────────────────────────────────')
  try {
    const proof = parseShowPack(readFileSync(
      join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
      'utf8',
    ))
    proof.pack.id = 'show-pack-activation-dogfood'
    proof.pack.title = 'Show Pack Activation Dogfood'
    proof.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(proof.bingo_squares[0]),
      id: `activation-square-${String(index + 1).padStart(2, '0')}`,
      title: `Activation square ${index + 1}`,
    }))
    const plan = await buildShowPackActivationPlan(proof)
    const inputPath = join(workspace, 'activation-pack.json')
    writeFileSync(inputPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')

    const roomCode = `ACT${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
    const { data: session, error: createError } = await browser.rpc('create_room_with_host', {
      p_code: roomCode,
      p_name: 'Activation Host',
      p_avatar_id: 'targaryen',
      p_color: '#D4AF37',
    })
    if (createError) throw createError
    roomId = session.room.id as string
    check(session.room.phase === 'lobby', 'disposable activation room begins in the lobby')

    const commandArgs = ['--input', inputPath, '--room', roomCode]
    const dryRun = runActivation(commandArgs)
    check(dryRun.includes('mode=dry-run'), 'activation command defaults to a dry run')
    check(dryRun.includes('activatable=true; no rows written'), 'dry run completes without catalog writes')

    const applied = runActivation([...commandArgs, '--apply', '--confirm-room', roomCode])
    check(applied.includes(`bound ${roomCode} to ${proof.pack.id}@${proof.pack.version}`),
      'confirmed command publishes and binds the compiled pack')

    const { data: registry, error: registryError } = await service
      .from('show_packs')
      .select('id,status,manifest_sha256')
      .eq('id', plan.showPackId)
      .single()
    if (registryError) throw registryError
    check(registry.status === 'published', 'activation publishes the registry only after catalog attestation')
    check(registry.manifest_sha256 === plan.manifestSha256, 'published registry retains the compiled manifest hash')

    const { data: boundRoom, error: roomError } = await service
      .from('rooms')
      .select('show_pack_id,game_model')
      .eq('id', roomId)
      .single()
    if (roomError) throw roomError
    check(boundRoom.show_pack_id === plan.showPackId, 'room binding points at the exact published registry')
    check(boundRoom.game_model === 'conviction_portfolio', 'declared-fact pack selects the conviction game model')

    const repeated = runActivation([...commandArgs, '--apply', '--confirm-room', roomCode])
    check(repeated.includes('catalog=attested status=published'), 'repeat apply re-attests the immutable catalog')
    check(repeated.includes(`bound ${roomCode}`), 'repeat apply is idempotent at the binding boundary')
    console.log(`\n${checks} show-pack activation checks passed.`)
  } finally {
    if (roomId) {
      const { error } = await service.from('rooms').delete().eq('id', roomId)
      if (error) console.error(`[show-pack-activation-dogfood] cleanup warning: ${error.message}`)
      else console.log('PASS removed the disposable activation room')
    }
    rmSync(workspace, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[show-pack-activation-dogfood] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

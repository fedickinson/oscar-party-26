/**
 * Which database a script talks to, decided in one place and announced out loud.
 *
 * Before this existed, all six scripts parsed .env.local themselves and every
 * one of them pointed at production, because production was the only database
 * there was. Now there is a local stack, and the question "which database am I
 * about to write to" has a wrong answer.
 *
 * The default depends on what the script is for, and callers pass it:
 *
 *   'local'  for anything that WRITES test data — dogfood-e2e, ghost-screen.
 *            Hitting production must be a deliberate act, not a forgotten flag.
 *   'remote' for the operator's lens — gm-pulse, snapshot-game, the daemon.
 *            These exist to observe or serve a live party; defaulting them to
 *            an empty local database would be its own kind of dangerous, in the
 *            middle of the one night they matter.
 *
 * Override either way with SUPABASE_TARGET=local|remote. Every script prints
 * the target it resolved before doing anything, so the answer is never a guess.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type Target = 'local' | 'remote'

export interface SupabaseConfig {
  target: Target
  url: string
  anonKey: string
  /** Required by protected operator writes such as settlement. Never exposed to Vite. */
  serviceKey?: string
  /** Only set for the remote target, and only when .env.local carries it. */
  anthropicKey?: string
}

function parseEnvFile(path: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/** Operator-only model credential. Process environment wins over .env.local. */
export function anthropicOperatorKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim()
  try {
    return parseEnvFile(new URL('../../.env.local', import.meta.url)).ANTHROPIC_API_KEY
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Reads the running stack's keys rather than hardcoding the demo JWTs. */
function localConfig(): { url: string; anonKey: string; serviceKey: string } {
  let status: string
  try {
    status = execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error(
      'The local Supabase stack is not running. Start it with `supabase start`, ' +
        'or re-run with SUPABASE_TARGET=remote to use production.',
    )
  }
  const parsed = JSON.parse(status) as Record<string, string>
  return { url: parsed.API_URL, anonKey: parsed.ANON_KEY, serviceKey: parsed.SERVICE_ROLE_KEY }
}

export function supabaseConfig(defaultTarget: Target): SupabaseConfig {
  const requested = process.env.SUPABASE_TARGET as Target | undefined
  if (requested && requested !== 'local' && requested !== 'remote') {
    throw new Error(`SUPABASE_TARGET must be "local" or "remote", got "${requested}"`)
  }
  const target = requested ?? defaultTarget

  if (target === 'local') {
    const { url, anonKey, serviceKey } = localConfig()
    announce(target, url)
    return { target, url, anonKey, serviceKey }
  }

  const env = parseEnvFile(new URL('../../.env.local', import.meta.url))
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('.env.local is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  announce(target, url)
  return {
    target,
    url,
    anonKey,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
  }
}

function announce(target: Target, url: string): void {
  const label = target === 'remote' ? 'PRODUCTION' : 'local'
  const rule = '─'.repeat(60)
  console.error(`${rule}\n  target: ${label}  ${url}\n${rule}`)
}

/**
 * Guards for the Anthropic proxy.
 *
 * WHY THIS FILE EXISTS
 * The proxy forwards a request to Anthropic using a key only the server holds.
 * Before hardening it accepted any body from any caller: any model, any
 * max_tokens, unlimited rate. Anyone who found the URL could bill the account.
 *
 * These are pure functions over their inputs — no fetch, no process.env, no
 * Vercel types — so they are unit-testable, which is the whole point of a gate.
 * Files under api/ whose name starts with `_` are not deployed as functions.
 */

/** Models this app actually calls. Adding one is a deliberate code change. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  'claude-sonnet-5', // event reactions, verdicts, results summary
  'claude-haiku-4-5', // chat replies, where latency is felt
])

/** The largest real call is the 3000-token verdicts batch; this is headroom, not a target. */
export const MAX_TOKENS_CEILING = 4000

/** Every top-level field the four client call sites actually send. */
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  'model',
  'max_tokens',
  'system',
  'messages',
  'thinking',
  'output_config',
  'temperature',
  'top_p',
  'stop_sequences',
])

/** ~40KB of cached system prompt plus history; 256KB is generous for that. */
export const MAX_BODY_BYTES = 256 * 1024

/**
 * A guard returns null when the request is fine, and a failure when it is not.
 *
 * Deliberately NOT a discriminated union on `ok: true | false`. Vercel compiles
 * these functions with its own non-strict config, where narrowing by boolean
 * literal degrades and `check.error` becomes a type error the deploy log
 * reports while shipping the broken function anyway. Null-or-failure narrows
 * correctly under strict and non-strict alike.
 */
export interface GuardFailure {
  status: number
  error: string
}

export type GuardResult = GuardFailure | null

const OK: GuardResult = null
const deny = (status: number, error: string): GuardResult => ({ status, error })

/**
 * Same-origin only, plus localhost for development.
 *
 * Browsers send `Origin` on every POST, including same-origin ones, so a
 * missing header means the caller is not a browser page. Comparing against the
 * request's own host covers production, every preview deployment, and any
 * custom domain without a hardcoded list.
 *
 * This stops casual and cross-site abuse. It does NOT stop a determined caller
 * forging the header from curl — see the residual note in the handler.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  extraAllowed: readonly string[] = [],
): boolean {
  if (!origin) return false

  let originHost: string
  let hostname: string
  try {
    const url = new URL(origin)
    originHost = url.host
    hostname = url.hostname
  } catch {
    return false
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (host && originHost === host) return true
  return extraAllowed.some((allowed) => allowed.trim() === origin)
}

/** Parse a comma-separated ALLOWED_ORIGINS env value into an origin list. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Reject anything that is not a shape this app sends: unknown model, a token
 * budget above the ceiling, an unexpected top-level field, or an oversized body.
 * Rejects rather than clamps — a silently truncated request is the kind of
 * failure that gets debugged at a party.
 */
export function validateBody(body: unknown): GuardResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return deny(400, 'Body must be a JSON object')
  }

  const record = body as Record<string, unknown>

  const size = Buffer.byteLength(JSON.stringify(record), 'utf8')
  if (size > MAX_BODY_BYTES) {
    return deny(413, `Body exceeds ${MAX_BODY_BYTES} bytes`)
  }

  for (const field of Object.keys(record)) {
    if (!ALLOWED_FIELDS.has(field)) {
      return deny(400, `Unsupported field: ${field}`)
    }
  }

  const { model, max_tokens: maxTokens, messages } = record

  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return deny(400, 'Unsupported model')
  }

  if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1) {
    return deny(400, 'max_tokens must be a positive integer')
  }

  if (maxTokens > MAX_TOKENS_CEILING) {
    return deny(400, `max_tokens exceeds ceiling of ${MAX_TOKENS_CEILING}`)
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return deny(400, 'messages must be a non-empty array')
  }

  return OK
}

export interface Bucket {
  tokens: number
  updatedAt: number
}

/**
 * Token bucket, sized for a room rather than a phone: every player is behind
 * one house NAT, so they all share a source IP. Capacity is the burst a room
 * can produce when several companions fire on one declaration.
 */
export const RATE_CAPACITY = 20
export const RATE_REFILL_PER_MS = 1 / 1000 // one token per second, 60/min sustained

/**
 * Consume one token for `key`, refilling by elapsed time. Mutates `buckets`.
 * Returns false when the caller is over budget.
 *
 * The store is passed in rather than held here so tests control time and state.
 * In the handler it is module scope, which means the limit is per warm instance,
 * not global — best effort, not a quota.
 */
export function takeToken(
  buckets: Map<string, Bucket>,
  key: string,
  now: number,
  capacity: number = RATE_CAPACITY,
  refillPerMs: number = RATE_REFILL_PER_MS,
): boolean {
  const bucket = buckets.get(key)

  if (!bucket) {
    buckets.set(key, { tokens: capacity - 1, updatedAt: now })
    return true
  }

  const elapsed = Math.max(0, now - bucket.updatedAt)
  const refilled = Math.min(capacity, bucket.tokens + elapsed * refillPerMs)
  bucket.updatedAt = now

  if (refilled < 1) {
    bucket.tokens = refilled
    return false
  }

  bucket.tokens = refilled - 1
  return true
}

/** Drop buckets untouched for a while so a long-lived instance does not grow without bound. */
export function pruneBuckets(buckets: Map<string, Bucket>, now: number, maxAgeMs = 10 * 60 * 1000): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > maxAgeMs) buckets.delete(key)
  }
}

/** First hop of x-forwarded-for, which is the client on Vercel. */
export function clientKey(forwardedFor: string | string[] | undefined): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
  if (!raw) return 'unknown'
  return raw.split(',')[0].trim() || 'unknown'
}

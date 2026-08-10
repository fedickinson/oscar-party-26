/**
 * Anthropic proxy — the only server-side code in the app.
 *
 * It exists so the API key never reaches a phone. That makes it the one URL
 * that spends money on someone else's behalf, so it is gated: same-origin
 * callers only, known models only, a token ceiling, and a per-instance rate
 * limit.
 *
 * RESIDUAL RISK, stated plainly: `Origin` can be forged by a non-browser
 * client, and the rate limit lives in the memory of one warm instance rather
 * than in shared storage. This bounds casual abuse and accidental loops; it is
 * not an authorization boundary. The real fix is to require a room code and
 * player id and verify them against Supabase before forwarding — that ties
 * spend to someone who is actually in a game.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  clientKey,
  isAllowedOrigin,
  parseAllowedOrigins,
  pruneBuckets,
  takeToken,
  validateBody,
  type Bucket,
} from '../../_guards.js'

/** Module scope: survives across invocations on a warm instance, and no longer. */
const buckets = new Map<string, Bucket>()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host
  if (!isAllowedOrigin(origin, host, parseAllowedOrigins(process.env.ALLOWED_ORIGINS))) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const now = Date.now()
  pruneBuckets(buckets, now)
  if (!takeToken(buckets, clientKey(req.headers['x-forwarded-for']), now)) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  const failure = validateBody(req.body)
  if (failure) {
    return res.status(failure.status).json({ error: failure.error })
  }

  // ANTHROPIC_API_KEY is the correct name; VITE_ANTHROPIC_API_KEY is accepted as
  // a fallback so an existing deployment keeps working through the rename. A
  // VITE_-prefixed secret is a footgun — the day anything in src/ references it,
  // Vite inlines it into the client bundle. Remove the fallback once the new
  // variable is set in the Vercel project.
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    })

    // Upstream errors are not always JSON — a gateway can return HTML, and
    // response.json() then throws where the caller expected a status.
    const text = await response.text()
    try {
      return res.status(response.status).json(JSON.parse(text))
    } catch {
      return res.status(response.status).json({ error: 'Upstream returned a non-JSON response' })
    }
  } catch {
    return res.status(502).json({ error: 'Upstream request failed' })
  }
}

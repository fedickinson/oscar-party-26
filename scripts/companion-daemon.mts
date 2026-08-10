/**
 * companion-daemon — the cast, freed from the host's phone.
 *
 * The companion engine lived in the host's browser tab; at a real party that
 * tab locks, backgrounds, and dies, and the cast goes silent exactly when the
 * game heats up (sentinel caught 6 declared events with 8 minutes of silence).
 * This daemon runs the event-reaction loop from the laptop: watch for new
 * declarations, build the same prompts, call the same model, insert the same
 * messages. The phone is now only for declaring.
 *
 * Dedup with a still-awake host tab: after spotting a new declaration it waits
 * 60s and only fires if no companion message has appeared since the
 * declaration landed — whoever reacts first wins, nobody reacts twice.
 *
 *   npx tsx scripts/companion-daemon.mts --room WDKH
 */
import { readFileSync } from 'fs'
import {
  buildWinnerReactionPrompt, parseCompanionResponse,
} from '../src/lib/companion-prompts'
import { buildCategoryContext } from '../src/lib/ceremony-context'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k: string) => env.split('\n').find((l) => l.startsWith(k + '='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const URL_ = pick('VITE_SUPABASE_URL'), KEY = pick('VITE_SUPABASE_ANON_KEY'), AKEY = pick('VITE_ANTHROPIC_API_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const get = async (p: string) => (await fetch(`${URL_}/rest/v1/${p}`, { headers: H })).json()
const ins = (t: string, b: object) => fetch(`${URL_}/rest/v1/${t}`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(b) })
const log = (m: string) => console.log(`[cast ${new Date().toLocaleTimeString()}] ${m}`)

const code = process.argv[process.argv.indexOf('--room') + 1] ?? 'WDKH'
const room = (await get(`rooms?code=eq.${code}&select=id`))[0]
if (!room) { console.error('room not found'); process.exit(1) }
const RID = room.id
const COMPANIONS = ['ned','cersei','tyrion','joffrey','daenerys','olenna','arya']

const seen = new Set<number>(
  (await get(`room_winners?room_id=eq.${RID}&select=category_id`)).map((w: {category_id:number}) => w.category_id),
)
log(`watching ${code} — ${seen.size} events already reacted-or-past; engine live`)

async function react(categoryId: number) {
  const [cat] = await get(`categories?id=eq.${categoryId}&select=*`)
  const [win] = await get(`room_winners?room_id=eq.${RID}&category_id=eq.${categoryId}&select=*`)
  if (!cat || !win) return
  const [nominee] = await get(`nominees?id=eq.${win.winner_id}&select=*`)
  if (!nominee) return

  // Host-tab dedup: if a companion already spoke since this was declared, skip.
  const declaredAt = win.created_at ?? new Date(Date.now() - 60_000).toISOString()
  const recent = await get(`messages?room_id=eq.${RID}&select=player_id,created_at&order=created_at.desc&limit=8`)
  if (recent.some((m: {player_id:string; created_at:string}) => COMPANIONS.includes(m.player_id) && m.created_at > declaredAt)) {
    log(`cat ${categoryId}: host tab reacted — standing down`)
    return
  }

  const players = await get(`players?room_id=eq.${RID}&select=*`)
  const picks = await get(`draft_picks?room_id=eq.${RID}&select=*`)
  const ents = await get(`draft_entities?select=*`)
  const eventsSoFar = seen.size

  const prompt = buildWinnerReactionPrompt(
    cat, nominee, players, [nominee], [], picks, ents, [], undefined, undefined,
    buildCategoryContext(cat.name, nominee.name), eventsSoFar,
  )
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 700,
      thinking: { type: 'disabled' }, output_config: { effort: 'low' },
      system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: [{ role: 'user', content: prompt.user }],
    }),
  })
  const d = await r.json()
  if (!r.ok) { log(`API error: ${JSON.stringify(d).slice(0,120)}`); return }
  const raw = (d.content ?? []).find((b: {type?:string}) => b.type === 'text')?.text ?? ''
  for (const m of parseCompanionResponse(raw)) {
    setTimeout(() => {
      void ins('messages', { room_id: RID, player_id: m.companion_id, text: m.text })
    }, Math.min(m.delay_seconds, 45) * 1000)
  }
  log(`cat ${categoryId} "${cat.name}": reactions queued`)
}

for (;;) {
  await new Promise((r) => setTimeout(r, 10_000))
  try {
    const winners = await get(`room_winners?room_id=eq.${RID}&select=category_id`)
    for (const w of winners) {
      if (seen.has(w.category_id)) continue
      seen.add(w.category_id)
      // grace: let a live host tab go first
      setTimeout(() => void react(w.category_id), 45_000)
      log(`new declaration cat ${w.category_id} — reacting in 45s unless host tab does`)
    }
  } catch (e) { log(`transient: ${String(e).slice(0, 80)}`) }
}

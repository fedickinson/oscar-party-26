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
 * Event ownership is durable: browser and daemon contend for one reaction-key
 * lease before model work. The winner atomically inserts Ned's zero-delay line
 * and seals the later delivery plan; either process may idempotently flush due
 * lines. The 45s observation check remains only for old browser bundles that do
 * not know how to claim yet.
 *
 *   npx tsx scripts/companion-daemon.mts --room WDKH
 */
import { randomUUID } from 'node:crypto'
import {
  buildWinnerReactionPrompt,
} from '../src/lib/companion-prompts'
import { buildCategoryContext } from '../src/lib/ceremony-context'
import {
  buildBingoReactionKey,
  buildCompanionReactionKey,
  selectSpokenCompanionIds,
} from '../src/lib/companion-reaction'
import { supabaseConfig } from './lib/env.mts'
import {
  groundedCompanionBatch,
  type GroundingModelCaller,
} from './grounded-line.mts'

const config = supabaseConfig('remote')
const URL_ = config.url
const KEY = config.serviceKey
const AKEY = config.anthropicKey ?? ''
if (!KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the companion daemon')
}
if (config.target === 'remote' && !AKEY) {
  throw new Error('ANTHROPIC_API_KEY is required for the production companion daemon')
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const get = async (p: string) => {
  const response = await fetch(`${URL_}/rest/v1/${p}`, { headers: H })
  if (!response.ok) throw new Error(`GET ${p}: ${response.status} ${await response.text()}`)
  return response.json()
}
const ins = async (t: string, b: object) => {
  const response = await fetch(`${URL_}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(b),
  })
  if (!response.ok) throw new Error(`POST ${t}: ${response.status} ${await response.text()}`)
}
const rpc = async <T,>(name: string, body: object): Promise<T> => {
  const response = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`RPC ${name}: ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}
const groundingCaller: GroundingModelCaller = async (request) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': AKEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [{
        type: 'text',
        text: request.system,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      }],
      messages: [{ role: 'user', content: request.user }],
    }),
  })
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> }
  if (!response.ok) throw new Error(`Anthropic grounding request failed (${response.status})`)
  return data.content?.find((block) => block.type === 'text')?.text ?? ''
}
const log = (m: string) => console.log(`[cast ${new Date().toLocaleTimeString()}] ${m}`)

const code = process.argv[process.argv.indexOf('--room') + 1] ?? 'WDKH'
const room = (await get(`rooms?code=eq.${code}&select=id,show_pack_id,host_id`))[0]
if (!room) { console.error('room not found'); process.exit(1) }
const RID = room.id
const COMPANIONS = ['ned','cersei','tyrion','joffrey','daenerys','olenna','arya']
const ENGINE = 'companion_daemon'
const INSTANCE_ID = randomUUID()
let shuttingDown = false

async function spokenCompanionIds(): Promise<string[]> {
  const rows = await get(
    `messages?room_id=eq.${RID}&player_id=in.(${COMPANIONS.join(',')})&select=player_id`,
  ) as Array<{ player_id: string }>
  return selectSpokenCompanionIds(rows.map((message) => message.player_id))
}

async function claimChatReaction(reactionKey: string): Promise<boolean> {
  const [claim] = await rpc<Array<{
    claimed: boolean
  }>>('claim_companion_reaction', {
    p_room_id: RID,
    p_reaction_key: reactionKey,
    p_engine: 'daemon',
    p_instance_id: INSTANCE_ID,
    p_lease_seconds: 60,
  })
  return claim?.claimed === true
}

interface EventReactionClaim {
  claimed: boolean
  active_lease_expires_at: string
  active_completed_at: string | null
}

async function claimEventReaction(reactionKey: string): Promise<EventReactionClaim> {
  const [claim] = await rpc<EventReactionClaim[]>('claim_companion_reaction', {
    p_room_id: RID,
    p_reaction_key: reactionKey,
    p_engine: 'daemon',
    p_instance_id: INSTANCE_ID,
    p_lease_seconds: 300,
  })
  if (!claim) throw new Error('event reaction claim returned no row')
  return claim
}

async function completeChatReaction(
  reactionKey: string,
  messages: Array<{ companion_id: string; text: string }>,
): Promise<boolean> {
  const [result] = await rpc<Array<{ completed: boolean }>>('complete_companion_reaction', {
    p_room_id: RID,
    p_reaction_key: reactionKey,
    p_instance_id: INSTANCE_ID,
    p_messages: messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
    })),
  })
  return result?.completed === true
}

async function releaseReaction(reactionKey: string): Promise<void> {
  await rpc<boolean>('release_companion_reaction', {
    p_room_id: RID,
    p_reaction_key: reactionKey,
    p_instance_id: INSTANCE_ID,
  })
}

async function scheduleEventReaction(
  reactionKey: string,
  messages: Array<{ companion_id: string; text: string; delay_seconds: number }>,
): Promise<boolean> {
  const [result] = await rpc<Array<{ completed: boolean }>>(
    'schedule_staggered_companion_reaction',
    {
      p_room_id: RID,
      p_reaction_key: reactionKey,
      p_instance_id: INSTANCE_ID,
      p_messages: messages.map((message) => ({
        player_id: message.companion_id,
        text: message.text,
        delay_seconds: message.delay_seconds,
      })),
    },
  )
  return result?.completed === true
}

async function deliverDueEventReactions(): Promise<number> {
  const [result] = await rpc<Array<{ delivered_count: number }>>(
    'deliver_due_companion_reactions',
    { p_room_id: RID, p_limit: 20 },
  )
  return result?.delivered_count ?? 0
}

interface HeartbeatLease {
  claimed: boolean
  active_instance_id: string
  active_heartbeat_at: string
}

async function touchHeartbeat(): Promise<HeartbeatLease> {
  const [lease] = await rpc<HeartbeatLease[]>('touch_operator_heartbeat', {
    p_room_id: RID,
    p_engine: ENGINE,
    p_instance_id: INSTANCE_ID,
  })
  if (!lease) throw new Error('heartbeat RPC returned no lease')
  return lease
}

async function releaseHeartbeat(): Promise<void> {
  await rpc<boolean>('release_operator_heartbeat', {
    p_room_id: RID,
    p_engine: ENGINE,
    p_instance_id: INSTANCE_ID,
  })
}

async function shutdown(exitCode: number): Promise<never> {
  if (shuttingDown) process.exit(exitCode)
  shuttingDown = true
  try {
    await releaseHeartbeat()
  } catch (error) {
    log(`heartbeat release failed: ${String(error).slice(0, 100)}`)
  }
  process.exit(exitCode)
}

const initialLease = await touchHeartbeat()
if (!initialLease.claimed) {
  console.error(`companion daemon already holds room ${code}; active instance ${initialLease.active_instance_id}`)
  process.exit(1)
}
process.once('SIGINT', () => { void shutdown(0) })
process.once('SIGTERM', () => { void shutdown(0) })

async function heartbeatLoop(): Promise<void> {
  while (!shuttingDown) {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    try {
      const lease = await touchHeartbeat()
      if (!lease.claimed || lease.active_instance_id !== INSTANCE_ID) {
        log(`heartbeat lease lost to ${lease.active_instance_id}; stopping`)
        await shutdown(1)
      }
    } catch (error) {
      log(`heartbeat pulse failed: ${String(error).slice(0, 100)}`)
    }
  }
}
void heartbeatLoop()

function runWatcher(name: string, watcher: () => Promise<void>): void {
  void watcher().catch((error) => {
    log(`${name} stopped: ${String(error).slice(0, 100)}`)
    void shutdown(1)
  })
}

const seen = new Set<number>(
  (await get(`room_winners?room_id=eq.${RID}&select=category_id`)).map((w: {category_id:number}) => w.category_id),
)
log(`watching ${code} — ${seen.size} events already reacted-or-past; lease ${INSTANCE_ID.slice(0, 8)} live`)

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

  const reactionKey = `event:${categoryId}:winner`
  const claim = await claimEventReaction(reactionKey)
  if (!claim.claimed) {
    if (claim.active_completed_at == null) {
      const leaseEnd = Date.parse(claim.active_lease_expires_at)
      const retryIn = Number.isFinite(leaseEnd)
        ? Math.max(1_000, Math.min(300_000, leaseEnd - Date.now() + 500))
        : 5_000
      setTimeout(() => {
        void react(categoryId)
          .catch((error) => log(`reaction retry failed: ${String(error).slice(0, 100)}`))
      }, retryIn)
      log(`cat ${categoryId}: another engine owns generation; retrying after its lease`)
    } else {
      log(`cat ${categoryId}: reaction already durably scheduled — standing down`)
    }
    return
  }

  let completed = false
  try {
    const players = await get(`players?room_id=eq.${RID}&select=*`)
    const picks = await get(`draft_picks?room_id=eq.${RID}&select=*`)
    const ents = await get(`draft_entities?show_pack_id=eq.${room.show_pack_id}&select=*`)
    const eventsSoFar = seen.size

    const prompt = buildWinnerReactionPrompt(
      cat, nominee, players, [nominee], [], picks, ents, [], undefined, undefined,
      buildCategoryContext(cat.name, nominee.name), eventsSoFar,
    )
    const grounded = await groundedCompanionBatch({
      system: prompt.system,
      user: prompt.user,
      facts: prompt.groundingFacts,
      model: 'claude-sonnet-5',
      maxTokens: 700,
      maxRetries: 2,
      expectedCompanionIds: prompt.expectedCompanionIds,
      caller: groundingCaller,
    })
    if (grounded.findings.length > 0) {
      if (!room.host_id) {
        log(`cat ${categoryId}: blocked by grounding; room host is unavailable for review evidence`)
        return
      }
      await rpc<string>('record_companion_grounding_review', {
        p_room_id: RID,
        p_actor_player_id: room.host_id,
        p_reaction_key: reactionKey,
        p_surface: 'event',
        p_engine: 'daemon',
        p_facts: prompt.groundingFacts,
        p_attempted_messages: grounded.messages,
        p_findings: grounded.findings,
        p_attempts: grounded.attempts,
        p_model: 'claude-sonnet-5',
      })
      log(`cat ${categoryId}: blocked by grounding after ${grounded.attempts} attempts`)
      return
    }

    completed = await scheduleEventReaction(reactionKey, grounded.messages)
    if (!completed) {
      log(`cat ${categoryId}: lost reaction ownership before schedule commit`)
      return
    }
    for (const message of grounded.messages.slice(1)) {
      setTimeout(() => {
        void deliverDueEventReactions()
          .catch((error) => log(`scheduled delivery failed: ${String(error).slice(0, 100)}`))
      }, message.delay_seconds * 1000)
    }
    log(`cat ${categoryId} "${cat.name}": durable reactions scheduled`)
  } finally {
    if (!completed) await releaseReaction(reactionKey)
  }
}

async function watchEvents() {
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000))
    try {
      const winners = await get(`room_winners?room_id=eq.${RID}&select=category_id`)
      for (const w of winners) {
        if (seen.has(w.category_id)) continue
        seen.add(w.category_id)
        // grace: let a live host tab go first
        setTimeout(() => {
          void react(w.category_id)
            .catch((error) => log(`reaction failed: ${String(error).slice(0, 100)}`))
        }, 45_000)
        log(`new declaration cat ${w.category_id} — reacting in 45s unless host tab does`)
      }
    } catch (e) { log(`transient: ${String(e).slice(0, 80)}`) }
  }
}
runWatcher('event watch', watchEvents)

async function watchScheduledEventDeliveries() {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    try {
      const delivered = await deliverDueEventReactions()
      if (delivered > 0) log(`delivered ${delivered} due cast ${delivered === 1 ? 'line' : 'lines'}`)
    } catch (error) {
      log(`scheduled delivery transient: ${String(error).slice(0, 80)}`)
    }
  }
}
runWatcher('scheduled event delivery', watchScheduledEventDeliveries)

// ─── Bingo watch — announcements + reactions, also freed from the phone ──────
// Marks were announced by the host tab's listener; locked phone = silent
// bingo. Same pattern as events: poll, verify the mark survived its undo
// window, insert the divider for everyone, occasionally let one companion
// comment; a completed line always gets its moment.
import { buildBingoReactionPrompt } from '../src/lib/companion-prompts'
import { didBingoMarkCompleteLine } from '../src/lib/bingo-utils'
import type { BingoMarkRow } from '../src/types/database'

async function watchBingo() {
  const seenMarks = new Set<string>(
    (await get(`bingo_marks?select=id`)).map((m: { id: string }) => m.id),
  )
  let lastSquareReaction = 0
  let squaresCache: Map<number, string> | null = null

  const squareText = async (id: number) => {
    if (!squaresCache) {
      squaresCache = new Map(
        (await get(`bingo_squares?show_pack_id=eq.${room.show_pack_id}&select=id,text`))
          .map((s: {id:number;text:string}) => [s.id, s.text]),
      )
    }
    return squaresCache.get(id) ?? null
  }

  log(`bingo watch live — ${seenMarks.size} existing marks baselined`)
  for (;;) {
    await new Promise((r) => setTimeout(r, 12_000))
    try {
      const marks = await get(`bingo_marks?select=id,card_id,square_index,status,marked_at&order=marked_at.desc&limit=30`)
      for (const mark of marks) {
        if (seenMarks.has(mark.id) || mark.status !== 'approved') continue
        seenMarks.add(mark.id)
        setTimeout(() => {
          void handleMark(mark)
            .catch((error) => log(`bingo handling failed: ${String(error).slice(0, 100)}`))
        }, 10_000) // undo grace
      }
    } catch (e) { log(`bingo transient: ${String(e).slice(0, 60)}`) }
  }

  async function handleMark(mark: BingoMarkRow) {
    const [still] = await get(`bingo_marks?id=eq.${mark.id}&select=id,status`)
    if (!still || still.status !== 'approved') return // undone or withdrawn during grace
    const [card] = await get(`bingo_cards?id=eq.${mark.card_id}&select=id,room_id,player_id,squares`)
    if (!card || card.room_id !== RID) return
    const [player] = await get(`players?id=eq.${card.player_id}&select=name`)
    const squareId = (card.squares as number[])[mark.square_index]
    const text = squareId ? await squareText(squareId) : null
    if (!player || !text) return

    const approved = await get(
      `bingo_marks?card_id=eq.${card.id}&status=eq.approved&select=id,card_id,square_index,status,marked_at`,
    ) as BingoMarkRow[]
    const isLine = didBingoMarkCompleteLine(mark, approved)

    const announcementKey = buildBingoReactionKey(mark.id, 'announcement')
    let announcementClaimed = false
    let announcementCompleted = false
    try {
      announcementClaimed = await claimChatReaction(announcementKey)
      if (announcementClaimed) {
        announcementCompleted = await completeChatReaction(announcementKey, [{
          companion_id: 'system',
          text: isLine
            ? `BINGO — ${player.name} completes a line: "${text}"`
            : `${player.name} marked: "${text}"`,
        }])
      }
    } finally {
      if (announcementClaimed && !announcementCompleted) {
        await releaseReaction(announcementKey)
      }
    }

    if (!isLine) {
      if (Date.now() - lastSquareReaction < 150_000) return
      if (Math.random() > 0.45) return
    }
    lastSquareReaction = Date.now()
    const spoken = await spokenCompanionIds()
    if (spoken.length === 0) return
    const who = spoken[Math.floor(Math.random() * spoken.length)]
    const reactionKey = buildBingoReactionKey(mark.id, 'reaction')
    let claimed = false
    let completed = false
    try {
      claimed = await claimChatReaction(reactionKey)
      if (!claimed) return
      const prompt = buildBingoReactionPrompt(who, player.name, text, isLine ? 'line' : 'square')
      const grounded = await groundedCompanionBatch({
        system: prompt.system,
        user: prompt.user,
        facts: prompt.groundingFacts,
        model: 'claude-sonnet-5',
        maxTokens: 400,
        maxRetries: 2,
        expectedCompanionIds: prompt.expectedCompanionIds,
        allowEmptyBatch: true,
        caller: groundingCaller,
      })
      if (grounded.findings.length > 0) {
        if (room.host_id) {
          await rpc<string>('record_companion_grounding_review', {
            p_room_id: RID,
            p_actor_player_id: room.host_id,
            p_reaction_key: reactionKey,
            p_surface: 'bingo',
            p_engine: 'daemon',
            p_facts: prompt.groundingFacts,
            p_attempted_messages: grounded.messages,
            p_findings: grounded.findings,
            p_attempts: grounded.attempts,
            p_model: 'claude-sonnet-5',
          })
        }
        log(`bingo ${isLine ? 'LINE' : 'square'} for ${player.name}: blocked by grounding`)
        return
      }
      if (grounded.messages.length === 0) return
      completed = await completeChatReaction(reactionKey, grounded.messages)
      if (completed) {
        log(`bingo ${isLine ? 'LINE' : 'square'} for ${player.name}: "${text.slice(0, 40)}" ${isLine ? '(celebrated)' : '(commented)'}`)
      }
    } finally {
      if (claimed && !completed) await releaseReaction(reactionKey)
    }
  }
}
runWatcher('bingo watch', watchBingo)

// ─── Chat watch — the cast answers when spoken to, phone-independent ─────────
// useChatReactivity (mentions, ambient) is host-tab-only: with the phone
// locked, a player asking Tyrion a question got silence — the most personal
// feature dead at the moment it matters. Haiku generates on this path because
// the human is actively waiting; Sonnet performs the shared factual audit.
import { buildChatReactivePrompt } from '../src/lib/companion-prompts'
import { detectMentions, detectAmbientTrigger, shouldFireAmbient } from '../src/lib/chat-reactivity-utils'

async function watchChat() {
  const seenMsgs = new Set<string>(
    (await get(`messages?room_id=eq.${RID}&select=id`)).map((m: { id: string }) => m.id),
  )
  const players: { id: string; name: string }[] = await get(`players?room_id=eq.${RID}&select=id,name`)
  const playerIds = new Set(players.map((p) => p.id))
  const lastReply = new Map<string, number>()
  let lastAmbient = 0
  const recent: { player_id: string; text: string }[] = []

  log(`chat watch live — ${seenMsgs.size} messages baselined, answering as of now`)
  for (;;) {
    await new Promise((r) => setTimeout(r, 5_000))
    try {
      const msgs = await get(`messages?room_id=eq.${RID}&select=id,player_id,text,created_at&order=created_at.desc&limit=12`)
      for (const m of [...msgs].reverse()) {
        if (seenMsgs.has(m.id)) continue
        seenMsgs.add(m.id)
        recent.push({ player_id: m.player_id, text: m.text })
        if (recent.length > 10) recent.shift()
        if (!playerIds.has(m.player_id)) continue // humans only
        const sender = players.find((p) => p.id === m.player_id)!

        const mentioned = detectMentions(m.text)
        let target: string | null = null
        let kind: 'mention' | 'ambient' = 'mention'
        if (mentioned.length) {
          target = mentioned.find((id) => Date.now() - (lastReply.get(id) ?? 0) > 20_000) ?? null
        } else {
          const trig = detectAmbientTrigger(m.text)
          if (trig && Date.now() - lastAmbient > 60_000 && shouldFireAmbient(trig)) {
            target = trig.companions[Math.floor(Math.random() * trig.companions.length)]
            kind = 'ambient'
            lastAmbient = Date.now()
          }
        }
        if (!target) continue
        lastReply.set(target, Date.now())

        const reactionKey = buildCompanionReactionKey(
          m.id,
          kind,
          target,
        )
        let claimed = false
        let completed = false
        try {
          claimed = await claimChatReaction(reactionKey)
          if (!claimed) continue

          const prompt = buildChatReactivePrompt(
            target, { messageId: m.id, playerName: sender.name, text: m.text },
            recent as never, { leaderboard: [], announcedCount: seen.size }, kind,
          )
          const grounded = await groundedCompanionBatch({
            system: prompt.system,
            user: prompt.user,
            facts: prompt.groundingFacts,
            model: 'claude-haiku-4-5',
            maxTokens: 200,
            maxRetries: 1,
            expectedCompanionIds: [target],
            allowEmptyBatch: true,
            caller: groundingCaller,
          })
          if (grounded.findings.length > 0) {
            if (room.host_id) {
              await rpc<string>('record_companion_grounding_review', {
                p_room_id: RID,
                p_actor_player_id: room.host_id,
                p_reaction_key: reactionKey,
                p_surface: 'chat',
                p_engine: 'daemon',
                p_facts: prompt.groundingFacts,
                p_attempted_messages: grounded.messages,
                p_findings: grounded.findings,
                p_attempts: grounded.attempts,
                p_model: 'claude-haiku-4-5',
              })
            }
            log(`${kind}: ${sender.name} -> ${target} blocked by grounding`)
            continue
          }
          if (grounded.messages.length === 0) continue
          completed = await completeChatReaction(reactionKey, grounded.messages)
          if (completed) log(`${kind}: ${sender.name} -> ${target} answered`)
        } finally {
          if (claimed && !completed) await releaseReaction(reactionKey)
        }
      }
    } catch (e) { log(`chat transient: ${String(e).slice(0, 60)}`) }
  }
}
runWatcher('chat watch', watchChat)

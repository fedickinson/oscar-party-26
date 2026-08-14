import type {
  PackRuntimeNarrativeCast,
  RuntimeIdentityChangeVoice,
  RuntimeMilestone,
  RuntimeNarrativeVoice,
} from './runtime-narrative'
import type { PlayerAward } from './night-awards'
import type { ScoredPlayer } from './scoring'
import type { VerdictSlotContract } from './verdict-response'
import type {
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  GameModel,
  NomineeRow,
  PlayerRow,
} from '../types/database'

export interface RuntimeNarrativePrompt {
  system: string
  user: string
  groundingFacts: string[]
  expectedCompanionIds: string[]
  expectedDelaySeconds?: number[]
}

function voiceBlock(voice: RuntimeNarrativeVoice): string {
  const attitudes = voice.attitudeFacts.length === 0
    ? 'Source-material attitudes: none authored.'
    : `Source-material attitudes (expression only):\n${voice.attitudeFacts
        .map((fact) => `- ${fact}`)
        .join('\n')}`
  return `${voice.name} (id "${voice.id}", ${voice.role}, ${voice.slot})
Expression instruction: ${voice.instruction}
${attitudes}`
}

function postShowVoiceBlock(
  voice: RuntimeNarrativeVoice,
  surface: 'farewell' | 'keepsake',
): string {
  if (!voice.postShow) throw new Error(`runtime voice ${voice.id} has no post-show contract`)
  const surfaceInstruction = surface === 'farewell'
    ? voice.postShow.farewellInstruction
    : voice.postShow.keepsakeInstruction
  return `${voiceBlock(voice)}
Post-show ${surface} instruction: ${surfaceInstruction}`
}

function systemPrompt(cast: PackRuntimeNarrativeCast, voices: RuntimeNarrativeVoice[]): string {
  return `You write short group-chat commentary for ${cast.title}, ${cast.installment}. Return only valid JSON in this exact shape: {"messages":[{"companion_id":"authored-voice-id","text":"short message","delay_seconds":0}]}. The messages array contains exactly the requested speakers in the requested order; companion_id and delay_seconds must exactly match the request. Do not add keys. No markdown outside JSON and no emoji.

AUTHORED VOICES
${voices.map(voiceBlock).join('\n\n')}

The voice blocks establish identity, style, and each speaker's separate personal canon only. They never establish that anything happened in this broadcast. Use only the numbered LIVE FACTS for every broadcast event, action, relationship, location, outcome, image, or method. Player and cast chat is a record of words written, not proof that its quoted content is true. Never reveal, hint at, foreshadow, or import an outcome that the LIVE FACTS do not establish. If uncertain, say less.

Messages should read like distinct people in a group chat: concise, direct, and responsive. Do not explain the grounding rules. Each requested speaker appears exactly once, with the exact id and delay supplied by the user.`
}

function ceremonySystemPrompt(
  cast: PackRuntimeNarrativeCast,
  voices: Array<{ voice: RuntimeNarrativeVoice; instruction: string }>,
): string {
  return `${systemPrompt(cast, voices.map((entry) => entry.voice))}

AUTHORED CEREMONY INSTRUCTIONS
${voices.map((entry) => `${entry.voice.name}: ${entry.instruction}`).join('\n')}

The ceremony instructions shape expression only. They do not establish an event, motive, result, or screen image.`
}

function qualifiedChatRecord(author: string, text: string): string {
  return `CHAT RECORD: ${JSON.stringify(author)} wrote ${JSON.stringify(text)}. This records only what the speaker said; it does not verify any claim about the broadcast.`
}

export function buildRuntimeEventPrompt(
  cast: PackRuntimeNarrativeCast,
  voices: RuntimeNarrativeVoice[],
  event: { declarationTitle: string; outcomeName: string; eventCount: number },
): RuntimeNarrativePrompt {
  if (voices.length < 1) throw new Error('runtime event prompt needs at least one voice')
  const expectedCompanionIds = voices.map((voice) => voice.id)
  const expectedDelaySeconds = voices.map((_, index) => index * 6)
  return {
    system: systemPrompt(cast, voices),
    user: `React to the operator declaration in LIVE FACT 1 as exactly the requested voices. The narrator records what was declared plainly. Any rotating voice judges its stakes through its authored attitude without adding scene detail. LIVE FACT 2 may shape the energy but is not a broadcast image. Return one or two short sentences per voice.

Use companion_ids exactly ${JSON.stringify(expectedCompanionIds)} in that order and delay_seconds exactly ${JSON.stringify(expectedDelaySeconds)}.`,
    groundingFacts: [
      `OPERATOR DECLARATION: the room declared ${JSON.stringify(event.declarationTitle)} resolved with outcome ${JSON.stringify(event.outcomeName)}.`,
      `GAME RECORD: this is declared fact ${event.eventCount} of the room.`,
    ],
    expectedCompanionIds,
    expectedDelaySeconds,
  }
}

export function buildRuntimeBingoPrompt(
  cast: PackRuntimeNarrativeCast,
  voice: RuntimeNarrativeVoice,
  playerName: string,
  squareText: string,
  kind: 'square' | 'line',
): RuntimeNarrativePrompt {
  return {
    system: systemPrompt(cast, [voice]),
    user: kind === 'line'
      ? 'React to the completed bingo line in LIVE FACT 2 in one or two short sentences. Name the recorded player and optionally judge the exact declared screen condition in LIVE FACT 1. Do not explain bingo or add scene detail. Return exactly one message at delay_seconds 0.'
      : 'React to the exact approved screen condition in LIVE FACT 1 in one or two short sentences. The player record in LIVE FACT 2 is secondary. Do not add scene detail. Return exactly one message at delay_seconds 0.',
    groundingFacts: [
      `LIVE DECLARATION: the approved bingo mark declares that ${JSON.stringify(squareText)} happened on screen.`,
      kind === 'line'
        ? `GAME RECORD: ${JSON.stringify(playerName)} completed a bingo line; LIVE FACT 1 was the square that completed it.`
        : `GAME RECORD: ${JSON.stringify(playerName)} marked the approved bingo condition in LIVE FACT 1.`,
    ],
    expectedCompanionIds: [voice.id],
    expectedDelaySeconds: [0],
  }
}

export function buildRuntimeChatPrompt(
  cast: PackRuntimeNarrativeCast,
  voice: RuntimeNarrativeVoice,
  trigger: { messageId: string; playerName: string; text: string },
  recentMessages: Array<{ player_id: string; text: string }>,
  eventCount: number,
  kind: 'mention' | 'ambient',
): RuntimeNarrativePrompt {
  const groundingFacts = [
    qualifiedChatRecord(trigger.playerName, trigger.text),
    ...recentMessages.slice(-8).map((message) => (
      qualifiedChatRecord(message.player_id, message.text)
    )),
    `GAME RECORD: ${eventCount} events have been declared so far in this room.`,
  ]
  return {
    system: systemPrompt(cast, [voice]),
    user: kind === 'mention'
      ? 'The player in LIVE FACT 1 directly addressed this voice. Answer what they wrote, use the recorded player name, and stay inside what the chat record actually proves. One to three short sentences. Return exactly one message at delay_seconds 0.'
      : 'Reply naturally to the tone of LIVE FACT 1 without promoting quoted speculation into a broadcast fact. Addressing the recorded player is optional. One to three short sentences. Return exactly one message at delay_seconds 0.',
    groundingFacts,
    expectedCompanionIds: [voice.id],
    expectedDelaySeconds: [0],
  }
}

export function buildRuntimePreShowPrompt(
  cast: PackRuntimeNarrativeCast,
  voice: RuntimeNarrativeVoice,
  context: {
    playerNames: string[]
    draftRosters: Array<{ playerName: string; entityNames: string[] }>
    recentMessages: Array<{ player_id: string; text: string }>
  },
): RuntimeNarrativePrompt {
  return {
    system: systemPrompt(cast, [voice]),
    user: 'Take this voice’s one pre-show arrival slot. Introduce its perspective without announcing its name. The room is waiting; no broadcast event has been established. You may acknowledge exact room or chat records, but never promote chat into screen truth. Use one to three short sentences and return exactly one message at delay_seconds 0.',
    groundingFacts: [
      'ROOM RECORD: playback has not begun and this voice has not yet entered durable chat. This establishes no screen event.',
      context.playerNames.length > 0
        ? `ROOM RECORD: the complete player roster contains exactly ${JSON.stringify(context.playerNames)}.`
        : 'ROOM RECORD: the player roster is empty.',
      context.draftRosters.length > 0
        ? `GAME RECORD: drafted rosters contain exactly ${JSON.stringify(context.draftRosters)}.`
        : 'GAME RECORD: no drafted roster is recorded.',
      ...context.recentMessages.slice(-6).map((message) => qualifiedChatRecord(
        message.player_id,
        message.text,
      )),
    ],
    expectedCompanionIds: [voice.id],
    expectedDelaySeconds: [0],
  }
}

export function buildRuntimeShowStartedPrompt(
  cast: PackRuntimeNarrativeCast,
  voices: RuntimeNarrativeVoice[],
  playerNames: string[],
): RuntimeNarrativePrompt {
  const expectedCompanionIds = voices.map((voice) => voice.id)
  const expectedDelaySeconds = voices.map((_, index) => index * 6)
  return {
    system: systemPrompt(cast, voices),
    user: `Mark the transition from waiting to watching in exactly the requested voices. The narrator opens the account; any rotating voice adds a brief expectation grounded only in personal attitude. Do not imply that anything has appeared on screen. Return one or two short sentences per voice with ids ${JSON.stringify(expectedCompanionIds)} and delays ${JSON.stringify(expectedDelaySeconds)}.`,
    groundingFacts: [
      'ROOM RECORD: shared playback began. This establishes no particular broadcast image, dialogue, character, location, or event.',
      playerNames.length > 0
        ? `ROOM RECORD: the complete watching roster contains exactly ${JSON.stringify(playerNames)}.`
        : 'ROOM RECORD: the watching roster is empty.',
    ],
    expectedCompanionIds,
    expectedDelaySeconds,
  }
}

export function buildRuntimeMilestonePrompt(
  cast: PackRuntimeNarrativeCast,
  milestone: RuntimeMilestone,
  eventCount: number,
  leaderboard: ScoredPlayer[],
): RuntimeNarrativePrompt {
  if (!Number.isInteger(eventCount) || eventCount < milestone.declaredEventCount) {
    throw new Error(`runtime milestone ${milestone.id} has not been reached`)
  }
  if (milestone.voices.length < 1) {
    throw new Error(`runtime milestone ${milestone.id} needs at least one voice`)
  }
  const expectedCompanionIds = milestone.voices.map((entry) => entry.voice.id)
  const expectedDelaySeconds = milestone.voices.map((entry) => entry.delaySeconds)
  const standings = leaderboard.map((entry) => ({
    rank: entry.rank,
    playerName: entry.player.name,
    totalScore: entry.totalScore,
    commitmentScore: entry.confidenceScore,
    identityScore: entry.ensembleScore,
    bingoScore: entry.bingoScore,
  }))
  return {
    system: ceremonySystemPrompt(cast, milestone.voices),
    user: `Mark the authored ${JSON.stringify(milestone.id)} checkpoint in exactly the requested voices and order. Treat the standings as a game record, not a broadcast image. Do not invent why a player is leading or what happens next. Return one or two short sentences per voice with ids ${JSON.stringify(expectedCompanionIds)} and delays ${JSON.stringify(expectedDelaySeconds)}.`,
    groundingFacts: [
      `GAME RECORD: the room has ${eventCount} declared events; authored checkpoint ${JSON.stringify(milestone.id)} begins at ${milestone.declaredEventCount}.`,
      standings.length > 0
        ? `GAME RECORD: the complete current standings are ${JSON.stringify(standings)}.`
        : 'GAME RECORD: the current standings are empty.',
    ],
    expectedCompanionIds,
    expectedDelaySeconds,
  }
}

export function buildRuntimeIdentityChangePrompt(
  cast: PackRuntimeNarrativeCast,
  selected: RuntimeIdentityChangeVoice,
  context: {
    playerName: string
    previousChoice: string
    choice: string
    revision: number
    rosterNames: string[]
  },
): RuntimeNarrativePrompt {
  if (!Number.isInteger(context.revision) || context.revision < 1) {
    throw new Error('runtime identity change revision must be a positive integer')
  }
  if (!context.previousChoice || !context.choice || context.previousChoice === context.choice) {
    throw new Error('runtime identity change needs two different authored choices')
  }
  return {
    system: ceremonySystemPrompt(cast, [selected]),
    user: 'React to the recorded identity revision in LIVE FACT 1. State or judge only the public change. Do not invent a motive, private allegiance, future behavior, or screen event. Return one or two short sentences and exactly one message at delay_seconds 0.',
    groundingFacts: [
      `GAME RECORD: ${JSON.stringify(context.playerName)} changed identity choice from ${JSON.stringify(context.previousChoice)} to ${JSON.stringify(context.choice)} at revision ${context.revision}. This records a player choice, not a motive or broadcast fact.`,
      context.rosterNames.length > 0
        ? `GAME RECORD: ${JSON.stringify(context.playerName)} has exactly this drafted roster: ${JSON.stringify(context.rosterNames)}.`
        : `GAME RECORD: ${JSON.stringify(context.playerName)} has no drafted roster.`,
    ],
    expectedCompanionIds: [selected.voice.id],
    expectedDelaySeconds: [0],
  }
}

export function buildRuntimeSpotlightPrompt(
  cast: PackRuntimeNarrativeCast,
  voices: RuntimeNarrativeVoice[],
  spotlight: {
    revision: number
    label: string
    candidates: string[]
    wagers: Array<{ playerName: string; outcomeName: string; conviction: number }>
  },
): RuntimeNarrativePrompt {
  if (!Number.isInteger(spotlight.revision) || spotlight.revision < 1) {
    throw new Error('runtime spotlight revision must be a positive integer')
  }
  const expectedCompanionIds = voices.map((voice) => voice.id)
  const expectedDelaySeconds = voices.map((_, index) => index * 6)
  return {
    system: systemPrompt(cast, voices),
    user: `Open the operator’s active question in exactly the requested voices. The narrator states the question plainly; any rotating voice may judge the possibility or one recorded wager. A spotlight is not a declaration that its wording happened. Return ids ${JSON.stringify(expectedCompanionIds)} and delays ${JSON.stringify(expectedDelaySeconds)}.`,
    groundingFacts: [
      `ROOM RECORD: spotlight revision ${spotlight.revision} opened operator question ${JSON.stringify(spotlight.label)}. This does not establish an outcome or screen event.`,
      spotlight.candidates.length > 0
        ? `CATALOG RECORD: its complete candidate roster is ${JSON.stringify(spotlight.candidates)}.`
        : 'CATALOG RECORD: the spotlight has no candidate roster.',
      spotlight.wagers.length > 0
        ? `GAME RECORD: its complete player wager record is ${JSON.stringify(spotlight.wagers)}.`
        : 'GAME RECORD: no player wager is attached to the spotlight.',
    ],
    expectedCompanionIds,
    expectedDelaySeconds,
  }
}

export function buildRuntimeWelcomePrompt(
  cast: PackRuntimeNarrativeCast,
  voice: RuntimeNarrativeVoice,
  player: {
    playerName: string
    rosterNames: string[]
  },
): RuntimeNarrativePrompt {
  return {
    system: systemPrompt(cast, [voice]),
    user: 'Give the recorded player one concise arrival welcome. Address their exact name and optionally acknowledge one drafted entity. These are game records, not broadcast events. Return exactly one message at delay_seconds 0.',
    groundingFacts: [
      `ROOM RECORD: the welcome slot belongs to player ${JSON.stringify(player.playerName)}.`,
      player.rosterNames.length > 0
        ? `GAME RECORD: that player’s drafted roster is exactly ${JSON.stringify(player.rosterNames)}.`
        : 'GAME RECORD: that player’s drafted roster is empty.',
    ],
    expectedCompanionIds: [voice.id],
    expectedDelaySeconds: [0],
  }
}

export interface RuntimePostShowContext {
    playerNames: string[]
    standings: Array<{
      rank: number
      playerName: string
      totalScore: number
      commitmentScore: number
      identityScore: number
      bingoScore: number
    }>
    declarations: Array<{ title: string; outcome: string }>
    commitments: Array<{
      playerName: string
      label: string
      weight: number
      result: 'correct' | 'incorrect' | 'unresolved'
    }>
}

export function projectRuntimePostShowContext(input: {
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks: ConvictionPickRow[]
  gameModel: GameModel
}): RuntimePostShowContext {
  return {
    playerNames: input.players.map((player) => player.name),
    standings: input.leaderboard.map((entry) => ({
      rank: entry.rank,
      playerName: entry.player.name,
      totalScore: entry.totalScore,
      commitmentScore: entry.confidenceScore,
      identityScore: entry.ensembleScore,
      bingoScore: entry.bingoScore,
    })),
    declarations: input.categories.flatMap((category) => {
      if (!category.winner_id) return []
      const outcomes = [category.winner_id, category.tie_winner_id]
        .filter((id): id is string => id != null)
        .map((id) => input.nominees.find((nominee) => nominee.id === id)?.name)
        .filter((name): name is string => name != null)
      return outcomes.length === 0 ? [] : [{ title: category.name, outcome: outcomes.join(' and ') }]
    }),
    commitments: input.gameModel === 'conviction_portfolio'
      ? input.convictionPicks.flatMap((pick) => {
          const player = input.players.find((candidate) => candidate.id === pick.player_id)
          const declaration = input.categories.find((category) =>
            category.source_signature_beat_id === pick.beat_id && category.winner_id != null)
          const authored = input.categories.find((category) =>
            category.source_signature_beat_id === pick.beat_id)
          return player ? [{
            playerName: player.name,
            label: declaration?.name ?? authored?.name ?? `authored beat ${pick.beat_id}`,
            weight: 1,
            result: declaration ? 'correct' as const : 'unresolved' as const,
          }] : []
        })
      : input.confidencePicks.flatMap((pick) => {
          const player = input.players.find((candidate) => candidate.id === pick.player_id)
          const category = input.categories.find((candidate) => candidate.id === pick.category_id)
          return player && category ? [{
            playerName: player.name,
            label: category.name,
            weight: pick.confidence,
            result: pick.is_correct === true
              ? 'correct' as const
              : pick.is_correct === false ? 'incorrect' as const : 'unresolved' as const,
          }] : []
        }),
  }
}

export function buildRuntimePostShowPrompt(
  cast: PackRuntimeNarrativeCast,
  context: RuntimePostShowContext,
): RuntimeNarrativePrompt {
  if (!cast.postShow) throw new Error('runtime post-show prompt needs an authored post-show cast')
  const voices = cast.postShow.voices
  const expectedCompanionIds = voices.map((voice) => voice.id)
  const expectedDelaySeconds = voices.map((voice) => voice.postShow!.farewellDelaySeconds)
  const system = `You write the final group-chat curtain call for ${cast.title}, ${cast.installment}. Return only valid JSON in this exact shape: {"messages":[{"companion_id":"authored-voice-id","text":"short message","delay_seconds":0}]}. The messages array contains exactly the requested speakers in the requested order; companion_id and delay_seconds must exactly match the request. Do not add keys. No markdown outside JSON and no emoji.

AUTHORED POST-SHOW VOICES
${voices.map((voice) => postShowVoiceBlock(voice, 'farewell')).join('\n\n')}

Voice and source-material attitude blocks govern expression only. They establish no broadcast event. Use only numbered LIVE FACTS for the room, declarations, commitments, standings, and player actions. A declaration records what the room resolved; chat and authored labels do not independently prove any other screen detail. Never invent motive, emotion, dialogue, relationship, location, method, source-material outcome, or future event. If the record is thin, say less.`
  return {
    system,
    user: `Close the provisional room record in exactly the authored post-show voices. Follow each voice's separate farewell instruction while making the batch feel like one curtain call. Acknowledge only players, declarations, commitments, and standings established in the LIVE FACTS. Use companion_ids exactly ${JSON.stringify(expectedCompanionIds)} and delay_seconds exactly ${JSON.stringify(expectedDelaySeconds)}.`,
    groundingFacts: [
      'ROOM RECORD: the room entered its provisional finished phase. This closes the live game ledger but establishes no additional broadcast fact.',
      context.playerNames.length > 0
        ? `ROOM RECORD: the complete player roster is exactly ${JSON.stringify(context.playerNames)}.`
        : 'ROOM RECORD: the complete player roster is empty.',
      context.standings.length > 0
        ? `GAME RECORD: the complete final standings are exactly ${JSON.stringify(context.standings)}.`
        : 'GAME RECORD: the complete final standings are empty.',
      context.declarations.length > 0
        ? `DECLARED FACT RECORD: the complete resolved declaration ledger is exactly ${JSON.stringify(context.declarations)}.`
        : 'DECLARED FACT RECORD: no declaration was resolved.',
      context.commitments.length > 0
        ? `GAME RECORD: the complete commitment result ledger is exactly ${JSON.stringify(context.commitments)}.`
        : 'GAME RECORD: no commitment result is recorded.',
    ],
    expectedCompanionIds,
    expectedDelaySeconds,
  }
}

export interface RuntimeVerdictLineCandidate {
  messageId: string
  author: string
  text: string
}

export interface RuntimeVerdictsPrompt {
  system: string
  user: string
  slots: Map<number, string>
  groundingFacts: string[]
  slotContracts: VerdictSlotContract[]
}

export function buildRuntimeVerdictsPrompt(
  cast: PackRuntimeNarrativeCast,
  awards: PlayerAward[],
  leaderboard: ScoredPlayer[],
  authors: Map<string, string>,
  lineCandidates: Map<string, RuntimeVerdictLineCandidate[]> = new Map(),
): RuntimeVerdictsPrompt {
  if (!cast.postShow) throw new Error('runtime keepsakes need an authored post-show cast')
  if (awards.length < 1 || awards.length > 7) {
    throw new Error('runtime keepsake generation requires one through seven player awards')
  }
  if (new Set(awards.map((award) => award.playerId)).size !== awards.length) {
    throw new Error('runtime keepsake player awards must be unique')
  }
  const voiceById = new Map(cast.postShow.voices.map((voice) => [voice.id, voice]))
  const usedVoiceIds = [...new Set(awards.map((award) => authors.get(award.playerId) ?? ''))]
  if (usedVoiceIds.some((voiceId) => !voiceById.has(voiceId))) {
    throw new Error('runtime keepsake author assignment names a voice outside the post-show cast')
  }
  const slots = new Map<number, string>()
  const groundingFacts = [
    'ROOM RECORD: this keepsake generation belongs to the room\'s provisional finished phase. The game ledger is final for this generation, but this establishes no additional broadcast fact.',
  ]
  const slotContracts: VerdictSlotContract[] = []
  const packRecords = (prefix: string, records: Array<Record<string, unknown>>, caveat: string) => {
    let chunk: Array<Record<string, unknown>> = []
    for (const record of records) {
      const candidate = [...chunk, record]
      const rendered = `${prefix} ${JSON.stringify(candidate)}. ${caveat}`
      if (rendered.length <= 2000) {
        chunk = candidate
        continue
      }
      if (chunk.length === 0) throw new Error('runtime keepsake grounding record exceeds the fact limit')
      groundingFacts.push(`${prefix} ${JSON.stringify(chunk)}. ${caveat}`)
      chunk = [record]
    }
    if (chunk.length > 0) groundingFacts.push(`${prefix} ${JSON.stringify(chunk)}. ${caveat}`)
  }

  awards.forEach((award, index) => {
    const slot = index + 1
    const entry = leaderboard.find((candidate) => candidate.player.id === award.playerId)
    if (!entry) throw new Error(`runtime keepsake slot ${slot} needs a canonical leaderboard entry`)
    const authorId = authors.get(award.playerId)
    const author = authorId ? voiceById.get(authorId) : undefined
    if (!author) throw new Error(`runtime keepsake slot ${slot} needs an assigned post-show voice`)
    slots.set(slot, award.playerId)
    groundingFacts.push(
      `GAME RECORD: keepsake slot ${slot} contains exactly ${JSON.stringify({
        player: award.playerName,
        assigned_companion_id: author.id,
        assigned_companion_name: author.name,
        standing: {
          rank: entry.rank,
          total: entry.totalScore,
          commitment: entry.confidenceScore,
          identity: entry.ensembleScore,
          bingo: entry.bingoScore,
          correct_commitments: entry.correctPickCount,
          highest_correct_weight: entry.topCorrectPick,
        },
        deterministic_award: {
          working_title: award.title,
          blurb: award.blurb,
          stat: award.stat,
        },
      })}. The award is a deterministic game summary, not independent evidence about the broadcast.`,
    )
    const candidates = lineCandidates.get(award.playerId) ?? []
    if (candidates.length === 0) {
      groundingFacts.push(`CHAT RECORD: keepsake slot ${slot} has no qualified chat highlight candidates.`)
    } else {
      packRecords(
        `CHAT RECORD: keepsake slot ${slot} may choose highlights only from`,
        candidates.map((candidate) => ({
          message_id: candidate.messageId,
          author: candidate.author,
          text: candidate.text.length > 600 ? candidate.text.slice(0, 600) : candidate.text,
          text_is_excerpt: candidate.text.length > 600,
        })),
        'This records only what each speaker wrote and does not verify the quoted content as broadcast truth.',
      )
    }
    slotContracts.push({
      slot,
      playerId: award.playerId,
      companionId: author.id,
      allowedMessageIds: candidates.map((candidate) => candidate.messageId),
      allowedImageSlugs: [],
    })
  })
  if (groundingFacts.length > 100) {
    throw new Error('runtime keepsake grounding projection exceeds the one-hundred-fact review contract')
  }
  const usedVoices = usedVoiceIds.map((voiceId) => voiceById.get(voiceId)!)
  const system = `You write end-of-night keepsake verdicts for ${cast.title}, ${cast.installment}. Return only valid JSON in this exact shape: {"verdicts":[{"slot":1,"title":"short title","text":"short verdict","highlights":[{"message_id":"exact-id","note":"short note"}],"imagery":[]}]}. Return no markdown outside JSON and no emoji.

AUTHORED KEEPSAKE VOICES
${usedVoices.map((voice) => postShowVoiceBlock(voice, 'keepsake')).join('\n\n')}

Each slot's assigned voice must write only that slot. Voice and source-material attitude blocks govern expression, never broadcast truth. Every claim about the night must come from the numbered LIVE FACTS. Chat records prove only what was written. Do not invent motive, emotion, dialogue, screen action, relationship, location, source-material outcome, score cause, or future event.`
  const user = `Write exactly one keepsake verdict for every numbered slot, in ascending order.

- Use only that slot's GAME RECORD and CHAT RECORD.
- Write a distinct two-to-four-word title and a two-to-three-sentence second-person verdict.
- Choose zero to four highlight message_ids only from that slot's candidates.
- Return imagery as an empty array. This pack has no authored keepsake artwork contract.
- When a fact is absent, unresolved, or excerpted, say less.

Return exactly ${awards.length} verdict${awards.length === 1 ? '' : 's'} in the documented JSON shape. Slots and titles must be unique and complete.`
  return { system, user, slots, groundingFacts, slotContracts }
}

import { isCompanionId } from '../data/ai-companions'

export interface GmPulsePlayer {
  id: string
  name: string
  is_host: boolean
  team: string | null
}

export interface GmPulseMessage {
  id: string
  player_id: string
  text: string
  created_at: string
}

export interface GmPulseCard {
  id: string
  player_id: string
}

export interface GmPulseMark {
  id: string
  card_id: string
}

export interface GmPulsePlayerActivity {
  player: GmPulsePlayer
  last_chat_at: string | null
  declaration_count: number | null
  declaration_attribution: 'exact' | 'ambiguous_name'
  mark_count: number
}

export interface GmPulseReport {
  players: GmPulsePlayerActivity[]
  recent_facts: GmPulseMessage[]
  last_companion_at: string | null
}

interface GmPulseInput {
  players: GmPulsePlayer[]
  messages: GmPulseMessage[]
  cards: GmPulseCard[]
  marks: GmPulseMark[]
  castIds?: string[]
}

function compareChronology(left: GmPulseMessage, right: GmPulseMessage): number {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
}

function latest(messages: GmPulseMessage[]): GmPulseMessage | null {
  return messages.reduce<GmPulseMessage | null>((current, message) => (
    current === null || compareChronology(current, message) < 0 ? message : current
  ), null)
}

/**
 * Derives the operator readout only from complete room-scoped inputs. The
 * database does not retain declaration actor IDs, so duplicate display names
 * make text-banner attribution explicitly ambiguous rather than doubly owned.
 */
export function deriveGmPulseReport(input: GmPulseInput): GmPulseReport {
  const nameCounts = new Map<string, number>()
  for (const player of input.players) {
    nameCounts.set(player.name, (nameCounts.get(player.name) ?? 0) + 1)
  }

  const cardsById = new Map(input.cards.map((card) => [card.id, card]))
  const markCounts = new Map<string, number>()
  for (const mark of input.marks) {
    const card = cardsById.get(mark.card_id)
    if (!card) continue
    markCounts.set(card.player_id, (markCounts.get(card.player_id) ?? 0) + 1)
  }

  const players = input.players.map((player): GmPulsePlayerActivity => {
    const hasDuplicateName = (nameCounts.get(player.name) ?? 0) > 1
    const declarationCount = hasDuplicateName
      ? null
      : input.messages.filter((message) => (
          message.player_id === 'winner-divider'
          && message.text.endsWith(`called by ${player.name}`)
        )).length
    return {
      player,
      last_chat_at: latest(input.messages.filter((message) => message.player_id === player.id))
        ?.created_at ?? null,
      declaration_count: declarationCount,
      declaration_attribution: hasDuplicateName ? 'ambiguous_name' : 'exact',
      mark_count: markCounts.get(player.id) ?? 0,
    }
  })

  const facts = input.messages
    .filter((message) => message.player_id === 'winner-divider' || message.player_id === 'system')
    .sort(compareChronology)
  const runtimeIds = input.castIds === undefined ? null : new Set(input.castIds)
  const lastCompanion = latest(input.messages.filter((message) => (
    runtimeIds === null
      ? isCompanionId(message.player_id)
      : runtimeIds.has(message.player_id)
  )))

  return {
    players,
    recent_facts: facts.slice(-6),
    last_companion_at: lastCompanion?.created_at ?? null,
  }
}

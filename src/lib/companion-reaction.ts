import { COMPANION_IDS, PRE_SHOW_COMPANIONS } from '../data/ai-companions'

export type CompanionReactionKind = 'mention' | 'ambient' | 'banter'

const REACTION_PART = /^[a-z0-9_-]+$/

function assertPart(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (!REACTION_PART.test(normalized)) {
    throw new Error(`${label} must contain only lowercase letters, numbers, underscores or hyphens`)
  }
  return normalized
}

export function buildCompanionReactionKey(
  messageId: string,
  kind: CompanionReactionKind,
  companionId?: string,
): string {
  const message = assertPart(messageId, 'message id')
  if (kind === 'ambient') return `chat:${message}:ambient`
  if (!companionId) throw new Error(`${kind} reactions require a companion id`)
  return `chat:${message}:${kind}:${assertPart(companionId, 'companion id')}`
}

export function buildBingoReactionKey(
  markId: string,
  kind: 'announcement' | 'reaction',
): string {
  return `bingo:${assertPart(markId, 'bingo mark id')}:${kind}`
}

export type DeclaredEventMilestone = 'halfway' | 'final_stretch'

export function buildMilestoneReactionKey(type: DeclaredEventMilestone): string {
  return `milestone:${type}`
}

export function buildWelcomeReactionKey(playerId: string): string {
  return `welcome:${assertPart(playerId, 'player id')}`
}

export function buildShowStartedReactionKey(
  kind: 'announcement' | 'reaction',
): string {
  return `ceremony:show_started:${kind}`
}

export function buildPostShowReactionKey(
  kind: 'announcement' | 'reaction',
): string {
  return `ceremony:post_show:${kind}`
}

export function buildVerdictReactionKey(): string {
  return 'keepsake:verdicts:v1'
}

export function buildPreShowArrivalReactionKey(companionId: string): string {
  const companion = assertPart(companionId, 'companion id')
  if (!PRE_SHOW_COMPANIONS.some((candidate) => candidate.id === companion)) {
    throw new Error('pre-show companion must name an authored arrival')
  }
  return `ceremony:pre_show:${companion}`
}

export function buildSpotlightReactionKey(
  spotlightRevision: number,
  kind: 'announcement' | 'reaction',
): string {
  if (!Number.isInteger(spotlightRevision) || spotlightRevision < 1) {
    throw new Error('spotlight revision must be a positive integer')
  }
  return `spotlight:${spotlightRevision}:${kind}`
}

export function buildTeamChangeReactionKey(
  playerId: string,
  teamRevision: number,
  kind: 'announcement' | 'reaction',
): string {
  if (!Number.isInteger(teamRevision) || teamRevision < 1) {
    throw new Error('team revision must be a positive integer')
  }
  return `team:${assertPart(playerId, 'player id')}:${teamRevision}:${kind}`
}

export function isMilestoneScoreboardReady(
  categories: ReadonlyArray<{ id: number; winner_id: string | null }>,
  confidencePicks: ReadonlyArray<{ category_id: number; is_correct: boolean | null }>,
): boolean {
  const resolvedCategoryIds = new Set(
    categories.filter((category) => category.winner_id != null).map((category) => category.id),
  )
  return confidencePicks.every((pick) =>
    !resolvedCategoryIds.has(pick.category_id) || pick.is_correct != null,
  )
}

export function selectSpokenCompanionIds(messagePlayerIds: readonly string[]): string[] {
  return [...new Set(messagePlayerIds.filter((playerId) => COMPANION_IDS.has(playerId)))]
}

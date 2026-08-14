import { describe, expect, it } from 'vitest'
import {
  buildBingoReactionKey,
  buildCompanionReactionKey,
  buildMilestoneReactionKey,
  buildPreShowArrivalReactionKey,
  buildRuntimePreShowArrivalReactionKey,
  buildRuntimeMilestoneReactionKey,
  buildIdentityChangeReactionKey,
  buildPostShowReactionKey,
  buildVerdictReactionKey,
  buildSpotlightReactionKey,
  buildShowStartedReactionKey,
  buildTeamChangeReactionKey,
  buildWelcomeReactionKey,
  isMilestoneScoreboardReady,
  selectSpokenCompanionIds,
} from './companion-reaction'

describe('companion reaction identity', () => {
  it('deduplicates ambient work independently of the randomly chosen voice', () => {
    expect(buildCompanionReactionKey('ABC-123', 'ambient', 'tyrion'))
      .toBe('chat:abc-123:ambient')
  })

  it('keeps separately mentioned companions as separate work', () => {
    expect(buildCompanionReactionKey('abc-123', 'mention', 'tyrion'))
      .not.toBe(buildCompanionReactionKey('abc-123', 'mention', 'cersei'))
  })

  it('rejects malformed identity parts', () => {
    expect(() => buildCompanionReactionKey('abc:123', 'banter', 'tyrion'))
      .toThrow('message id must contain only')
    expect(() => buildCompanionReactionKey('abc-123', 'mention'))
      .toThrow('mention reactions require a companion id')
  })

  it('gives each bingo mark one stable announcement and reaction identity', () => {
    expect(buildBingoReactionKey('MARK-123', 'announcement'))
      .toBe('bingo:mark-123:announcement')
    expect(buildBingoReactionKey('MARK-123', 'reaction'))
      .toBe('bingo:mark-123:reaction')
    expect(() => buildBingoReactionKey('mark:123', 'reaction'))
      .toThrow('bingo mark id must contain only')
  })

  it('gives each declared-event threshold one stable ownership key', () => {
    expect(buildMilestoneReactionKey('halfway')).toBe('milestone:halfway')
    expect(buildMilestoneReactionKey('final_stretch')).toBe('milestone:final_stretch')
  })

  it('gives authored milestones and identity revisions separate durable keys', () => {
    expect(buildRuntimeMilestoneReactionKey('First-Turn'))
      .toBe('milestone:pack:first-turn')
    expect(buildIdentityChangeReactionKey('PLAYER-123', 2, 'announcement'))
      .toBe('identity:player-123:2:announcement')
    expect(buildIdentityChangeReactionKey('PLAYER-123', 2, 'reaction'))
      .toBe('identity:player-123:2:reaction')
    expect(() => buildIdentityChangeReactionKey('player-123', 0, 'reaction'))
      .toThrow('positive integer')
  })

  it('gives each player one stable welcome ownership key', () => {
    expect(buildWelcomeReactionKey('PLAYER-123')).toBe('welcome:player-123')
    expect(() => buildWelcomeReactionKey('player:123'))
      .toThrow('player id must contain only')
  })

  it('gives the show-start divider and grounded batch separate stable ownership keys', () => {
    expect(buildShowStartedReactionKey('announcement'))
      .toBe('ceremony:show_started:announcement')
    expect(buildShowStartedReactionKey('reaction'))
      .toBe('ceremony:show_started:reaction')
  })

  it('gives every authored pre-show arrival one stable ownership key', () => {
    expect(buildPreShowArrivalReactionKey('Olenna'))
      .toBe('ceremony:pre_show:olenna')
    expect(() => buildPreShowArrivalReactionKey('joffrey'))
      .toThrow('pre-show companion')
    expect(buildRuntimePreShowArrivalReactionKey('Lantern-Archivist'))
      .toBe('ceremony:pre_show:lantern-archivist')
  })

  it('gives repeated spotlight openings revisioned divider and reaction keys', () => {
    expect(buildSpotlightReactionKey(3, 'announcement'))
      .toBe('spotlight:3:announcement')
    expect(buildSpotlightReactionKey(4, 'reaction'))
      .toBe('spotlight:4:reaction')
    expect(() => buildSpotlightReactionKey(0, 'reaction'))
      .toThrow('positive integer')
  })

  it('gives the post-show divider and full-cast farewell separate stable keys', () => {
    expect(buildPostShowReactionKey('announcement'))
      .toBe('ceremony:post_show:announcement')
    expect(buildPostShowReactionKey('reaction'))
      .toBe('ceremony:post_show:reaction')
  })

  it('gives the full-room keepsake verdict batch one stable ownership key', () => {
    expect(buildVerdictReactionKey()).toBe('keepsake:verdicts:v1')
  })

  it('gives repeated team transitions distinct announcement and reaction keys', () => {
    expect(buildTeamChangeReactionKey('PLAYER-123', 3, 'announcement'))
      .toBe('team:player-123:3:announcement')
    expect(buildTeamChangeReactionKey('PLAYER-123', 4, 'reaction'))
      .toBe('team:player-123:4:reaction')
    expect(() => buildTeamChangeReactionKey('player-123', 0, 'reaction'))
      .toThrow('positive integer')
  })

  it('waits for every pick on a resolved event before freezing milestone standings', () => {
    const categories = [{ id: 6, winner_id: 'winner' }]
    const pendingPicks = [
      { category_id: 6, is_correct: true },
      { category_id: 6, is_correct: null },
      { category_id: 7, is_correct: null },
    ]

    expect(isMilestoneScoreboardReady(categories, pendingPicks)).toBe(false)
    expect(isMilestoneScoreboardReady(categories, [
      pendingPicks[0],
      { category_id: 6, is_correct: false },
      pendingPicks[2],
    ])).toBe(true)
  })

  it('derives eligible responders only from cast members already in durable chat', () => {
    expect(selectSpokenCompanionIds([
      'system',
      'ned',
      'player-1',
      'cersei',
      'ned',
    ])).toEqual(['ned', 'cersei'])
    expect(selectSpokenCompanionIds(['system', 'player-1'])).toEqual([])
  })
})

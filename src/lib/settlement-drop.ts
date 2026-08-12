/**
 * Versioned contract and offline renderer for a post-show settlement drop.
 *
 * The settlement is the canonical owner of final totals. The drop owns only
 * presentation order: every displayed point enters through a beat ledger and
 * must reconstruct those totals exactly before any HTML can be emitted.
 */

import {
  parseSettlementReceipt,
  settlementCharacterPoints,
  settlementPlayerTotals,
  settlementStandings,
  type SettlementReceipt,
  type SettlementReceiptScoreEvent,
} from './settlement-receipt'
import {
  parseSettlementDropGrounding,
  type SettlementDropGrounding,
} from './settlement-drop-grounding'

export type SettlementDropAccent = 'ash' | 'blue' | 'gold' | 'madder' | 'violet'
export type SettlementDropScene = 'title' | 'keep' | 'hall' | 'field' | 'table'
export type SettlementDropBeatWeight = 'ordinary' | 'death' | 'betrayal'
export type SettlementDropLedgerKind = 'draft' | 'prediction' | 'bingo' | 'adjustment' | 'no_card'
export type SettlementDropMusterTier = 'lead' | 'support' | 'present' | 'absent'

export type { SettlementDropGrounding } from './settlement-drop-grounding'

export interface SettlementDropQuote {
  speaker: string
  portrait_asset: string
  text: string
  refs: string[]
  grounding: SettlementDropGrounding
}

export interface SettlementDropLedgerLine {
  evidence_id?: string
  fact_id?: string
  kind?: SettlementDropLedgerKind
  player_id?: string
  character_id?: string
  text?: string
  points?: number
  trigger?: SettlementReceiptScoreEvent['trigger']
}

export interface SettlementDropBeat {
  id: string
  kicker: string
  title: string
  summary: string
  weight: SettlementDropBeatWeight
  portrait_asset?: string
  ledger: SettlementDropLedgerLine[]
  quotes: SettlementDropQuote[]
}

export interface SettlementDropAct {
  id: string
  title: string
  subtitle: string
  scene: SettlementDropScene
  interstitial: {
    portrait_asset: string
  }
  beats: SettlementDropBeat[]
}

export interface SettlementDropCharacter {
  id: string
  name: string
  kind: 'character' | 'creature' | 'organization' | 'other'
  player_id?: string
  portrait_asset: string
  muster_tier: SettlementDropMusterTier
  drawer: {
    note?: string
    beats: Array<{
      evidence_id?: string
      label?: string
      points?: number
      fired?: boolean
    }>
  }
}

export interface SettlementDropPlayer {
  id: string
  name: string
  house: string
  accent: SettlementDropAccent
  portrait_asset: string
}

export interface SettlementDropPersonalEdition {
  player_id: string
  bingo: Array<{ label: string; marked: boolean; free: boolean }>
}

export interface SettlementDropManifest {
  version: 1
  settlement_receipt: {
    path: string
    sha256: string
  }
  show: {
    title: string
    subtitle: string
    closing_title: string
    return_path?: string
  }
  assets: Record<string, { path: string; alt: string }>
  players: SettlementDropPlayer[]
  characters: SettlementDropCharacter[]
  opening: {
    eyebrow: string
    muster_title: string
    begins_label: string
  }
  acts: SettlementDropAct[]
}

export interface CompiledSettlementDrop extends SettlementDropManifest {
  settlement: SettlementReceipt
  personal_editions: SettlementDropPersonalEdition[]
}

export interface SettlementDropReceiptReference {
  path: string
  sha256: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value: UnknownRecord, allowed: string[], label: string): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function identifier(value: unknown, label: string): string {
  const result = stringValue(value, label)
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`)
  }
  return result
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}`)
  }
  return value as number
}

function signedInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`)
  return value as number
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`)
  return value
}

function assertKnown<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`)
  }
}

function assertUnique(id: string, seen: Set<string>, label: string): void {
  if (seen.has(id)) throw new Error(`duplicate ${label} ${id}`)
  seen.add(id)
}

function assertAsset(asset: unknown, assets: Set<string>, label: string): void {
  if (asset === undefined) return
  const key = identifier(asset, label)
  if (!assets.has(key)) throw new Error(`${label} references unknown asset ${key}`)
}

function confinedRelativePath(value: unknown, label: string): string {
  const path = stringValue(value, label)
  const segments = path.replace(/^\.\//, '').split('/')
  if (path.includes('\\') || path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path)
    || segments.includes('..') || segments.includes('') || segments.every((segment) => segment === '.')) {
    throw new Error(`${label} must stay inside the drop directory`)
  }
  return path
}

function parseGrounding(value: unknown, label: string): void {
  parseSettlementDropGrounding(value, label)
}

export function parseSettlementDropReceiptReference(raw: string): SettlementDropReceiptReference {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || !isRecord(value.settlement_receipt)) {
    throw new Error('settlement_receipt is required')
  }
  assertExactKeys(value.settlement_receipt, ['path', 'sha256'], 'settlement_receipt')
  const path = confinedRelativePath(value.settlement_receipt.path, 'settlement_receipt.path')
  const sha256 = value.settlement_receipt.sha256
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('settlement_receipt.sha256 must be a lowercase SHA-256 digest')
  }
  return { path, sha256 }
}

/** Parses and proves a settlement-drop authoring manifest against one receipt. */
export function parseSettlementDropManifest(
  raw: string,
  settlement: SettlementReceipt,
  receiptSha256: string,
): CompiledSettlementDrop {
  settlement = parseSettlementReceipt(JSON.stringify(settlement))
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error('settlement drop manifest must be an object')
  assertExactKeys(value, [
    'version',
    'settlement_receipt',
    'show',
    'assets',
    'players',
    'characters',
    'opening',
    'acts',
  ], 'manifest')
  if (value.version !== 1) throw new Error('manifest.version must be 1')
  if (!isRecord(value.settlement_receipt)) throw new Error('settlement_receipt is required')
  if (!isRecord(value.show)) throw new Error('show is required')
  if (!isRecord(value.assets)) throw new Error('assets must be an object')
  if (!isRecord(value.opening)) throw new Error('opening is required')
  assertExactKeys(value.show, [
    'title', 'subtitle', 'closing_title', 'return_path',
  ], 'show')
  assertExactKeys(value.opening, [
    'eyebrow', 'muster_title', 'begins_label',
  ], 'opening')

  const receiptReference = parseSettlementDropReceiptReference(raw)
  if (receiptSha256 !== receiptReference.sha256) {
    throw new Error('settlement receipt SHA-256 does not match settlement_receipt.sha256')
  }

  stringValue(value.show.title, 'show.title')
  stringValue(value.show.subtitle, 'show.subtitle')
  stringValue(value.show.closing_title, 'show.closing_title')
  if (value.show.return_path !== undefined
    && (typeof value.show.return_path !== 'string' || !/^\/(?!\/)/.test(value.show.return_path))) {
    throw new Error('show.return_path must be a local absolute path')
  }

  stringValue(value.opening.eyebrow, 'opening.eyebrow')
  stringValue(value.opening.muster_title, 'opening.muster_title')
  stringValue(value.opening.begins_label, 'opening.begins_label')

  const assetIds = new Set<string>()
  for (const [assetId, asset] of Object.entries(value.assets)) {
    identifier(assetId, 'asset id')
    assertUnique(assetId, assetIds, 'asset')
    if (!isRecord(asset)) throw new Error(`asset ${assetId} must be an object`)
    assertExactKeys(asset, ['path', 'alt'], `asset ${assetId}`)
    confinedRelativePath(asset.path, `asset ${assetId} path`)
    stringValue(asset.alt, `asset ${assetId} alt`)
  }

  const players = requiredArray(value.players, 'players')
  const playerIds = new Set<string>()
  const receiptPlayers = new Map(settlement.players.map((player) => [player.id, player]))
  for (const [index, player] of players.entries()) {
    const label = `player ${index + 1}`
    if (!isRecord(player)) throw new Error(`${label} must be an object`)
    assertExactKeys(player, [
      'id', 'name', 'house', 'accent', 'portrait_asset',
    ], label)
    const id = identifier(player.id, `${label} id`)
    assertUnique(id, playerIds, 'player')
    const name = stringValue(player.name, `${label} name`)
    const receiptPlayer = receiptPlayers.get(id)
    if (!receiptPlayer) throw new Error(`player ${id} is missing from the settlement receipt`)
    if (name !== receiptPlayer.name) throw new Error(`player ${id} name must match the settlement receipt`)
    stringValue(player.house, `${label} house`)
    assertKnown(player.accent, ['ash', 'blue', 'gold', 'madder', 'violet'], `${label} accent`)
    stringValue(player.portrait_asset, `${label} portrait_asset`)
    assertAsset(player.portrait_asset, assetIds, `${label} portrait_asset`)
  }

  const totals = settlementPlayerTotals(settlement)
  for (const playerId of playerIds) {
    if (!(playerId in totals)) throw new Error(`settlement total is missing player ${playerId}`)
    signedInteger(totals[playerId], `settlement total for ${playerId}`)
  }
  for (const totalId of Object.keys(totals)) {
    if (!playerIds.has(totalId)) throw new Error(`settlement total references unknown player ${totalId}`)
  }

  const characters = requiredArray(value.characters, 'characters')
  const characterIds = new Set<string>()
  const characterOwners = new Map<string, string | undefined>()
  const drawerTotals = new Map<string, number>()
  const receiptCharacters = new Map(settlement.characters.map((character) => [character.id, character]))
  const scoreEvents = new Map(settlement.score_events.map((event) => [event.id, event]))
  const settledFacts = settlement.settled_facts === undefined
    ? undefined
    : new Map(settlement.settled_facts.map((fact) => [fact.id, fact]))
  const usedDrawerEvents = new Set<string>()
  for (const [index, character] of characters.entries()) {
    const label = `character ${index + 1}`
    if (!isRecord(character)) throw new Error(`${label} must be an object`)
    assertExactKeys(character, [
      'id', 'name', 'kind', 'player_id', 'portrait_asset', 'muster_tier', 'drawer',
    ], label)
    const id = identifier(character.id, `${label} id`)
    assertUnique(id, characterIds, 'character')
    const name = stringValue(character.name, `${label} name`)
    const receiptCharacter = receiptCharacters.get(id)
    if (!receiptCharacter) throw new Error(`character ${id} is missing from the settlement receipt`)
    if (name !== receiptCharacter.name) throw new Error(`character ${id} name must match the settlement receipt`)
    assertKnown(character.kind, ['character', 'creature', 'organization', 'other'], `${label} kind`)
    if (character.player_id !== undefined) {
      const playerId = identifier(character.player_id, `${label} player_id`)
      if (!playerIds.has(playerId)) throw new Error(`${label} references unknown player ${playerId}`)
    }
    const playerId = character.player_id as string | undefined
    if (playerId !== receiptCharacter.player_id) {
      throw new Error(`character ${id} owner must match the settlement receipt`)
    }
    characterOwners.set(id, playerId)
    stringValue(character.portrait_asset, `${label} portrait_asset`)
    assertAsset(character.portrait_asset, assetIds, `${label} portrait_asset`)
    assertKnown(character.muster_tier, ['lead', 'support', 'present', 'absent'], `${label} muster_tier`)
    if (!isRecord(character.drawer) || !Array.isArray(character.drawer.beats)) {
      throw new Error(`${label} drawer.beats must be an array`)
    }
    assertExactKeys(character.drawer, ['note', 'beats'], `${label} drawer`)
    if (character.drawer.note !== undefined) stringValue(character.drawer.note, `${label} drawer.note`)
    let firedTotal = 0
    for (const [beatIndex, beat] of character.drawer.beats.entries()) {
      if (!isRecord(beat)) throw new Error(`${label} drawer beat ${beatIndex + 1} must be an object`)
      const beatLabel = `${label} drawer beat ${beatIndex + 1}`
      if ('evidence_id' in beat) {
        if (Object.keys(beat).length !== 1) {
          throw new Error(`${beatLabel} fired drawer beats may contain only evidence_id`)
        }
        const evidenceId = stringValue(beat.evidence_id, `${beatLabel} evidence_id`)
        const event = scoreEvents.get(evidenceId)
        if (!event) throw new Error(`${beatLabel} references unknown score event ${evidenceId}`)
        if (event.character_id !== id) {
          throw new Error(`${beatLabel} score event ${evidenceId} does not belong to character ${id}`)
        }
        if (usedDrawerEvents.has(evidenceId)) throw new Error(`${beatLabel} uses score event ${evidenceId} more than once`)
        usedDrawerEvents.add(evidenceId)
        firedTotal += event.points
        ;(character.drawer.beats as unknown[])[beatIndex] = {
          evidence_id: event.id,
          label: event.label,
          points: event.points,
          fired: true,
        }
        continue
      }
      assertExactKeys(beat, ['label', 'points', 'fired'], beatLabel)
      stringValue(beat.label, `${beatLabel} label`)
      if (!Number.isInteger(beat.points) || beat.points === 0) {
        throw new Error(`${beatLabel} points must be a non-zero integer`)
      }
      if (beat.fired !== false) throw new Error(`${beatLabel} fired rows must reference receipt evidence`)
    }
    drawerTotals.set(id, firedTotal)
  }

  const missingReceiptCharacter = settlement.characters.find((character) => !characterIds.has(character.id))
  if (missingReceiptCharacter) {
    throw new Error(`settlement receipt character ${missingReceiptCharacter.id} is missing from the drop`)
  }
  const missingDrawerEvent = settlement.score_events.find((event) => (
    event.character_id !== undefined && !usedDrawerEvents.has(event.id)
  ))
  if (missingDrawerEvent) {
    throw new Error(`character score event ${missingDrawerEvent.id} is missing from its drawer`)
  }

  const usedScoreEvents = new Set<string>()
  const usedUnscoredFacts = new Set<string>()
  const acts = requiredArray(value.acts, 'acts')
  const actIds = new Set<string>()
  const beatIds = new Set<string>()
  const ledgerTotals = new Map(Array.from(playerIds, (id) => [id, 0]))
  const characterLedgerTotals = new Map(Array.from(characterIds, (id) => [id, 0]))
  for (const [actIndex, act] of acts.entries()) {
    const actLabel = `act ${actIndex + 1}`
    if (!isRecord(act)) throw new Error(`${actLabel} must be an object`)
    assertExactKeys(act, [
      'id', 'title', 'subtitle', 'scene', 'interstitial', 'beats',
    ], actLabel)
    const actId = identifier(act.id, `${actLabel} id`)
    assertUnique(actId, actIds, 'act')
    stringValue(act.title, `${actLabel} title`)
    stringValue(act.subtitle, `${actLabel} subtitle`)
    assertKnown(act.scene, ['title', 'keep', 'hall', 'field', 'table'], `${actLabel} scene`)
    if (!isRecord(act.interstitial)) throw new Error(`${actLabel} interstitial is required`)
    assertExactKeys(act.interstitial, ['portrait_asset'], `${actLabel} interstitial`)
    stringValue(act.interstitial.portrait_asset, `${actLabel} interstitial portrait_asset`)
    assertAsset(act.interstitial.portrait_asset, assetIds, `${actLabel} interstitial portrait_asset`)
    const beats = requiredArray(act.beats, `${actLabel} beats`)
    for (const [beatIndex, beat] of beats.entries()) {
      const beatLabel = `${actLabel} beat ${beatIndex + 1}`
      if (!isRecord(beat)) throw new Error(`${beatLabel} must be an object`)
      assertExactKeys(beat, [
        'id', 'kicker', 'title', 'summary', 'weight', 'portrait_asset', 'ledger', 'quotes',
      ], beatLabel)
      const beatId = identifier(beat.id, `${beatLabel} id`)
      assertUnique(beatId, beatIds, 'beat')
      stringValue(beat.kicker, `${beatLabel} kicker`)
      stringValue(beat.title, `${beatLabel} title`)
      stringValue(beat.summary, `${beatLabel} summary`)
      assertKnown(beat.weight, ['ordinary', 'death', 'betrayal'], `${beatLabel} weight`)
      assertAsset(beat.portrait_asset, assetIds, `${beatLabel} portrait_asset`)
      const lines = requiredArray(beat.ledger, `${beatLabel} ledger`)
      for (const [lineIndex, line] of lines.entries()) {
        const lineLabel = `${beatLabel} ledger line ${lineIndex + 1}`
        if (!isRecord(line)) throw new Error(`${lineLabel} must be an object`)
        if (line.kind === 'no_card') {
          assertExactKeys(line, ['kind', 'fact_id'], lineLabel)
          if (settledFacts === undefined) {
            throw new Error('settlement receipt has no settled-fact timeline; re-emit it with settle-room')
          }
          const factId = stringValue(line.fact_id, `${lineLabel} fact_id`)
          const fact = settledFacts.get(factId)
          if (!fact) throw new Error(`${lineLabel} references unknown settled fact ${factId}`)
          if (fact.outcome !== 'resolved' || fact.board_status !== 'unscored') {
            throw new Error(`${lineLabel} fact ${factId} is not a resolved unscored settlement fact`)
          }
          if (usedUnscoredFacts.has(factId)) {
            throw new Error(`${lineLabel} uses settled fact ${factId} more than once`)
          }
          usedUnscoredFacts.add(factId)
          ;(beat.ledger as unknown[])[lineIndex] = {
            kind: 'no_card',
            fact_id: fact.id,
            text: fact.title,
          }
          continue
        }
        if (Object.keys(line).length !== 1 || !('evidence_id' in line)) {
          throw new Error(`${lineLabel} scored lines may contain only evidence_id`)
        }
        const evidenceId = stringValue(line.evidence_id, `${lineLabel} evidence_id`)
        if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(evidenceId)) {
          throw new Error(`${lineLabel} evidence_id is invalid`)
        }
        const event = scoreEvents.get(evidenceId)
        if (!event) throw new Error(`${lineLabel} references unknown score event ${evidenceId}`)
        if (usedScoreEvents.has(evidenceId)) throw new Error(`${lineLabel} uses score event ${evidenceId} more than once`)
        usedScoreEvents.add(evidenceId)
        const playerId = event.player_id
        if (!playerIds.has(playerId)) throw new Error(`${lineLabel} score event references unknown player ${playerId}`)
        ledgerTotals.set(playerId, (ledgerTotals.get(playerId) ?? 0) + event.points)
        if (event.character_id !== undefined) {
          const characterId = event.character_id
          if (!characterIds.has(characterId)) throw new Error(`${lineLabel} references unknown character ${characterId}`)
          if (event.kind !== 'draft' && event.kind !== 'adjustment') {
            throw new Error(`${lineLabel} only draft or adjustment lines may reference a character`)
          }
          const owner = characterOwners.get(characterId)
          if (owner === undefined) {
            throw new Error(`${lineLabel} cannot award unclaimed character ${characterId}`)
          }
          if (owner !== undefined && owner !== playerId) {
            throw new Error(`${lineLabel} awards ${characterId} to the wrong player`)
          }
          characterLedgerTotals.set(
            characterId,
            (characterLedgerTotals.get(characterId) ?? 0) + event.points,
          )
        }
        ;(beat.ledger as unknown[])[lineIndex] = {
          evidence_id: event.id,
          kind: event.kind,
          player_id: event.player_id,
          ...(event.character_id === undefined ? {} : { character_id: event.character_id }),
          text: event.label,
          points: event.points,
          ...(event.trigger === undefined ? {} : { trigger: event.trigger }),
        }
      }

      if (!Array.isArray(beat.quotes)) throw new Error(`${beatLabel} quotes must be an array`)
      for (const [quoteIndex, quote] of beat.quotes.entries()) {
        const quoteLabel = `${beatLabel} quote ${quoteIndex + 1}`
        if (!isRecord(quote)) throw new Error(`${quoteLabel} must be an object`)
        assertExactKeys(quote, ['speaker', 'portrait_asset', 'text', 'refs', 'grounding'], quoteLabel)
        stringValue(quote.speaker, `${quoteLabel} speaker`)
        stringValue(quote.portrait_asset, `${quoteLabel} portrait_asset`)
        assertAsset(quote.portrait_asset, assetIds, `${quoteLabel} portrait_asset`)
        stringValue(quote.text, `${quoteLabel} text`)
        const refs = requiredArray(quote.refs, `${quoteLabel} refs`)
        refs.forEach((ref, refIndex) => stringValue(ref, `${quoteLabel} ref ${refIndex + 1}`))
        parseGrounding(quote.grounding, `${beatLabel} quote ${quoteIndex + 1}`)
      }
    }
  }

  const missingScoreEvent = settlement.score_events.find((event) => !usedScoreEvents.has(event.id))
  if (missingScoreEvent) {
    throw new Error(`receipt score event ${missingScoreEvent.id} is missing from the ceremony`)
  }
  const missingUnscoredFact = settlement.settled_facts?.find((fact) => (
    fact.outcome === 'resolved'
      && fact.board_status === 'unscored'
      && !usedUnscoredFacts.has(fact.id)
  ))
  if (missingUnscoredFact) {
    throw new Error(`resolved unscored settlement fact ${missingUnscoredFact.id} is missing from the ceremony`)
  }

  for (const playerId of playerIds) {
    const ledger = ledgerTotals.get(playerId) ?? 0
    const total = totals[playerId] as number
    if (ledger !== total) throw new Error(`ledger total for ${playerId} is ${ledger}; settlement total is ${total}`)
  }
  for (const characterId of characterIds) {
    const drawer = drawerTotals.get(characterId) ?? 0
    const ledger = characterLedgerTotals.get(characterId) ?? 0
    if (drawer !== ledger) {
      throw new Error(`drawer total for ${characterId} is ${drawer}; ledger total is ${ledger}`)
    }
  }
  const receiptCharacterPoints = settlementCharacterPoints(settlement)
  const receiptCharacterIds = new Set(Object.keys(receiptCharacterPoints))
  for (const characterId of characterIds) {
    const ledger = characterLedgerTotals.get(characterId) ?? 0
    const receiptPoints = receiptCharacterPoints[characterId]
    if (ledger === 0 && receiptPoints === undefined) continue
    if (receiptPoints === undefined) {
      throw new Error(`settlement receipt is missing character ${characterId}`)
    }
    if (ledger !== receiptPoints) {
      throw new Error(`ledger total for character ${characterId} is ${ledger}; settlement total is ${receiptPoints}`)
    }
    receiptCharacterIds.delete(characterId)
  }
  const unknownReceiptCharacter = [...receiptCharacterIds][0]
  if (unknownReceiptCharacter) {
    throw new Error(`settlement receipt references character ${unknownReceiptCharacter} missing from the drop`)
  }

  const cardsByPlayer = new Map(settlement.personal_cards.map((card) => [card.player_id, card]))
  const editions = [...playerIds].map((playerId) => {
    const card = cardsByPlayer.get(playerId) as SettlementReceipt['personal_cards'][number]
    return {
      player_id: playerId,
      bingo: card.bingo.map((cell) => ({ ...cell })),
    }
  })

  return { ...(value as unknown as SettlementDropManifest), settlement, personal_editions: editions }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function imageMarkup(assetId: string | undefined, assets: Record<string, string>, alt: string, className: string): string {
  if (!assetId) return `<span class="${className} fallback" aria-hidden="true">${esc(initials(alt))}</span>`
  return `<img class="${className}" src="${esc(assets[assetId])}" alt="${esc(alt)}">`
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points)
}

function triggerDecisionLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

function renderTriggerContract(
  trigger: NonNullable<SettlementReceiptScoreEvent['trigger']>,
  controlId: string,
): string {
  const ruleId = `signature-beat-${trigger.source_signature_beat_id}`
  const contract = trigger.contract
  return `<div class="trigger-rule" id="${esc(controlId)}" data-trigger-rule="${ruleId}" hidden>
    <p class="trigger-condition">${esc(contract.condition)}</p>
    <div class="trigger-rule-section"><b>Does not count</b><ul>${contract.exclusions.map((exclusion) => `<li>${esc(exclusion)}</li>`).join('')}</ul></div>
    <dl class="trigger-policy">
      <div><dt>Proxies</dt><dd>${esc(triggerDecisionLabel(contract.adjudication.proxies))}</dd></div>
      <div><dt>Offscreen</dt><dd>${esc(triggerDecisionLabel(contract.adjudication.offscreen))}</dd></div>
      <div><dt>Mentions</dt><dd>${esc(triggerDecisionLabel(contract.adjudication.mentions))}</dd></div>
    </dl>
    <div class="trigger-rule-section trigger-provenance"><b>Reviewed rule</b><p>${esc(contract.title_review.note)}</p><div>${contract.basis_claim_ids.map((claim) => `<code>${esc(claim)}</code>`).join('')}</div></div>
  </div>`
}

function renderQuoteDesk(
  quotes: SettlementDropQuote[],
  beatId: string,
  embeddedAssets: Record<string, string>,
): string {
  if (quotes.length === 0) return ''
  const items = quotes.map((quote, index) => `
          <article class="quote${index === 0 ? ' active' : ''}" data-quote="${index}">
            <div class="quote-layout">${imageMarkup(quote.portrait_asset, embeddedAssets, `${quote.speaker} portrait`, 'quote-portrait')}<div class="quote-copy">
              <p class="quote-speaker">${esc(quote.speaker)}</p>
              <blockquote>${esc(quote.text)}</blockquote>
              <div class="refs" aria-label="References for ${esc(quote.speaker)}">${quote.refs.map((ref) => `<span>${esc(ref)}</span>`).join('')}</div>
            </div></div>
          </article>`).join('')
  const controls = quotes.length > 1
    ? `<div class="quote-controls" aria-label="Pundit desk controls">
          <button type="button" data-quote-prev aria-label="Previous take">Previous</button>
          <span><b data-quote-position>1</b> / ${quotes.length}</span>
          <button type="button" data-quote-next aria-label="Next take">Next</button>
        </div>`
    : ''
  return `<div class="desk" data-desk="${esc(beatId)}" data-quote-count="${quotes.length}">${items}${controls}</div>`
}

function renderLedger(
  lines: SettlementDropLedgerLine[],
  players: Map<string, SettlementDropPlayer>,
  characters: Map<string, SettlementDropCharacter>,
  embeddedAssets: Record<string, string>,
): string {
  return `<div class="ledger">${lines.map((line, lineIndex) => {
    if (line.kind === 'no_card') {
      return `<aside class="ledger-line no-card" data-line-kind="no_card" aria-label="No card in the board"><span class="line-mark">No card</span><p>${esc(line.text as string)}</p></aside>`
    }
    const player = players.get(line.player_id as string) as SettlementDropPlayer
    let icon = `<span class="player-mark accent-${player.accent}">${esc(initials(player.name))}</span>`
    if (line.kind === 'bingo') {
      icon = '<svg class="ledger-icon bingo-hallmark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
    } else if (line.character_id !== undefined) {
      const character = characters.get(line.character_id) as SettlementDropCharacter
      icon = imageMarkup(character.portrait_asset, embeddedAssets, `${character.name} portrait`, 'ledger-icon ledger-portrait')
    }
    const triggerControlId = line.trigger
      ? `ledger-trigger-${String(line.evidence_id).replace(/[^a-z0-9_-]/gi, '-')}-${lineIndex + 1}`
      : null
    const triggerButton = line.trigger && triggerControlId
      ? `<button type="button" class="ledger-rule-chip" aria-expanded="false" aria-controls="${esc(triggerControlId)}" data-trigger-toggle>Reviewed rule<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>`
      : ''
    const triggerRule = line.trigger && triggerControlId
      ? renderTriggerContract(line.trigger, triggerControlId)
      : ''
    return `<div class="ledger-line${line.trigger ? ' ledger-line-rule' : ''}" data-line-kind="${line.kind}">
      ${icon}
      <p>${esc(line.text as string)}<small>${esc(player.name)} &middot; ${esc(line.kind as string)}</small>${triggerButton}</p>
      <strong>${signed(line.points as number)}</strong>
      ${triggerRule}
    </div>`
  }).join('')}</div>`
}

/** Renders a validated manifest with already embedded image data URIs. */
export function renderSettlementDropHtml(
  manifest: CompiledSettlementDrop,
  embeddedAssets: Record<string, string>,
): string {
  const { settlement, personal_editions: _personalEditions, ...compiledAuthoringManifest } = manifest
  const authoringManifest: SettlementDropManifest = {
    ...compiledAuthoringManifest,
    characters: compiledAuthoringManifest.characters.map((character) => ({
      ...character,
      drawer: {
        ...character.drawer,
        beats: character.drawer.beats.map((beat) => beat.fired
          ? { evidence_id: beat.evidence_id }
          : { label: beat.label, points: beat.points, fired: false }),
      },
    })),
    acts: compiledAuthoringManifest.acts.map((act) => ({
      ...act,
      beats: act.beats.map((beat) => ({
        ...beat,
        ledger: beat.ledger.map((line) => line.kind === 'no_card'
          ? { kind: 'no_card', fact_id: line.fact_id }
          : { evidence_id: line.evidence_id }),
      })),
    })),
  }
  manifest = parseSettlementDropManifest(
    JSON.stringify(authoringManifest),
    settlement,
    manifest.settlement_receipt.sha256,
  )
  for (const assetId of Object.keys(manifest.assets)) {
    const uri = embeddedAssets[assetId]
    if (typeof uri !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(uri)) {
      throw new Error(`embedded asset ${assetId} must be an image data URI`)
    }
  }

  const players = new Map(manifest.players.map((player) => [player.id, player]))
  const characters = new Map(manifest.characters.map((character) => [character.id, character]))
  const totals = settlementPlayerTotals(manifest.settlement)
  const proofMode = manifest.settlement.source === 'synthetic-proof'
  const recordSeal = proofMode ? 'synthetic record' : 'record sealed'
  const scoreEvents = new Map(manifest.settlement.score_events.map((event) => [event.id, event]))
  const runningEvents: SettlementReceiptScoreEvent[] = []
  const finalStandings = settlementStandings(manifest.settlement)
  const ranked = finalStandings.map((standing) => players.get(standing.player_id) as SettlementDropPlayer)
  const finalRankByPlayer = new Map(finalStandings.map((standing) => [standing.player_id, standing.rank]))
  const champions = finalStandings
    .filter((standing) => standing.rank === 1)
    .map((standing) => players.get(standing.player_id) as SettlementDropPlayer)

  const rosterByPlayer = new Map(manifest.players.map((player) => [
    player.id,
    manifest.characters.filter((character) => character.player_id === player.id),
  ]))
  const unclaimedRoster = manifest.characters.filter((character) => character.player_id === undefined)
  const tierLabels: Array<[SettlementDropMusterTier, string]> = [
    ['lead', 'Heavy hitters'],
    ['support', 'Impact'],
    ['present', 'Just there'],
    ['absent', 'No scene'],
  ]
  const musterZoneClass = (roster: SettlementDropCharacter[]): string => {
    const hasImpact = roster.some((character) => character.muster_tier === 'lead' || character.muster_tier === 'support')
    const hasRest = roster.some((character) => character.muster_tier === 'present' || character.muster_tier === 'absent')
    if (hasImpact && hasRest) return 'muster-cast muster-zones'
    if (hasImpact) return 'muster-cast muster-impact-only'
    return 'muster-cast muster-rest-only'
  }
  const renderMusterTiers = (roster: SettlementDropCharacter[]): string => {
    const order = { lead: 0, support: 1, present: 2, absent: 3 }
    const impactPoints = (character: SettlementDropCharacter): number => character.drawer.beats
      .reduce((sum, beat) => sum + (beat.fired ? (beat.points as number) : 0), 0)
    const ordered = [...roster].sort((a, b) => (
      order[a.muster_tier] - order[b.muster_tier]
      || impactPoints(b) - impactPoints(a)
      || a.name.localeCompare(b.name)
    ))
    const impactCharacters = [...roster]
      .filter((character) => character.muster_tier === 'lead' || character.muster_tier === 'support')
      .sort((a, b) => impactPoints(b) - impactPoints(a) || a.name.localeCompare(b.name))
    const impactRanks = new Map(impactCharacters.map((character, index) => [character.id, index + 1]))
    const impactCount = impactCharacters.length
    const characterChip = (character: SettlementDropCharacter): string => {
      const rank = impactRanks.get(character.id)
      let className = 'character-chip'
      let impactAttributes = ''
      if (rank !== undefined) {
        const progress = impactCount <= 1 ? 0 : (rank - 1) / (impactCount - 1)
        const chipWidth = (164 - 32 * progress).toFixed(2)
        const chipHeight = (76 - 12 * progress).toFixed(2)
        const faceWidth = (44 - 10 * progress).toFixed(2)
        const faceHeight = (54 - 12 * progress).toFixed(2)
        className += ' impact-chip'
        impactAttributes = ` data-impact-rank="${rank}" style="--chip-width:${chipWidth}px;--chip-height:${chipHeight}px;--face-width:${faceWidth}px;--face-height:${faceHeight}px"`
      }
      return `<button type="button" class="${className}"${impactAttributes} data-character="${esc(character.id)}" aria-label="Open ${esc(character.name)} wager sheet">${imageMarkup(character.portrait_asset, embeddedAssets, character.name, 'chip-face')}<span class="chip-label">${esc(character.name)}</span><svg class="chip-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>`
    }
    return tierLabels.map(([tier, label]) => {
      const tierCharacters = ordered.filter((character) => character.muster_tier === tier)
      if (tierCharacters.length === 0) return ''
      return `<div class="muster-tier tier-${tier}"><p class="muster-tier-label">${label}</p><div>${tierCharacters.map(characterChip).join('')}</div></div>`
    }).join('') || '<p class="quiet">No claims entered.</p>'
  }
  const unclaimedMuster = unclaimedRoster.length === 0 ? '' : `<article class="muster-row accent-ash">
    <header>${imageMarkup(undefined, embeddedAssets, 'Unclaimed', 'avatar')}<span><b>Unclaimed</b><small>No banner</small></span></header>
    <div class="${musterZoneClass(unclaimedRoster)}">${renderMusterTiers(unclaimedRoster)}</div>
  </article>`

  const opening = `
    <section class="slide scene-title" data-slide-kind="opening">
      <div class="stage"><p class="eyebrow">${esc(manifest.opening.eyebrow)}</p><h1>${esc(manifest.show.title)}</h1></div>
      <div class="stage"><p class="subtitle">${esc(manifest.show.subtitle)}</p></div>
    </section>
    <section class="slide scene-title muster" data-slide-kind="muster">
      <div class="stage"><p class="kicker">The muster</p><h2>${esc(manifest.opening.muster_title)}</h2></div>
      <p class="stage muster-hint">Tap any name for its wager sheet.</p>
      <div class="stage muster-list">${manifest.players.map((player) => {
        const roster = rosterByPlayer.get(player.id) ?? []
        return `<article class="muster-row accent-${player.accent}">
          <header>${imageMarkup(player.portrait_asset, embeddedAssets, player.name, 'avatar')}<span><b>${esc(player.name)}</b><small>${esc(player.house)}</small></span></header>
          <div class="${musterZoneClass(roster)}">${renderMusterTiers(roster)}</div>
        </article>`
      }).join('')}${unclaimedMuster}</div>
    </section>
    <section class="slide scene-title begins" data-slide-kind="begins">
      <div class="stage"><p class="eyebrow">Settlement ${manifest.settlement.settlement_version}</p><h2>${esc(manifest.opening.begins_label)}</h2></div>
      <div class="stage"><p class="record-seal">Room ${esc(manifest.settlement.room_code)} &middot; ${recordSeal}</p></div>
    </section>`

  const acts = manifest.acts.map((act, actIndex) => {
    const divider = `<section class="slide scene-${act.scene} act-divider" data-slide-kind="act">
      <div class="stage"><p class="act-number">Act ${actIndex + 1}</p><h2>${esc(act.title)}</h2><p class="subtitle">${esc(act.subtitle)}</p></div>
    </section>`
    const beatSlides = act.beats.map((beat) => {
      for (const line of beat.ledger) {
        if (line.kind !== 'no_card') {
          runningEvents.push(scoreEvents.get(line.evidence_id as string) as SettlementReceiptScoreEvent)
        }
      }
      return `<section class="slide scene-${act.scene} beat weight-${beat.weight}" data-slide-kind="beat" data-beat-weight="${beat.weight}">
        ${beat.weight === 'betrayal' ? '<canvas class="ember-canvas" data-embers aria-hidden="true"></canvas>' : ''}
        <div class="stage beat-head"><div><p class="kicker">${esc(beat.kicker)}</p><h2>${esc(beat.title)}</h2></div>${imageMarkup(beat.portrait_asset, embeddedAssets, beat.title, 'beat-portrait')}</div>
        <div class="stage"><p class="subtitle">${esc(beat.summary)}</p></div>
        <div class="stage">${renderLedger(beat.ledger, players, characters, embeddedAssets)}</div>
        <div class="stage">${renderQuoteDesk(beat.quotes, beat.id, embeddedAssets)}</div>
      </section>`
    }).join('')
    const runningStandings = settlementStandings(manifest.settlement, runningEvents)
    const standings = runningStandings.map((standing) => players.get(standing.player_id) as SettlementDropPlayer)
    const leaders = runningStandings.filter((standing) => standing.rank === 1)
    const leader = standings[0]
    const allZeroAndTied = leaders.length === runningStandings.length
      && runningStandings.every((standing) => standing.total === 0)
    const interstitialTitle = allZeroAndTied
      ? 'The field remains level'
      : leaders.length > 1 ? 'The lead is shared' : `${esc(leader.name)} holds the room`
    const interstitial = `<section class="slide scene-table interstitial" data-slide-kind="interstitial">
      <div class="stage interstitial-head"><div><p class="kicker">After act ${actIndex + 1}</p><h2>${interstitialTitle}</h2></div><div class="interstitial-cast-frame">${imageMarkup(act.interstitial.portrait_asset, embeddedAssets, `${act.title} cast portrait`, 'interstitial-cast-portrait')}</div></div>
      <div class="stage standings">${standings.map((player, index) => `<div class="standing accent-${player.accent}"><span>${runningStandings[index].rank}</span>${imageMarkup(player.portrait_asset, embeddedAssets, player.name, 'avatar')}<b>${esc(player.name)}</b><strong>${runningStandings[index].total}</strong></div>`).join('')}</div>
    </section>`
    return divider + beatSlides + interstitial
  }).join('')

  const finale = `<section class="slide scene-title finale" data-slide-kind="finale">
      <div class="stage"><p class="eyebrow">The settled table</p><h2>${esc(champions.map((player) => player.name).join(' & '))}</h2><p class="champion-line">${champions.length > 1 ? 'Co-champions in the final record' : 'First in the final record'}</p></div>
      <div class="stage standings final-standings">${ranked.map((player) => `<div class="standing accent-${player.accent}"><span>${finalRankByPlayer.get(player.id)}</span>${imageMarkup(player.portrait_asset, embeddedAssets, player.name, 'avatar')}<b>${esc(player.name)}</b><strong>${totals[player.id]}</strong></div>`).join('')}</div>
    </section>`

  const personal = `<section class="slide scene-title personal" data-slide-kind="personal">
      <div class="stage"><p class="eyebrow">Private edition</p><h2>Take your night home</h2><p class="subtitle">Choose your banner to open its settled card.</p></div>
      <div class="stage personal-gate">${manifest.personal_editions.map((edition) => {
        const player = players.get(edition.player_id) as SettlementDropPlayer
        return `<button type="button" class="personal-choice accent-${player.accent}" data-personal="${esc(player.id)}">${imageMarkup(player.portrait_asset, embeddedAssets, player.name, 'avatar')}<span><b>${esc(player.name)}</b><small>${totals[player.id]} points</small></span></button>`
      }).join('')}</div>
    </section>`

  const closingDoor = manifest.show.return_path
    ? `<a class="door" href="${esc(manifest.show.return_path)}">Return to the hall</a>`
    : '<button type="button" class="door" data-begin-again>Begin again</button>'
  const closing = `<section class="slide scene-title closing" data-slide-kind="closing">
      <div class="stage"><p class="eyebrow">The room is closed</p><h2>${esc(manifest.show.closing_title)}</h2></div>
      <div class="stage settlement-proof"><span>Settlement ${manifest.settlement.settlement_version}</span><code>${esc(manifest.settlement.manifest_hash.slice(0, 12))}</code></div>
      <div class="stage">${closingDoor}</div>
    </section>`

  const characterSheets = manifest.characters.map((character) => {
    const owner = character.player_id ? players.get(character.player_id) : undefined
    const total = character.drawer.beats.reduce((sum, beat) => sum + (beat.fired ? (beat.points as number) : 0), 0)
    const triggerRows = character.drawer.beats.map((beat, beatIndex) => {
      const event = beat.evidence_id ? scoreEvents.get(beat.evidence_id) : undefined
      const trigger = event?.trigger
      const rowClass = `trigger${beat.fired ? ' fired' : ''}${trigger ? ' has-rule' : ''}`
      const summary = `<span>${beat.fired ? 'Struck' : 'Quiet'}</span><p>${esc(beat.label as string)}</p><strong>${signed(beat.points as number)}</strong>`
      if (!trigger) return `<div class="${rowClass}">${summary}</div>`
      const ruleId = `signature-beat-${trigger.source_signature_beat_id}`
      const controlId = `${ruleId}-${character.id}-${beatIndex + 1}`
      return `<div class="${rowClass}">
        <button type="button" class="trigger-rule-toggle" aria-expanded="false" aria-controls="${controlId}" data-trigger-toggle>${summary}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
        ${renderTriggerContract(trigger, controlId)}
      </div>`
    }).join('')
    return `<article class="sheet-panel" data-character-panel="${esc(character.id)}">
      <div class="sheet-title">${imageMarkup(character.portrait_asset, embeddedAssets, character.name, 'sheet-portrait')}<span><p class="kicker">${esc(character.kind)}</p><h2>${esc(character.name)}</h2>${owner ? `<small>${esc(owner.name)}</small>` : ''}</span><strong>${total}</strong></div>
      ${character.drawer.note ? `<p class="sheet-note">${esc(character.drawer.note)}</p>` : ''}
      <div class="trigger-list">${triggerRows}</div>
    </article>`
  }).join('')

  const personalSheets = manifest.personal_editions.map((edition) => {
    const player = players.get(edition.player_id) as SettlementDropPlayer
    const roster = rosterByPlayer.get(player.id) ?? []
    const rosterButtons = roster.map((character) => {
      const fired = character.drawer.beats.filter((beat) => beat.fired)
      const points = fired.reduce((sum, beat) => sum + (beat.points as number), 0)
      const summary = fired.length > 0
        ? `${fired.length} struck &middot; ${signed(points)}`
        : 'Quiet &middot; 0'
      return `<button type="button" data-character="${esc(character.id)}"><b>${esc(character.name)}</b><small>${summary}</small></button>`
    }).join('')
    return `<article class="sheet-panel personal-panel" data-personal-panel="${esc(player.id)}">
      <div class="sheet-title">${imageMarkup(player.portrait_asset, embeddedAssets, player.name, 'sheet-portrait')}<span><p class="kicker">${esc(player.house)}</p><h2>${esc(player.name)}</h2><small>Your settled night</small></span><strong>${totals[player.id]}</strong></div>
      <div class="personal-roster">${rosterButtons || '<p class="quiet">No roster on record.</p>'}</div>
      <div class="bingo-board">${edition.bingo.map((cell) => `<div class="bingo-cell${cell.marked ? ' marked' : ''}${cell.free ? ' free' : ''}"><span>${esc(cell.label)}</span></div>`).join('')}</div>
      <button type="button" class="personal-share" data-share-personal="${esc(player.id)}" data-share-name="${esc(player.name)}" data-share-total="${totals[player.id]}">Share this edition</button>
      <p class="share-status" data-share-status aria-live="polite"></p>
    </article>`
  }).join('')

  return `<!doctype html>
<html lang="en" data-settlement-id="${esc(manifest.settlement.settlement_id)}" data-manifest-hash="${esc(manifest.settlement.manifest_hash)}" data-receipt-source="${esc(manifest.settlement.source)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c0c10">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${proofMode ? 'PROOF &mdash; ' : ''}${esc(manifest.show.title)} &mdash; Settlement Drop</title>
<style>
:root{--jet:#0c0c10;--iron:#17171c;--line:#34343c;--vellum:#e2d5b9;--ink:#241f17;--muted:#9a9387;--ash:#b9b5ad;--blue:#7e93a8;--gold:#d0a355;--madder:#c2604c;--violet:#8e7ca8;--beacon:#b9863f;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--nav-h:64px;--fast:160ms;--base:280ms;--serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--mono:"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--jet);color:var(--vellum);font-family:var(--serif)}button,a{font:inherit}button{color:inherit}body{overflow:hidden}.deck{height:100dvh;position:relative}.slide{position:absolute;inset:0;display:none;overflow-y:auto;overflow-x:hidden;padding:calc(var(--safe-top) + 34px) 20px calc(var(--safe-bottom) + var(--nav-h) + 28px);background:radial-gradient(ellipse at 50% 10%,rgba(185,134,63,.12),transparent 58%),var(--jet);align-content:start}.slide.on{display:block}.scene-keep{background:radial-gradient(ellipse at 50% 10%,rgba(142,59,46,.2),transparent 60%),var(--jet)}.scene-hall{background:radial-gradient(ellipse at 50% 10%,rgba(126,147,168,.18),transparent 60%),var(--jet)}.scene-field{background:radial-gradient(ellipse at 50% 10%,rgba(102,86,66,.2),transparent 60%),var(--jet)}.scene-table{background:linear-gradient(rgba(23,23,28,.9),rgba(12,12,16,.98)),var(--jet)}.stage{width:min(100%,520px);margin:0 auto 22px;opacity:0;transform:translateY(10px);transition:opacity var(--base),transform var(--base)}.stage.in{opacity:1;transform:none}.eyebrow,.kicker,.act-number{margin:0 0 9px;color:var(--beacon);font:700 11px/1.3 var(--mono);letter-spacing:.18em;text-transform:uppercase}h1,h2{margin:0;font-weight:500;line-height:.98;text-wrap:balance}h1{font-size:clamp(42px,14vw,72px)}h2{font-size:clamp(34px,11vw,58px)}.subtitle{margin:0;color:var(--muted);font-size:18px;line-height:1.45}.record-seal,.champion-line{padding:14px;border-block:1px solid var(--line);color:var(--beacon);text-align:center;letter-spacing:.08em}.muster-list{display:grid;gap:12px}.muster-row{border:1px solid var(--line);border-left:4px solid var(--accent);padding:14px;background:rgba(23,23,28,.86)}.muster-row header,.sheet-title{display:flex;align-items:center;gap:12px}.muster-row header span,.sheet-title span{min-width:0;flex:1}.muster-row b,.sheet-title h2{display:block}.muster-row small,.sheet-title small{display:block;color:var(--muted);margin-top:3px}.avatar,.chip-face,.beat-portrait,.sheet-portrait{display:block;object-fit:cover;background:var(--iron);border:1px solid var(--line)}.avatar{width:44px;height:44px;border-radius:50%}.fallback{display:grid;place-items:center;font:700 11px var(--mono)}.muster-cast{display:flex;gap:8px;overflow-x:auto;padding:12px 0 2px;scrollbar-width:none}.character-chip{min-width:92px;min-height:62px;border:1px solid var(--line);background:var(--jet);padding:8px;display:flex;align-items:center;gap:7px;text-align:left}.character-chip span{font-size:12px;line-height:1.15}.chip-face{width:34px;height:42px;flex:0 0 34px}.tier-lead{border-color:var(--beacon)}.tier-present,.tier-absent{opacity:.62}.tier-absent{filter:grayscale(1)}.act-divider{align-content:center}.act-divider .stage{padding-block:18vh;border-block:1px solid var(--line)}.beat-head{display:flex;align-items:end;gap:14px}.beat-head>div{flex:1}.beat-portrait{width:82px;height:106px}.weight-death,.weight-betrayal{isolation:isolate}.weight-death:after,.weight-betrayal:after{content:"";position:fixed;z-index:3;inset:0;pointer-events:none;background:var(--jet);opacity:0}.weight-death.on:after,.weight-betrayal.on:after{animation:theaterDim 1050ms ease-out both}@keyframes theaterDim{0%{opacity:0}18%{opacity:.88}42%{opacity:.88}100%{opacity:0}}.beat .stage{position:relative;z-index:2}.weight-death{box-shadow:inset 0 10px 0 var(--madder)}.weight-betrayal{box-shadow:inset 0 14px 0 var(--madder);background:radial-gradient(ellipse at 50% 0,rgba(194,96,76,.34),transparent 58%),var(--jet)}.weight-death h2,.weight-betrayal h2{color:var(--vellum)}.weight-betrayal h2{font-size:clamp(40px,13vw,66px)}.ember-canvas{position:fixed;z-index:1;inset:0;width:100%;height:100%;pointer-events:none;opacity:.68}.ledger{display:grid;gap:8px}.ledger-line{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px;padding:11px;border:1px solid var(--line);background:rgba(23,23,28,.84)}.ledger-line p{margin:0;line-height:1.25}.ledger-line small{display:block;color:var(--muted);font:10px/1.4 var(--mono);text-transform:uppercase;margin-top:4px}.ledger-line strong{font:700 18px var(--mono)}.ledger-rule-chip{display:inline-flex;align-items:center;gap:4px;min-height:34px;margin-top:7px;border:1px solid var(--line);background:transparent;padding:5px 7px;color:var(--beacon);font:700 9px var(--mono);letter-spacing:.08em;text-transform:uppercase}.ledger-rule-chip svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;transition:transform var(--fast)}.ledger-rule-chip[aria-expanded="true"] svg{transform:rotate(90deg)}.ledger-line>.trigger-rule{grid-column:1/-1;padding:10px 0 2px;border-top:1px solid var(--line)}.player-mark{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--accent);color:var(--accent);font:700 10px var(--mono)}.no-card{grid-template-columns:70px 1fr;border-color:var(--muted);border-style:dashed;background:rgba(154,147,135,.07);color:var(--muted)}.line-mark{width:max-content;padding:5px 7px;border:1px solid var(--muted);font:700 9px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.desk{border-top:1px solid var(--line);padding-top:18px}.quote{display:none}.quote.active{display:block}.quote-speaker{margin:0 0 7px;color:var(--beacon);font:700 11px var(--mono);text-transform:uppercase}.quote blockquote{margin:0;font-size:18px;line-height:1.45}.refs{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.refs span{border:1px solid var(--line);padding:6px 8px;font:10px var(--mono);color:var(--muted)}.quote-controls{display:flex;align-items:center;justify-content:space-between;margin-top:13px}.quote-controls button{min-height:44px;border:1px solid var(--line);background:var(--iron);padding:0 13px}.quote-controls span{font:11px var(--mono);color:var(--muted)}.standings{display:grid;gap:8px}.standing{display:grid;grid-template-columns:24px 44px 1fr auto;align-items:center;gap:9px;min-height:58px;padding:7px 12px;border:1px solid var(--line);border-left:3px solid var(--accent);background:var(--iron)}.standing>span,.standing>strong{font:700 16px var(--mono)}.standing>span{color:var(--muted)}.final-standings .standing:first-child{border-color:var(--beacon)}.personal-gate{display:grid;gap:10px}.personal-choice{min-height:64px;display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--iron);text-align:left}.personal-choice span{display:block}.personal-choice small{display:block;color:var(--muted);margin-top:3px}.settlement-proof{display:flex;justify-content:space-between;border-block:1px solid var(--line);padding:13px 0;font:11px var(--mono);color:var(--muted)}.door{display:grid;place-items:center;min-height:48px;width:100%;border:1px solid var(--beacon);background:transparent;color:var(--vellum);text-decoration:none}.chrome{position:fixed;z-index:20;left:0;right:0;bottom:0;height:calc(var(--nav-h) + var(--safe-bottom));padding:8px 12px calc(8px + var(--safe-bottom));display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:8px;background:linear-gradient(transparent,rgba(12,12,16,.92) 18%,var(--jet) 45%)}.nav-button{width:48px;height:48px;border:1px solid var(--line);background:var(--iron);font-size:22px}.progress-track{height:2px;background:var(--line)}.progress{height:100%;width:0;background:var(--beacon);transition:width var(--base)}.hint{position:fixed;z-index:19;left:50%;bottom:calc(var(--safe-bottom) + var(--nav-h) + 5px);transform:translateX(-50%);font:10px var(--mono);color:var(--muted);white-space:nowrap;transition:opacity var(--fast)}.hint.used{opacity:0}.sheet-wrap{display:none;position:fixed;z-index:40;inset:0;background:rgba(0,0,0,.7);align-items:end}.sheet-wrap.on{display:flex}.sheet{width:min(100%,540px);max-height:88dvh;overflow:auto;margin:0 auto;background:var(--vellum);color:var(--ink);padding:18px 18px calc(20px + var(--safe-bottom));border-radius:16px 16px 0 0}.sheet-close{position:sticky;z-index:2;top:0;margin-left:auto;width:44px;height:44px;border:1px solid rgba(36,31,23,.3);background:var(--vellum);color:var(--ink)}.sheet-panel{display:none}.sheet-panel.on{display:block}.sheet-title{padding-bottom:14px;border-bottom:1px solid rgba(36,31,23,.28)}.sheet-title h2{font-size:30px}.sheet-title .kicker{color:#743226}.sheet-title strong{font:700 26px var(--mono)}.sheet-portrait{width:64px;height:78px}.sheet-note{font-size:17px;line-height:1.45}.trigger-list{display:grid;gap:7px}.trigger{display:grid;grid-template-columns:52px 1fr auto;gap:8px;align-items:center;padding:10px;border:1px solid rgba(36,31,23,.24);opacity:.58}.trigger.fired{opacity:1;border-left:4px solid #743226}.trigger span{font:700 9px var(--mono);text-transform:uppercase}.trigger p{margin:0}.trigger strong{font:700 14px var(--mono)}.personal-roster{display:flex;gap:7px;overflow:auto;padding:14px 0}.personal-roster button{min-height:44px;border:1px solid rgba(36,31,23,.3);background:transparent;color:var(--ink);padding:8px 10px;white-space:nowrap}.bingo-board{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}.bingo-cell{min-width:0;aspect-ratio:1;display:grid;place-items:center;padding:3px;border:1px solid rgba(36,31,23,.24);font-size:8px;text-align:center;overflow-wrap:anywhere}.bingo-cell.marked{background:#292219;color:#e2d5b9}.bingo-cell.free{outline:2px solid #b9863f;outline-offset:-3px}.quiet{color:var(--muted);font-style:italic}.accent-ash{--accent:var(--ash)}.accent-blue{--accent:var(--blue)}.accent-gold{--accent:var(--gold)}.accent-madder{--accent:var(--madder)}.accent-violet{--accent:var(--violet)}
@media (min-width:700px){.slide{padding-inline:32px}.muster-list{grid-template-columns:1fr 1fr}.sheet{border-radius:16px;margin-bottom:18px}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}.weight-death.on:after,.weight-betrayal.on:after{animation:none!important}.curtain-panel{transition:none!important}}
/* FINAL OVERRIDES: artifact fixes belong below this line. */
.proof-banner{display:none}.proof-mode .proof-banner{position:fixed;z-index:60;inset:0 0 auto;height:calc(var(--safe-top) + 28px);padding-top:var(--safe-top);display:grid;place-items:center;background:var(--madder);color:var(--vellum);font:700 10px var(--mono);letter-spacing:.12em;text-transform:uppercase}.proof-mode .slide{padding-top:calc(var(--safe-top) + 62px)}
.curtain{position:fixed;z-index:5;inset:0;overflow:hidden;pointer-events:none}.curtain-panel{position:absolute;inset-block:0;width:50.5%;background:linear-gradient(90deg,rgba(194,96,76,.04),rgba(194,96,76,.22) 18%,rgba(12,12,16,.26) 34%,rgba(194,96,76,.18) 52%,rgba(12,12,16,.34) 72%,rgba(194,96,76,.12)),var(--jet);transition:transform 780ms cubic-bezier(.72,0,.2,1);will-change:transform}.curtain-left{left:0;box-shadow:inset -12px 0 18px rgba(0,0,0,.48)}.curtain-right{right:0;transform:scaleX(-1);box-shadow:inset 12px 0 18px rgba(0,0,0,.48)}.curtain-open .curtain-left{transform:translateX(-102%)}.curtain-open .curtain-right{transform:translateX(102%) scaleX(-1)}.scene-title .stage{position:relative;z-index:6}
.quote-layout{display:grid;grid-template-columns:54px minmax(0,1fr);gap:12px;align-items:start}.quote-copy{min-width:0}.quote-portrait{display:block;width:54px;height:68px;object-fit:cover;border:1px solid var(--line);background:var(--iron)}
.interstitial-head{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:18px;align-items:center}.interstitial-cast-frame{width:112px;height:112px;margin:4px;display:grid;place-items:center;border:1px solid var(--beacon);outline:1px solid var(--beacon);outline-offset:4px}.interstitial-cast-portrait{display:block;width:92px;height:92px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:var(--iron)}
.ledger-icon{display:block;width:28px;height:28px;margin-inline:3px;border-radius:4px;background:var(--iron)}.ledger-portrait{object-fit:cover;border:1px solid var(--line)}.bingo-hallmark{fill:none;stroke:var(--beacon);stroke-width:1.4;stroke-linejoin:round}
.muster-hint{margin-bottom:10px;color:var(--muted);font:10px/1.4 var(--mono);letter-spacing:.04em}.muster-cast{display:grid;grid-template-columns:1fr;gap:10px;overflow:visible;padding:12px 0 2px}.muster-zones{grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}.muster-tier{min-width:0}.muster-tier-label{margin:0 0 6px;color:var(--muted);font:700 9px var(--mono);letter-spacing:.12em;text-transform:uppercase}.muster-tier>div{display:flex;flex-wrap:wrap;gap:8px;overflow:visible}.muster-tier.tier-lead,.muster-tier.tier-support{grid-column:1}.muster-tier.tier-present,.muster-tier.tier-absent{grid-column:2}.muster-impact-only .muster-tier,.muster-rest-only .muster-tier{grid-column:1}.muster-tier.tier-lead .character-chip{border-color:var(--beacon)}.muster-tier.tier-present,.muster-tier.tier-absent{opacity:.62}.muster-tier.tier-absent{filter:grayscale(1)}.character-chip{position:relative}.chip-label{min-width:0;flex:1}.chip-chevron{width:15px;height:15px;flex:0 0 15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;color:var(--muted)}.impact-chip{width:var(--chip-width);min-width:var(--chip-width);max-width:var(--chip-width);min-height:var(--chip-height)}.impact-chip .chip-face{width:var(--face-width);height:var(--face-height);flex-basis:var(--face-width)}.tier-present .character-chip,.tier-absent .character-chip{min-width:78px;min-height:52px;padding:6px}.tier-present .chip-face,.tier-absent .chip-face{width:28px;height:34px;flex-basis:28px}.tier-present .chip-chevron,.tier-absent .chip-chevron{width:12px;height:12px;flex-basis:12px}
.trigger.has-rule{display:block;padding:0}.trigger-rule-toggle{position:relative;width:100%;min-height:48px;display:grid;grid-template-columns:52px 1fr auto 18px;gap:8px;align-items:center;padding:10px;border:0;background:transparent;color:var(--ink);text-align:left}.trigger-rule-toggle svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;transition:transform var(--fast)}.trigger-rule-toggle[aria-expanded="true"] svg{transform:rotate(90deg)}.trigger-rule{padding:4px 12px 14px 70px;border-top:1px solid rgba(36,31,23,.18)}.trigger-rule[hidden]{display:none}.trigger-condition{font-size:15px;line-height:1.45}.trigger-rule-section{margin-top:12px}.trigger-rule-section>b,.trigger-policy dt{font:700 9px var(--mono);letter-spacing:.08em;text-transform:uppercase}.trigger-rule-section ul{margin:6px 0 0;padding-left:18px}.trigger-rule-section li{margin-top:4px;font-size:13px;line-height:1.4}.trigger-policy{display:grid;gap:6px;margin:12px 0 0}.trigger-policy div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(36,31,23,.14);padding-bottom:5px}.trigger-policy dd{margin:0;font:11px var(--mono);text-transform:capitalize}.trigger-provenance p{margin-top:5px;font-size:12px;line-height:1.4}.trigger-provenance div{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.trigger-provenance code{border:1px solid rgba(36,31,23,.22);padding:3px 5px;font:9px var(--mono)}
.sheet button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}.sheet-wrap.personal-open .sheet{position:relative;width:min(100%,420px);height:100dvh;max-height:100dvh;border-radius:0;padding:calc(18px + var(--safe-top)) 18px calc(20px + var(--safe-bottom))}.sheet-wrap.personal-open .sheet-close{position:absolute;top:calc(18px + var(--safe-top));right:18px;margin:0}.proof-mode .sheet-wrap.personal-open .sheet{padding-top:calc(44px + var(--safe-top))}.proof-mode .sheet-wrap.personal-open .sheet-close{top:calc(38px + var(--safe-top))}.personal-panel .sheet-title{padding-right:54px}.personal-panel .personal-roster{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;overflow:visible;padding:12px 0}.personal-panel .personal-roster button{min-width:0;min-height:44px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:6px 8px;white-space:normal;text-align:left}.personal-panel .personal-roster b{font-size:12px;line-height:1.15}.personal-panel .personal-roster small{margin-top:3px;font:9px var(--mono);color:rgba(36,31,23,.62)}.personal-panel .bingo-board{width:min(100%,300px);margin:0 auto}.personal-share{width:100%;min-height:44px;margin-top:12px;border:1px solid rgba(36,31,23,.38);background:transparent;color:var(--ink);font:700 11px var(--mono);letter-spacing:.08em;text-transform:uppercase}.share-status{min-height:16px;margin:6px 0 0;text-align:center;font:10px/1.4 var(--mono);color:rgba(36,31,23,.62)}
@media (max-width:390px){.slide{padding-inline:16px}.quote blockquote{font-size:17px}.beat-portrait{width:72px;height:94px}.muster-row{padding:12px}.bingo-cell{font-size:7px}}
</style>
</head>
<body${proofMode ? ' class="proof-mode"' : ''}>
${proofMode ? '<div class="proof-banner">Synthetic proof &middot; not a settled room</div>' : ''}<div class="curtain" aria-hidden="true"><div class="curtain-panel curtain-left"></div><div class="curtain-panel curtain-right"></div></div><main class="deck">${opening}${acts}${finale}${personal}${closing}</main>
<p class="hint" id="hint">Tap the edges or swipe</p>
<nav class="chrome" aria-label="Ceremony navigation"><button class="nav-button" id="back" type="button" aria-label="Previous slide">&lsaquo;</button><div class="progress-track"><div class="progress" id="progress"></div></div><button class="nav-button" id="next" type="button" aria-label="Next slide">&rsaquo;</button></nav>
<div class="sheet-wrap" id="sheet-wrap" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Record detail"><div class="sheet"><button class="sheet-close" id="sheet-close" type="button" aria-label="Close detail">&times;</button>${characterSheets}${personalSheets}</div></div>
<script>
(function(){
  var slides=document.querySelectorAll('.slide');
  var beginsIndex=[].indexOf.call(slides,document.querySelector('[data-slide-kind="begins"]'));
  var personalIndex=[].indexOf.call(slides,document.querySelector('[data-slide-kind="personal"]'));
  var current=0;
  var progress=document.getElementById('progress');
  var hint=document.getElementById('hint');
  var sheetWrap=document.getElementById('sheet-wrap');
  var deck=document.querySelector('.deck');
  var chrome=document.querySelector('.chrome');
  var lastFocus=null;
  var touchX=0;
  var emberFrame=0;
  function stopEmbers(){
    if(emberFrame){window.cancelAnimationFrame(emberFrame);emberFrame=0}
    var canvases=document.querySelectorAll('[data-embers]');
    for(var i=0;i<canvases.length;i+=1){var context=canvases[i].getContext('2d');if(context)context.clearRect(0,0,canvases[i].width,canvases[i].height)}
  }
  function startEmbers(slide){
    var canvas=slide.querySelector('[data-embers]');
    if(!canvas)return;
    stopEmbers();
    var context=canvas.getContext('2d');
    if(!context)return;
    var width=window.innerWidth;
    var height=window.innerHeight;
    var ratio=Math.min(window.devicePixelRatio||1,2);
    var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.width=Math.round(width*ratio);
    canvas.height=Math.round(height*ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    var particles=[];
    var count=reduced?16:30;
    for(var i=0;i<count;i+=1){particles.push({x:Math.random()*width,y:height*(.42+Math.random()*.62),r:.7+Math.random()*1.6,v:.18+Math.random()*.42,d:(Math.random()-.5)*.16,a:.25+Math.random()*.45})}
    function paint(move){
      context.clearRect(0,0,width,height);
      for(var i=0;i<particles.length;i+=1){
        var particle=particles[i];
        if(move){particle.y-=particle.v;particle.x+=particle.d;if(particle.y<height*.18){particle.y=height+6;particle.x=Math.random()*width}}
        context.beginPath();
        context.arc(particle.x,particle.y,particle.r,0,Math.PI*2);
        context.fillStyle='rgba(194,96,76,'+particle.a+')';
        context.fill();
      }
    }
    if(reduced){paint(false);return}
    function frame(){paint(true);emberFrame=window.requestAnimationFrame(frame)}
    frame();
  }
  function stages(slide){return slide.querySelectorAll('.stage')}
  function reveal(slide){var list=stages(slide);for(var i=0;i<list.length;i+=1){list[i].classList.add('in')}}
  function show(index){
    if(index<0||index>=slides.length)return;
    stopEmbers();
    slides[current].classList.remove('on');
    current=index;
    slides[current].classList.add('on');
    slides[current].scrollTop=0;
    document.body.classList.toggle('curtain-open',index>beginsIndex);
    reveal(slides[current]);
    startEmbers(slides[current]);
    progress.style.width=(slides.length===1?100:(current/(slides.length-1))*100)+'%';
  }
  function retireHint(){hint.classList.add('used')}
  function next(){if(sheetWrap.classList.contains('on'))return;retireHint();show(current+1)}
  function back(){if(sheetWrap.classList.contains('on'))return;retireHint();show(current-1)}
  function setSheetOpen(open){deck.inert=open;chrome.inert=open;hint.inert=open;sheetWrap.setAttribute('aria-hidden',open?'false':'true')}
  function clearSheetPanels(){var panels=document.querySelectorAll('.sheet-panel.on');for(var i=0;i<panels.length;i+=1)panels[i].classList.remove('on')}
  function closeSheet(){var restore=lastFocus;sheetWrap.classList.remove('on','personal-open');clearSheetPanels();setSheetOpen(false);lastFocus=null;if(restore&&restore.isConnected)restore.focus()}
  function openPanel(selector){var panel=document.querySelector(selector);if(!panel)return;if(!sheetWrap.classList.contains('on'))lastFocus=document.activeElement;clearSheetPanels();panel.classList.add('on');sheetWrap.classList.add('on');sheetWrap.classList.toggle('personal-open',panel.classList.contains('personal-panel'));setSheetOpen(true);sheetWrap.querySelector('.sheet').scrollTop=0;var status=panel.querySelector('[data-share-status]');if(status)status.textContent='';sheetWrap.querySelector('.sheet-close').focus()}
  function personalPanel(playerId){var panels=document.querySelectorAll('[data-personal-panel]');for(var i=0;i<panels.length;i+=1){if(panels[i].getAttribute('data-personal-panel')===playerId)return panels[i]}return null}
  function personalUrl(playerId){var url=new URL(window.location.href);url.searchParams.set('player',playerId);url.hash='';return url.href}
  function setPersonalUrl(playerId){try{history.replaceState(null,'',personalUrl(playerId))}catch(error){return false}return true}
  function openPersonal(playerId,updateUrl){var panel=personalPanel(playerId);if(!panel)return false;if(updateUrl)setPersonalUrl(playerId);if(personalIndex>=0)show(personalIndex);openPanel('[data-personal-panel="'+playerId+'"]');return true}
  function shareStatus(button,message){var status=button.parentNode.querySelector('[data-share-status]');if(status)status.textContent=message}
  function copyPersonal(button,text,url){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text+' · '+url).then(function(){shareStatus(button,'Edition link copied.')}).catch(function(){shareStatus(button,'The personal link is ready in the address bar.')});return}shareStatus(button,'The personal link is ready in the address bar.')}
  function canSharePersonal(data){var protocol;try{protocol=new URL(data.url).protocol}catch(error){return false}if(protocol!=='http:'&&protocol!=='https:')return false;if(!navigator.share)return false;if(!navigator.canShare)return false;try{return navigator.canShare(data)}catch(error){return false}}
  function sharePersonal(button){var playerId=button.getAttribute('data-share-personal');var url=personalUrl(playerId);setPersonalUrl(playerId);var text=button.getAttribute('data-share-name')+' · '+button.getAttribute('data-share-total')+' points';var data={title:document.title,text:text,url:url};if(canSharePersonal(data)){navigator.share(data).then(function(){shareStatus(button,'Edition shared.')}).catch(function(error){if(error&&error.name==='AbortError'){shareStatus(button,'Share canceled.');return}copyPersonal(button,text,url)});return}copyPersonal(button,text,url)}
  function sheetFocusables(){var nodes=sheetWrap.querySelectorAll('button,a[href],[tabindex]:not([tabindex="-1"])');var visible=[];for(var i=0;i<nodes.length;i+=1){if(!nodes[i].disabled&&nodes[i].offsetParent!==null)visible.push(nodes[i])}return visible}
  function trapSheetFocus(event){var list=sheetFocusables();if(!list.length){event.preventDefault();return}var first=list[0];var last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}else if(!sheetWrap.contains(document.activeElement)){event.preventDefault();first.focus()}}
  document.getElementById('next').addEventListener('click',next);
  document.getElementById('back').addEventListener('click',back);
  document.getElementById('sheet-close').addEventListener('click',closeSheet);
  sheetWrap.addEventListener('click',function(event){if(event.target===sheetWrap)closeSheet()});
  document.addEventListener('keydown',function(event){if(sheetWrap.classList.contains('on')){if(event.key==='Escape')closeSheet();if(event.key==='Tab'){trapSheetFocus(event)}return}if(event.key==='ArrowRight'||event.key===' '){event.preventDefault();next()}if(event.key==='ArrowLeft'){event.preventDefault();back()}});
  document.addEventListener('touchstart',function(event){touchX=event.changedTouches[0].screenX},{passive:true});
  document.addEventListener('touchend',function(event){if(sheetWrap.classList.contains('on'))return;var dx=event.changedTouches[0].screenX-touchX;if(Math.abs(dx)>54){if(dx<0)next();else back()}},{passive:true});
  window.addEventListener('pagehide',stopEmbers);
  document.addEventListener('click',function(event){
    var triggerToggle=event.target.closest('[data-trigger-toggle]');
    if(triggerToggle){
      event.stopPropagation();
      var expanded=triggerToggle.getAttribute('aria-expanded')==='true';
      var rule=document.getElementById(triggerToggle.getAttribute('aria-controls'));
      triggerToggle.setAttribute('aria-expanded',expanded?'false':'true');
      if(rule)rule.hidden=expanded;
      return;
    }
    var character=event.target.closest('[data-character]');
    if(character){event.stopPropagation();openPanel('[data-character-panel="'+character.getAttribute('data-character')+'"]');return}
    var share=event.target.closest('[data-share-personal]');
    if(share){event.stopPropagation();sharePersonal(share);return}
    var personal=event.target.closest('[data-personal]');
    if(personal){event.stopPropagation();openPersonal(personal.getAttribute('data-personal'),true);return}
    var restart=event.target.closest('[data-begin-again]');if(restart){show(0);return}
    var desk=event.target.closest('[data-desk]');
    if(desk&&(event.target.closest('[data-quote-next]')||event.target.closest('[data-quote-prev]'))){
      var quotes=desk.querySelectorAll('.quote');var active=0;for(var i=0;i<quotes.length;i+=1){if(quotes[i].classList.contains('active'))active=i}
      quotes[active].classList.remove('active');
      active=(active+(event.target.closest('[data-quote-next]')?1:-1)+quotes.length)%quotes.length;
      quotes[active].classList.add('active');desk.querySelector('[data-quote-position]').textContent=String(active+1);
      return;
    }
    if(sheetWrap.classList.contains('on')||event.target.closest('button,a'))return;
    if(event.clientX<=56){back();return}if(event.clientX>=window.innerWidth-56){next()}
  });
  show(0);
  var requestedPlayer=new URLSearchParams(window.location.search).get('player');
  if(requestedPlayer)openPersonal(requestedPlayer,false);
})();
</script>
</body>
</html>`
}

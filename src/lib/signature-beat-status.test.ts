import { describe, expect, it } from 'vitest'
import type { CategoryRow, DraftEntityRow, NomineeRow, SignatureBeatRow } from '../types/database'
import {
  declarationMatchesSignatureBeat,
  draftEntityHasHitSignatureBeat,
  signatureBeatWasHit,
} from './signature-beat-status'

const entity: DraftEntityRow = {
  id: 'entity-aegon',
  name: 'Aegon II',
  type: 'person',
  nominations: [],
  film_name: 'The Greens',
  nom_count: 1,
  show_pack_id: 'pack-finale',
  pack_key: 'aegon-ii',
}

const nominee: NomineeRow = {
  id: 'nominee-aegon',
  name: 'Aegon II',
  type: 'person',
  film_name: 'The Greens',
  image_url: '',
  show_pack_id: 'pack-finale',
  pack_key: 'aegon-ii',
}

const beat: SignatureBeatRow = {
  id: 42,
  entity_id: entity.id,
  partner_entity_id: null,
  name: 'Aegon takes the throne',
  trigger_text: 'The episode depicts Aegon taking the throne.',
  odds: 'coin_flip',
  points: 8,
  pitch: '',
  show_pack_id: 'pack-finale',
  pack_key: 'aegon-takes-throne',
}

function declaration(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 7,
    name: 'Operator wording may change',
    tier: 1,
    points: 8,
    display_order: 7,
    winner_id: nominee.id,
    tie_winner_id: null,
    announced_at: '2026-08-11T00:00:00Z',
    show_pack_id: 'pack-finale',
    room_id: 'room',
    source_signature_beat_id: beat.id,
    ...overrides,
  }
}

describe('declarationMatchesSignatureBeat', () => {
  it('uses persisted source identity even when operator wording differs', () => {
    expect(declarationMatchesSignatureBeat(declaration(), beat)).toBe(true)
  })

  it('fails closed on a sourced declaration whose display name happens to match another beat', () => {
    expect(declarationMatchesSignatureBeat(declaration({
      name: beat.name,
      source_signature_beat_id: 99,
    }), beat)).toBe(false)
  })

  it('preserves the historical name and detail-suffix fallback only when provenance is absent', () => {
    expect(declarationMatchesSignatureBeat(declaration({
      name: `${beat.name} — witnessed live`,
      source_signature_beat_id: null,
      source_trigger_contract: null,
    }), beat)).toBe(true)
  })
})

describe('signature beat roster status', () => {
  it('requires both the sourced beat and the canonically identified winning entity', () => {
    expect(signatureBeatWasHit(beat, entity, [declaration()], [nominee])).toBe(true)
    expect(draftEntityHasHitSignatureBeat(entity, [declaration()], [nominee], [beat])).toBe(true)
    expect(signatureBeatWasHit(beat, entity, [declaration({ winner_id: 'someone-else' })], [nominee]))
      .toBe(false)
  })
})

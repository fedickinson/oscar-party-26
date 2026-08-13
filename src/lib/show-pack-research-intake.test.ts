import { describe, expect, it } from 'vitest'
import {
  applyShowPackResearchIntake,
  assertShowPackResearchIntakeResultCurrent,
  buildShowPackResearchIntakePacket,
  inspectShowPackResearchIntakeDecisions,
  serializeShowPackResearchIntakeDecisionTemplate,
  serializeShowPackResearchIntakePacket,
} from './show-pack-research-intake'
import type { ShowPackFlywheelSeed } from './show-pack-flywheel'
import { sha256Hex } from './sha256'

function seed(): ShowPackFlywheelSeed {
  return {
    schema_version: 3,
    artifact: 'show-pack-flywheel-seed',
    predecessor: {
      pack_id: 'hotd-s3e7',
      settlement_id: '11111111-1111-4111-8111-111111111111',
      settlement_version: 2,
    },
    attestation: {
      pack_version: 7,
      registry_id: '22222222-2222-4222-8222-222222222222',
      receipt_source: 'scripts/settle-room.mts',
      manifest_hash: 'a'.repeat(64),
      receipt_sha256: 'b'.repeat(64),
      revision: { settled_at: '2026-08-11T03:00:00.000Z', supersedes_id: null },
    },
    source: {
      id: 'predecessor-settlement', kind: 'operator_record',
      title: 'Settled predecessor record', locator: 'settlement:proof',
    },
    screen_claims: [{
      id: 'predecessor-screen-fact-001', canon: 'screen', status: 'verified',
      text: 'The Fox broke the bargain.', source_ids: ['predecessor-settlement'],
    }],
    facts: [{
      id: 'fox-breaks-bargain', sequence: 1, title: 'The Fox breaks the bargain',
      outcome: 'resolved', board_status: 'authored', winner: { id: 'fox', name: 'The Fox' },
      screen_claim_id: 'predecessor-screen-fact-001',
    }],
    events: [],
    entities: [{ id: 'fox', name: 'The Fox', net_points: 4, event_ids: [] }],
  }
}

function packetFixture() {
  const value = seed()
  const seedRaw = `${JSON.stringify(value, null, 2)}\n`
  const candidates = {
    candidate_version: 1,
    artifact: 'show-pack-research-candidates',
    target: value.predecessor,
    sources: [{
      id: 'episode-seven-recap', kind: 'recap', title: 'Episode seven recap',
      locator: 'https://example.test/recap',
    }, {
      id: 'episode-seven-sentiment', kind: 'sentiment', title: 'Episode seven reaction sweep',
      locator: 'research:episode-seven-sentiment',
    }],
    claims: [{
      id: 'recap-fox-bargain', canon: 'screen', text: 'A recap says the Fox broke the bargain.',
      source_ids: ['episode-seven-recap'],
      candidate_cross_check_claim_ids: ['predecessor-screen-fact-001'],
    }, {
      id: 'discourse-fox-bargain', canon: 'discourse', text: 'The bargain break drew strong approval.',
      source_ids: ['episode-seven-sentiment'],
      candidate_cross_check_claim_ids: [],
    }],
  }
  const candidatesRaw = `${JSON.stringify(candidates, null, 2)}\n`
  const packet = buildShowPackResearchIntakePacket(seedRaw, candidatesRaw)
  return { seedRaw, candidates, candidatesRaw, packet }
}

function completeDecisions() {
  const { packet } = packetFixture()
  const decisions = JSON.parse(serializeShowPackResearchIntakeDecisionTemplate(packet))
  Object.assign(decisions.sources[0], { disposition: 'include', note: 'Reviewed recap source.' })
  Object.assign(decisions.sources[1], { disposition: 'include', note: 'Reviewed sentiment sweep.' })
  Object.assign(decisions.claims[0], {
    disposition: 'include', status: 'verified',
    approved_cross_check_claim_ids: ['predecessor-screen-fact-001'],
    note: 'Cross-checked against the canonical settled screen claim.',
  })
  Object.assign(decisions.claims[1], {
    disposition: 'include', status: 'verified', approved_cross_check_claim_ids: [],
    note: 'Reviewed as audience discourse, not screen evidence.',
  })
  return { packet, decisions }
}

describe('show-pack research intake', () => {
  it('seals recap and sentiment candidates beside canonical predecessor evidence', () => {
    const { seedRaw, candidatesRaw, packet } = packetFixture()

    expect(packet.target).toEqual(seed().predecessor)
    expect(packet.inputs).toEqual({
      flywheel_seed_sha256: sha256Hex(seedRaw),
      candidates_sha256: sha256Hex(candidatesRaw),
    })
    expect(packet.canonical_screen_claims).toEqual(seed().screen_claims)
    expect(packet.doctrine).toMatchObject({
      recap_default_status: 'recap',
      source_material_role: 'attitude_only',
      screen_silence_verdict: 'unverifiable',
    })
  })

  it('leaves every source and claim decision open', () => {
    const { packet } = packetFixture()
    const template = JSON.parse(serializeShowPackResearchIntakeDecisionTemplate(packet))

    expect(inspectShowPackResearchIntakeDecisions(packet, template)).toEqual({
      required_values: 8,
      open_values: 8,
      open_items: [
        'sources[episode-seven-recap].disposition', 'sources[episode-seven-recap].note',
        'sources[episode-seven-sentiment].disposition', 'sources[episode-seven-sentiment].note',
        'claims[recap-fox-bargain].disposition', 'claims[recap-fox-bargain].note',
        'claims[discourse-fox-bargain].disposition', 'claims[discourse-fox-bargain].note',
      ],
      status: 'open',
    })
  })

  it('requires a canonical screen cross-check before recap becomes verified', () => {
    const { packet, decisions } = completeDecisions()
    decisions.claims[0].approved_cross_check_claim_ids = []

    expect(() => inspectShowPackResearchIntakeDecisions(packet, decisions))
      .toThrow('verified recap claim recap-fox-bargain requires an approved canonical screen cross-check')
  })

  it('keeps an included unconfirmed recap claim tagged recap and screen silence unverifiable', () => {
    const { packet, decisions } = completeDecisions()
    decisions.claims[0].status = 'recap'
    decisions.claims[0].approved_cross_check_claim_ids = []
    expect(inspectShowPackResearchIntakeDecisions(packet, decisions).status).toBe('complete')

    decisions.claims[0].status = 'unverifiable'
    expect(inspectShowPackResearchIntakeDecisions(packet, decisions).status).toBe('complete')
  })

  it('does not retain approved screen cross-checks on recap or unverifiable claims', () => {
    const { packet, decisions } = completeDecisions()
    decisions.claims[0].status = 'recap'

    expect(() => inspectShowPackResearchIntakeDecisions(packet, decisions))
      .toThrow('non-verified recap claim recap-fox-bargain cannot carry approved screen cross-checks')

    decisions.claims[0].status = 'unverifiable'
    expect(() => inspectShowPackResearchIntakeDecisions(packet, decisions))
      .toThrow('non-verified recap claim recap-fox-bargain cannot carry approved screen cross-checks')
  })

  it('rejects discourse claims without sentiment sources and unapproved cross-checks', () => {
    const { packet, decisions } = completeDecisions()
    packet.claims[1].source_ids = ['episode-seven-recap']
    decisions.expected_packet_sha256 = sha256Hex(serializeShowPackResearchIntakePacket(packet))
    expect(() => inspectShowPackResearchIntakeDecisions(packet, decisions))
      .toThrow('discourse claim discourse-fox-bargain requires a sentiment source')

    const fresh = completeDecisions()
    fresh.decisions.claims[0].approved_cross_check_claim_ids = ['predecessor-screen-missing']
    expect(() => inspectShowPackResearchIntakeDecisions(fresh.packet, fresh.decisions))
      .toThrow('references an unoffered canonical screen cross-check')
  })

  it('rejects discourse candidates that advertise screen cross-checks', () => {
    const value = packetFixture()
    value.candidates.claims[1].candidate_cross_check_claim_ids = ['predecessor-screen-fact-001']

    expect(() => buildShowPackResearchIntakePacket(
      value.seedRaw,
      `${JSON.stringify(value.candidates, null, 2)}\n`,
    )).toThrow('discourse research candidate discourse-fox-bargain cannot offer screen cross-checks')
  })

  it('materializes only included reviewed sources and claims', () => {
    const { packet, decisions } = completeDecisions()
    decisions.sources[1].disposition = 'omit'
    decisions.sources[1].note = 'Sentiment sweep was not adequate.'
    decisions.claims[1].disposition = 'omit'
    decisions.claims[1].status = null
    decisions.claims[1].approved_cross_check_claim_ids = null
    decisions.claims[1].note = 'Dependent sentiment claim omitted.'
    const result = applyShowPackResearchIntake(packet, decisions)

    expect(result.sources.map((source) => source.id)).toEqual([
      'episode-seven-recap', 'predecessor-research-review',
    ])
    expect(result.sources[1].locator).toContain(`packet:${result.packet_sha256}:decisions:${result.decisions_sha256}`)
    expect(result.claims).toEqual([{
      id: 'recap-fox-bargain', canon: 'screen', status: 'verified',
      text: 'A recap says the Fox broke the bargain.',
      source_ids: ['episode-seven-recap', 'predecessor-research-review'],
    }])
  })

  it('rebuilds and verifies the complete research artifact chain', () => {
    const { seedRaw, candidatesRaw, packet } = packetFixture()
    const { decisions } = completeDecisions()
    const packetRaw = serializeShowPackResearchIntakePacket(packet)
    const decisionsRaw = `${JSON.stringify(decisions, null, 2)}\n`
    const result = applyShowPackResearchIntake(packet, decisions)
    const resultRaw = `${JSON.stringify(result, null, 2)}\n`

    expect(assertShowPackResearchIntakeResultCurrent({
      flywheelSeedRaw: seedRaw, candidatesRaw, packetRaw, decisionsRaw, resultRaw,
    })).toEqual(result)

    const forged = structuredClone(result)
    forged.claims[0].text = 'A forged upgrade.'
    expect(() => assertShowPackResearchIntakeResultCurrent({
      flywheelSeedRaw: seedRaw,
      candidatesRaw,
      packetRaw,
      decisionsRaw,
      resultRaw: `${JSON.stringify(forged, null, 2)}\n`,
    })).toThrow('research intake result does not match the exact reviewed artifacts')
  })

  it('rejects stale decisions and noncanonical packet bytes', () => {
    const { packet, decisions } = completeDecisions()
    decisions.expected_packet_sha256 = 'f'.repeat(64)
    expect(() => inspectShowPackResearchIntakeDecisions(packet, decisions))
      .toThrow('research intake decisions do not target the exact packet bytes')

    expect(() => buildShowPackResearchIntakePacket(
      ` ${JSON.stringify(seed())}`,
      packetFixture().candidatesRaw,
    )).toThrow('flywheel seed bytes are not canonical')
    expect(serializeShowPackResearchIntakePacket(packet).endsWith('\n')).toBe(true)
  })

  it('reserves flywheel-owned source and claim identities', () => {
    const value = packetFixture()
    value.candidates.sources[0].id = 'predecessor-settlement'
    value.candidates.claims[0].source_ids = ['predecessor-settlement']
    expect(() => buildShowPackResearchIntakePacket(
      value.seedRaw,
      `${JSON.stringify(value.candidates, null, 2)}\n`,
    )).toThrow('research source id predecessor-settlement is reserved')

    const claim = packetFixture()
    claim.candidates.claims[0].id = 'predecessor-screen-forged'
    expect(() => buildShowPackResearchIntakePacket(
      claim.seedRaw,
      `${JSON.stringify(claim.candidates, null, 2)}\n`,
    )).toThrow('research claim id predecessor-screen-forged is reserved')
  })
})

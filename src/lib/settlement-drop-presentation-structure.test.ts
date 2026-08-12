import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropPresentationStructurePacket,
  serializeSettlementDropPresentationStructureDecisionTemplate,
  serializeSettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'

function sealed(name: string, raw: string) {
  return { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) }
}

function input() {
  const beatlinesRaw = JSON.stringify({
    B1: [{ kind: 'draft', char: 'Wolf', pts: '+5', text: 'Wolf arrives → Alice' }],
    B2: [{ kind: 'draft', char: 'Raven', pts: '+8', text: 'Raven warns → Bob' }],
    B3: [],
  })
  const takesRaw = JSON.stringify({
    2: [{ speaker: 'Ned', text: 'The wolf arrived.', refs: [{ name: 'Wolf' }] }],
    5: [{ speaker: 'Arya', text: 'The raven warned them.', refs: [{ name: 'Raven' }] }],
  })
  const ceremonyRaw = `<!doctype html>
    <section class="slide scene-title"><h1>Proof Night</h1></section>
    <section class="slide scene-keep actdiv"><h2>The First Act</h2><p>First subtitle.</p></section>
    <section class="slide scene-keep beat"><div class="kicker">Act I · Beat 1</div><h2>Wolf arrives</h2><p>The wolf crosses the gate.</p><div class="ledger"><div class="bl">Wolf arrives → Alice <b>+5</b></div></div></section>
    <section class="slide scene-table inter"><h2>Alice leads</h2></section>
    <section class="slide scene-field actdiv"><h2>The Second Act</h2><p>Second subtitle.</p></section>
    <section class="slide scene-field beat beat-death"><div class="kicker">Act II · Beat 1</div><h2>Raven warns</h2><p>The warning lands.</p><div class="ledger"><div class="bl">Raven warns → Bob <b>+8</b></div></div></section>
    <section class="slide scene-close beat"><div class="kicker">Act II · Epilogue</div><h2>The tally stands</h2><p>The record closes.</p><div class="ledger"><div class="bl">No points</div></div></section>
    <section class="slide scene-title personal"></section>
    <script>var PUNDITS={"2":{"name":"Ned"},"5":{"name":"Arya"}};function move(n){return PUNDITS[String(n)]}</script>`
  return {
    room_code: 'WDKH',
    ceremony: { raw: ceremonyRaw, seal: sealed('the-ceremony.html', ceremonyRaw) },
    beatlines: { raw: beatlinesRaw, seal: sealed('beatlines.json', beatlinesRaw) },
    takes: { raw: takesRaw, seal: sealed('takes.json', takesRaw) },
  }
}

describe('buildSettlementDropPresentationStructurePacket', () => {
  it('preserves slide order, act membership and explicit legacy joins', () => {
    const packet = buildSettlementDropPresentationStructurePacket(input())

    expect(packet.coverage).toEqual({
      slides: 8,
      acts: 2,
      beats: 3,
      interstitials: 1,
      beatline_groups: 3,
      beatline_group_candidates: 2,
      take_groups: 2,
      take_groups_mapped: 2,
      unresolved_beatline_groups: ['B3'],
    })
    expect(packet.acts).toEqual([
      {
        observed_act_ordinal: 1,
        divider_slide_index: 1,
        scene_class: 'scene-keep',
        title: 'The First Act',
        subtitle: 'First subtitle.',
        beat_slide_indices: [2],
        interstitial_slide_indices: [3],
      },
      {
        observed_act_ordinal: 2,
        divider_slide_index: 4,
        scene_class: 'scene-field',
        title: 'The Second Act',
        subtitle: 'Second subtitle.',
        beat_slide_indices: [5, 6],
        interstitial_slide_indices: [],
      },
    ])
    expect(packet.slides[2]).toEqual(expect.objectContaining({
      slide_index: 2,
      ordinal: 3,
      kind: 'beat',
      observed_act_ordinal: 1,
      title: 'Wolf arrives',
      beatline_group_candidate: 'B1',
      beatline_match_evidence: { shared_tokens: 3, runner_up_shared_tokens: 0 },
      take_group: '2',
      observed_weight_evidence: null,
    }))
    expect(packet.slides[5]).toEqual(expect.objectContaining({
      beatline_group_candidate: 'B2',
      take_group: '5',
      observed_weight_evidence: 'beat-death class',
    }))
    expect(packet.slides[6]).toEqual(expect.objectContaining({
      beatline_group_candidate: null,
      beatline_match_evidence: null,
      take_group: null,
    }))
  })

  it('emits a completely null decision template bound to the packet hash', () => {
    const packet = buildSettlementDropPresentationStructurePacket(input())
    const template = JSON.parse(serializeSettlementDropPresentationStructureDecisionTemplate(packet))

    expect(template.expected_packet_sha256)
      .toBe(sha256Hex(serializeSettlementDropPresentationStructurePacket(packet)))
    expect(template.show).toEqual({
      title: null,
      subtitle: null,
      closing_title: null,
      opening_eyebrow: null,
      muster_title: null,
      begins_label: null,
      note: null,
    })
    expect(template.acts).toHaveLength(2)
    expect(template.acts.every((act: Record<string, unknown>) => Object.values(act).slice(1).every((value) => value === null))).toBe(true)
    expect(template.beats).toHaveLength(3)
    expect(template.beats.every((beat: Record<string, unknown>) => Object.values(beat).slice(1).every((value) => value === null))).toBe(true)
  })

  it('rejects ambiguous ledger signatures rather than assigning by order', () => {
    const value = input()
    value.ceremony.raw = value.ceremony.raw.replace(
      '<div class="ledger"><div class="bl">No points</div></div>',
      '<div class="ledger"><div class="bl">Wolf arrives → Alice <b>+5</b></div></div>',
    )
    value.ceremony.seal = sealed('the-ceremony.html', value.ceremony.raw)

    expect(() => buildSettlementDropPresentationStructurePacket(value))
      .toThrow('beatline group B1 has ambiguous ledger signature')
  })

  it('rejects take keys that omit a runtime PUNDITS publication', () => {
    const value = input()
    value.takes.raw = value.takes.raw.replace('"5"', '"6"')
    value.takes.seal = sealed('takes.json', value.takes.raw)

    expect(() => buildSettlementDropPresentationStructurePacket(value))
      .toThrow('ceremony PUNDITS key 5 is missing from takes')
  })

  it('rejects malformed act order and seal drift', () => {
    const noAct = input()
    noAct.ceremony.raw = noAct.ceremony.raw.replace('scene-keep actdiv', 'scene-keep')
    noAct.ceremony.seal = sealed('the-ceremony.html', noAct.ceremony.raw)
    expect(() => buildSettlementDropPresentationStructurePacket(noAct))
      .toThrow('beat slide 2 appears before an act divider')

    const drifted = input()
    drifted.beatlines.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropPresentationStructurePacket(drifted))
      .toThrow('beatlines seal does not match its bytes')
  })

  it('serializes deterministically with a trailing newline', () => {
    const packet = buildSettlementDropPresentationStructurePacket(input())
    expect(serializeSettlementDropPresentationStructurePacket(packet))
      .toBe(serializeSettlementDropPresentationStructurePacket(packet))
    expect(serializeSettlementDropPresentationStructurePacket(packet).endsWith('\n')).toBe(true)
  })
})

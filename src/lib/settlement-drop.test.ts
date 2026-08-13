import { describe, expect, it } from 'vitest'
import {
  parseSettlementDropManifest,
  renderSettlementDropHtml,
  type SettlementDropManifest,
} from './settlement-drop'
import type { SettlementReceipt } from './settlement-receipt'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const receiptSha = 'b'.repeat(64)

function card(playerId: string) {
  return {
    player_id: playerId,
    bingo: Array.from({ length: 25 }, (_, index) => ({
      label: index === 12 ? 'FREE' : `Square ${index + 1}`,
      marked: index === 12 || index === 0,
      free: index === 12,
    })),
  }
}

function proofReceipt(): SettlementReceipt {
  return {
    version: 1,
    source: 'scripts/settle-room.mts',
    room_code: 'PROOF',
    room_id: '22222222-2222-4222-8222-222222222222',
    settlement_id: '11111111-1111-4111-8111-111111111111',
    settlement_version: 1,
    manifest_hash: 'a'.repeat(64),
    players: [
      { id: 'arya', name: 'Arya' },
      { id: 'tyrion', name: 'Tyrion' },
    ],
    characters: [
      { id: 'ghost', name: 'The Ghost', player_id: 'tyrion' },
      { id: 'raven', name: 'The Raven', player_id: 'arya' },
      { id: 'scribe', name: 'The Scribe', player_id: 'tyrion' },
      { id: 'wanderer', name: 'The Wanderer' },
      { id: 'wolf', name: 'The Wolf', player_id: 'arya' },
    ],
    settled_facts: [
      {
        id: 'witness-at-wall',
        sequence: 1,
        title: 'The witness reaches the wall',
        outcome: 'resolved',
        board_status: 'unscored',
        occurred_at: '2026-08-11T01:04:05.000Z',
        winner: { id: 'wanderer', name: 'The Wanderer' },
      },
      {
        id: 'gate-void',
        sequence: 2,
        title: 'The north gate opens',
        outcome: 'void',
        board_status: 'authored',
      },
    ],
    score_events: [
      {
        id: 'arya-path',
        kind: 'draft',
        player_id: 'arya',
        character_id: 'wolf',
        label: 'The Wolf finds the path',
        points: 5,
        trigger: {
          source_signature_beat_id: 42,
          contract: {
            title: 'The Wolf finds the path',
            condition: 'The Wolf must visibly find and enter the hidden path.',
            exclusions: ['A map alone does not count.'],
            adjudication: {
              proxies: 'do_not_count',
              offscreen: 'do_not_count',
              mentions: 'do_not_count',
            },
            title_review: { status: 'approved', note: 'The title matches the rule.' },
            basis_claim_ids: ['screen-claim-42'],
          },
        },
      },
      { id: 'arya-gate', kind: 'draft', player_id: 'arya', character_id: 'wolf', label: 'The Wolf keeps the gate', points: 5 },
      { id: 'arya-correction', kind: 'adjustment', player_id: 'arya', character_id: 'wolf', label: 'The duplicate call is removed', points: -2 },
      { id: 'bingo-square:tyrion-card:0', kind: 'bingo', player_id: 'tyrion', label: 'A marked square lands', points: 3 },
      { id: 'bingo-square:tyrion-card:1', kind: 'bingo', player_id: 'tyrion', label: 'Another marked square lands', points: 3 },
    ],
    personal_cards: [card('arya'), card('tyrion')],
  }
}

function proofManifest(): SettlementDropManifest {
  return {
    version: 1,
    settlement_receipt: { path: './proof-receipt.json', sha256: receiptSha },
    show: {
      title: 'The Night in Proof',
      subtitle: 'A settlement drop',
      closing_title: 'The record stands',
      return_path: '/room/PROOF/results',
    },
    assets: {
      arya: { path: './assets/arya.svg', alt: 'Arya portrait' },
      tyrion: { path: './assets/tyrion.svg', alt: 'Tyrion portrait' },
      wolf: { path: './assets/wolf.svg', alt: 'A silver wolf' },
    },
    players: [
      { id: 'arya', name: 'Arya', house: 'House Wolf', accent: 'blue', portrait_asset: 'arya' },
      { id: 'tyrion', name: 'Tyrion', house: 'House Lion', accent: 'gold', portrait_asset: 'tyrion' },
    ],
    characters: [
      {
        id: 'wolf',
        name: 'The Wolf',
        kind: 'character',
        player_id: 'arya',
        portrait_asset: 'wolf',
        muster_tier: 'lead',
        drawer: {
          note: 'The decisive claim.',
          beats: [
            { evidence_id: 'arya-path' },
            { evidence_id: 'arya-gate' },
            { evidence_id: 'arya-correction' },
          ],
        },
      },
      {
        id: 'scribe', name: 'The Scribe', kind: 'character', player_id: 'tyrion',
        portrait_asset: 'wolf', muster_tier: 'support', drawer: { beats: [] },
      },
      {
        id: 'raven', name: 'The Raven', kind: 'creature', player_id: 'arya',
        portrait_asset: 'wolf', muster_tier: 'support', drawer: { beats: [] },
      },
      {
        id: 'ghost', name: 'The Ghost', kind: 'other', player_id: 'tyrion',
        portrait_asset: 'wolf', muster_tier: 'absent', drawer: { beats: [] },
      },
      {
        id: 'wanderer', name: 'The Wanderer', kind: 'character',
        portrait_asset: 'wolf', muster_tier: 'present', drawer: { beats: [] },
      },
    ],
    opening: {
      eyebrow: 'After the room closed',
      muster_title: 'Two banners took the field',
      begins_label: 'The record opens',
    },
    acts: [
      {
        id: 'act-one',
        title: 'The first account',
        subtitle: 'What the room declared',
        scene: 'keep',
        interstitial: { portrait_asset: 'wolf' },
        beats: [
          {
            id: 'the-path',
            kicker: 'The turn',
            title: 'The path was found',
            summary: 'One claim changed the table.',
            weight: 'ordinary',
            portrait_asset: 'wolf',
            ledger: [
              { evidence_id: 'arya-path' },
              { evidence_id: 'bingo-square:tyrion-card:0' },
              { evidence_id: 'bingo-square:tyrion-card:1' },
            ],
            quotes: [
              {
                speaker: 'The Witness',
                portrait_asset: 'wolf',
                text: 'The declared path, not a rumor, changed the table.',
                refs: ['The Wolf', 'Room ruling'],
                grounding: {
                  pipeline: 'scripts/grounded-line.mts',
                  fact_block: ['The room declared that the Wolf found the path.'],
                  attempts: 1,
                  residual_findings: [],
                },
              },
              {
                speaker: 'The Skeptic',
                portrait_asset: 'wolf',
                text: 'The points follow the ruling exactly.',
                refs: ['Settlement v1'],
                grounding: {
                  pipeline: 'scripts/grounded-line.mts',
                  fact_block: ['Arya received five points for the declared beat.'],
                  attempts: 1,
                  residual_findings: [],
                },
              },
            ],
          },
          {
            id: 'the-gate',
            kicker: 'The close',
            title: 'The gate held',
            summary: 'The final three points entered the record.',
            weight: 'betrayal',
            ledger: [
              { evidence_id: 'arya-gate' },
              { evidence_id: 'arya-correction' },
              { kind: 'no_card', fact_id: 'witness-at-wall' },
            ],
            quotes: [],
          },
        ],
      },
    ],
  } as SettlementDropManifest
}

describe('settlement drop compiler', () => {
  it('renders the complete offline ceremony grammar from receipt-owned evidence', () => {
    const manifest = parseSettlementDropManifest(JSON.stringify(proofManifest()), proofReceipt(), receiptSha)
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('data-settlement-id="11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('data-slide-kind="muster"')
    expect(html).toContain('class="muster-tier-label">Heavy hitters</p>')
    expect(html).toContain('class="muster-tier-label">Impact</p>')
    expect(html).toContain('class="muster-tier-label">Just there</p>')
    expect(html).toContain('class="muster-tier-label">No scene</p>')
    expect(html).toContain('class="stage muster-hint">Tap any name for its wager sheet.</p>')
    expect(html).toContain('aria-label="Open The Wolf wager sheet"')
    expect(html).toMatch(/data-impact-rank="1"[^>]+data-character="wolf"/)
    expect(html).toMatch(/data-impact-rank="2"[^>]+data-character="raven"/)
    expect(html).toContain('class="chip-chevron"')
    expect(html).toContain('class="muster-cast muster-zones"')
    expect(html).toContain('class="muster-cast muster-impact-only"')
    expect(html).toContain('class="muster-cast muster-rest-only"')
    expect(html).toContain('<div class="curtain" aria-hidden="true"><div class="curtain-panel curtain-left"></div><div class="curtain-panel curtain-right"></div></div>')
    expect(html).toContain("var beginsIndex=[].indexOf.call(slides,document.querySelector('[data-slide-kind=\"begins\"]'));")
    expect(html).toContain("document.body.classList.toggle('curtain-open',index>beginsIndex);")
    expect(html).toContain('.curtain-open .curtain-left{transform:translateX(-102%)}')
    expect(html).toContain('.curtain-panel{transition:none!important}')
    expect(html).toContain("if(event.clientX<=56){back();return}if(event.clientX>=window.innerWidth-56){next()}")
    expect(html).toContain("function next(){if(sheetWrap.classList.contains('on'))return;")
    expect(html).toContain("sheetWrap.querySelector('.sheet-close').focus()")
    expect(html).toContain("if(event.key==='Tab'){trapSheetFocus(event)}")
    expect(html).toContain("deck.inert=open;chrome.inert=open")
    expect(html).toContain('<b>Unclaimed</b>')
    expect(html).toContain('data-beat-weight="betrayal"')
    expect(html).toContain('data-line-kind="no_card"')
    expect(html).toContain('<aside class="ledger-line no-card"')
    expect(html).toContain('The witness reaches the wall')
    expect(html).toContain('border-style:dashed')
    expect(html).toContain('class="ember-canvas" data-embers')
    expect(html).toContain('.weight-betrayal h2{font-size:clamp(')
    expect(html).toContain('@keyframes theaterDim')
    expect(html).toContain('function startEmbers')
    expect(html).toContain('data-quote-count="2"')
    expect(html).toContain('class="quote-portrait"')
    expect(html).toContain('alt="The Witness portrait"')
    expect(html).toContain('aria-label="References for The Witness"')
    expect(html).toContain('class="stage interstitial-head"')
    expect(html).toContain('class="interstitial-cast-frame"')
    expect(html).toContain('class="interstitial-cast-portrait"')
    expect(html).toContain('outline-offset:4px')
    expect((html.match(/data-line-kind="bingo"/g) ?? []).length).toBe(2)
    expect(html).toContain('A marked square lands')
    expect(html).toContain('Another marked square lands')
    expect((html.match(/class="ledger-icon bingo-hallmark"/g) ?? []).length).toBe(2)
    expect(html).toContain('class="ledger-icon ledger-portrait"')
    expect(html).toContain('The duplicate call is removed')
    expect(html).toContain('class="trigger-rule-toggle"')
    expect(html).toContain('The Wolf must visibly find and enter the hidden path.')
    expect(html).toContain('A map alone does not count.')
    expect(html).toContain('<dt>Proxies</dt><dd>do not count</dd>')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('data-trigger-rule="signature-beat-42"')
    expect(html).toContain('<strong>-2</strong>')
    expect(html).toContain('Square 1')
    expect(html).toContain('href="/room/PROOF/results"')
    expect(html).toContain(pixel)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('requires every receipt event exactly once and rejects authored score fields', () => {
    const unknown = proofManifest()
    unknown.acts[0].beats[0].ledger[0].evidence_id = 'invented'
    expect(() => parseSettlementDropManifest(JSON.stringify(unknown), proofReceipt(), receiptSha))
      .toThrow('references unknown score event invented')

    const duplicate = proofManifest()
    duplicate.acts[0].beats[0].ledger[1].evidence_id = 'arya-path'
    expect(() => parseSettlementDropManifest(JSON.stringify(duplicate), proofReceipt(), receiptSha))
      .toThrow('uses score event arya-path more than once')

    const missing = proofManifest()
    missing.acts[0].beats[0].ledger.pop()
    expect(() => parseSettlementDropManifest(JSON.stringify(missing), proofReceipt(), receiptSha))
      .toThrow('receipt score event bingo-square:tyrion-card:1 is missing from the ceremony')

    const authored = proofManifest()
    Object.assign(authored.acts[0].beats[0].ledger[0], { points: 99, player_id: 'tyrion' })
    expect(() => parseSettlementDropManifest(JSON.stringify(authored), proofReceipt(), receiptSha))
      .toThrow('scored lines may contain only evidence_id')
  })

  it('binds every no-card callout to one resolved unscored receipt fact', () => {
    const authoredText = proofManifest()
    Object.assign(authoredText.acts[0].beats[1].ledger[2], { text: 'A hand-written claim' })
    expect(() => parseSettlementDropManifest(JSON.stringify(authoredText), proofReceipt(), receiptSha))
      .toThrow('ledger line 3 has unknown field text')

    const wrongFact = proofManifest()
    wrongFact.acts[0].beats[1].ledger[2] = { kind: 'no_card', fact_id: 'gate-void' }
    expect(() => parseSettlementDropManifest(JSON.stringify(wrongFact), proofReceipt(), receiptSha))
      .toThrow('fact gate-void is not a resolved unscored settlement fact')

    const missingFact = proofManifest()
    missingFact.acts[0].beats[1].ledger.pop()
    expect(() => parseSettlementDropManifest(JSON.stringify(missingFact), proofReceipt(), receiptSha))
      .toThrow('resolved unscored settlement fact witness-at-wall is missing from the ceremony')

    const legacyReceipt = proofReceipt()
    delete legacyReceipt.settled_facts
    expect(() => parseSettlementDropManifest(JSON.stringify(proofManifest()), legacyReceipt, receiptSha))
      .toThrow('settlement receipt has no settled-fact timeline; re-emit it with settle-room')
  })

  it('binds player names and the complete roster to receipt identity', () => {
    const swappedName = proofManifest()
    swappedName.players[0].name = 'Tyrion'
    expect(() => parseSettlementDropManifest(JSON.stringify(swappedName), proofReceipt(), receiptSha))
      .toThrow('player arya name must match the settlement receipt')

    const missingCharacter = proofManifest()
    missingCharacter.characters = missingCharacter.characters.filter((character) => character.id !== 'wanderer')
    expect(() => parseSettlementDropManifest(JSON.stringify(missingCharacter), proofReceipt(), receiptSha))
      .toThrow('settlement receipt character wanderer is missing from the drop')
  })

  it('requires every fired drawer row to reference its exact character score event', () => {
    const authoredFired = proofManifest()
    Object.assign(authoredFired.characters[0].drawer.beats[0], {
      label: 'Invented trigger', points: 5, fired: true,
    })
    expect(() => parseSettlementDropManifest(JSON.stringify(authoredFired), proofReceipt(), receiptSha))
      .toThrow('fired drawer beats may contain only evidence_id')

    const wrongCharacter = proofManifest()
    wrongCharacter.characters[0].drawer.beats[0] = { evidence_id: 'bingo-square:tyrion-card:0' }
    expect(() => parseSettlementDropManifest(JSON.stringify(wrongCharacter), proofReceipt(), receiptSha))
      .toThrow('score event bingo-square:tyrion-card:0 does not belong to character wolf')
  })

  it('requires the exact receipt hash and confined authoring paths', () => {
    expect(() => parseSettlementDropManifest(JSON.stringify(proofManifest()), proofReceipt(), 'c'.repeat(64)))
      .toThrow('settlement receipt SHA-256 does not match')

    const escapedReceipt = proofManifest()
    escapedReceipt.settlement_receipt.path = '../receipt.json'
    expect(() => parseSettlementDropManifest(JSON.stringify(escapedReceipt), proofReceipt(), receiptSha))
      .toThrow('settlement_receipt.path must stay inside the drop directory')

    const escapedAsset = proofManifest()
    escapedAsset.assets.wolf.path = '../../private/wolf.svg'
    expect(() => parseSettlementDropManifest(JSON.stringify(escapedAsset), proofReceipt(), receiptSha))
      .toThrow('asset wolf path must stay inside the drop directory')
  })

  it('rejects private or stale fields at every nested authoring boundary', () => {
    const cases = [{
      expected: 'settlement_receipt has unknown field private_note',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.settlement_receipt, { private_note: 'operator-only' },
      ),
    }, {
      expected: 'show has unknown field raw_recap',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.show, { raw_recap: 'unpublished research' },
      ),
    }, {
      expected: 'asset wolf has unknown field source_prompt',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.assets.wolf, { source_prompt: 'private portrait prompt' },
      ),
    }, {
      expected: 'opening has unknown field draft_copy',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.opening, { draft_copy: 'not grounded' },
      ),
    }, {
      expected: 'player 1 has unknown field private_name',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.players[0], { private_name: 'do not publish' },
      ),
    }, {
      expected: 'character 1 has unknown field provisional_points',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.characters[0], { provisional_points: 99 },
      ),
    }, {
      expected: 'character 1 drawer has unknown field raw_trigger_notes',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.characters[0].drawer, { raw_trigger_notes: 'unreviewed' },
      ),
    }, {
      expected: 'act 1 has unknown field private_analysis',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.acts[0], { private_analysis: 'not for the artifact' },
      ),
    }, {
      expected: 'act 1 beat 1 has unknown field alternate_score',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.acts[0].beats[0], { alternate_score: 100 },
      ),
    }, {
      expected: 'act 1 beat 1 quote 1 has unknown field raw_model_output',
      mutate: (manifest: SettlementDropManifest) => Object.assign(
        manifest.acts[0].beats[0].quotes[0].grounding, { raw_model_output: 'private transcript' },
      ),
    }]

    const results = cases.map(({ mutate }) => {
      const manifest = proofManifest()
      mutate(manifest)
      try {
        parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha)
        return 'accepted'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })

    expect(results).toEqual(cases.map(({ expected }) => expected))
  })

  it('marks synthetic proof output visibly on every slide', () => {
    const receipt = proofReceipt()
    receipt.source = 'synthetic-proof'
    const manifest = parseSettlementDropManifest(JSON.stringify(proofManifest()), receipt, receiptSha)
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toContain('<body class="proof-mode">')
    expect(html).toContain('<div class="proof-banner">Synthetic proof &middot; not a settled room</div>')
    expect(html).toContain('Room PROOF &middot; synthetic record')
  })

  it('rejects prose without a clean grounded-line evidence stamp', () => {
    const manifest = proofManifest()
    manifest.acts[0].beats[0].quotes[0].grounding.residual_findings = ['Unsupported claim']
    expect(() => parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha))
      .toThrow('quote 1 is blocked by residual grounding findings')
  })

  it('requires a canonical speaker portrait for every pundit take', () => {
    const manifest = proofManifest()
    delete (manifest.acts[0].beats[0].quotes[0] as unknown as Record<string, unknown>).portrait_asset
    expect(() => parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha))
      .toThrow('quote 1 portrait_asset is required')
  })

  it('requires a registered portrait for every player', () => {
    const manifest = proofManifest()
    delete (manifest.players[0] as unknown as Record<string, unknown>).portrait_asset
    expect(() => parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha))
      .toThrow('player 1 portrait_asset is required')
  })

  it('requires a registered portrait for every draftable entity', () => {
    const manifest = proofManifest()
    delete (manifest.characters[0] as unknown as Record<string, unknown>).portrait_asset
    expect(() => parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha))
      .toThrow('character 1 portrait_asset is required')
  })

  it('requires every pundit take to expose at least one reference chip', () => {
    const manifest = proofManifest()
    manifest.acts[0].beats[0].quotes[0].refs = []
    expect(() => parseSettlementDropManifest(JSON.stringify(manifest), proofReceipt(), receiptSha))
      .toThrow('quote 1 refs must be a non-empty array')
  })

  it('requires every act interstitial to use a registered cast portrait', () => {
    const missing = proofManifest()
    delete (missing.acts[0] as unknown as Record<string, unknown>).interstitial
    expect(() => parseSettlementDropManifest(JSON.stringify(missing), proofReceipt(), receiptSha))
      .toThrow('act 1 interstitial is required')

    const unknown = proofManifest()
    unknown.acts[0].interstitial.portrait_asset = 'missing'
    expect(() => parseSettlementDropManifest(JSON.stringify(unknown), proofReceipt(), receiptSha))
      .toThrow('act 1 interstitial portrait_asset references unknown asset missing')
  })

  it('rejects missing assets, manifest-owned cards, and unsafe return paths', () => {
    const missingAsset = proofManifest()
    missingAsset.characters[0].portrait_asset = 'missing'
    expect(() => parseSettlementDropManifest(JSON.stringify(missingAsset), proofReceipt(), receiptSha))
      .toThrow('unknown asset missing')

    const forgedCards = proofManifest() as unknown as Record<string, unknown>
    forgedCards.personal_editions = [{ player_id: 'arya', bingo: [] }]
    expect(() => parseSettlementDropManifest(JSON.stringify(forgedCards), proofReceipt(), receiptSha))
      .toThrow('manifest has unknown field personal_editions')

    const externalReturn = proofManifest()
    externalReturn.show.return_path = 'https://example.com'
    expect(() => parseSettlementDropManifest(JSON.stringify(externalReturn), proofReceipt(), receiptSha))
      .toThrow('return_path must be a local absolute path')
  })

  it('rejects a receipt with a non-canonical personal card', () => {
    const receipt = proofReceipt()
    receipt.personal_cards[0].bingo[12].marked = false
    expect(() => parseSettlementDropManifest(JSON.stringify(proofManifest()), receipt, receiptSha))
      .toThrow('must have one marked free cell at index 12')
  })

  it('uses authored player order for the receipt-owned personal gate', () => {
    const authored = proofManifest()
    authored.players.reverse()
    const manifest = parseSettlementDropManifest(JSON.stringify(authored), proofReceipt(), receiptSha)
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html.indexOf('data-personal="tyrion"')).toBeLessThan(html.indexOf('data-personal="arya"'))
  })

  it('emits direct, shareable personal editions with receipt-owned roster summaries', () => {
    const manifest = parseSettlementDropManifest(
      JSON.stringify(proofManifest()), proofReceipt(), receiptSha,
    )
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toContain('data-share-personal="arya"')
    expect(html).toContain('data-share-name="Arya"')
    expect(html).toContain('data-share-total="8"')
    expect(html).toContain('<b>The Wolf</b><small>3 struck &middot; +8</small>')
    expect(html).toContain('<b>The Raven</b><small>Quiet &middot; 0</small>')
    expect(html).toContain('data-share-status aria-live="polite"')
    expect(html).toContain("new URLSearchParams(window.location.search).get('player')")
    expect(html).toContain("history.replaceState(null,'',personalUrl(playerId))")
    expect(html).toContain("if(protocol!=='http:'&&protocol!=='https:')return false")
    expect(html).toContain('if(!navigator.share)return false')
    expect(html).toContain('if(!navigator.canShare)return false')
    expect(html).toContain('return navigator.canShare(data)')
    expect(html).toContain('if(canSharePersonal(data)){navigator.share(data)')
    expect(html).toContain('navigator.clipboard.writeText(text+\' · \'+url)')
    expect(html).toContain('openPersonal(requestedPlayer,false)')
    expect(html).toContain('padding:calc(18px + var(--safe-top)) 18px calc(20px + var(--safe-bottom))')
    expect(html).toContain('top:calc(18px + var(--safe-top))')
  })

  it('uses confidence tiebreaks and shared competition ranks in the finale', () => {
    const confidenceReceipt = proofReceipt()
    confidenceReceipt.score_events = confidenceReceipt.score_events.map((event) => (
      event.id === 'bingo-square:tyrion-card:0' ? { ...event, kind: 'prediction', points: 8 } : event
    ))
    let manifest = parseSettlementDropManifest(
      JSON.stringify(proofManifest()), confidenceReceipt, receiptSha,
    )
    let html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })
    expect(html).toContain('The settled table</p><h2>Tyrion</h2>')

    const tiedReceipt = proofReceipt()
    tiedReceipt.score_events = tiedReceipt.score_events.map((event) => (
      event.id === 'bingo-square:tyrion-card:0' ? { ...event, points: 5 } : event
    ))
    manifest = parseSettlementDropManifest(JSON.stringify(proofManifest()), tiedReceipt, receiptSha)
    html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })
    expect(html).toContain('The settled table</p><h2>Arya &amp; Tyrion</h2>')
    expect(html).toContain('<h2>The lead is shared</h2>')
    expect((html.match(/<span>1<\/span>/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders reviewed trigger doctrine on conviction ledger lines without character drawers', () => {
    const convictionReceipt = proofReceipt()
    const reviewedTrigger = convictionReceipt.score_events.find((event) => event.id === 'arya-path')?.trigger
    convictionReceipt.score_events = convictionReceipt.score_events.map((event) => (
      event.id === 'bingo-square:tyrion-card:0'
        ? { ...event, kind: 'prediction' as const, trigger: reviewedTrigger }
        : event
    ))
    const manifest = parseSettlementDropManifest(
      JSON.stringify(proofManifest()), convictionReceipt, receiptSha,
    )
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toContain('class="ledger-rule-chip"')
    expect(html).toContain('ledger-trigger-bingo-square-tyrion-card-0-2')
    expect(html).toContain('data-trigger-rule="signature-beat-42"')
    expect(html).toContain('The Wolf must visibly find and enter the hidden path.')
  })

  it('renders a canonical negative player total after settlement adjustments', () => {
    const correctedReceipt = proofReceipt()
    correctedReceipt.score_events = correctedReceipt.score_events.map((event) => {
      if (event.id === 'arya-path' || event.id === 'arya-gate') return { ...event, points: 1 }
      if (event.id === 'arya-correction') return { ...event, points: -5 }
      return event
    })

    const manifest = parseSettlementDropManifest(
      JSON.stringify(proofManifest()), correctedReceipt, receiptSha,
    )
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toContain('data-share-total="-3"')
    expect(html).toContain('<strong>-3</strong>')
    expect(html).toMatch(
      /final-standings">.*<b>Tyrion<\/b><strong>6<\/strong>.*<b>Arya<\/b><strong>-3<\/strong>/s,
    )
  })

  it('calls the field level only when the complete running table is tied', () => {
    const correctedReceipt = proofReceipt()
    correctedReceipt.score_events = correctedReceipt.score_events.map((event) => {
      if (event.id === 'arya-path' || event.id === 'arya-gate') return { ...event, points: 1 }
      if (event.id === 'arya-correction') return { ...event, points: -5 }
      if (event.id === 'bingo-square:tyrion-card:1') {
        return { ...event, id: 'tyrion-correction', kind: 'adjustment', points: -3 }
      }
      return event
    })
    const authored = proofManifest()
    authored.acts[0].beats[0].ledger[2] = { evidence_id: 'tyrion-correction' }

    const manifest = parseSettlementDropManifest(
      JSON.stringify(authored), correctedReceipt, receiptSha,
    )
    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })

    expect(html).toContain('After act 1</p><h2>Tyrion holds the room</h2>')
    expect(html).not.toContain('The field remains level')
  })

  it('escapes authored text and refuses non-image embedded assets', () => {
    const manifest = parseSettlementDropManifest(JSON.stringify(proofManifest()), proofReceipt(), receiptSha)
    manifest.show.title = '<img src=x onerror=alert(1)>'
    expect(() => renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: 'file:///tmp/wolf.svg' }))
      .toThrow('embedded asset wolf must be an image data URI')

    const html = renderSettlementDropHtml(manifest, { arya: pixel, tyrion: pixel, wolf: pixel })
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})

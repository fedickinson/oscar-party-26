/**
 * player-recap-html.ts — renders one player's night as a standalone HTML file.
 *
 * THE ARTIFACT IS A SHEET OF VELLUM
 * This follows the share-artifact treatment in docs/design/share-cards-notes.md:
 * a pale manuscript page with ink copy, a deckled edge, an inner ink frame,
 * geometric motif bands, heraldic faction edges, and a wax seal carrying the
 * player's house device. It reads as a document from the world of the show
 * rather than a dark app screen — which is the point of a keepsake. It has to
 * look like something worth keeping when it is opened a year later with no app
 * around it.
 *
 * It was a dark glassmorphism page before, inherited from the Oscars build. That
 * identity is gone from the app; this file was the last thing still wearing it.
 *
 * SELF-CONTAINED, NON-NEGOTIABLY
 * Saved to a phone, AirDropped, opened offline. So: no external stylesheets, no
 * webfont requests, no <img>, no scripts. The vellum mottle is an inline SVG
 * turbulence data URI, the fibers are repeating gradients, and the seal, motif
 * bands and house devices are literal inline SVG.
 *
 * ON THE FONTS
 * The app loads Cinzel and Cormorant Garamond from Google Fonts. A file opened
 * from disk cannot reach a CDN, and the Artifact CSP blocks font hosts outright,
 * so the families are named for the rare case they are already installed and
 * Georgia carries it otherwise. Georgia is a real serif on every platform we
 * care about and holds the manuscript register far better than a UI sans.
 *
 * WHY LITERAL COLOR VALUES
 * Same reason the share cards use them (see "Export-safe literal values" in the
 * design notes): a standalone document has no token layer to inherit from. The
 * values below mirror the --t-* tokens exactly and sit in one block so a theme
 * change stays a contained edit.
 *
 * ESCAPING IS A SECURITY BOUNDARY, NOT A NICETY
 * Player names and chat messages are free text typed by people at the party,
 * and the result is an HTML document opened on other people's machines. Every
 * interpolation goes through esc(). See the note there.
 */

import type { PlayerRecapData } from './player-recap'
import { HOUSE_DEVICE_PATHS, houseForAvatar, isGreenHouse } from './house-devices'

/** Mirrors the --t-* tokens in index.css. See the note above on literals. */
const C = {
  vellum: '#e2d5b9',
  vellumLight: '#f0e5cb',
  vellumDeep: '#bca982',
  ink: '#292219',
  inkMuted: '#665642',
  jet: '#101014',        // Team Black field
  madder: '#8e3b2e',     // Team Black device
  bottle: '#2c4034',     // Team Green field
  beacon: '#b9863f',     // Team Green device
  wax: '#743226',
  waxLight: '#a4513e',
  waxDark: '#451d18',
  iron: '#4a4744',
  ironDark: '#24231f',
  ashlar: '#a2988a',
  ornament: '#d6cdba',
  ground: '#17161a',     // the dark surface the sheet lies on
} as const

const DISPLAY = "'Cinzel', Georgia, 'Times New Roman', serif"
const MANUSCRIPT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif"

/** Vellum fiber and mottle, copied from the share cards so the papers match. */
const VELLUM_TEXTURE =
  `repeating-linear-gradient(2deg, rgba(102,86,66,.026) 0px, rgba(102,86,66,.026) 1px, transparent 1px, transparent 7px),` +
  `repeating-linear-gradient(91deg, rgba(240,229,203,.12) 0px, rgba(240,229,203,.12) 1px, transparent 1px, transparent 19px),` +
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.018 .08' numOctaves='5' seed='31' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='gamma' amplitude='.28' exponent='1.7' offset='0'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

/**
 * Escapes text for interpolation into HTML body content and quoted attributes.
 *
 * This file writes raw markup, so every value that came from a human MUST pass
 * through here. Chat text is the sharp edge: a player who types
 * `<img src=x onerror=...>` would otherwise get that executed in the browser of
 * everyone they shared the file with, from a local file:// origin.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TIER_LABELS: Record<string, string> = {
  likely: 'Likely',
  toss_up: 'Toss-up',
  long_shot: 'Long shot',
  chaos: 'Chaos',
}

// Written out rather than "1st" — this is a proclamation, not a scoreboard.
const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

/**
 * The repeating lozenge rule that opens and closes the sheet.
 *
 * Tiled as a fixed-size background rather than one stretched SVG. A single wide
 * SVG with preserveAspectRatio="none" squashed each lozenge into a sliver at
 * phone widths; tiling keeps the ornament at its drawn size whatever the sheet
 * is scaled to, which is what an engraved band should do.
 */
const MOTIF_UNIT =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='24' viewBox='0 0 40 24'%3E%3Cpath d='M0 12 10 3l10 9-10 9Zm20 0 10-9 10 9-10 9Z' fill='none' stroke='%23d6cdba' stroke-width='1.6'/%3E%3Ccircle cx='10' cy='12' r='2.2' fill='%23d6cdba'/%3E%3Ccircle cx='30' cy='12' r='2.2' fill='%23d6cdba'/%3E%3C/svg%3E")`

function motifBand(): string {
  return `<div class="motif-band" aria-hidden="true"></div>`
}

/**
 * The signet: an iron handle, a pool of wax, and the player's house device
 * pressed into it. Traced from the Signet hallmark, inline rather than a <use>
 * reference because there is no symbol sheet in a standalone file.
 */
function signet(house: keyof typeof HOUSE_DEVICE_PATHS): string {
  return `<svg class="signet" viewBox="0 0 120 120" aria-hidden="true">
        <path fill="${C.wax}" d="M25 83c1-8 8-13 15-15 4-7 13-10 21-7 7-4 17-1 21 6 9 1 15 7 15 15 5 6 2 14-5 18-5 8-14 10-22 7-6 6-16 6-23 1-9 2-17-3-19-11-6-3-7-10-3-14Z"/>
        <path fill="${C.waxDark}" d="M29 92c8 5 17 7 27 6 12 5 25 1 31-8l8-3c2 5 0 10-5 14-5 7-13 9-21 6-6 6-16 6-23 1-8 2-15-2-18-9Z"/>
        <path fill="${C.waxLight}" d="M28 82c5-7 13-10 21-9 7-7 19-8 27-2 7 0 13 3 17 8-8-3-15-2-21 1-11-4-23-2-31 5-5-1-9-1-13 1Z"/>
        <ellipse cx="60" cy="84" rx="22" ry="16" fill="${C.vellumDeep}"/>
        <g transform="translate(50 74) scale(.2)"><path fill="${C.waxDark}" d="${HOUSE_DEVICE_PATHS[house]}"/></g>
        <path fill="${C.ironDark}" fill-rule="evenodd" d="M78 9c12 2 19 12 17 24-1 9-8 16-17 18L68 66l-11-7 11-17c-5-5-7-12-5-19 2-10 7-16 15-14Zm1 8c-5-1-8 3-9 9-1 7 2 14 8 16 5 1 9-4 10-10 1-7-3-14-9-15Z"/>
        <path fill="${C.iron}" d="m65 48 13 8-11 20-17-11Z"/>
        <path fill="${C.ashlar}" d="M75 11c7-2 15 4 18 11-5-5-10-7-15-6-6 1-9 6-9 12-2-9 0-15 6-17Zm-7 39 5 3-12 18-6-4Z"/>
        <path fill="${C.ironDark}" d="m50 62 19 12-5 11-22-13Z"/>
        <path fill="${C.iron}" d="m45 61 24 14-5 12-26-15Z"/>
        <path fill="${C.ashlar}" d="m45 61 24 14-2 4-24-14Z"/>
      </svg>`
}


/**
 * The deckled edge, built in pixels rather than percentages.
 *
 * The share cards express their deckle as percentages, which works because they
 * are a fixed 1080x1350. This sheet is a scrolling page several thousand pixels
 * tall, so the same 0.1%-0.5% variance on the top edge resolved to ~20px and
 * tore visible notches out of the paper. Amplitude belongs in px; only the
 * position along each edge is proportional.
 */
function deckle(amp = 4, steps = 14): string {
  const pts: string[] = []
  const jitter = (i: number) => (i % 3 === 0 ? 1 : i % 3 === 1 ? amp : amp - 2)

  for (let i = 0; i <= steps; i++) pts.push(`${((i / steps) * 100).toFixed(1)}% ${jitter(i)}px`)
  for (let i = 1; i <= steps; i++) pts.push(`calc(100% - ${jitter(i + 1)}px) ${((i / steps) * 100).toFixed(1)}%`)
  for (let i = steps; i >= 0; i--) pts.push(`${((i / steps) * 100).toFixed(1)}% calc(100% - ${jitter(i + 2)}px)`)
  for (let i = steps; i >= 1; i--) pts.push(`${jitter(i)}px ${((i / steps) * 100).toFixed(1)}%`)

  return `polygon(${pts.join(', ')})`
}

export function renderPlayerRecapHtml(d: PlayerRecapData): string {
  const initial = esc(d.playerName.charAt(0).toUpperCase())
  const house = houseForAvatar(d.avatarId)
  const green = isGreenHouse(house)
  const factionField = green ? C.bottle : C.jet
  const factionDevice = green ? C.beacon : C.madder

  // ── Draft ─────────────────────────────────────────────────────────────────
  const rosterHtml = d.roster.length
    ? d.roster
        .map((r) => {
          const wins = r.wins.length
            ? `<ul class="wins">${r.wins
                .map((w) => `<li><span>${esc(w.event)}</span><em>${w.points}</em></li>`)
                .join('')}</ul>`
            : `<p class="quiet">Nothing came in for them.</p>`
          return `
      <div class="entry">
        <div class="entry-head">
          <div>
            <p class="kicker">${r.kind === 'dragon' ? 'Dragon' : 'Character'} &middot; claimed ${r.pickNumber}</p>
            <h3>${esc(r.name)}</h3>
          </div>
          <div class="pts${r.points > 0 ? '' : ' zero'}">${r.points}</div>
        </div>
        ${wins}
      </div>`
        })
        .join('')
    : `<p class="quiet">No roster on record.</p>`

  const draftSummaryHtml = `
      <div class="ledger-head">
        <div><p class="kicker">Claimed</p><h3>${d.draft.totalPoints}</h3></div>
        ${d.draft.best
          ? `<div class="right"><p class="kicker">Best claim</p><h3>${esc(d.draft.best.name)}</h3><p class="fine">${d.draft.best.points} at pick ${d.draft.best.pickNumber}</p></div>`
          : ''}
      </div>
      ${d.draft.blanks.length
        ? `<p class="fine ruled">Returned nothing: ${d.draft.blanks.map(esc).join(', ')}.</p>`
        : ''}
      ${d.draft.passedOn
        ? `<p class="fine ruled"><span class="marginal">Left on the board</span>
             At pick ${d.draft.passedOn.pickNumber} you took ${esc(d.draft.passedOn.youTook)} for ${d.draft.passedOn.yourPoints}.
             ${esc(d.draft.passedOn.theirName)} was still there and went on to score ${d.draft.passedOn.theirPoints}${d.draft.passedOn.takenBy ? ` &mdash; ${esc(d.draft.passedOn.takenBy)} took them` : ' &mdash; and nobody took them at all'}.</p>`
        : ''}`

  // ── Predictions ───────────────────────────────────────────────────────────
  const predRow = (p: PlayerRecapData['predictions'][number]) => `
          <li class="pred ${p.outcome}">
            <span class="pred-conf">${p.confidence}</span>
            <span class="pred-body">
              <span class="pred-event">${esc(p.event)}</span>
              <span class="pred-detail">${
                p.outcome === 'hit'
                  ? `You called ${esc(p.yourPick)}`
                  : p.outcome === 'miss'
                    ? `You said ${esc(p.yourPick)} &middot; it was ${esc(p.actual ?? 'someone else')}`
                    : `You said ${esc(p.yourPick)} &middot; never called`
              }</span>
            </span>
            <span class="pred-mark">${p.outcome === 'hit' ? `+${p.confidence}` : p.outcome === 'miss' ? '0' : '&mdash;'}</span>
          </li>`

  const hits = d.predictions.filter((p) => p.outcome === 'hit')
  const misses = d.predictions.filter((p) => p.outcome === 'miss')
  const unresolved = d.predictions.filter((p) => p.outcome === 'unresolved')

  const predGroup = (label: string, rows: typeof hits, open: boolean, note?: string) =>
    rows.length
      ? `<details class="group"${open ? ' open' : ''}>
          <summary><span class="g-title">${label}</span><span class="g-count">${rows.length}</span></summary>
          ${note ? `<p class="fine g-note">${note}</p>` : ''}
          <ul class="pred-list">${rows.map(predRow).join('')}</ul>
        </details>`
      : ''

  const predictionsHtml = d.predictions.length
    ? `
      <section>
        <h2>What you called</h2>
        <p class="section-note">${d.predictionSummary.hits} of ${d.predictionSummary.total} right &middot; ${d.predictionSummary.banked} banked${
          d.predictionSummary.strandedPoints > 0
            ? ` &middot; ${d.predictionSummary.strandedPoints} staked on events never called`
            : ''
        }</p>
        ${predGroup('Got right', hits, true)}
        ${predGroup('Got wrong', misses, false)}
        ${predGroup('Never called', unresolved, false, 'The host never resolved these, so whatever you staked on them scored nothing either way.')}
      </section>`
    : ''

  // ── Bingo ─────────────────────────────────────────────────────────────────
  const bingoHtml = d.bingo
    ? `
      <section>
        <h2>Your bingo board</h2>
        <p class="section-note">${d.bingo.approvedCount} of 24 struck &middot; ${d.bingo.lineCount} line${d.bingo.lineCount === 1 ? '' : 's'} &middot; open a square for the rule</p>
        <div class="board">
          ${d.bingo.cells
            .map(
              (c) => `<div class="cell${c.approved ? ' hit' : ''}${c.inLine ? ' inline' : ''}${c.isFree ? ' free' : ''}"><span>${esc(c.label)}</span></div>`,
            )
            .join('')}
        </div>
        <div class="squares">
          ${(() => {
            // TWO LEVELS OF DISCLOSURE, because 24 squares is a wall.
            // The grid above answers "how did I do" at a glance. Struck and
            // missed then collapse to two lines, and only the square you are
            // actually curious about opens to its rule. One flat list of 24
            // disclosures buried every other section under it.
            const detail = (c: PlayerRecapData['bingo'] extends null ? never : NonNullable<PlayerRecapData['bingo']>['cells'][number]) => {
              const tier = TIER_LABELS[c.tier] ?? ''
              const odds = c.probabilityPct > 0 ? `${c.probabilityPct}% likely` : ''
              const meta = [tier, odds].filter(Boolean).join(' &middot; ')

              // The square pool stores the same sentence in both `text` and
              // `win_condition`. Printing both renders the rule twice and reads
              // like a bug, so the description shows only when it genuinely
              // differs; "Counts when" is the more useful framing of the two.
              const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
              const rule = c.winCondition.trim()
              const blurbDiffers = c.text.trim().length > 0 && norm(c.text) !== norm(rule)
              const body = [
                blurbDiffers ? `<p class="sq-text">${esc(c.text)}</p>` : '',
                rule
                  ? `<p class="sq-rule"><span class="marginal">Counts when</span> ${esc(rule)}</p>`
                  : (!blurbDiffers && c.text.trim() ? `<p class="sq-text">${esc(c.text)}</p>` : ''),
                meta ? `<p class="fine">${meta}</p>` : '',
              ].filter(Boolean).join('\n              ')

              return `
            <details class="square${c.approved ? ' hit' : ''}">
              <summary>
                <span class="dot" aria-hidden="true"></span>
                <span class="sq-label">${esc(c.label)}</span>
                <span class="sq-state">${c.inLine ? 'In a line' : c.approved ? 'Struck' : 'Missed'}</span>
              </summary>
              <div class="square-body">${body}</div>
            </details>`
            }

            const playable = d.bingo!.cells.filter((c) => !c.isFree)
            const struck = playable.filter((c) => c.approved)
            const missed = playable.filter((c) => !c.approved)
            const group = (label: string, rows: typeof playable) =>
              rows.length
                ? `<details class="group">
            <summary><span class="g-title">${label}</span><span class="g-count">${rows.length}</span></summary>
            <div class="square-list">${rows.map(detail).join('')}</div>
          </details>`
                : ''
            return group('Struck', struck) + group('Missed', missed)
          })()}
        </div>
      </section>`
    : ''

  // ── Scraps ────────────────────────────────────────────────────────────────
  const linesHtml = d.lines.length
    ? `
      <section>
        <h2>What was said</h2>
        ${d.lines
          .map(
            (l) => `
        <div class="scrap ${l.kind}">
          <p class="scrap-text">${esc(l.text)}</p>
          <p class="scrap-author">${l.kind === 'you' ? 'You' : esc(l.author)}</p>
          ${l.note ? `<p class="scrap-note">${esc(l.note)}</p>` : ''}
        </div>`,
          )
          .join('')}
      </section>`
    : ''

  const verdictHtml = d.verdict
    ? `
      <section>
        <h2>The verdict</h2>
        <blockquote class="verdict">
          <p>${esc(d.verdict.text)}</p>
          <cite>${esc(d.verdict.companionName)}</cite>
        </blockquote>
      </section>`
    : ''

  const momentsHtml = d.moments.length
    ? `
      <section>
        <h2>Your night</h2>
        ${d.moments
          .map(
            (m) => `
        <div class="moment">
          <p class="kicker">${esc(m.label)}</p>
          <h3>${esc(m.headline)}</h3>
          <p class="fine">${esc(m.detail)}</p>
        </div>`,
          )
          .join('')}
      </section>`
    : ''

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.playerName)} — Fire &amp; Blood</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 18px 10px 40px;
    /* A dark ground so the pale sheet reads as an object lying on a table. */
    background: ${C.ground};
    color: ${C.ink};
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* ── The sheet ───────────────────────────────────────────────────────── */
  .sheet {
    position: relative;
    max-width: 660px;
    margin: 0 auto;
    background-color: ${C.vellum};
    background-image: ${VELLUM_TEXTURE};
    /* Deckled edge, matching the share cards. A clip-path, never a mask. */
    clip-path: ${deckle()};
  }

  /* Allegiance lives at the extreme edges; the page itself stays neutral. */
  .edge { position: absolute; top: 0; bottom: 0; width: 13px; background: ${factionField}; }
  .edge.l { left: 0; } .edge.r { right: 0; }
  .device { position: absolute; top: 0; bottom: 0; width: 5px; background: ${factionDevice}; }
  .device.l { left: 13px; } .device.r { right: 13px; }

  /* One-pixel ink frame, independent of the deckled silhouette so the sheet
     stays bounded against both dark feeds and white interfaces. */
  .frame {
    position: absolute; inset: 13px;
    border: 1px solid ${C.ink};
    box-shadow: inset 0 0 0 4px rgba(102,86,66,.16);
    pointer-events: none;
  }

  .inner { position: relative; padding: 24px 30px 30px; }
  @media (max-width: 480px) { .inner { padding: 22px 22px 26px; } }

  .motif-band {
    height: 20px;
    background-color: ${C.ironDark};
    background-image: ${MOTIF_UNIT};
    background-repeat: repeat-x;
    background-position: center;
    background-size: 34px 20px;
    border-top: 1px solid rgba(214,205,186,.48);
    border-bottom: 1px solid rgba(18,17,15,.82);
  }

  /* ── Type ────────────────────────────────────────────────────────────── */
  h2 {
    font-family: ${DISPLAY};
    font-size: 13px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase;
    color: ${C.inkMuted}; margin: 0 0 3px;
  }
  h3 { font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; margin: 2px 0 0; text-wrap: balance; }
  .kicker {
    font-family: ${DISPLAY}; font-size: 10px; letter-spacing: .16em;
    text-transform: uppercase; color: ${C.inkMuted}; margin: 0; font-weight: 700;
  }
  .section-note {
    font-family: ${MANUSCRIPT}; font-size: 15px; color: ${C.inkMuted};
    margin: 0 0 12px; text-wrap: pretty;
  }
  .fine { font-size: 13px; line-height: 1.55; color: ${C.inkMuted}; margin: 6px 0 0; }
  .quiet { font-family: ${MANUSCRIPT}; font-size: 15px; color: ${C.inkMuted}; margin: 8px 0 0; font-style: italic; }
  .marginal {
    display: block; font-family: ${DISPLAY}; font-size: 10px; letter-spacing: .16em;
    text-transform: uppercase; color: ${C.madder}; margin-bottom: 3px; font-weight: 700;
  }
  section { margin-top: 28px; }
  .ruled { padding-top: 11px; margin-top: 11px; border-top: 1px solid rgba(41,34,25,.16); }

  /* ── Masthead ────────────────────────────────────────────────────────── */
  header { text-align: center; padding: 20px 0 2px; }
  .presents {
    font-family: ${DISPLAY}; font-size: 11px; font-weight: 700; letter-spacing: .3em;
    text-transform: uppercase; color: ${C.inkMuted}; margin: 0 0 7px;
  }
  .masthead {
    font-family: ${DISPLAY}; font-size: 30px; font-weight: 800; letter-spacing: .05em;
    text-transform: uppercase; color: ${C.ink}; margin: 0;
  }
  .masthead em { font-style: normal; color: ${C.madder}; }
  .episode {
    font-family: ${MANUSCRIPT}; font-size: 17px; font-weight: 700;
    color: ${C.inkMuted}; margin: 6px 0 0; text-wrap: balance;
  }

  .signet { display: block; width: 124px; height: 124px; margin: 18px auto 0; }

  .identity { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
  .medallion {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700; color: ${C.vellumLight};
    border: 1px solid rgba(41,34,25,.4);
  }
  .player-name { font-family: ${DISPLAY}; font-size: 21px; font-weight: 700; color: ${C.ink}; }

  .title {
    font-family: ${DISPLAY}; font-size: 37px; font-weight: 800; color: ${C.ink};
    margin: 15px 0 0; line-height: 1.1; letter-spacing: .01em; text-wrap: balance;
  }
  .blurb {
    font-family: ${MANUSCRIPT}; font-size: 17px; line-height: 1.5;
    color: ${C.inkMuted}; margin: 9px auto 0; max-width: 430px;
  }
  .inscription {
    display: inline-block; margin-top: 14px; padding: 7px 0;
    border-top: 1px solid ${C.ink}; border-bottom: 1px solid ${C.ink};
    font-family: ${DISPLAY}; font-size: 11px; letter-spacing: .17em;
    text-transform: uppercase; color: ${C.ink};
  }

  /* ── Scoreline ───────────────────────────────────────────────────────── */
  .scoreline {
    display: grid; grid-template-columns: repeat(4, 1fr);
    margin-top: 22px; border-top: 1px solid ${C.ink}; border-bottom: 1px solid ${C.ink};
  }
  .scoreline > div { padding: 11px 4px; text-align: center; }
  .scoreline > div + div { border-left: 1px solid rgba(41,34,25,.2); }
  .big {
    font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; color: ${C.ink};
    font-variant-numeric: tabular-nums lining-nums;
  }
  .lbl {
    font-family: ${DISPLAY}; font-size: 9px; letter-spacing: .14em;
    text-transform: uppercase; color: ${C.inkMuted}; margin-top: 3px;
  }

  /* ── Verdict ─────────────────────────────────────────────────────────── */
  .verdict { margin: 0; padding: 2px 0 2px 16px; border-left: 2px solid ${C.madder}; }
  .verdict p {
    font-family: ${MANUSCRIPT}; font-size: 19px; line-height: 1.55;
    font-style: italic; color: ${C.ink}; margin: 0;
  }
  .verdict cite {
    display: block; margin-top: 9px; font-style: normal; font-family: ${DISPLAY};
    font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: ${C.inkMuted};
  }

  /* ── Moments ─────────────────────────────────────────────────────────── */
  .moment { padding: 11px 0; border-top: 1px solid rgba(41,34,25,.16); }
  .moment:first-of-type { border-top: 1px solid ${C.ink}; }

  /* ── Ledger and roster ───────────────────────────────────────────────── */
  .ledger-head {
    display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
    padding-bottom: 10px; border-bottom: 2px solid ${C.ink};
  }
  .ledger-head .right { text-align: right; }
  .ledger-head h3 { font-variant-numeric: tabular-nums lining-nums; }
  .entry { padding: 12px 0; border-top: 1px solid rgba(41,34,25,.16); }
  .entry-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .pts {
    font-family: ${DISPLAY}; font-size: 25px; font-weight: 800; color: ${C.ink};
    font-variant-numeric: tabular-nums lining-nums;
  }
  .pts.zero { color: rgba(41,34,25,.3); }
  .wins { list-style: none; margin: 9px 0 0; padding: 0; }
  .wins li {
    display: flex; justify-content: space-between; gap: 10px;
    font-size: 13px; padding: 2px 0;
    /* Leader dots, the way a ruled ledger carries the eye across. */
    background-image: radial-gradient(circle, rgba(41,34,25,.26) .5px, transparent .5px);
    background-position: 0 1.02em; background-size: 5px 1px; background-repeat: repeat-x;
  }
  .wins span, .wins em { background: ${C.vellum}; }
  .wins span { color: ${C.ink}; padding-right: 6px; }
  .wins em {
    font-style: normal; color: ${C.ink}; padding-left: 6px;
    font-variant-numeric: tabular-nums lining-nums;
  }

  /* ── Disclosure groups ───────────────────────────────────────────────── */
  .group { border-top: 1px solid rgba(41,34,25,.16); }
  .group:first-of-type { border-top: 2px solid ${C.ink}; }
  .group summary {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 11px 0; cursor: pointer; list-style: none; min-height: 44px;
  }
  .group summary::-webkit-details-marker { display: none; }
  .group summary:focus-visible { outline: 2px solid ${C.madder}; outline-offset: 2px; }
  .g-title {
    font-family: ${DISPLAY}; font-size: 12px; letter-spacing: .17em;
    text-transform: uppercase; color: ${C.ink}; font-weight: 700;
  }
  .g-count { font-size: 13px; color: ${C.inkMuted}; font-variant-numeric: tabular-nums lining-nums; }
  .g-note { margin: 0 0 6px; }
  .pred-list { list-style: none; margin: 0; padding: 0 0 10px; }
  .pred { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid rgba(41,34,25,.12); }
  .pred-conf {
    width: 26px; flex-shrink: 0; text-align: right; font-family: ${DISPLAY};
    font-size: 15px; font-weight: 700; color: rgba(41,34,25,.45);
    font-variant-numeric: tabular-nums lining-nums;
  }
  .pred.hit .pred-conf { color: ${C.madder}; }
  .pred-body { flex: 1; min-width: 0; }
  .pred-event { display: block; font-size: 14px; color: ${C.ink}; }
  .pred-detail {
    display: block; font-family: ${MANUSCRIPT}; font-size: 15px;
    color: ${C.inkMuted}; margin-top: 1px; line-height: 1.4;
  }
  .pred-mark {
    flex-shrink: 0; font-size: 13px; color: rgba(41,34,25,.38);
    font-variant-numeric: tabular-nums lining-nums;
  }
  .pred.hit .pred-mark { color: ${C.madder}; }

  /* ── Bingo ───────────────────────────────────────────────────────────── */
  .board {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px;
    border: 1px solid ${C.ink}; padding: 3px;
  }
  .cell {
    aspect-ratio: 1; padding: 3px;
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-size: 8px; line-height: 1.2; color: rgba(41,34,25,.5);
    border: 1px solid rgba(41,34,25,.14); overflow: hidden;
  }
  /* A struck square is inked over, the way you score out a list by hand. */
  .cell.hit { background: rgba(142,59,46,.17); border-color: rgba(142,59,46,.42); color: ${C.ink}; font-weight: 600; }
  .cell.inline { background: ${C.madder}; border-color: ${C.waxDark}; color: ${C.vellumLight}; font-weight: 700; }
  .cell.free { font-family: ${DISPLAY}; letter-spacing: .1em; color: ${C.inkMuted}; }

  .squares { margin-top: 14px; }
  .square-list { padding-bottom: 8px; }
  .square { border-top: 1px solid rgba(41,34,25,.14); }
  /* Nested one level in, so the inner rows read as belonging to the group. */
  .square-list .square { margin-left: 2px; }
  .square summary {
    display: flex; align-items: center; gap: 10px; padding: 10px 0;
    cursor: pointer; list-style: none; min-height: 44px;
    font-size: 13px; color: ${C.inkMuted};
  }
  .square summary::-webkit-details-marker { display: none; }
  .square summary:focus-visible { outline: 2px solid ${C.madder}; outline-offset: 2px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: rgba(41,34,25,.2); }
  .square.hit .dot { background: ${C.madder}; }
  .sq-label { flex: 1; color: ${C.ink}; }
  .sq-state {
    font-family: ${DISPLAY}; font-size: 9px; letter-spacing: .13em;
    text-transform: uppercase; color: ${C.inkMuted}; flex-shrink: 0;
  }
  .square-body { padding: 0 0 12px 17px; }
  .sq-text, .sq-rule {
    font-family: ${MANUSCRIPT}; font-size: 16px; line-height: 1.45; color: ${C.ink}; margin: 0;
  }
  .sq-text + .sq-rule { margin-top: 7px; }

  /* ── Scraps ──────────────────────────────────────────────────────────── */
  .scrap { padding: 12px 0; border-top: 1px solid rgba(41,34,25,.16); }
  .scrap:first-of-type { border-top: 2px solid ${C.ink}; }
  .scrap-text { font-family: ${MANUSCRIPT}; font-size: 18px; line-height: 1.5; color: ${C.ink}; margin: 0; }
  .scrap.you .scrap-text { font-style: italic; }
  .scrap-author {
    font-family: ${DISPLAY}; font-size: 10px; letter-spacing: .16em;
    text-transform: uppercase; color: ${C.inkMuted}; margin: 7px 0 0;
  }
  .scrap-note { font-family: ${MANUSCRIPT}; font-size: 15px; color: ${C.madder}; margin: 4px 0 0; font-style: italic; }

  footer {
    margin-top: 28px; padding-top: 15px; text-align: center;
    border-top: 1px solid ${C.ink};
    font-family: ${DISPLAY}; font-size: 10px; letter-spacing: .15em;
    text-transform: uppercase; color: ${C.inkMuted}; line-height: 2;
  }
  footer .url {
    text-transform: none; letter-spacing: .02em;
    font-family: ${MANUSCRIPT}; font-size: 13px; word-break: break-all;
  }

  @media print {
    body { background: ${C.vellum}; padding: 0; }
    .sheet { clip-path: none; max-width: none; }
    .entry, .square, .group, .scrap, .moment { break-inside: avoid; }
    /* A printed keepsake cannot be expanded, so open everything. */
    .square-body, .pred-list, .g-note { display: block !important; }
  }
</style>

<div class="sheet">
  <div class="edge l"></div><div class="edge r"></div>
  <div class="device l"></div><div class="device r"></div>
  <div class="frame"></div>

  <div class="inner">
    ${motifBand()}

    <header>
      <p class="presents">Party Night Presents</p>
      <p class="masthead">Fire <em>&amp;</em> Blood</p>
      <p class="episode">House of the Dragon &mdash; Season 3 Finale</p>

      ${signet(house)}

      <div class="identity">
        <div class="medallion" style="background: linear-gradient(135deg, ${d.avatarColors.primary} 0%, ${d.avatarColors.secondary} 100%);">${initial}</div>
        <span class="player-name">${esc(d.playerName)}</span>
      </div>

      <h1 class="title">${esc(d.title)}</h1>
      <p class="blurb">${esc(d.titleBlurb)}</p>
      <div><span class="inscription">${esc(d.titleStat)}</span></div>

      <div class="scoreline">
        <div><div class="big">${d.rank ? ordinal(d.rank) : '&mdash;'}</div><div class="lbl">of ${d.playerCount}</div></div>
        <div><div class="big">${d.ensembleScore}</div><div class="lbl">Claimed</div></div>
        <div><div class="big">${d.confidenceScore}</div><div class="lbl">Called</div></div>
        <div><div class="big">${d.bingoScore}</div><div class="lbl">Board</div></div>
      </div>
    </header>
${verdictHtml}${momentsHtml}
      <section>
        <h2>Your draft</h2>
        <p class="section-note">${d.roster.length} claimed &middot; biggest earner first</p>
        ${draftSummaryHtml}
        ${rosterHtml}
      </section>
${predictionsHtml}${bingoHtml}${linesHtml}
    <footer>
      Room ${esc(d.roomCode)} &middot; the Dance of the Dragons<br>
      <span class="url">${esc(d.recapUrl)}</span>
    </footer>

    ${motifBand()}
  </div>
</div>
`
}

/** Filename for the downloaded artifact. Safe across every OS we care about. */
export function playerRecapFileName(playerName: string, roomCode: string): string {
  const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'
  return `fire-and-blood-${slug}-${roomCode.toLowerCase()}.html`
}

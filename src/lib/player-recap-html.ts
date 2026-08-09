/**
 * player-recap-html.ts — renders one player's night as a standalone HTML file.
 *
 * SELF-CONTAINED, NON-NEGOTIABLY
 * The output is saved to a phone, AirDropped, emailed, and opened months later
 * with no network. So: no external stylesheets, no web fonts, no <img>, no
 * scripts. Avatars are a CSS gradient with an initial, the bingo board is a CSS
 * grid, and the type is a system font stack. Anything fetched at open time
 * would eventually render as a broken box on somebody's laptop.
 *
 * WHY A STRING AND NOT A REACT COMPONENT
 * This exact markup is both the downloaded file and the shared page (the page
 * renders it in an iframe). One implementation means the file a player keeps
 * cannot drift from the link they sent — which is the whole promise of the
 * artifact. A React version would have to be kept in lockstep by hand.
 *
 * ESCAPING IS A SECURITY BOUNDARY, NOT A NICETY
 * Player names and chat messages are free text typed by people at the party,
 * and the result is an HTML document that gets opened on other people's
 * machines. Every interpolation goes through esc(). See the note there.
 */

import type { PlayerRecapData } from './player-recap'

/**
 * The palette, in one place, because this file cannot use the app's theme.
 *
 * Every other surface reads --color-accent from index.css. A standalone HTML
 * file opened from disk months later has no stylesheet to inherit from, so the
 * values must be literal. Same constraint the share cards work under (they are
 * rasterised by html-to-image, which has no cascade either).
 *
 * If the theme changes, these change by hand. Hoisted here so that is a
 * four-line edit rather than a hunt through a template literal.
 */
const C = {
  // Fire & Blood castle palette — mirrors the --t-* tokens in index.css
  accent: '#B9863F',                 // beacon ochre (was Oscars gold)
  accentDim: 'rgba(185,134,63,.6)',
  bgFrom: '#151009',                 // soot
  bgVia: '#241B15',                  // leather
} as const

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

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

export function renderPlayerRecapHtml(d: PlayerRecapData): string {
  const initial = esc(d.playerName.charAt(0).toUpperCase())

  const rosterHtml = d.roster.length
    ? d.roster
        .map((r) => {
          const wins = r.wins.length
            ? `<ul class="wins">${r.wins
                .map((w) => `<li><span>${esc(w.event)}</span><em>+${w.points}</em></li>`)
                .join('')}</ul>`
            : `<p class="quiet">Nothing came in for them.</p>`
          return `
    <div class="card roster-row">
      <div class="roster-head">
        <div>
          <p class="kicker">${r.kind === 'dragon' ? 'Dragon' : 'Character'} &middot; pick ${r.pickNumber}</p>
          <h3>${esc(r.name)}</h3>
        </div>
        <div class="pts ${r.points > 0 ? '' : 'zero'}">${r.points}</div>
      </div>
      ${wins}
    </div>`
        })
        .join('')
    : `<div class="card"><p class="quiet">No roster on record.</p></div>`

  const momentsHtml = d.moments.length
    ? d.moments
        .map(
          (m) => `
    <div class="card moment">
      <p class="kicker">${esc(m.label)}</p>
      <h3>${esc(m.headline)}</h3>
      <p class="detail">${esc(m.detail)}</p>
    </div>`,
        )
        .join('')
    : ''

  // The board reads at a glance; the detail sits behind <details>, which is
  // native progressive disclosure and needs no script — the file has none.
  const bingoHtml = d.bingo
    ? `
  <section>
    <h2>Your bingo board</h2>
    <p class="section-note">${d.bingo.approvedCount} of 24 confirmed &middot; ${d.bingo.lineCount} line${d.bingo.lineCount === 1 ? '' : 's'} &middot; tap a square for the rule</p>
    <div class="board">
      ${d.bingo.cells
        .map(
          (c) => `<div class="cell${c.approved ? ' hit' : ''}${c.inLine ? ' inline' : ''}${c.isFree ? ' free' : ''}"><span>${esc(c.label)}</span></div>`,
        )
        .join('')}
    </div>

    <div class="squares">
      ${d.bingo.cells
        .filter((c) => !c.isFree)
        .map((c) => {
          const tier = TIER_LABELS[c.tier] ?? ''
          const odds = c.probabilityPct > 0 ? `${c.probabilityPct}% likely` : ''
          const meta = [tier, odds].filter(Boolean).join(' &middot; ')

          // The square pool currently stores the same sentence in both `text`
          // and `win_condition`. Printing both renders the rule twice and reads
          // like a bug. Show the description only when it genuinely differs from
          // the adjudication rule; otherwise the rule alone says everything, and
          // "Counts when" is the more useful framing of the two.
          const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
          const rule = c.winCondition.trim()
          const blurbDiffers = c.text.trim().length > 0 && norm(c.text) !== norm(rule)
          const bodyHtml = [
            blurbDiffers ? `<p class="sq-text">${esc(c.text)}</p>` : '',
            rule
              ? `<p class="sq-rule"><span>Counts when</span> ${esc(rule)}</p>`
              : (!blurbDiffers && c.text.trim() ? `<p class="sq-text">${esc(c.text)}</p>` : ''),
            meta ? `<p class="sq-meta">${meta}</p>` : '',
          ].filter(Boolean).join('\n          ')

          return `
      <details class="square${c.approved ? ' hit' : ''}">
        <summary>
          <span class="dot" aria-hidden="true"></span>
          <span class="sq-label">${esc(c.label)}</span>
          <span class="sq-state">${c.inLine ? 'In a line' : c.approved ? 'Hit' : 'Missed'}</span>
        </summary>
        <div class="square-body">
          ${bodyHtml}
        </div>
      </details>`
        })
        .join('')}
    </div>
  </section>`
    : ''

  const linesHtml = d.lines.length
    ? `
  <section>
    <h2>What was said</h2>
    ${d.lines
      .map(
        (l) => `
    <div class="card line ${l.kind}">
      <p class="line-text">${esc(l.text)}</p>
      <p class="line-author">${l.kind === 'you' ? 'You' : esc(l.author)}</p>
      ${l.note ? `<p class="line-note">${esc(l.note)}</p>` : ''}
    </div>`,
      )
      .join('')}
  </section>`
    : ''

  const verdictHtml = d.verdict
    ? `
    <div class="card verdict">
      <p class="verdict-text">&ldquo;${esc(d.verdict.text)}&rdquo;</p>
      <p class="verdict-by">&mdash; ${esc(d.verdict.companionName)}</p>
    </div>`
    : ''

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.playerName)} — House of the Dragon Finale</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 0 64px;
    background: linear-gradient(160deg, ${C.bgFrom} 0%, ${C.bgVia} 60%, ${C.bgFrom} 100%);
    background-attachment: fixed;
    color: #fff;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 620px; margin: 0 auto; padding: 0 20px; }
  section { margin-top: 40px; }
  h2 {
    font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
    color: rgba(255,255,255,.35); font-weight: 600; margin: 0 0 4px;
  }
  .section-note { font-size: 12px; color: rgba(255,255,255,.3); margin: 0 0 14px; }
  h3 { font-size: 17px; font-weight: 700; margin: 2px 0 0; }
  .card {
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 16px; padding: 16px; margin-bottom: 10px;
  }
  .kicker {
    font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
    color: rgba(255,255,255,.35); margin: 0; font-weight: 600;
  }
  .quiet { color: rgba(255,255,255,.35); font-size: 13px; margin: 8px 0 0; }
  .detail { color: rgba(255,255,255,.6); font-size: 13px; margin: 6px 0 0; line-height: 1.5; }

  /* ── Header ── */
  header { text-align: center; padding: 56px 0 8px; }
  .eyebrow {
    font-size: 10px; letter-spacing: .3em; text-transform: uppercase;
    color: ${C.accentDim}; margin: 0 0 26px; font-weight: 600;
  }
  .avatar {
    width: 96px; height: 96px; border-radius: 50%; margin: 0 auto 16px;
    display: flex; align-items: center; justify-content: center;
    font-size: 40px; font-weight: 800;
    background: linear-gradient(135deg, ${d.avatarColors.primary} 0%, ${d.avatarColors.secondary} 100%);
  }
  .name { font-size: 19px; font-weight: 600; color: rgba(255,255,255,.85); margin: 0; }
  .title {
    font-size: 38px; font-weight: 800; color: ${C.accent};
    margin: 12px 0 0; line-height: 1.08; letter-spacing: -.01em;
  }
  .blurb { color: rgba(255,255,255,.6); font-size: 14px; line-height: 1.55; margin: 12px auto 0; max-width: 420px; }
  .stat {
    display: inline-block; margin-top: 16px; padding: 8px 16px; border-radius: 999px;
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
    font-size: 12px; color: rgba(255,255,255,.65);
  }

  /* ── Scoreline ── */
  .scoreline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 28px; }
  .scoreline div {
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
    border-radius: 14px; padding: 12px 6px; text-align: center;
  }
  .scoreline .big { font-size: 21px; font-weight: 800; }
  .scoreline .lbl {
    font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
    color: rgba(255,255,255,.35); margin-top: 3px;
  }
  .scoreline .accent .big { color: ${C.accent}; }

  /* ── Verdict ── */
  .verdict { border-color: rgba(212,175,55,.25); background: rgba(212,175,55,.06); }
  .verdict-text { font-style: italic; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,.82); margin: 0; }
  .verdict-by { font-size: 12px; color: rgba(255,255,255,.4); margin: 12px 0 0; }

  /* ── Roster ── */
  .roster-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .pts { font-size: 24px; font-weight: 800; color: ${C.accent}; font-variant-numeric: tabular-nums; }
  .pts.zero { color: rgba(255,255,255,.2); }
  .wins { list-style: none; margin: 12px 0 0; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,.08); }
  .wins li { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 3px 0; }
  .wins span { color: rgba(255,255,255,.7); }
  .wins em { font-style: normal; color: ${C.accent}; font-variant-numeric: tabular-nums; }

  /* ── Bingo ── */
  .board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .cell {
    aspect-ratio: 1; border-radius: 9px; padding: 4px;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-size: 8px; line-height: 1.2; color: rgba(255,255,255,.4);
    overflow: hidden;
  }
  .cell.hit {
    background: rgba(212,175,55,.28); border-color: rgba(212,175,55,.65);
    color: #fff; font-weight: 600;
  }
  /* A completed line reads brightest — that is the thing worth pointing at. */
  .cell.inline { background: rgba(212,175,55,.55); border-color: ${C.accent}; color: #0A0E27; font-weight: 700; }
  .cell.free { color: ${C.accentDim}; font-weight: 700; }

  /* ── Bingo detail ── */
  .squares { margin-top: 14px; display: flex; flex-direction: column; gap: 4px; }
  .square {
    background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
    border-radius: 11px; overflow: hidden;
  }
  .square.hit { background: rgba(212,175,55,.07); border-color: rgba(212,175,55,.22); }
  .square summary {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 13px; cursor: pointer; list-style: none;
    font-size: 13px; color: rgba(255,255,255,.55);
  }
  /* Safari draws its own triangle unless this is suppressed too. */
  .square summary::-webkit-details-marker { display: none; }
  .square summary:focus-visible { outline: 2px solid ${C.accent}; outline-offset: -2px; }
  .square .dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    background: rgba(255,255,255,.15);
  }
  .square.hit .dot { background: ${C.accent}; }
  .sq-label { flex: 1; color: rgba(255,255,255,.8); }
  .square.hit .sq-label { color: #fff; }
  .sq-state {
    font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
    color: rgba(255,255,255,.3); flex-shrink: 0;
  }
  .square.hit .sq-state { color: ${C.accentDim}; }
  .square-body { padding: 0 13px 13px 30px; }
  .sq-text { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.72); margin: 0; }
  .sq-rule { font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.5); margin: 8px 0 0; }
  .sq-rule span { color: rgba(255,255,255,.32); text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }
  .sq-meta { font-size: 11px; color: rgba(255,255,255,.35); margin: 8px 0 0; }

  /* ── Lines ── */
  .line-text { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.82); margin: 0; }
  .line.you { border-color: rgba(212,175,55,.22); }
  .line-author { font-size: 11px; color: rgba(255,255,255,.38); margin: 10px 0 0; }
  /* The companion's reason this line was chosen. */
  .line-note {
    font-size: 12px; color: ${C.accentDim}; margin: 8px 0 0;
    padding-top: 8px; border-top: 1px solid rgba(255,255,255,.07); font-style: italic;
  }

  footer {
    margin-top: 48px; padding-top: 24px; text-align: center;
    border-top: 1px solid rgba(255,255,255,.08);
    font-size: 11px; color: rgba(255,255,255,.28); line-height: 1.8;
  }
  footer .url { color: ${C.accentDim}; word-break: break-all; }

  @media print {
    body { background: ${C.bgFrom}; }
    .card, .square { break-inside: avoid; }
    /* A printed keepsake cannot be expanded, so open everything. */
    .square-body { display: block !important; }
  }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">House of the Dragon &middot; Season 3 Finale</p>
    <div class="avatar">${initial}</div>
    <p class="name">${esc(d.playerName)}</p>
    <h1 class="title">${esc(d.title)}</h1>
    <p class="blurb">${esc(d.titleBlurb)}</p>
    <div><span class="stat">${esc(d.titleStat)}</span></div>

    <div class="scoreline">
      <div class="accent"><div class="big">${d.rank ? ordinal(d.rank) : '&mdash;'}</div><div class="lbl">of ${d.playerCount}</div></div>
      <div><div class="big">${d.ensembleScore}</div><div class="lbl">Draft</div></div>
      <div><div class="big">${d.confidenceScore}</div><div class="lbl">Picks</div></div>
      <div><div class="big">${d.bingoScore}</div><div class="lbl">Bingo</div></div>
    </div>
  </header>

  ${verdictHtml ? `<section><h2>The verdict</h2>${verdictHtml}</section>` : ''}

  ${momentsHtml ? `<section><h2>Your night</h2>${momentsHtml}</section>` : ''}

  <section>
    <h2>Your roster</h2>
    <p class="section-note">${d.ensembleScore} points drafted</p>
    ${rosterHtml}
  </section>

  ${bingoHtml}

  ${linesHtml}

  <footer>
    Room ${esc(d.roomCode)} &middot; the Dance of the Dragons<br>
    <span class="url">${esc(d.recapUrl)}</span>
  </footer>
</div>
`
}

/** Filename for the downloaded artifact. Safe across every OS we care about. */
export function playerRecapFileName(playerName: string, roomCode: string): string {
  const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'
  return `hotd-finale-${slug}-${roomCode.toLowerCase()}.html`
}

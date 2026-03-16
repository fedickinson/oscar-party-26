/**
 * recap-pdf.ts -- pure PDF generation for the Oscar Party game recap.
 *
 * Uses jsPDF to build a styled, Oscar-themed PDF document.
 * No React, no Supabase -- receives all data as arguments.
 *
 * This is a GAME recap, not a ceremony program. The story here is:
 * who was winning, who caught up, who made the boldest picks, who
 * scored on bingo. People can Google the Oscar winners. What they
 * can't get anywhere else is how the game went between their friends.
 *
 * Pages:
 *   1. Cover + Final Standings
 *   2. The Confidence Game (category-by-category scorecard)
 *   3. Fantasy Draft Results
 *   4. Bingo + Chat Highlights
 */

import { jsPDF } from 'jspdf'
import type { ScoredPlayer } from './scoring'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  MessageRow,
} from '../types/database'

// ---- Color constants (Oscar theme) ------------------------------------------

const GOLD = '#D4AF37'
const DARK_BG = '#0A0E27'
const DARK_CARD = '#151A3A'
const DARK_ROW_ALT = '#111530'
const WHITE = '#FFFFFF'
const WHITE_80 = '#CCCCCC'
const WHITE_60 = '#999999'
const WHITE_40 = '#666666'
const WHITE_20 = '#5A5E7A'
const GREEN = '#22C55E'
const GREEN_DIM = '#166534'
const RED = '#EF4444'
const RED_DIM = '#7F1D1D'
const AMBER = '#F59E0B'
const PURPLE = '#8B5CF6'
const PURPLE_DIM = '#4C1D95'

// ---- Types ------------------------------------------------------------------

export interface RecapData {
  roomCode: string
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  players: PlayerRow[]
  messages: MessageRow[]
  playerBingoCounts: Map<string, number>
}

export interface RecapHighlights {
  /** Player who got the most confidence picks correct */
  bestPredictor: { name: string; correctCount: number } | null
  /** Player with highest single confidence payout */
  biggestConfidenceWin: { name: string; categoryName: string; confidence: number } | null
  /** Categories where nobody picked the winner */
  upsets: Array<{ categoryName: string; winnerName: string }>
  /** Player(s) who got bingo */
  bingoWinners: Array<{ name: string; count: number }>
  /** Most popular wrong pick -- a category where most players picked the same loser */
  groupThinkFail: { categoryName: string; wrongPick: string; playerCount: number } | null
}

// ---- Highlight computation (pure) -------------------------------------------

export function computeHighlights(data: RecapData): RecapHighlights {
  const { categories, nominees, confidencePicks, players, playerBingoCounts } = data

  const announcedCategories = categories.filter((c) => c.winner_id != null)

  // Best predictor -- most correct picks (only set if at least one correct)
  let bestPredictor: RecapHighlights['bestPredictor'] = null
  players.forEach((p) => {
    const correct = confidencePicks.filter(
      (cp) => cp.player_id === p.id && cp.is_correct === true,
    ).length
    if (correct > 0 && (!bestPredictor || correct > bestPredictor.correctCount)) {
      bestPredictor = { name: p.name, correctCount: correct }
    }
  })

  // Biggest single confidence win
  let biggestConfidenceWin: RecapHighlights['biggestConfidenceWin'] = null
  confidencePicks
    .filter((cp) => cp.is_correct === true)
    .forEach((cp) => {
      if (!biggestConfidenceWin || cp.confidence > biggestConfidenceWin.confidence) {
        const player = players.find((p) => p.id === cp.player_id)
        const cat = categories.find((c) => c.id === cp.category_id)
        if (player && cat) {
          biggestConfidenceWin = {
            name: player.name,
            categoryName: cat.name,
            confidence: cp.confidence,
          }
        }
      }
    })

  // Upsets -- categories where no player picked the winner
  const upsets: RecapHighlights['upsets'] = []
  announcedCategories.forEach((cat) => {
    const anyonePickedWinner = confidencePicks.some(
      (cp) => cp.category_id === cat.id && (cp.nominee_id === cat.winner_id || cp.nominee_id === cat.tie_winner_id),
    )
    if (!anyonePickedWinner) {
      const winner = nominees.find((n) => n.id === cat.winner_id)
      if (winner) {
        upsets.push({ categoryName: cat.name, winnerName: winner.name })
      }
    }
  })

  // Bingo winners
  const bingoWinners: RecapHighlights['bingoWinners'] = []
  playerBingoCounts.forEach((count, playerId) => {
    if (count > 0) {
      const player = players.find((p) => p.id === playerId)
      if (player) bingoWinners.push({ name: player.name, count })
    }
  })

  // Group-think fail -- category where most players picked the same wrong nominee
  let groupThinkFail: RecapHighlights['groupThinkFail'] = null
  announcedCategories.forEach((cat) => {
    const picksForCategory = confidencePicks.filter(
      (cp) => cp.category_id === cat.id && cp.nominee_id !== cat.winner_id && cp.nominee_id !== cat.tie_winner_id,
    )
    const wrongCounts = new Map<string, number>()
    picksForCategory.forEach((cp) => {
      wrongCounts.set(cp.nominee_id, (wrongCounts.get(cp.nominee_id) ?? 0) + 1)
    })
    wrongCounts.forEach((count, nomineeId) => {
      if (count >= 2 && (!groupThinkFail || count > groupThinkFail.playerCount)) {
        const nominee = nominees.find((n) => n.id === nomineeId)
        if (nominee) {
          groupThinkFail = {
            categoryName: cat.name,
            wrongPick: nominee.name,
            playerCount: count,
          }
        }
      }
    })
  })

  return { bestPredictor, biggestConfidenceWin, upsets, bingoWinners, groupThinkFail }
}

// ---- PDF generation ---------------------------------------------------------

/**
 * Generates the recap PDF and triggers a browser download.
 */
export function generateRecapPDF(data: RecapData): void {
  const highlights = computeHighlights(data)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297mm
  const margin = 12
  const contentWidth = pageWidth - margin * 2          // 186mm
  // Reserve space at bottom for footer: footer sits at pageHeight - 10, rule 4mm above it
  const footerHeight = 14
  const safeBottom = pageHeight - footerHeight
  let y = 0

  // ---- Helpers ----------------------------------------------------------------

  function hexToRgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
  }

  function setTextColor(hex: string) {
    const [r, g, b] = hexToRgb(hex)
    doc.setTextColor(r, g, b)
  }

  function fillRect(x: number, yPos: number, w: number, h: number, hex: string) {
    const [r, g, b] = hexToRgb(hex)
    doc.setFillColor(r, g, b)
    doc.rect(x, yPos, w, h, 'F')
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, hex: string, thickness = 0.3) {
    const [r, g, b] = hexToRgb(hex)
    doc.setDrawColor(r, g, b)
    doc.setLineWidth(thickness)
    doc.line(x1, y1, x2, y2)
  }

  function drawPageBg() {
    fillRect(0, 0, pageWidth, pageHeight, DARK_BG)
  }

  function newPage() {
    doc.addPage()
    drawPageBg()
    y = margin
  }

  // Check if `needed` mm will fit before the safe bottom boundary.
  // If not, start a new page. Returns true if a page break occurred.
  function checkPageBreak(needed: number): boolean {
    if (y + needed > safeBottom) {
      newPage()
      return true
    }
    return false
  }

  // Draw a section header with left gold accent bar
  function sectionHeader(title: string, subtitle?: string) {
    const headerH = subtitle ? 18 : 14
    checkPageBreak(headerH + 4)
    drawLine(margin, y, margin + contentWidth, y, WHITE_20, 0.3)
    y += 5
    fillRect(margin, y, 3.5, subtitle ? 12 : 9, GOLD)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    setTextColor(GOLD)
    doc.text(title.toUpperCase(), margin + 9, y + 6.5)
    if (subtitle) {
      y += 7
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_60)
      doc.text(subtitle, margin + 9, y + 5)
    }
    y += 10
  }

  // A callout box for drama moments (bold win / painful miss)
  function calloutBox(
    label: string,
    value: string,
    accentColor: string,
    bgColor: string,
  ) {
    const lines = doc.splitTextToSize(value, contentWidth - 22)
    const boxH = 8 + lines.length * 6 + 7
    checkPageBreak(boxH + 4)

    fillRect(margin, y, contentWidth, boxH, bgColor)
    fillRect(margin, y, 4, boxH, accentColor)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    setTextColor(accentColor)
    doc.text(label.toUpperCase(), margin + 10, y + 6)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(WHITE_80)
    lines.forEach((line: string, li: number) => {
      doc.text(line, margin + 10, y + 6 + 6 + li * 6)
    })

    y += boxH + 5
  }

  // Draw a footer rule on the current page at the fixed bottom position
  function pageFooter() {
    const fy = pageHeight - 7
    drawLine(margin, fy - 5, margin + contentWidth, fy - 5, WHITE_20, 0.3)
    // Short gold accent rule centered above the text
    drawLine((pageWidth - 24) / 2, fy - 5, (pageWidth + 24) / 2, fy - 5, GOLD, 0.5)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_20)
    doc.text(`OSCARS PARTY 26  \u00B7  Room ${data.roomCode}`, pageWidth / 2, fy, { align: 'center' })
  }

  // Truncate text to fit within a pixel width
  function truncate(text: string, maxWidth: number, fontSize: number): string {
    doc.setFontSize(fontSize)
    if (doc.getTextWidth(text) <= maxWidth) return text
    let truncated = text
    while (truncated.length > 1 && doc.getTextWidth(truncated + '...') > maxWidth) {
      truncated = truncated.slice(0, -1)
    }
    return truncated + '...'
  }

  // ============================================================
  // PAGE 1 — COVER + FINAL STANDINGS
  // ============================================================

  drawPageBg()

  // Top accent bar (decorative)
  fillRect(0, 0, pageWidth, 2, DARK_CARD)
  fillRect((pageWidth - 60) / 2, 0, 60, 2, GOLD)

  // Header block — generous top spacing for a grand cover feel
  y = 28
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTextColor(GOLD)
  doc.text('98TH ACADEMY AWARDS  \u00B7  GAME RECAP', pageWidth / 2, y, { align: 'center' })
  y += 5
  fillRect((pageWidth - 28) / 2, y, 28, 0.5, GOLD)
  y += 12

  // Room name / title — large and bold
  doc.setFontSize(34)
  doc.setFont('helvetica', 'bold')
  setTextColor(WHITE)
  doc.text(`Room ${data.roomCode}`, pageWidth / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  setTextColor(WHITE_60)
  doc.text('Oscar Night  \u00B7  March 15, 2026', pageWidth / 2, y, { align: 'center' })
  y += 12

  const sepWidth = 90
  fillRect((pageWidth - sepWidth) / 2, y, sepWidth, 0.6, GOLD)
  y += 14

  // Winner podium callout — grand and prominent
  if (data.leaderboard.length > 0) {
    const champion = data.leaderboard[0]
    const runnerUp = data.leaderboard[1] ?? null
    const margin2 = data.leaderboard.length >= 2 && runnerUp
      ? champion.totalScore - runnerUp.totalScore
      : 0

    const cardH = 60
    fillRect(margin, y, contentWidth, cardH, DARK_CARD)
    fillRect(margin, y, 4, cardH, GOLD)

    // "Tonight's Champion" label
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setTextColor(GOLD)
    doc.text("TONIGHT'S CHAMPION", margin + 10, y + 9)

    // Champion name — very large
    doc.setFontSize(28)
    doc.setFont('helvetica', 'bold')
    setTextColor(WHITE)
    doc.text(champion.player.name, margin + 10, y + 22)

    // Total score — large, right-aligned
    doc.setFontSize(28)
    doc.setFont('helvetica', 'bold')
    setTextColor(GOLD)
    doc.text(`${champion.totalScore}`, margin + contentWidth - 4, y + 22, { align: 'right' })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_40)
    doc.text('total pts', margin + contentWidth - 4, y + 28, { align: 'right' })

    // Score breakdown
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_60)
    doc.text(
      `Draft ${champion.ensembleScore}  \u00B7  Confidence ${champion.confidenceScore}  \u00B7  Bingo ${champion.bingoScore}`,
      margin + 10,
      y + 33,
    )

    // One-line game summary
    const summaryParts: string[] = []
    if (margin2 > 0 && runnerUp) {
      summaryParts.push(`Won by ${margin2} pts over ${runnerUp.player.name}`)
    }
    if (champion.confidenceScore > champion.ensembleScore && champion.confidenceScore > champion.bingoScore) {
      summaryParts.push('confidence picks carried the win')
    } else if (champion.ensembleScore > champion.confidenceScore) {
      summaryParts.push('dominant fantasy draft')
    }
    if (highlights.biggestConfidenceWin?.name === champion.player.name) {
      summaryParts.push(`landed the night's biggest confidence bet (${highlights.biggestConfidenceWin.confidence} pts)`)
    }

    if (summaryParts.length > 0) {
      const summaryText = summaryParts.join(' — ')
      const wrapped = doc.splitTextToSize(summaryText, contentWidth - 18)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_60)
      wrapped.slice(0, 2).forEach((line: string, li: number) => {
        doc.text(line, margin + 10, y + 43 + li * 5.5)
      })
    }

    y += cardH + 10
  }

  // Full leaderboard table
  sectionHeader('Final Standings', 'Draft pts  +  Confidence pts  +  Bingo pts  =  Total')

  // Table header row
  const COL = {
    rank: margin + 5,
    name: margin + 18,
    draft: margin + contentWidth - 68,
    conf: margin + contentWidth - 46,
    bingo: margin + contentWidth - 24,
    total: margin + contentWidth - 2,
  }

  fillRect(margin, y - 4, contentWidth, 12, DARK_CARD)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  setTextColor(WHITE_40)
  doc.text('#', COL.rank, y + 3.5)
  doc.text('PLAYER', COL.name, y + 3.5)
  doc.text('DRAFT', COL.draft, y + 3.5, { align: 'right' })
  doc.text('CONF', COL.conf, y + 3.5, { align: 'right' })
  doc.text('BINGO', COL.bingo, y + 3.5, { align: 'right' })
  doc.text('TOTAL', COL.total, y + 3.5, { align: 'right' })
  y += 12

  data.leaderboard.forEach((entry, i) => {
    checkPageBreak(16)
    const rank = i + 1
    const rowBg = i === 0 ? '#1A1E40' : i % 2 === 0 ? DARK_CARD : DARK_ROW_ALT

    fillRect(margin, y - 4, contentWidth, 14, rowBg)
    if (i === 0) fillRect(margin, y - 4, 3, 14, GOLD)

    // Rank
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(i === 0 ? GOLD : WHITE_40)
    doc.text(`${rank}`, COL.rank, y + 4)

    // Name
    doc.setFontSize(13)
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
    setTextColor(i === 0 ? WHITE : WHITE_80)
    doc.text(entry.player.name, COL.name, y + 4)

    // Score columns
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_60)
    doc.text(`${entry.ensembleScore}`, COL.draft, y + 4, { align: 'right' })
    doc.text(`${entry.confidenceScore}`, COL.conf, y + 4, { align: 'right' })
    doc.text(`${entry.bingoScore}`, COL.bingo, y + 4, { align: 'right' })

    // Total
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    setTextColor(i === 0 ? GOLD : WHITE)
    doc.text(`${entry.totalScore}`, COL.total, y + 4, { align: 'right' })

    y += 14
  })

  y += 10

  // Quick highlights strip
  const quickHighlights: Array<{ label: string; value: string }> = []

  if (highlights.bestPredictor) {
    quickHighlights.push({
      label: 'Most Correct',
      value: `${highlights.bestPredictor.name} (${highlights.bestPredictor.correctCount} right)`,
    })
  }
  if (highlights.biggestConfidenceWin) {
    quickHighlights.push({
      label: 'Boldest Hit',
      value: `${highlights.biggestConfidenceWin.name} — ${highlights.biggestConfidenceWin.confidence} pts on ${highlights.biggestConfidenceWin.categoryName}`,
    })
  }
  if (highlights.groupThinkFail) {
    quickHighlights.push({
      label: 'Group Fail',
      value: `${highlights.groupThinkFail.playerCount} players all picked ${highlights.groupThinkFail.wrongPick} for ${highlights.groupThinkFail.categoryName}`,
    })
  }
  if (highlights.upsets.length > 0) {
    const upsetLabel = highlights.upsets.length === 1
      ? highlights.upsets[0].categoryName
      : `${highlights.upsets.length} categories`
    quickHighlights.push({ label: 'Nobody Called', value: upsetLabel })
  }

  if (quickHighlights.length > 0) {
    checkPageBreak(10 + quickHighlights.length * 12)
    drawLine(margin, y, margin + contentWidth, y, WHITE_20, 0.3)
    y += 7
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setTextColor(GOLD)
    doc.text('NIGHT HIGHLIGHTS', margin, y)
    y += 7

    quickHighlights.forEach((h) => {
      checkPageBreak(12)
      const rowY = y
      fillRect(margin, rowY - 3, contentWidth, 11, DARK_CARD)

      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      setTextColor(WHITE_40)
      doc.text(h.label.toUpperCase(), margin + 4, rowY + 3.5)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_80)
      const maxW = contentWidth - 58
      const truncVal = truncate(h.value, maxW, 9)
      doc.text(truncVal, margin + contentWidth - 2, rowY + 3.5, { align: 'right' })
      y += 12
    })
  }

  pageFooter()

  // ============================================================
  // PAGE 2 — THE CONFIDENCE GAME
  // ============================================================

  newPage()

  // Page header
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTextColor(GOLD)
  doc.text('THE CONFIDENCE GAME', pageWidth / 2, y + 3, { align: 'center' })
  y += 6
  fillRect((pageWidth - 28) / 2, y, 28, 0.5, GOLD)
  y += 10

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  setTextColor(WHITE)
  doc.text('Category-by-Category Scorecard', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  setTextColor(WHITE_60)
  doc.text('Confidence number = points wagered. Correct pick earns full confidence value. Wrong pick earns 0.', pageWidth / 2, y, { align: 'center' })
  y += 12

  const announcedCategories = data.categories
    .filter((c) => c.winner_id != null)
    .sort((a, b) => a.display_order - b.display_order)

  const unannounced = data.categories.filter((c) => c.winner_id == null)
  const playerCount = data.players.length

  if (announcedCategories.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_60)
    doc.text('No categories were announced yet.', margin, y)
    y += 14
  } else {
    // Find the best "bold win" and "painful miss" across all categories
    let boldWin: { categoryId: number; playerName: string; confidence: number } | null = null
    let painfulMiss: { categoryId: number; playerName: string; confidence: number } | null = null

    data.confidencePicks.forEach((cp) => {
      const cat = announcedCategories.find((c) => c.id === cp.category_id)
      if (!cat) return
      const player = data.players.find((p) => p.id === cp.player_id)
      if (!player) return
      if (cp.is_correct === true) {
        if (!boldWin || cp.confidence > boldWin.confidence) {
          boldWin = { categoryId: cp.category_id, playerName: player.name, confidence: cp.confidence }
        }
      } else if (cp.is_correct === false) {
        if (!painfulMiss || cp.confidence > painfulMiss.confidence) {
          painfulMiss = { categoryId: cp.category_id, playerName: player.name, confidence: cp.confidence }
        }
      }
    })

    // Column layout for confidence picks table
    // Category col | [Player cols...] each player gets equal slice of remaining width
    const catColW = Math.min(58, contentWidth * 0.42)
    const remainW = contentWidth - catColW
    const playerColW = Math.min(remainW / Math.max(playerCount, 1), 34)

    // Table column x positions (left edge of each player column)
    const colX: number[] = []
    for (let i = 0; i < playerCount; i++) {
      colX.push(margin + catColW + i * playerColW)
    }

    // Table column header
    const tableHeaderH = 20
    checkPageBreak(tableHeaderH + 4)
    fillRect(margin, y, contentWidth, tableHeaderH, DARK_CARD)

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    setTextColor(WHITE_40)
    doc.text('CATEGORY / WINNER', margin + 4, y + 7)
    doc.text('(confidence pts each)', margin + 4, y + 13)

    data.players.forEach((player, pi) => {
      const px = colX[pi] + playerColW / 2
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      setTextColor(GOLD)
      const nameShort = player.name.length > 10 ? player.name.slice(0, 10) : player.name
      doc.text(nameShort, px, y + 11, { align: 'center' })
    })

    y += tableHeaderH

    // Draw alternating rows for each announced category
    announcedCategories.forEach((cat, catIdx) => {
      const winner = data.nominees.find((n) => n.id === cat.winner_id)
      if (!winner) return

      // Collect per-player pick data for this category
      const playerPicks = data.players.map((player) => {
        const pick = data.confidencePicks.find(
          (cp) => cp.player_id === player.id && cp.category_id === cat.id,
        )
        if (!pick) return { picked: null, confidence: 0, correct: false, earned: 0 }
        const correct = pick.is_correct === true
        return {
          picked: data.nominees.find((n) => n.id === pick.nominee_id)?.name ?? null,
          confidence: pick.confidence,
          correct,
          earned: correct ? pick.confidence : 0,
        }
      })

      const isBoldWinCat = boldWin !== null && (boldWin as { categoryId: number }).categoryId === cat.id
      const isPainfulMissCat = painfulMiss !== null && (painfulMiss as { categoryId: number }).categoryId === cat.id

      // Row height: larger to match bigger fonts
      const rowH = 17
      const rowBg = isBoldWinCat
        ? '#0D2A1A'
        : isPainfulMissCat
        ? '#2A0D0D'
        : catIdx % 2 === 0
        ? DARK_CARD
        : DARK_ROW_ALT

      checkPageBreak(rowH + 2)
      fillRect(margin, y, contentWidth, rowH, rowBg)

      // Left accent for highlight categories
      if (isBoldWinCat) fillRect(margin, y, 2.5, rowH, GREEN)
      if (isPainfulMissCat) fillRect(margin, y, 2.5, rowH, RED)

      // Category name (line 1)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      setTextColor(isBoldWinCat ? GREEN : isPainfulMissCat ? RED : WHITE_40)
      const catName = truncate(cat.name, catColW - 6, 8)
      doc.text(catName, margin + 5, y + 5.5)

      // Winner name (line 2)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      setTextColor(WHITE)
      const winnerDisplay = winner.name
      const winnerTrunc = truncate(winnerDisplay, catColW - 8, 10)
      doc.text(winnerTrunc, margin + 5, y + 12.5)

      // Per-player pick cells
      data.players.forEach((player, pi) => {
        const pickData = playerPicks[pi]
        const cellX = colX[pi]
        const cellCenterX = cellX + playerColW / 2

        if (!pickData.picked) {
          doc.setFontSize(8)
          setTextColor(WHITE_40)
          doc.text('--', cellCenterX, y + 9, { align: 'center' })
          return
        }

        // Marker: + or x
        const marker = pickData.correct ? '+' : 'x'
        const markerColor = pickData.correct ? GREEN : RED
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        setTextColor(markerColor)
        doc.text(marker, cellCenterX - 4, y + 6.5, { align: 'center' })

        // Confidence number
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        setTextColor(pickData.correct ? GREEN : WHITE_40)
        doc.text(`${pickData.confidence}`, cellCenterX + 2, y + 6.5, { align: 'center' })

        // Points earned
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        setTextColor(pickData.correct ? GREEN : WHITE_40)
        doc.text(
          pickData.correct ? `+${pickData.earned}` : `0`,
          cellCenterX,
          y + 13,
          { align: 'center' },
        )
      })

      // Upset badge
      const nobodyRight = playerPicks.every((p) => !p.correct)
      if (nobodyRight && playerCount > 0) {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        setTextColor(AMBER)
        doc.text('UPSET', margin + contentWidth - 4, y + 6, { align: 'right' })
      }

      y += rowH
    })

    y += 8

    // Confidence totals summary row
    checkPageBreak(20)
    fillRect(margin, y, contentWidth, 17, '#1A1E40')
    fillRect(margin, y, contentWidth, 2.5, GOLD)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    setTextColor(GOLD)
    doc.text('CONFIDENCE TOTALS', margin + 5, y + 12)

    data.players.forEach((player, pi) => {
      const confScore = data.leaderboard.find((l) => l.player.id === player.id)?.confidenceScore ?? 0
      const cellCenterX = colX[pi] + playerColW / 2
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      setTextColor(WHITE)
      doc.text(`${confScore}`, cellCenterX, y + 12, { align: 'center' })
    })

    y += 22

    // Bold Win / Painful Miss callout pair
    if (boldWin || painfulMiss) {
      if (boldWin) {
        const bw = boldWin as { categoryId: number; playerName: string; confidence: number }
        const bwCat = data.categories.find((c) => c.id === bw.categoryId)
        calloutBox(
          'BOLD WIN',
          `${bw.playerName} bet ${bw.confidence} confidence points on ${bwCat?.name ?? 'Unknown'} and nailed it — the night's single biggest confidence payout`,
          GREEN,
          GREEN_DIM,
        )
      }

      if (painfulMiss) {
        const pm = painfulMiss as { categoryId: number; playerName: string; confidence: number }
        const pmCat = data.categories.find((c) => c.id === pm.categoryId)
        calloutBox(
          'MOST PAINFUL MISS',
          `${pm.playerName} burned ${pm.confidence} confidence points on ${pmCat?.name ?? 'Unknown'} — the night's costliest wrong pick`,
          RED,
          RED_DIM,
        )
      }
    }

    // Unannounced categories note
    if (unannounced.length > 0) {
      checkPageBreak(14)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_40)
      doc.text(
        `${unannounced.length} categor${unannounced.length === 1 ? 'y was' : 'ies were'} not announced before the game ended.`,
        margin,
        y,
      )
      y += 10
    }
  }

  pageFooter()

  // ============================================================
  // PAGE 3 — FANTASY DRAFT RESULTS
  // ============================================================

  newPage()

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTextColor(GOLD)
  doc.text('FANTASY DRAFT RESULTS', pageWidth / 2, y + 3, { align: 'center' })
  y += 6
  fillRect((pageWidth - 28) / 2, y, 28, 0.5, GOLD)
  y += 10

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  setTextColor(WHITE)
  doc.text('Who Drafted What, and What Won', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  setTextColor(WHITE_60)
  doc.text('Each drafted entity earns its category point value when the nominee wins.', pageWidth / 2, y, { align: 'center' })
  y += 14

  // Build a per-player draft roster with win info
  let bestDraftPick: { playerName: string; entityName: string; points: number } | null = null
  let biggestDraftMiss: { playerName: string; entityName: string; nominations: number } | null = null

  // Build map: entityId -> who drafted it + entity details
  const draftPickMap = new Map<string, { playerId: string; pickNumber: number }>()
  data.draftPicks.forEach((dp) => {
    draftPickMap.set(dp.entity_id, { playerId: dp.player_id, pickNumber: dp.pick_number })
  })

  // Per-player roster: entity name, type, won (boolean), points earned
  interface RosterEntry {
    entityName: string
    filmName: string
    type: 'person' | 'film'
    pickNumber: number
    won: boolean
    pointsEarned: number
    nominations: number
  }

  const playerRosters = new Map<string, RosterEntry[]>()
  data.players.forEach((p) => playerRosters.set(p.id, []))

  data.draftEntities.forEach((entity) => {
    const pick = draftPickMap.get(entity.id)
    if (!pick) return

    const roster = playerRosters.get(pick.playerId)
    if (!roster) return

    let won = false
    let pointsEarned = 0

    const noms = Array.isArray(entity.nominations)
      ? (entity.nominations as Array<{ category_id?: number; points?: number }>)
      : []

    announcedCategories.forEach((cat) => {
      const catWinnerId = cat.winner_id
      const catTieWinnerId = cat.tie_winner_id

      let matched = false
      if (entity.type === 'person') {
        const nominee = data.nominees.find((n) => n.id === catWinnerId || n.id === catTieWinnerId)
        if (nominee && nominee.name === entity.name) {
          const nominatedHere =
            noms.length === 0 || noms.some((n) => n.category_id === cat.id)
          if (nominatedHere) matched = true
        }
      } else {
        const filmTitle = entity.film_name || entity.name
        const winNominee = data.nominees.find((n) => n.id === catWinnerId)
        const tieNominee = catTieWinnerId ? data.nominees.find((n) => n.id === catTieWinnerId) : null
        const nomFilm1 = winNominee ? (winNominee.film_name || winNominee.name) : null
        const nomFilm2 = tieNominee ? (tieNominee.film_name || tieNominee.name) : null
        if (filmTitle === nomFilm1 || filmTitle === nomFilm2) matched = true
      }

      if (matched) {
        won = true
        pointsEarned += cat.points
      }
    })

    roster.push({
      entityName: entity.type === 'film' ? entity.film_name || entity.name : entity.name,
      filmName: entity.film_name,
      type: entity.type,
      pickNumber: pick.pickNumber,
      won,
      pointsEarned,
      nominations: noms.length,
    })

    if (won && (!bestDraftPick || pointsEarned > bestDraftPick.points)) {
      const player = data.players.find((p) => p.id === pick.playerId)
      if (player) {
        bestDraftPick = {
          playerName: player.name,
          entityName: entity.type === 'film' ? (entity.film_name || entity.name) : entity.name,
          points: pointsEarned,
        }
      }
    }

    if (!won && noms.length > 0) {
      if (!biggestDraftMiss || noms.length > biggestDraftMiss.nominations) {
        const player = data.players.find((p) => p.id === pick.playerId)
        if (player) {
          biggestDraftMiss = {
            playerName: player.name,
            entityName: entity.type === 'film' ? (entity.film_name || entity.name) : entity.name,
            nominations: noms.length,
          }
        }
      }
    }
  })

  // Render per-player draft sections
  // Player header height + row height per pick: do NOT check for entire section at once
  // because a roster may be too large to fit. Instead check each element individually.
  data.leaderboard.forEach((entry, li) => {
    const player = entry.player
    const roster = playerRosters.get(player.id) ?? []
    roster.sort((a, b) => a.pickNumber - b.pickNumber)

    // Player header — if no room even for the header, break page
    checkPageBreak(16)

    // Player header
    const playerBg = li === 0 ? '#1A1E40' : DARK_CARD
    fillRect(margin, y, contentWidth, 13, playerBg)
    if (li === 0) fillRect(margin, y, 3.5, 13, GOLD)

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    setTextColor(li === 0 ? GOLD : WHITE)
    doc.text(`${li + 1}. ${player.name}`, margin + 7, y + 9)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(li === 0 ? GOLD : WHITE_60)
    doc.text(`${entry.ensembleScore} draft pts`, margin + contentWidth - 3, y + 9, { align: 'right' })

    y += 13

    if (roster.length === 0) {
      checkPageBreak(12)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_40)
      doc.text('No picks on record.', margin + 7, y + 7)
      y += 12
    } else {
      roster.forEach((item) => {
        checkPageBreak(12)
        const rowBg = item.won ? '#0D2A1A' : DARK_ROW_ALT
        fillRect(margin, y, contentWidth, 11, rowBg)
        if (item.won) fillRect(margin, y, 2.5, 11, GREEN)

        // Pick number
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        setTextColor(WHITE_40)
        doc.text(`#${item.pickNumber}`, margin + 5, y + 7)

        // Entity name
        doc.setFontSize(10.5)
        doc.setFont('helvetica', item.won ? 'bold' : 'normal')
        setTextColor(item.won ? WHITE : WHITE_60)
        const entityTrunc = truncate(item.entityName, contentWidth - 46, 10.5)
        doc.text(entityTrunc, margin + 16, y + 7)

        // Type badge below entity name — same row, smaller
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        setTextColor(item.type === 'film' ? PURPLE : WHITE_40)
        // Place type badge to the right of the entity name area
        const entityEndX = margin + 16 + doc.getTextWidth(entityTrunc)
        doc.setFontSize(7)
        doc.text(
          item.type === 'film' ? ' FILM' : ' PERSON',
          entityEndX + 2,
          y + 7,
        )

        // Points earned or dash
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        setTextColor(item.won ? GREEN : WHITE_20)
        doc.text(
          item.won ? `+${item.pointsEarned}` : '--',
          margin + contentWidth - 3,
          y + 7,
          { align: 'right' },
        )

        y += 11
      })
    }

    y += 8
  })

  // Best pick / biggest miss callouts
  if (bestDraftPick || biggestDraftMiss) {
    if (bestDraftPick) {
      const bdp = bestDraftPick as { playerName: string; entityName: string; points: number }
      calloutBox(
        'BEST DRAFT PICK',
        `${bdp.playerName}'s pick of "${bdp.entityName}" earned ${bdp.points} pts — the single most valuable draft selection of the night`,
        GREEN,
        GREEN_DIM,
      )
    }
    if (biggestDraftMiss) {
      const bm = biggestDraftMiss as { playerName: string; entityName: string; nominations: number }
      calloutBox(
        'BIGGEST DRAFT MISS',
        `${bm.playerName} drafted "${bm.entityName}" (${bm.nominations} nomination${bm.nominations !== 1 ? 's' : ''}) but it went home empty-handed`,
        AMBER,
        '#2A1E00',
      )
    }
  }

  pageFooter()

  // ============================================================
  // PAGE 4 — BINGO + CHAT HIGHLIGHTS
  // ============================================================

  newPage()

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTextColor(GOLD)
  doc.text('BINGO + CHAT', pageWidth / 2, y + 3, { align: 'center' })
  y += 6
  fillRect((pageWidth - 28) / 2, y, 28, 0.5, GOLD)
  y += 10

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  setTextColor(WHITE)
  doc.text('Bingo Results + Highlights from the Chat', pageWidth / 2, y, { align: 'center' })
  y += 14

  // ---- Bingo section ---------------------------------------------------------

  sectionHeader('Bingo Results')

  const hasBingoData = data.playerBingoCounts.size > 0

  if (!hasBingoData) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_60)
    doc.text('No bingo cards on record.', margin, y)
    y += 12
  } else {
    const bingoRanked = data.players
      .map((p) => ({
        player: p,
        count: data.playerBingoCounts.get(p.id) ?? 0,
        bingoScore: data.leaderboard.find((l) => l.player.id === p.id)?.bingoScore ?? 0,
      }))
      .sort((a, b) => b.count - a.count || b.bingoScore - a.bingoScore)

    bingoRanked.forEach((entry, i) => {
      checkPageBreak(14)
      const hasBingo = entry.count > 0
      fillRect(margin, y, contentWidth, 12, hasBingo ? '#0D1E3A' : DARK_CARD)
      if (hasBingo) fillRect(margin, y, 3.5, 12, PURPLE)

      doc.setFontSize(12)
      doc.setFont('helvetica', hasBingo ? 'bold' : 'normal')
      setTextColor(hasBingo ? WHITE : WHITE_60)
      doc.text(entry.player.name, margin + 8, y + 8)

      // Bingo count badge
      if (hasBingo) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        setTextColor(PURPLE)
        doc.text(
          `${entry.count} BINGO${entry.count > 1 ? 'S' : ''}`,
          margin + 65,
          y + 8,
        )
      } else {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        setTextColor(WHITE_40)
        doc.text('No bingo', margin + 65, y + 8)
      }

      // Bingo score
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      setTextColor(hasBingo ? PURPLE : WHITE_40)
      doc.text(`${entry.bingoScore} pts`, margin + contentWidth - 3, y + 8, { align: 'right' })

      y += 12
    })

    y += 8
  }

  // ---- Chat transcript -------------------------------------------------------

  sectionHeader('Chat Highlights', 'Human messages only — reactions and moments from the night')

  const AI_IDS = new Set(['system', 'meryl', 'nikki', 'will'])
  const humanMessages = data.messages.filter((m) => !AI_IDS.has(m.player_id))

  if (humanMessages.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_60)
    doc.text('No chat messages from this session.', margin, y)
    y += 12
  } else {
    const shortMessages = humanMessages.filter((m) => m.text.length <= 80)
    const chatMessages = shortMessages.length >= Math.min(humanMessages.length, 4)
      ? shortMessages
      : humanMessages

    // Cap at 30 messages
    const displayMessages = chatMessages.slice(0, 30)
    const totalHuman = humanMessages.length
    const showing = displayMessages.length

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    setTextColor(WHITE_40)
    const noteText = showing < totalHuman
      ? `Showing ${showing} of ${totalHuman} messages (short/reactive messages prioritized)`
      : `${totalHuman} message${totalHuman !== 1 ? 's' : ''} from the night`
    doc.text(noteText, margin, y)
    y += 8

    displayMessages.forEach((msg, msgIdx) => {
      const msgLines = doc.splitTextToSize(msg.text, contentWidth - 12)
      // Line height for body text: 5mm per line at 9.5pt
      const lineH = 5
      const rowH = 7 + msgLines.length * lineH + 4
      checkPageBreak(rowH + 2)

      if (msgIdx % 2 === 0) {
        fillRect(margin, y - 1, contentWidth, rowH, DARK_CARD)
      }

      const player = data.players.find((p) => p.id === msg.player_id)
      const senderName = player?.name ?? 'Unknown'
      const timeStr = new Date(msg.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })

      // Sender name
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      setTextColor(GOLD)
      doc.text(senderName, margin + 4, y + 5)

      // Time — inline after name
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_20)
      doc.text(timeStr, margin + 4 + doc.getTextWidth(senderName) + 2, y + 5)

      // Message body
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'normal')
      setTextColor(WHITE_80)
      msgLines.forEach((line: string, li: number) => {
        checkPageBreak(lineH + 2)
        doc.text(line, margin + 4, y + 5 + lineH + li * lineH)
      })

      y += rowH
    })
  }

  pageFooter()

  // ---- Save -----------------------------------------------------------------

  doc.save(`oscars-recap-${data.roomCode.toLowerCase()}.pdf`)
}

/**
 * recap-pdf.ts -- pure PDF generation for the night's recap.
 *
 * Uses jsPDF to build a styled, Oscar-themed PDF document.
 * No React, no Supabase -- receives all data as arguments.
 *
 * Sections:
 *   1. Title page / header
 *   2. Final leaderboard with score breakdowns
 *   3. All 24 Oscar winners by category
 *   4. Fun stats / highlights
 *   5. Chat transcript
 */

import { jsPDF } from 'jspdf'
import type { ScoredPlayer } from './scoring'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  PlayerRow,
  MessageRow,
} from '../types/database'

// ---- Color constants (Oscar theme) ------------------------------------------

const GOLD = '#D4AF37'
const DARK_BG = '#0A0E27'
const DARK_CARD = '#151A3A'
const WHITE = '#FFFFFF'
const WHITE_60 = '#999999'
const WHITE_40 = '#666666'
const WHITE_20 = '#5A5E7A'
const GREEN = '#22C55E'
const RED = '#EF4444'

// ---- Types ------------------------------------------------------------------

export interface RecapData {
  roomCode: string
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
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
      (cp) => cp.category_id === cat.id && cp.nominee_id === cat.winner_id,
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
      (cp) => cp.category_id === cat.id && cp.nominee_id !== cat.winner_id,
    )
    // Count how many players picked each wrong nominee
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
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 0

  // ---- Helpers --------------------------------------------------------------

  function setColor(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    doc.setTextColor(r, g, b)
  }

  function fillRect(x: number, yPos: number, w: number, h: number, hex: string) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    doc.setFillColor(r, g, b)
    doc.rect(x, yPos, w, h, 'F')
  }

  function drawPageBg() {
    fillRect(0, 0, pageWidth, pageHeight, DARK_BG)
  }

  function checkPageBreak(needed: number): boolean {
    if (y + needed > pageHeight - 12) {
      doc.addPage()
      drawPageBg()
      y = margin
      return true
    }
    return false
  }

  function sectionHeader(title: string) {
    checkPageBreak(16)
    // Gold accent line
    fillRect(margin, y, 24, 0.8, GOLD)
    y += 4
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    setColor(WHITE)
    doc.text(title, margin, y)
    y += 8
  }

  // ---- Page 1: Title --------------------------------------------------------

  drawPageBg()

  // Center gold trophy area
  y = 40
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  setColor(GOLD)
  doc.text('98TH ACADEMY AWARDS', pageWidth / 2, y, { align: 'center' })
  y += 12

  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  setColor(WHITE)
  doc.text('Night\'s Recap', pageWidth / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  setColor(WHITE_60)
  doc.text(`Room ${data.roomCode}  |  March 15, 2026`, pageWidth / 2, y, { align: 'center' })
  y += 6

  // Gold separator line
  const sepWidth = 60
  fillRect((pageWidth - sepWidth) / 2, y, sepWidth, 0.5, GOLD)
  y += 12

  // Winner callout
  if (data.leaderboard.length > 0) {
    const winner = data.leaderboard[0]
    doc.setFontSize(10)
    setColor(GOLD)
    doc.text('TONIGHT\'S CHAMPION', pageWidth / 2, y, { align: 'center' })
    y += 8

    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    setColor(WHITE)
    doc.text(winner.player.name, pageWidth / 2, y, { align: 'center' })
    y += 8

    doc.setFontSize(16)
    setColor(GOLD)
    doc.text(`${winner.totalScore} points`, pageWidth / 2, y, { align: 'center' })
    y += 6

    doc.setFontSize(9)
    setColor(WHITE_40)
    doc.text(
      `Draft ${winner.ensembleScore}  |  Confidence ${winner.confidenceScore}  |  Bingo ${winner.bingoScore}`,
      pageWidth / 2,
      y,
      { align: 'center' },
    )
    y += 16
  }

  // ---- Section: Full Leaderboard -------------------------------------------

  sectionHeader('Final Standings')

  data.leaderboard.forEach((entry, i) => {
    checkPageBreak(10)
    const rank = i + 1
    const rowY = y

    // Subtle row background for #1
    if (i === 0) {
      fillRect(margin, rowY - 4, contentWidth, 9, '#1A1F3D')
    }

    // Rank
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setColor(i === 0 ? GOLD : WHITE_60)
    doc.text(`${rank}.`, margin + 2, rowY)

    // Name
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setColor(i === 0 ? WHITE : WHITE_60)
    doc.text(entry.player.name, margin + 12, rowY)

    // Score breakdown
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setColor(WHITE_40)
    doc.text(
      `D:${entry.ensembleScore}  C:${entry.confidenceScore}  B:${entry.bingoScore}`,
      margin + 12,
      rowY + 4.5,
    )

    // Total score (right-aligned)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    setColor(i === 0 ? GOLD : WHITE)
    doc.text(`${entry.totalScore}`, margin + contentWidth, rowY, { align: 'right' })
    doc.setFontSize(7)
    setColor(WHITE_40)
    doc.text('pt', margin + contentWidth, rowY + 4, { align: 'right' })

    y += 12
  })

  y += 4

  // ---- Section: Oscar Winners -----------------------------------------------

  sectionHeader('All Oscar Winners')

  const announcedCategories = data.categories
    .filter((c) => c.winner_id != null)
    .sort((a, b) => a.display_order - b.display_order)

  announcedCategories.forEach((cat) => {
    checkPageBreak(10)
    const winner = data.nominees.find((n) => n.id === cat.winner_id)
    if (!winner) return

    // Category name
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setColor(GOLD)
    doc.text(cat.name.toUpperCase(), margin + 2, y)

    // Winner name + film
    y += 4.5
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    setColor(WHITE)
    const winnerText = winner.film_name && winner.film_name !== winner.name
      ? `${winner.name}  --  ${winner.film_name}`
      : winner.name
    doc.text(winnerText, margin + 2, y, { maxWidth: contentWidth - 20 })

    // Points badge
    doc.setFontSize(7)
    setColor(WHITE_40)
    doc.text(`${cat.points}pt`, margin + contentWidth, y, { align: 'right' })

    y += 7
  })

  y += 4

  // ---- Section: Highlights --------------------------------------------------

  sectionHeader('Night\'s Highlights')

  function addHighlight(label: string, value: string) {
    checkPageBreak(12)
    // Card background
    fillRect(margin, y - 3.5, contentWidth, 10, DARK_CARD)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setColor(GOLD)
    doc.text(label, margin + 3, y)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setColor(WHITE)
    // Wrap long values
    const lines = doc.splitTextToSize(value, contentWidth - 8)
    doc.text(lines[0], margin + 3, y + 4.5)
    y += 12
    if (lines.length > 1) {
      doc.text(lines.slice(1).join(' '), margin + 3, y - 3)
      y += 5
    }
  }

  if (highlights.bestPredictor) {
    addHighlight(
      'BEST PREDICTOR',
      `${highlights.bestPredictor.name} -- ${highlights.bestPredictor.correctCount} correct picks`,
    )
  }

  if (highlights.biggestConfidenceWin) {
    addHighlight(
      'BIGGEST CONFIDENCE WIN',
      `${highlights.biggestConfidenceWin.name} wagered ${highlights.biggestConfidenceWin.confidence} on ${highlights.biggestConfidenceWin.categoryName} and nailed it`,
    )
  }

  if (highlights.bingoWinners.length > 0) {
    const bingoText = highlights.bingoWinners
      .map((bw) => `${bw.name} (${bw.count} line${bw.count > 1 ? 's' : ''})`)
      .join(', ')
    addHighlight('BINGO WINNERS', bingoText)
  }

  if (highlights.groupThinkFail) {
    addHighlight(
      'GROUP-THINK FAIL',
      `${highlights.groupThinkFail.playerCount} players picked ${highlights.groupThinkFail.wrongPick} for ${highlights.groupThinkFail.categoryName} -- wrong!`,
    )
  }

  if (highlights.upsets.length > 0) {
    const upsetText =
      highlights.upsets.length <= 3
        ? highlights.upsets.map((u) => `${u.categoryName}: ${u.winnerName}`).join(', ')
        : `${highlights.upsets.length} categories where nobody called the winner`
    addHighlight('UPSETS', upsetText)
  }

  y += 4

  // ---- Section: Chat Transcript ---------------------------------------------

  // Filter to human messages only (exclude system and AI companion IDs)
  const AI_IDS = new Set(['system', 'meryl', 'nikki', 'will'])
  const humanMessages = data.messages.filter((m) => !AI_IDS.has(m.player_id))

  if (humanMessages.length > 0) {
    doc.addPage()
    drawPageBg()
    y = margin

    sectionHeader('Chat Transcript')

    doc.setFontSize(8)
    setColor(WHITE_40)
    doc.text(`${humanMessages.length} messages from the night`, margin + 2, y)
    y += 6

    humanMessages.forEach((msg) => {
      checkPageBreak(10)

      const player = data.players.find((p) => p.id === msg.player_id)
      const senderName = player?.name ?? 'Unknown'
      const time = new Date(msg.created_at)
      const timeStr = time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })

      // Sender + timestamp
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      setColor(GOLD)
      doc.text(senderName, margin + 2, y)
      doc.setFont('helvetica', 'normal')
      setColor(WHITE_20)
      doc.text(timeStr, margin + 2 + doc.getTextWidth(senderName) + 3, y)

      // Message text (wrapped)
      y += 3.5
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      setColor(WHITE_60)
      const lines = doc.splitTextToSize(msg.text, contentWidth - 6)
      lines.forEach((line: string) => {
        checkPageBreak(4)
        doc.text(line, margin + 2, y)
        y += 3.5
      })

      y += 2
    })
  }

  // ---- Footer on last page --------------------------------------------------

  y = pageHeight - 12
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  setColor(WHITE_20)
  doc.text('Generated by Oscars Party  |  oscars.party', pageWidth / 2, y, { align: 'center' })

  // ---- Save -----------------------------------------------------------------

  doc.save(`oscars-recap-${data.roomCode.toLowerCase()}.pdf`)
}

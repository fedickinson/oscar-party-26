import { containsDisallowedEmoji } from './generated-prose.js'

export interface CompanionVerdict {
  slot: number
  text: string
  title: string
  highlights: Array<{ messageId: string; note: string }>
  imagery: Array<{ slot: string; slug: string; note: string }>
}

export interface VerdictSlotContract {
  slot: number
  playerId: string
  companionId: string
  allowedMessageIds: string[]
  allowedImageSlugs: string[]
}

/** Lenient projection; the canonical grounding adapter applies strict shape checks first. */
export function parseVerdictResponse(raw: string): CompanionVerdict[] {
  try {
    if (containsDisallowedEmoji(raw)) return []
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed.verdicts)) return []
    return parsed.verdicts
      .filter(
        (value: unknown) =>
          typeof (value as { slot?: unknown }).slot === 'number' &&
          typeof (value as { text?: unknown }).text === 'string' &&
          (value as { text: string }).text.trim().length > 0,
      )
      .map((value: Record<string, unknown>) => ({
        slot: value.slot as number,
        text: (value.text as string).trim(),
        title: typeof value.title === 'string' ? value.title.trim() : '',
        highlights: Array.isArray(value.highlights)
          ? (value.highlights as Array<Record<string, unknown>>)
              .filter((highlight) => typeof highlight?.message_id === 'string')
              .map((highlight) => ({
                messageId: highlight.message_id as string,
                note: typeof highlight.note === 'string' ? highlight.note.trim() : '',
              }))
          : [],
        imagery: Array.isArray(value.imagery)
          ? (value.imagery as Array<Record<string, unknown>>)
              .filter((image) => typeof image?.slot === 'string' && typeof image?.slug === 'string')
              .map((image) => ({
                slot: (image.slot as string).trim(),
                slug: (image.slug as string).trim(),
                note: typeof image.note === 'string' ? image.note.trim() : '',
              }))
          : [],
      }))
  } catch {
    return []
  }
}

// ─── Keepsake output budget ───────────────────────────────────────────────────
//
// One response carries every player's keepsake, so the per-keepsake contract
// and the room's seat count together decide whether the batch fits inside the
// proxy's `MAX_TOKENS_CEILING` of 4000 (api/_guards.ts). That ceiling is the
// account's cost guard on a public URL, not a keepsake tuning knob, so the
// contract has to give, not the ceiling.
//
// THE ARITHMETIC, per keepsake, at the wide contract:
//   JSON scaffolding, slot number and a 2-4 word title      ~30 tokens
//   a 2-3 sentence passage                                  ~80
//   4 highlights: a 36-char uuid (~20) plus a 12-word note
//     (~18) plus punctuation (~6), four times               ~176
//   2 imagery entries: slot, slug and a 12-word note        ~70
//                                                    total  ~356, call it 430
//     with the slack a real response spends on longer notes.
//   Seven seats: 7 x 430 = 3010, comfortably inside 4000.
//   Ten seats:   10 x 430 = 4300, OVER the ceiling. A ten-player batch can be
//   truncated mid-JSON, which fails the envelope check, exhausts the retries
//   and loses the whole room's keepsake rather than one player's.
//
// THE TIGHTENED CONTRACT, above seven seats:
//   two highlights instead of four   -88 tokens
//   one image instead of two         -35
//   a 1-2 sentence passage           -25
//                              call it ~290 per keepsake.
//   Ten seats: 10 x 290 = 2900, about 1100 tokens (27%) under the ceiling.
//
// The database contract is untouched: 20260921000100 still validates up to
// four highlights and two imagery entries per row, and still accepts one
// through ten rows. This narrows what the model is ASKED for inside that
// envelope, so a response written against the wider contract stays valid.

/** Above this many seats the per-keepsake contract tightens. */
export const KEEPSAKE_WIDE_ROOM_SEATS = 7

export interface KeepsakeLengthContract {
  /** Highlight lines the model may choose for one keepsake. */
  maxHighlights: number
  /** Imagery placements the model may fill for one keepsake. */
  maxImagery: number
  /** How long the passage may run, as the prompt phrases it. */
  sentences: string
  /** True when the seat count forced the narrower contract. */
  tightened: boolean
}

/**
 * The per-keepsake contract for a room of this many seats.
 *
 * One owner for both prompt builders, so the legacy cast and a pack's authored
 * voices cannot drift into different budgets for the same single-response RPC.
 */
export function keepsakeLengthContract(seatCount: number): KeepsakeLengthContract {
  if (seatCount > KEEPSAKE_WIDE_ROOM_SEATS) {
    return { maxHighlights: 2, maxImagery: 1, sentences: 'one-to-two-sentence', tightened: true }
  }
  return { maxHighlights: 4, maxImagery: 2, sentences: 'two-to-three-sentence', tightened: false }
}

/**
 * bingo-squares.ts — canonical seed data for the 98th Academy Awards bingo card.
 *
 * 50 squares total:
 *   - 20 objective  (is_objective: true)  — auto-approved by checkObjectiveCondition()
 *                                            when a winner is announced
 *   - 30 subjective (is_objective: false) — host approves manually during broadcast
 *
 * Objective square text patterns must match one of the three patterns in
 * checkObjectiveCondition() in src/lib/bingo-utils.ts:
 *   "[target] wins any award"          — matches winner name OR film_name
 *   "[target] speaks at the podium"    — matches winner name only
 *   "[person] wins [category name]"    — matches winner name OR film_name in that category
 *
 * ids 1–50 are stable and used as foreign keys in bingo_cards.squares arrays.
 * Do not renumber existing ids. Add new squares starting at 51.
 *
 * SHORT TEXT RULES:
 *   Max ~28 characters. Used on the bingo card grid (small tile).
 *   Full text is shown in the detail/approval view.
 *
 * 98th Oscars context (March 15, 2026):
 *   - Host: Conan O'Brien
 *   - Sinners: 16 nominations (record)
 *   - One Battle After Another: 13 nominations, swept precursors, PTA has 0 wins in 14 career noms
 *   - Best Actor toss-up: Michael B. Jordan vs Timothee Chalamet
 *   - Chalamet said "no one cares" about ballet/opera; Misty Copeland performing in response
 *   - Jessie Buckley: -3500 lock for Best Actress
 *   - Best Casting: brand new inaugural category
 *   - Supporting Actress: tight 3-way race
 *   - Delroy Lindo: 73 years old, first nomination
 */

import type { BingoSquareInsert } from '../types/database'

export const BINGO_SQUARES: BingoSquareInsert[] = [
  // ─── OBJECTIVE (20) ──────────────────────────────────────────────────────────
  // These auto-approve when a matching winner is announced.
  // Text must use exact patterns from checkObjectiveCondition().

  {
    id: 1,
    text: 'Sinners wins any award',
    short_text: 'Sinners wins anything',
    is_objective: true,
  },
  {
    id: 2,
    text: 'One Battle After Another wins any award',
    short_text: 'One Battle wins anything',
    is_objective: true,
  },
  {
    id: 3,
    text: 'Paul Thomas Anderson wins any award',
    short_text: 'PTA wins anything',
    is_objective: true,
  },
  {
    id: 4,
    text: 'Jessie Buckley wins Best Actress',
    short_text: 'Buckley wins Actress',
    is_objective: true,
  },
  {
    id: 5,
    text: 'Michael B. Jordan wins Best Actor',
    short_text: 'MBJ wins Actor',
    is_objective: true,
  },
  {
    id: 6,
    text: 'Timothee Chalamet wins Best Actor',
    short_text: 'Chalamet wins Actor',
    is_objective: true,
  },
  {
    id: 7,
    text: 'Sinners wins Best Picture',
    short_text: 'Sinners wins Picture',
    is_objective: true,
  },
  {
    id: 8,
    text: 'One Battle After Another wins Best Picture',
    short_text: 'One Battle wins Picture',
    is_objective: true,
  },
  {
    id: 9,
    text: 'Paul Thomas Anderson wins Best Director',
    short_text: 'PTA wins Director',
    is_objective: true,
  },
  {
    id: 10,
    text: 'Sinners wins Best Director',
    short_text: 'Sinners wins Director',
    is_objective: true,
  },
  {
    id: 11,
    text: 'Delroy Lindo wins any award',
    short_text: 'Delroy Lindo wins',
    is_objective: true,
  },
  {
    id: 12,
    text: 'Sinners wins Best Cinematography',
    short_text: 'Sinners wins Cinematography',
    is_objective: true,
  },
  {
    id: 13,
    text: 'Sinners wins Best Film Editing',
    short_text: 'Sinners wins Editing',
    is_objective: true,
  },
  {
    id: 14,
    text: 'One Battle After Another wins Best Director',
    short_text: 'One Battle wins Director',
    is_objective: true,
  },
  {
    id: 15,
    text: 'One Battle After Another wins Best Cinematography',
    short_text: 'One Battle wins Cinematography',
    is_objective: true,
  },
  {
    id: 16,
    text: 'Sinners wins Best Original Score',
    short_text: 'Sinners wins Score',
    is_objective: true,
  },
  {
    id: 17,
    text: 'One Battle After Another wins Best Original Screenplay',
    short_text: 'One Battle wins Screenplay',
    is_objective: true,
  },
  {
    id: 18,
    text: 'Sinners wins Best Original Screenplay',
    short_text: 'Sinners wins Screenplay',
    is_objective: true,
  },
  {
    id: 19,
    text: 'Michael B. Jordan speaks at the podium',
    short_text: 'MBJ at the podium',
    is_objective: true,
  },
  {
    id: 20,
    text: 'Jessie Buckley speaks at the podium',
    short_text: 'Buckley at the podium',
    is_objective: true,
  },

  // ─── SUBJECTIVE (30) ─────────────────────────────────────────────────────────
  // Host approves these manually during the broadcast.

  // Conan O'Brien host moments
  {
    id: 21,
    text: 'Conan O\'Brien makes a self-deprecating joke about never winning an Oscar',
    short_text: 'Conan self-deprecates',
    is_objective: false,
  },
  {
    id: 22,
    text: 'Conan does a bit that goes on longer than it should',
    short_text: 'Conan bit runs long',
    is_objective: false,
  },
  {
    id: 23,
    text: 'Conan gets visibly flustered or breaks character',
    short_text: 'Conan breaks character',
    is_objective: false,
  },
  {
    id: 24,
    text: 'Conan references the writers\' room or his late-night history',
    short_text: 'Conan plugs late night',
    is_objective: false,
  },

  // Misty Copeland / Chalamet storyline
  {
    id: 25,
    text: 'The camera cuts to Timothee Chalamet during the Misty Copeland performance',
    short_text: 'Camera finds Chalamet',
    is_objective: false,
  },
  {
    id: 26,
    text: 'The Misty Copeland performance gets a standing ovation',
    short_text: 'Copeland standing ovation',
    is_objective: false,
  },
  {
    id: 27,
    text: 'Timothee Chalamet looks uncomfortable at any point on camera',
    short_text: 'Chalamet looks awkward',
    is_objective: false,
  },

  // PTA / "long overdue" narrative
  {
    id: 28,
    text: 'A presenter or winner mentions a long-overdue recognition or first-time winner',
    short_text: 'Long overdue mention',
    is_objective: false,
  },
  {
    id: 29,
    text: 'Someone on stage mentions Paul Thomas Anderson\'s career or prior nominations',
    short_text: 'PTA career mentioned',
    is_objective: false,
  },
  {
    id: 30,
    text: 'Paul Thomas Anderson appears visibly emotional on camera',
    short_text: 'PTA gets emotional',
    is_objective: false,
  },

  // Delroy Lindo
  {
    id: 31,
    text: 'Delroy Lindo gets a standing ovation',
    short_text: 'Delroy Lindo ovation',
    is_objective: false,
  },
  {
    id: 32,
    text: 'Delroy Lindo cries or visibly tears up on camera',
    short_text: 'Delroy Lindo tears up',
    is_objective: false,
  },

  // Sinners record nominations
  {
    id: 33,
    text: 'A presenter announces or references Sinners\' record 16 nominations',
    short_text: 'Sinners record cited',
    is_objective: false,
  },
  {
    id: 34,
    text: 'Ryan Coogler is shown in the audience or on stage',
    short_text: 'Ryan Coogler on camera',
    is_objective: false,
  },

  // Best Casting (inaugural)
  {
    id: 35,
    text: 'The inaugural Best Casting award presenter acknowledges it is a new category',
    short_text: 'New Casting category noted',
    is_objective: false,
  },
  {
    id: 36,
    text: 'The Best Casting winner thanks the actors in their speech',
    short_text: 'Casting winner thanks actors',
    is_objective: false,
  },

  // General ceremony moments
  {
    id: 37,
    text: 'A winner forgets to thank someone and turns back to the mic to add them',
    short_text: 'Winner turns back to mic',
    is_objective: false,
  },
  {
    id: 38,
    text: 'An acceptance speech gets played off by the orchestra',
    short_text: 'Played off by orchestra',
    is_objective: false,
  },
  {
    id: 39,
    text: 'A winner thanks their therapist',
    short_text: 'Winner thanks therapist',
    is_objective: false,
  },
  {
    id: 40,
    text: 'A winner cries before they say a single word',
    short_text: 'Winner cries before speaking',
    is_objective: false,
  },
  {
    id: 41,
    text: 'A presenter mispronounces a nominee\'s name',
    short_text: 'Name mispronounced',
    is_objective: false,
  },
  {
    id: 42,
    text: 'Two presenters\' banter falls noticeably flat',
    short_text: 'Banter falls flat',
    is_objective: false,
  },
  {
    id: 43,
    text: 'A winner uses the phrase "I am speechless" in their speech',
    short_text: '"I am speechless"',
    is_objective: false,
  },
  {
    id: 44,
    text: 'A nominee\'s reaction shot shows them genuinely surprised they lost',
    short_text: 'Surprised loser reaction',
    is_objective: false,
  },
  {
    id: 45,
    text: 'A winner mentions a film that did not get nominated this year',
    short_text: 'Snubbed film mentioned',
    is_objective: false,
  },
  {
    id: 46,
    text: 'Any presenter or winner references the film industry strike or labor conditions',
    short_text: 'Strike or labor mentioned',
    is_objective: false,
  },
  {
    id: 47,
    text: 'A winner dedicates their award to a deceased person',
    short_text: 'Dedicated to the deceased',
    is_objective: false,
  },
  {
    id: 48,
    text: 'The In Memoriam segment is interrupted by applause',
    short_text: 'In Memoriam applause',
    is_objective: false,
  },
  {
    id: 49,
    text: 'A clip reel shown before an award contains a film that did not win',
    short_text: 'Clip reel includes a loser',
    is_objective: false,
  },
  {
    id: 50,
    text: 'Best Picture winner is announced and the room reaction sounds genuinely shocked',
    short_text: 'Shocked Best Picture room',
    is_objective: false,
  },
]

/**
 * Returns the squares formatted for Supabase INSERT.
 * id is optional in BingoSquareInsert but we always supply it for idempotent upserts.
 */
export function getBingoSquareSeedRows(): BingoSquareInsert[] {
  return BINGO_SQUARES
}

/**
 * Returns only objective squares (auto-approved when conditions are met).
 */
export function getObjectiveSquares(): BingoSquareInsert[] {
  return BINGO_SQUARES.filter((s) => s.is_objective)
}

/**
 * Returns only subjective squares (host approves manually).
 */
export function getSubjectiveSquares(): BingoSquareInsert[] {
  return BINGO_SQUARES.filter((s) => !s.is_objective)
}

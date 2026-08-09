/**
 * allegiance.ts — which claim each house declared for in the Dance.
 *
 * Pure data, no React, no Supabase.
 *
 * Your house IS your side: picking a sigil in the join flow declares you for a
 * claimant, and the app's --t-personal-* token layer (active tab, own
 * leaderboard row, chat edge, primary buttons) resolves through
 * [data-allegiance] on the root element — wired in App.tsx.
 *
 * The mapping is the show's/history's: Hightower, Lannister and Baratheon
 * declared for Aegon (the Greens); the rest of the drafted houses fought for
 * Rhaenyra (the Blacks). Targaryen itself is ambiguous by nature — both
 * claimants are Targaryens — but the roundel convention throughout this app
 * (see PlayerShareCard, the Dance mark) reads the three-headed dragon as
 * Rhaenyra's, so it maps Black.
 */

export type Allegiance = 'black' | 'green'

const GREEN_HOUSES = new Set(['hightower', 'lannister', 'baratheon'])

export function allegianceForAvatar(avatarId: string | null | undefined): Allegiance {
  if (!avatarId) return 'black'
  return GREEN_HOUSES.has(avatarId.toLowerCase()) ? 'green' : 'black'
}

/** Display label for the join flow: which claim this house declares for. */
export function allegianceLabel(avatarId: string): string {
  return allegianceForAvatar(avatarId) === 'green' ? 'For the Greens' : 'For the Blacks'
}

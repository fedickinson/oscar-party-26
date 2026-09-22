/**
 * Join deep links — the code an invite carries.
 *
 * An invite can carry `/?join=CODE` or `/join/CODE` so a tap does what typing
 * the code on the landing page does. The link is held to exactly the same rule
 * as the typed form: room codes are generated client-side as four uppercase
 * consonants (see `generateCode` in `src/pages/Home.tsx`), and the join input
 * strips everything that is not A-Z and stops at four characters. A link is
 * therefore trimmed and uppercased, and anything that is not then exactly four
 * letters is refused rather than repaired — a half-right code must reach a
 * person, not the room lookup.
 *
 * The restrictive default is deliberate: `parseJoinLinkCode` returns null for
 * every ambiguous input, and the caller falls back to the ordinary hand-typed
 * screen. `normalizeJoinLinkCode` exists only to prefill that screen with
 * whatever letters were salvageable, so a mistyped invite can be finished by
 * hand instead of having to be resent.
 */

/** The exact shape a room code must have to be used without a human reading it. */
const JOIN_CODE_PATTERN = /^[A-Z]{4}$/

/**
 * The code a link carries, or null when the link does not carry a usable one.
 * Outer whitespace is ignored and lowercase is accepted; nothing else is.
 */
export function parseJoinLinkCode(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const candidate = raw.trim().toUpperCase()
  return JOIN_CODE_PATTERN.test(candidate) ? candidate : null
}

/**
 * The salvageable letters of a link that failed `parseJoinLinkCode`, shaped the
 * way the join input shapes a keystroke: uppercase, letters only, four at most.
 * Never used to join — only to prefill the field the player then corrects.
 */
export function normalizeJoinLinkCode(raw: string | null | undefined): string {
  if (raw == null) return ''
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

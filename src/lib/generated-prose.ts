// Generated text is an untrusted boundary. The UI contract forbids emoji, so
// reject them before any parser can turn model output into a durable row.
const DISALLOWED_EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u20E3)/u

export function containsDisallowedEmoji(value: string): boolean {
  return DISALLOWED_EMOJI.test(value)
}

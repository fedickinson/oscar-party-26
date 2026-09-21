/**
 * PredictionPhase — the `confidence` phase route, resolved by the room's
 * commitment instrument.
 *
 *   conviction_portfolio  (contract commitment `open_conviction`)
 *     -> Conviction: spend a fixed portfolio across the whole authored board.
 *   legacy_ensemble       (contract commitment `confidence_allocation`)
 *     -> Confidence: one winner pick plus a ranked 1..N allocation over the
 *        room's categories. This is the Results Night game that scoring
 *        (`src/lib/scoring.ts`), settlement and the receipt all read from
 *        `confidence_picks`.
 *
 * `game_model` is derived by the database from the bound pack's contract commitment,
 * so it is always one of those two for a real room; an unset value falls back
 * to the same default every other consumer uses (`legacy_ensemble`).
 *
 * `Activate` — the pre-portfolio "activate three beats per drafted character"
 * screen — is deliberately not reachable from here. No current room model
 * selects it: a scheduled pack derives `legacy_ensemble` and every other fact
 * source derives `conviction_portfolio`, which the portfolio screen replaced.
 * It stays in the tree as the reference for the beat-wager surface until beat
 * activation is either retired or expressed as its own contract commitment.
 */

import { useGame } from '../context/GameContext'
import Confidence from './Confidence'
import Conviction from './Conviction'

export default function PredictionPhase() {
  const { room } = useGame()
  return room?.game_model === 'conviction_portfolio' ? <Conviction /> : <Confidence />
}

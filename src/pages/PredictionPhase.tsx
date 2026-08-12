import { useGame } from '../context/GameContext'
import Activate from './Activate'
import Conviction from './Conviction'

export default function PredictionPhase() {
  const { room } = useGame()
  return room?.game_model === 'conviction_portfolio' ? <Conviction /> : <Activate />
}

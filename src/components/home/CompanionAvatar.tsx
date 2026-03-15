/**
 * CompanionAvatar — gradient circle with icon for AI chat companions.
 *
 * sm: 32px circle, 14px icon
 * md: 48px circle, 20px icon
 */

import { Award, HelpCircle, Mic, Trophy } from 'lucide-react'
import { getCompanionById } from '../../data/ai-companions'

interface Props {
  companionId: string
  size: 'sm' | 'md'
}

export default function CompanionAvatar({ companionId, size }: Props) {
  const companion = getCompanionById(companionId)
  if (!companion) return null

  const dim = size === 'sm' ? 32 : 48
  const iconSize = size === 'sm' ? 14 : 20

  const IconComponent =
    companion.iconName === 'Trophy' ? Trophy :
    companion.iconName === 'Award' ? Award :
    companion.iconName === 'Mic' ? Mic : HelpCircle

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${companion.colorPrimary}, ${companion.colorSecondary})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <IconComponent size={iconSize} color="white" />
    </div>
  )
}

/**
 * category-icons.tsx — maps Oscar category names to thematic SVG icons.
 *
 * Usage:
 *   <CategoryIcon categoryName={category.name} size={16} className="text-white/50" />
 *
 * Pattern-matched on lowercased name so it works regardless of exact DB wording.
 * Falls back to a generic Film icon for unknown categories.
 */

import type { ComponentType } from 'react'
import {
  Aperture,
  BookOpen,
  Clapperboard,
  Film,
  Globe,
  Mic,
  Music,
  Palette,
  PenLine,
  Scissors,
  Shirt,
  Sparkles,
  User,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react'
import { OscarTrophy } from '../components/ui/Icons'

interface CategoryIconProps {
  categoryName: string
  size?: number
  className?: string
}

// lucide-react icons accept size + className directly
type LucideIconType = ComponentType<{ size?: number; className?: string }>

function resolveIcon(name: string): LucideIconType {
  const n = name.toLowerCase()

  if (n.includes('picture')) return OscarTrophy as LucideIconType
  if (n.includes('director')) return Clapperboard

  // Acting — check supporting before lead
  if (n.includes('supporting') && (n.includes('actress') || n.includes('actor'))) return User
  if (n.includes('actress') || n.includes('actor')) return User

  // Screenplay — adapted before original to avoid substring collision
  if (n.includes('adapted')) return BookOpen
  if (n.includes('screenplay')) return PenLine

  // Animated — feature before short
  if (n.includes('animated') && n.includes('feature')) return Wand2
  if (n.includes('animated') && n.includes('short')) return Sparkles
  if (n.includes('animated')) return Wand2

  // Documentary
  if (n.includes('documentary')) return Video

  // International
  if (n.includes('international')) return Globe

  // Technical craft
  if (n.includes('editing')) return Scissors
  if (n.includes('cinematography')) return Aperture
  if (n.includes('score')) return Music
  if (n.includes('song')) return Mic
  if (n.includes('production design')) return Palette
  if (n.includes('costume')) return Shirt
  if (n.includes('makeup') || n.includes('hairstyling')) return Sparkles
  if (n.includes('sound')) return Volume2
  if (n.includes('visual effects')) return Wand2

  // Short films — live action fallback
  if (n.includes('short')) return Clapperboard

  return Film
}

export function CategoryIcon({ categoryName, size = 16, className = '' }: CategoryIconProps) {
  const Icon = resolveIcon(categoryName)
  return <Icon size={size} className={className} />
}

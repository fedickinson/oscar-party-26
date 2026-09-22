/**
 * CategoryIcon.tsx — renders the icon a category asks for.
 *
 * Usage:
 *   <CategoryIcon categoryName={category.name} size={16} className="text-white/50" />
 *
 * The decision lives in `src/lib/category-icon-map.ts`, which is pure and tested; this
 * file is the key → component table and the identity read. The original map is
 * keyed on Academy Award wording and falls back to a film strip, which is the
 * right answer for exactly one pack; every other pack resolves through the
 * music map, whose fallback is a plain award.
 *
 * The component reads `useShowIdentity` so the many call sites — several of
 * which are not ours to edit — need no new prop. A surface that already holds
 * an identity (the public recap resolves the record's show, not the viewer's)
 * passes `isLegacy` explicitly and skips the read.
 */

import type { ComponentType } from 'react'
import {
  Aperture,
  AudioLines,
  Award,
  BookOpen,
  Clapperboard,
  Disc,
  Disc3,
  Drum,
  Film,
  Footprints,
  Guitar,
  Globe,
  Headphones,
  Mic,
  Music,
  Music2,
  Music3,
  Music4,
  Palette,
  PenLine,
  Scissors,
  Shirt,
  Sparkles,
  Star,
  Sun,
  Swords,
  Trophy,
  User,
  Users,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react'
import { OscarTrophy } from './Icons'
import { useShowIdentity } from '../../hooks/useShowIdentity'
import { categoryIconKey, type CategoryIconKey } from '../../lib/category-icon-map'

interface CategoryIconProps {
  categoryName: string
  size?: number
  className?: string
  /** Overrides the room read. Pass it where the identity is already in hand. */
  isLegacy?: boolean
}

// lucide-react icons accept size + className directly
type LucideIconType = ComponentType<{ size?: number; className?: string }>

const ICONS: Record<CategoryIconKey, LucideIconType> = {
  'oscar-trophy': OscarTrophy as LucideIconType,
  swords: Swords,
  user: User,
  'book-open': BookOpen,
  'pen-line': PenLine,
  wand: Wand2,
  sparkles: Sparkles,
  video: Video,
  globe: Globe,
  scissors: Scissors,
  aperture: Aperture,
  music: Music,
  mic: Mic,
  palette: Palette,
  shirt: Shirt,
  volume: Volume2,
  film: Film,
  trophy: Trophy,
  star: Star,
  sun: Sun,
  disc3: Disc3,
  users: Users,
  clapperboard: Clapperboard,
  footprints: Footprints,
  'audio-lines': AudioLines,
  headphones: Headphones,
  drum: Drum,
  guitar: Guitar,
  music4: Music4,
  disc: Disc,
  music2: Music2,
  music3: Music3,
  award: Award,
}

export function CategoryIcon({
  categoryName,
  size = 16,
  className = '',
  isLegacy,
}: CategoryIconProps) {
  const { identity } = useShowIdentity()
  const Icon = ICONS[categoryIconKey(categoryName, isLegacy ?? identity.isLegacy)]
  return <Icon size={size} className={className} />
}

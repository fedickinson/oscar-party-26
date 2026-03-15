export interface CompanionConfig {
  id: 'the-academy' | 'meryl' | 'nikki' | 'will'
  name: string
  colorPrimary: string
  colorSecondary: string
  iconName: 'Trophy' | 'Award' | 'Mic' | 'HelpCircle'
}

export const AI_COMPANIONS: CompanionConfig[] = [
  { id: 'the-academy', name: 'The Academy', colorPrimary: '#D4AF37', colorSecondary: '#B8960C', iconName: 'Trophy' },
  { id: 'meryl', name: 'Meryl', colorPrimary: '#C9A84C', colorSecondary: '#8B6914', iconName: 'Award' },
  { id: 'nikki', name: 'Nikki', colorPrimary: '#EC4899', colorSecondary: '#9D174D', iconName: 'Mic' },
  { id: 'will',  name: 'Will',  colorPrimary: '#EAB308', colorSecondary: '#92400E', iconName: 'HelpCircle' },
]

export const COMPANION_IDS = new Set<string>(['the-academy', 'meryl', 'nikki', 'will'])
export function getCompanionById(id: string) { return AI_COMPANIONS.find(c => c.id === id) }

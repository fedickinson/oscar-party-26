export interface CompanionConfig {
  id: 'the-academy' | 'meryl' | 'nikki' | 'will'
  name: string
  colorPrimary: string
  colorSecondary: string
  iconName: 'Trophy' | 'Award' | 'Mic' | 'HelpCircle'
  role: string
  bio: string
  imageUrl: string
}

export const AI_COMPANIONS: CompanionConfig[] = [
  {
    id: 'the-academy',
    name: 'The Academy',
    colorPrimary: '#D4AF37',
    colorSecondary: '#B8960C',
    iconName: 'Trophy',
    role: 'The Official Record',
    bio: 'The voice of the evening. Dignified, precise, and — if you listen closely — occasionally opinionated. Announces every winner first, every time. Has been keeping the record for longer than anyone can remember, and intends to keep doing so.',
    imageUrl: '/avatars/companions/academy-statuette.png',
  },
  {
    id: 'meryl',
    name: 'Gloria',
    colorPrimary: '#C9A84C',
    colorSecondary: '#8B6914',
    iconName: 'Award',
    role: 'The Legend',
    bio: 'Has been at every ceremony since the era of hand-delivered envelopes. Knows everyone, has opinions on everything, and will make you feel like you should have seen more films. Warm, grand, occasionally tearful — even about films she has not technically seen.',
    imageUrl: '/avatars/companions/gloria-perfume.png',
  },
  {
    id: 'nikki',
    name: 'Razor',
    colorPrimary: '#EC4899',
    colorSecondary: '#9D174D',
    iconName: 'Mic',
    role: 'The Roaster',
    bio: 'Has put more people on the spot than anyone in the business. Roasts because he cares. Will find your weakest pick and make it his whole personality for the night. Also the first to get emotional — not that he would ever admit it.',
    imageUrl: '/avatars/companions/razor-spotlight.png',
  },
  {
    id: 'will',
    name: 'Buddy',
    colorPrimary: '#EAB308',
    colorSecondary: '#92400E',
    iconName: 'HelpCircle',
    role: 'The Goofball',
    bio: 'Enthusiastic. Forming a theory. Picked a random nominee in the first category and is now their biggest fan for reasons he cannot fully explain. Asks questions nobody else thought to ask. Occasionally says something genuinely profound entirely by accident.',
    imageUrl: '/avatars/companions/buddy-microphone.png',
  },
]

export const COMPANION_IDS = new Set<string>(['the-academy', 'meryl', 'nikki', 'will'])
export function getCompanionById(id: string) { return AI_COMPANIONS.find(c => c.id === id) }

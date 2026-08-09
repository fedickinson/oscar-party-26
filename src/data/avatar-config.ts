// Player avatars are the dragons of the Dance. You are not playing AS a
// character — you draft those — so the dragon is pure identity, and it sidesteps
// the confusion of someone's avatar being an entity another player owns.
//
// No artwork: Avatar falls back to a gradient built from `color` plus the
// initial, which is legible at every size we render. Drop files into
// public/avatars/player/ and set `image` if art turns up.
// Player avatars are house sigils. Dragons were the obvious choice until they
// became draftable — having Betty's icon be a dragon Tom owns is confusing, and
// dragons are far more fun as contested picks than as decoration. Houses were
// cut from the draft for being unbalanced, which leaves their sigils free.
//
// No artwork: Avatar falls back to a gradient built from `color` plus the
// initial. Drop files into public/avatars/player/ and set `image` if art turns up.
export const PLAYER_AVATARS = [
  { id: 'targaryen', name: 'Targaryen', object: 'Three-Headed Dragon',
    description: 'Fire and blood. Currently busy destroying itself from the inside.',
    color: '#B91C1C', image: '', animated: '' },
  { id: 'hightower', name: 'Hightower', object: 'The Beacon',
    description: 'We light the way. Mostly toward whatever suits Oldtown.',
    color: '#059669', image: '', animated: '' },
  { id: 'velaryon', name: 'Velaryon', object: 'The Seahorse',
    description: 'Older than the Targaryens and quietly never lets anyone forget it.',
    color: '#0EA5E9', image: '', animated: '' },
  { id: 'stark', name: 'Stark', object: 'The Direwolf',
    description: 'Winter is coming, and the North has opinions about southron nonsense.',
    color: '#64748B', image: '', animated: '' },
  { id: 'tully', name: 'Tully', object: 'The Leaping Trout',
    description: 'Family, duty, honour. In whichever order is least inconvenient.',
    color: '#2563EB', image: '', animated: '' },
  { id: 'lannister', name: 'Lannister', object: 'The Lion',
    description: 'Hear me roar. Also, hear about the debt.',
    color: '#CA8A04', image: '', animated: '' },
  { id: 'baratheon', name: 'Baratheon', object: 'The Crowned Stag',
    description: 'Ours is the fury, and very little of the planning.',
    color: '#F59E0B', image: '', animated: '' },
  { id: 'blackwood', name: 'Blackwood', object: 'The Weirwood',
    description: 'Old gods, long memories, and the best archer in the Riverlands.',
    color: '#7C3AED', image: '', animated: '' },
  { id: 'dustin', name: 'Dustin', object: 'The Winter Crown',
    description: 'Barrowton. The Winter Wolves came south to die well.',
    color: '#475569', image: '', animated: '' },
  { id: 'strong', name: 'Strong', object: 'The Cleft Chevron',
    description: 'Harrenhal. Nothing that happens there ends well for anyone.',
    color: '#78350F', image: '', animated: '' },
  { id: 'arryn', name: 'Arryn', object: 'The Falcon and Moon',
    description: 'As high as honour, and about as involved as the Vale ever is.',
    color: '#94A3B8', image: '', animated: '' },
  { id: 'manderly', name: 'Manderly', object: 'The Merman',
    description: 'White Harbour. Well fed, well armed, and further north than you think.',
    color: '#14B8A6', image: '', animated: '' },
] as const;

export const COMPANION_AVATARS = [
  {
    id: 'gloria',
    name: 'Gloria',
    object: 'Vintage Perfume Bottle',
    personality: 'The sophisticated one. Encyclopedic knowledge of film history. Delivers devastating observations with perfect poise. Cries at the In Memoriam segment.',
    color: '#D4AF72',
    image: '/avatars/companion/gloria-perfume-bottle.png',
  },
  {
    id: 'razor',
    name: 'Razor',
    object: 'Spotlight',
    personality: 'The roast comic. Fast, fearless, and funny. Says what everyone is thinking. Zero filter, all love.',
    color: '#00B4A6',
    image: '/avatars/companion/razor-spotlight.png',
  },
  {
    id: 'buddy',
    name: 'Buddy',
    object: 'Microphone',
    personality: 'The hype man. Genuinely excited about everything. Cheers for categories no one cares about. Heart of gold.',
    color: '#E87D3E',
    image: '/avatars/companion/buddy-microphone.png',
  },
  {
    id: 'academy',
    name: 'The Academy',
    object: 'Golden Statuette',
    personality: 'The official voice. Delivers facts, stats, and history. Dry wit. The straight man to everyone else.',
    color: '#D4A017',
    image: '/avatars/companion/academy-statuette.png',
  },
] as const;

export type PlayerAvatarId = typeof PLAYER_AVATARS[number]['id'];
export type CompanionAvatarId = typeof COMPANION_AVATARS[number]['id'];

export function getAvatarById(id: string) {
  return [...PLAYER_AVATARS, ...COMPANION_AVATARS].find(a => a.id === id);
}

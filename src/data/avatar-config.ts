export const PLAYER_AVATARS = [
  {
    id: 'clapperboard',
    name: 'The Director',
    object: 'Clapperboard',
    description: 'Bossy, opinionated, calls the shots, thinks they are running the show',
    color: '#00B4A6',
    image: '/avatars/player/clapperboard.png',
    animated: '/avatars/animated/clapperboard.mp4',
  },
  {
    id: 'film-reel',
    name: 'The Classic',
    object: 'Film Reel',
    description: 'Old-school taste, loves the greats, nostalgic, a little dramatic',
    color: '#9B1B30',
    image: '/avatars/player/film-reel.png',
    animated: '/avatars/animated/film-reel.mp4',
  },
  {
    id: 'movie-camera',
    name: 'The Critic',
    object: 'Movie Camera',
    description: 'Observant, analytical, sees everything, one-lens monocle energy',
    color: '#3B2D6B',
    image: '/avatars/player/movie-camera.png',
    animated: '/avatars/animated/movie-camera.mp4',
  },
  {
    id: 'popcorn-bucket',
    name: 'The Fan',
    object: 'Popcorn Bucket',
    description: 'Here for fun, loud, enthusiastic, does not take it seriously',
    color: '#D4872C',
    image: '/avatars/player/popcorn-bucket.png',
    animated: '/avatars/animated/popcorn-bucket.mp4',
  },
  {
    id: 'drama-mask',
    name: 'The Drama Queen',
    object: 'Drama Mask',
    description: 'Over-the-top reactions, gasps at every upset, lives for the spectacle',
    color: '#6B1D4D',
    image: '/avatars/player/drama-mask.png',
    animated: '/avatars/animated/drama-mask.mp4',
  },
  {
    id: 'megaphone',
    name: 'The Insider',
    object: 'Megaphone',
    description: 'Knows the industry gossip, always talking, has a take on everything',
    color: '#4A4A5A',
    image: '/avatars/player/megaphone.png',
    animated: '/avatars/animated/megaphone.mp4',
  },
  {
    id: 'phonograph',
    name: 'The Composer',
    object: 'Phonograph',
    description: 'Dreamy, musical, only cares about Best Score, vibes over plot',
    color: '#1E3A6E',
    image: '/avatars/player/phonograph.png',
    animated: '/avatars/animated/phonograph.mp4',
  },
  {
    id: 'ticket-stub',
    name: 'The Wildcard',
    object: 'Ticket Stub',
    description: 'Showed up randomly, does not know the nominees, will somehow win everything',
    color: '#C7256F',
    image: '/avatars/player/ticket-stub.png',
    animated: '/avatars/animated/ticket-stub.mp4',
  },
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

/**
 * avatars.ts — static avatar config for all 12 characters.
 *
 * IDs match the `avatars` Supabase table. This file exists so components
 * can do instant color/initials lookups without a DB fetch. The text fields
 * (character_name, actor_name, film_name) are duplicated from the DB seed
 * so AvatarPicker can optionally render without an extra query; the DB copy
 * is the source of truth if they diverge.
 *
 * Color palettes are drawn from each film's visual identity:
 *   - deep/saturated primary + complementary secondary
 *   - high contrast against white initials
 */

export interface AvatarConfig {
  id: string
  characterName: string
  actorName: string
  filmName: string
  initials: string
  colorPrimary: string
  colorSecondary: string
  /** Optional photo. Place file at public/avatars/<id>.jpg and set this path. */
  imageUrl?: string
}

export const AVATAR_CONFIGS: AvatarConfig[] = [
  {
    id: 'mbj-smoke',
    characterName: 'Smoke',
    actorName: 'Michael B. Jordan',
    filmName: 'Sinners',
    initials: 'MJ',
    colorPrimary: '#8B0000',
    colorSecondary: '#FF4500',
    imageUrl: '/avatars/mbj-smoke.png',
  },
  {
    id: 'lindo-delta',
    characterName: 'Delta',
    actorName: 'Delroy Lindo',
    filmName: 'Sinners',
    initials: 'DL',
    colorPrimary: '#191970',
    colorSecondary: '#D4AF37',
    imageUrl: '/avatars/lindo-delta.png',
  },
  {
    id: 'mosaku-sinners',
    characterName: 'Mary',
    actorName: 'Wunmi Mosaku',
    filmName: 'Sinners',
    initials: 'WM',
    colorPrimary: '#4B0082',
    colorSecondary: '#FFBF00',
    imageUrl: '/avatars/mosaku-sinners.png',
  },
  {
    id: 'chalamet-marty',
    characterName: 'Marty Supreme',
    actorName: 'Timothée Chalamet',
    filmName: 'Marty Supreme',
    initials: 'TC',
    colorPrimary: '#7B2FF7',
    colorSecondary: '#E0D0FF',
    imageUrl: '/avatars/chalamet-marty.png',
  },
  {
    id: 'buckley-agnes',
    characterName: 'Agnes',
    actorName: 'Jessie Buckley',
    filmName: 'Hamnet',
    initials: 'JB',
    colorPrimary: '#228B22',
    colorSecondary: '#F5DEB3',
    imageUrl: '/avatars/buckley-agnes.png',
  },
  {
    id: 'stone-bugonia',
    characterName: 'Eloise',
    actorName: 'Emma Stone',
    filmName: 'Bugonia',
    initials: 'ES',
    colorPrimary: '#3D6B00',
    colorSecondary: '#ADFF2F',
    imageUrl: '/avatars/stone-bugonia.png',
  },
  {
    id: 'elordi-creature',
    characterName: 'The Creature',
    actorName: 'Jacob Elordi',
    filmName: 'Frankenstein',
    initials: 'JE',
    colorPrimary: '#2E4A1E',
    colorSecondary: '#B8FFB0',
    imageUrl: '/avatars/elordi-creature.png',
  },
  {
    id: 'reinsve-sv',
    characterName: 'Nora',
    actorName: 'Renate Reinsve',
    filmName: 'Sentimental Value',
    initials: 'RR',
    colorPrimary: '#2A6B8A',
    colorSecondary: '#B0E0E6',
    imageUrl: '/avatars/reinsve-sv.png',
  },
  {
    id: 'pitt-f1',
    characterName: 'Sonny Hayes',
    actorName: 'Brad Pitt',
    filmName: 'F1',
    initials: 'BP',
    colorPrimary: '#CC0000',
    colorSecondary: '#1A1A1A',
    imageUrl: '/avatars/pitt-f1.png',
  },
  {
    id: 'dicaprio-obaa',
    characterName: 'Frank',
    actorName: 'Leonardo DiCaprio',
    filmName: 'OBAA',
    initials: 'LD',
    colorPrimary: '#2B5BA8',
    colorSecondary: '#C0C0C0',
    imageUrl: '/avatars/dicaprio-obaa.png',
  },
  {
    id: 'penn-obaa',
    characterName: 'Victor',
    actorName: 'Sean Penn',
    filmName: 'OBAA',
    initials: 'SP',
    colorPrimary: '#36454F',
    colorSecondary: '#8B0000',
    imageUrl: '/avatars/penn-obaa.png',
  },
  {
    id: 'taylor-obaa',
    characterName: 'Rosa',
    actorName: 'Taylor Russell',
    filmName: 'OBAA',
    initials: 'TR',
    colorPrimary: '#C2185B',
    colorSecondary: '#D4AF37',
    imageUrl: '/avatars/taylor-obaa.png',
  },
]

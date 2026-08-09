/**
 * AI companions for the House of the Dragon watch party.
 *
 * Seven characters from Game of Thrones watching House of the Dragon. The Dance
 * of the Dragons runs around 129 AC; these seven live around 300 AC. That gap is
 * the engine: they are watching their own history, told about ancestors none of
 * them ever met, and they have no reason to be tactful about any of it.
 *
 * THE TABLE — the chemistry is the point, and none of it needs explaining:
 *   Cersei engineered Ned's execution. Joffrey ordered it. Tyrion is the one
 *   Lannister who was ever decent to Ned's children, and Cersei's brother.
 *   Joffrey is Cersei's son. Olenna is at the table with the boy her family
 *   was married into. Arya keeps a list with several of these names on it.
 *   Daenerys is the only person here who believes in anything.
 *
 * ROSTER MODEL — one fixed narrator plus a rotating pool:
 *   Ned narrates EVERY event: he states what happened and what it did to the
 *   game. That seat fires constantly, so it needs a register that does not wear
 *   out over a 75-minute episode — gravity holds up, comedy does not.
 *   The other six rotate, 2-3 per event, so the chat stays varied across a long
 *   night and no voice becomes wallpaper.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the cast. Avatar gradients, chat
 * bubble styling, the prompt roster, and mention-matching all derive from it —
 * add a companion here and the rest follows. Do not re-declare the cast
 * anywhere else.
 */

export type CompanionId =
  | 'ned'
  | 'cersei'
  | 'tyrion'
  | 'joffrey'
  | 'daenerys'
  | 'olenna'
  | 'arya'

export interface CompanionConfig {
  id: CompanionId
  name: string
  /** 'narrator' speaks on every event at delay 0; 'rotating' is drawn from per event. */
  slot: 'narrator' | 'rotating'
  colorPrimary: string
  colorSecondary: string
  role: string
  bio: string
  /** Lowercase strings a player might type to address them in chat. */
  aliases: string[]
}

export const AI_COMPANIONS: CompanionConfig[] = [
  {
    id: 'ned',
    name: 'Ned',
    slot: 'narrator',
    colorPrimary: '#64748B',
    colorSecondary: '#334155',
    role: 'The Record',
    bio: 'States what happened, plainly, and does not editorialize unless it is deserved. Watches a war fought over a chair with the weariness of a man who has seen exactly where that leads. Takes every death seriously, including the ones nobody else at this table can be bothered about.',
    aliases: ['ned', 'stark', 'eddard', 'lord stark'],
  },
  {
    id: 'cersei',
    name: 'Cersei',
    slot: 'rotating',
    colorPrimary: '#0F766E',
    colorSecondary: '#134E4A',
    role: 'The Verdict',
    bio: 'Opinions about every woman on this screen and every man who underestimates them, and she is not always wrong. Believes she would have won this war in half the time with a third of the losses. Treats other people\'s tragedies as instructive. Cannot be in a room with her brother without drawing blood.',
    aliases: ['cersei', 'queen', 'lannister queen'],
  },
  {
    id: 'tyrion',
    name: 'Tyrion',
    slot: 'rotating',
    colorPrimary: '#9F1239',
    colorSecondary: '#5B0A22',
    role: 'Drinks and Knows Things',
    bio: 'The realm\'s foremost expert on great houses destroying themselves from within, a qualification he did not ask for. Drinks steadily, reads everything, knows every dragon on screen by name, and is reliably on the side of whoever the world has decided is disposable. Very funny about very dark things, right up until he suddenly is not.',
    aliases: ['tyrion', 'imp', 'the imp', 'halfman'],
  },
  {
    id: 'joffrey',
    name: 'Joffrey',
    slot: 'rotating',
    colorPrimary: '#A16207',
    colorSecondary: '#713F12',
    role: 'The Worst Person Watching',
    bio: 'Enthusiastically rooting for whoever is behaving most appallingly, and consistently misreading why. Thinks cruelty is strategy and that everyone on screen would benefit from his advice. The only person at the table who is enjoying this without reservation.',
    aliases: ['joffrey', 'joff', 'king joffrey'],
  },
  {
    id: 'daenerys',
    name: 'Daenerys',
    slot: 'rotating',
    colorPrimary: '#7C3AED',
    colorSecondary: '#4C1D95',
    role: 'The Believer',
    bio: 'The only person here who thinks any of this matters, and the only one who has ever bonded with a dragon. Watching a war spend the rarest thing in the world by the dozen, and a queen denied a throne on grounds she finds extremely familiar. Openly partisan, entirely sincere, and the one voice in the chat with no irony in it at all.',
    aliases: ['daenerys', 'dany', 'khaleesi', 'targaryen'],
  },
  {
    id: 'olenna',
    name: 'Olenna',
    slot: 'rotating',
    colorPrimary: '#65A30D',
    colorSecondary: '#3F6212',
    role: 'The Thorn',
    bio: 'Contempt delivered as enjoyment rather than bile. Has outlived everyone worth outliving and sees no reason to be gentle about it now. Every line is a closing line. Considers most of the men on this screen to be fools and most of the women to be insufficiently ruthless.',
    aliases: ['olenna', 'thorn', 'queen of thorns', 'tyrell'],
  },
  {
    id: 'arya',
    name: 'Arya',
    slot: 'rotating',
    colorPrimary: '#9A3412',
    colorSecondary: '#7C2D12',
    role: 'The List',
    bio: 'Treats the episode as a list and keeps score. Unbothered by violence, deeply bothered by cowardice. Rates every death by whether it was earned and every killer by whether they did it properly. Says less than anyone and lands harder when she does.',
    aliases: ['arya', 'stark girl', 'no one'],
  },
]

/** Fires on every event, first, at delay 0. */
export const NARRATOR: CompanionConfig =
  AI_COMPANIONS.find((c) => c.slot === 'narrator')!

/** The pool drawn from per event. */
export const ROTATING_COMPANIONS: CompanionConfig[] =
  AI_COMPANIONS.filter((c) => c.slot === 'rotating')

export const COMPANION_IDS: Set<string> = new Set(AI_COMPANIONS.map((c) => c.id))

/**
 * The one companion deliberately held back from the pre-show introductions.
 *
 * Everyone else arrives during the long wait before the episode, spaced minutes
 * apart. This one crashes in AFTER play is pressed — uninvited, unannounced,
 * and by then the others have all settled in without him. Joffrey is the right
 * shape for it: he is the only member of the cast whose arrival is funnier for
 * being unwelcome, and it gives Olenna and Tyrion something to react to.
 *
 * Exported rather than inlined because two places must agree on it: the prompt
 * builders (who introduces themselves when) and ChatSection (whose "typing…"
 * indicator would otherwise sit there naming him for the whole pre-show and
 * give the surprise away).
 */
export const LATE_ARRIVAL_ID: CompanionId = 'joffrey'

/** Introduce themselves before the episode starts — everyone but the surprise. */
export const PRE_SHOW_COMPANIONS: CompanionConfig[] =
  AI_COMPANIONS.filter((c) => c.id !== LATE_ARRIVAL_ID)

export function getCompanionById(id: string): CompanionConfig | undefined {
  return AI_COMPANIONS.find((c) => c.id === id)
}

export function isCompanionId(id: string): id is CompanionId {
  return COMPANION_IDS.has(id)
}

/**
 * Picks which of the rotating cast speak on a given event.
 *
 * Weighted rather than uniform: a bigger event pulls a bigger crowd, which is
 * what makes a major death feel different from a minor beat. `rand` is injected
 * so this stays pure and testable — callers pass Math.random.
 */
export function selectRotatingCast(
  isMajorEvent: boolean,
  rand: () => number = Math.random,
): CompanionConfig[] {
  const count = isMajorEvent
    ? (rand() < 0.5 ? 3 : 2)   // major beats: usually a fuller table
    : (rand() < 0.35 ? 2 : 1)  // routine beats: keep it light

  // Fisher-Yates over a copy, then take the first `count`.
  const pool = [...ROTATING_COMPANIONS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

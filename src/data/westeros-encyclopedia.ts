/**
 * westeros-encyclopedia.ts — researched ground truth for House of the Dragon S3.
 *
 * WHY THIS FILE EXISTS
 * Season 3 aired June–August 2026, after the model's training cutoff. The model
 * knows the books and earlier seasons well and knows THIS SEASON NOT AT ALL.
 * Without the data below it invents deaths, dragons and betrayals with total
 * confidence, in a chat the players read as canon. lib/ceremony-context.ts
 * injects the relevant slice into every companion prompt.
 *
 * CUTOFF: end of S3E7 "The Dragon in Winter" (aired 2026-08-02). Nothing here
 * comes from episode 8, screeners, leaks, or finale press.
 *
 * SPOILER DISCIPLINE
 * Items carrying a Fire & Blood event the series has NOT dramatised through E7
 * are marked `spoiler: true`. They are kept for our own grounding and are
 * filtered out by safeCriticism() before anything reaches the model. If unsure,
 * mark it as a spoiler.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Allegiance = 'Black' | 'Green' | 'Neutral'

export interface CharacterProfile {
  /** Must match the character name used in the seed SQL. */
  id: string
  name: string
  actor: string
  house: string
  allegiance: Allegiance
  dragon: { name: string; notes: string } | null
  /** Alive? Where? Doing what? The most load-bearing field in the file. */
  statusEnteringFinale: string
  arcThisSeason: string
  whatTheyveLost: string
  discourse: string | null
  /**
   * How the actual audience feels about them right now, sampled from reaction
   * videos and comments through E7. This is what keeps the companions in step
   * with the room instead of arguing against it — if everyone watching loves
   * Sheepstealer, a companion sneering at him lands badly.
   */
  audienceReaction: string | null
}

export interface EpisodeRecap {
  episode: number
  title: string
  events: string[]
}

export type CriticismCategory =
  | 'adaptation' | 'pacing' | 'characterisation'
  | 'incest-discourse' | 'sexual-violence' | 'production' | 'praise'

export interface CriticismItem {
  category: CriticismCategory
  point: string
  prevalence: string
  /** True = references unaired material. Never sent to the model. */
  spoiler: boolean
}

// ─── The dead ─────────────────────────────────────────────────────────────────
// Kept separate from `characters` so nothing can accidentally offer them as
// draftable or have a companion react to them as though they were present.

export const theDead = [
  { name: 'Jacaerys Velaryon', episode: 1, how: 'Vermax downed at the Gullet; killed by arrows after surfacing' },
  { name: 'Vermax', episode: 1, how: "Jacaerys' dragon, struck down at the Gullet" },
  { name: 'Sharako Lohar', episode: 1, how: 'Killed by Alyn after fighting Corlys' },
  { name: 'Simon Strong and his sons', episode: 2, how: 'Killed by Aemond at Harrenhal after offering surrender' },
  { name: 'Otto Hightower', episode: 2, how: 'Executed by Rhaenyra after being found in Larys’s prison' },
  { name: 'Criston Cole', episode: 6, how: "Three arrows at the Butcher's Ball; shot by Alysanne Blackwood" },
] as const

// ─── Characters ───────────────────────────────────────────────────────────────

export const characters: CharacterProfile[] = [
  {
    id: 'Rhaenyra Targaryen', name: 'Rhaenyra Targaryen', actor: "Emma D'Arcy",
    house: 'The Blacks', allegiance: 'Black',
    dragon: { name: 'Syrax', notes: 'Golden royal mount' },
    statusEnteringFinale: "Alive, in King's Landing, holding the Iron Throne after recovering Rhaena. Facing an empty treasury, food shortages, a hostile Faith and restive dragonseeds.",
    arcThisSeason: 'Wins the capital in E2 and discovers governing is harder than conquering. Jace’s death, insolvency and repeated betrayal push her toward paranoia and increasingly coercive rule.',
    whatTheyveLost: 'Jace, Vermax, most of her treasury, confidence in Daemon, dragonseed loyalty',
    discourse: "D'Arcy's darkening performance is widely praised; critics argue the show swung from over-softening Rhaenyra to making her irrational too abruptly.",
    audienceReaction: 'GOODWILL DETERIORATING. The complaint is not that she is evil but that her decisions look self-destructive — alienating dragonseeds, mistrusting advisers, mishandling the city. \'Rhaenyra\'s downfall\' is now a common video title. Viewers are actively arguing whether this is good tragedy or bad writing.',
  },
  {
    id: 'Daemon Targaryen', name: 'Daemon Targaryen', actor: 'Matt Smith',
    house: 'The Blacks', allegiance: 'Black',
    dragon: { name: 'Caraxes', notes: 'Long, red, heavily battle-experienced' },
    statusEnteringFinale: 'Alive. Last confirmed at the Sheepstealer fight, having deliberately let the wounded dragon escape. Exact location after that scene is NOT established — do not place him.',
    arcThisSeason: 'Military asset and increasingly imperial-minded co-ruler. Secretly protected Rhaena by murdering a shepherd and passing off the body as Sheepstealer’s rider; the deception is now exposed.',
    whatTheyveLost: 'Jace, political trust, many Gold Cloaks',
    discourse: 'Some criticism that his season again detours into family/mystical material after S2 spent so long at Harrenhal.',
    audienceReaction: 'DEBATABLE. Viewers were divided on him, but E7 earned real credit: many noticed he could have had Caraxes finish Sheepstealer and deliberately chose not to, reading it as choosing his daughter over the obvious move.',
  },
  {
    id: 'Aemond Targaryen', name: 'Aemond Targaryen', actor: 'Ewan Mitchell',
    house: 'Harrenhal', allegiance: 'Green',
    dragon: { name: 'Vhagar', notes: 'Largest and oldest living war dragon. WHEREABOUTS CURRENTLY UNCLEAR — the show deliberately left this open. Do not say Vhagar is at Harrenhal.' },
    statusEnteringFinale: 'ALIVE but poisoned with nightshade by Alicent and collapsed at Harrenhal. There is NO on-screen death. His fate is the season’s biggest open question.',
    arcThisSeason: 'Opens powerful enough to menace both factions and destroys the Strongs, then spends most of the season wounded and dependent on Alys Rivers. His need for maternal approval is made explicit and sexualised.',
    whatTheyveLost: "Operational command, physical health, Vhagar's presence, Alicent's loyalty",
    discourse: 'The Harrenhal slowdown and the Oedipal rewrite are heavily disputed; Mitchell’s vulnerable performance is often praised.',
    audienceReaction: 'MIXED BUT HIGHLY ENGAGED. \'Mommy issues\' has become the shorthand for S3 Aemond. The Alys material works for viewers as gothic psychological horror, not romance. There is real fatigue about another Targaryen stuck at Harrenhal hallucinating.',
  },
  {
    id: 'Alicent Hightower', name: 'Alicent Hightower', actor: 'Olivia Cooke',
    house: 'Harrenhal', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive, at Harrenhal, having just poisoned Aemond as the price of Rhaenyra protecting Helaena.',
    arcThisSeason: "Delivers King's Landing to the Blacks by disabling its defences and flipping the Gold Cloaks, then fights to protect Helaena. Rhaenyra's price is Aemond's death, and she goes through with it.",
    whatTheyveLost: 'Political power, Otto, Aegon as an ally, Aemond’s trust, her freedom',
    discourse: "Possibly the season's most divisive characterisation: critics question whether poisoning her own son follows from two seasons of maternal motivation.",
    audienceReaction: 'THE WRITING IS THE TARGET, NOT THE ACTOR. The poisoning is the focal point of a \'they broke Alicent\' argument. Crucially, viewers are sympathetic to Olivia Cooke and think she is excellent — they are unhappy with what the scripts ask her to sell. Do not mock the performance.',
  },
  {
    id: 'Aegon II Targaryen', name: 'Aegon II Targaryen', actor: 'Tom Glynn-Carney',
    house: 'The Greens', allegiance: 'Green',
    dragon: { name: 'Sunfyre', notes: 'Golden, severely scarred, ALIVE and newly reunited with him. The show does not explain how Sunfyre survived — any mechanism is fan speculation.' },
    statusEnteringFinale: 'Alive, scarred and disabled, on the road with Tyland, newly re-emboldened after Sunfyre returned and killed the Black soldiers confronting him.',
    arcThisSeason: 'The dethroned king spends most of the season humiliated and forced to confront his own failures. His road-trip with Larys and the Sunfyre reunion give him the clearest reversal of the season.',
    whatTheyveLost: "King's Landing, the throne, physical mobility, much of his entitlement",
    discourse: 'Glynn-Carney’s humanisation of Aegon is among the season’s most consistently praised performances.',
    audienceReaction: 'THE SEASON\'S BIGGEST WINNER. Viewers who mocked him now name him a favourite. The wounded road story stripped the swagger and made him a person. You do not have to back him politically to enjoy watching him.',
  },
  {
    id: 'Helaena Targaryen', name: 'Helaena Targaryen', actor: 'Phia Saban',
    house: 'The Blacks', allegiance: 'Neutral',
    dragon: { name: 'Dreamfyre', notes: 'Bonded. Her E7 flight is a VISION, not a real sortie — she has not entered combat.' },
    statusEnteringFinale: "Alive and pregnant, effectively a Black ward/prisoner in King's Landing, still protecting Jaehaera.",
    arcThisSeason: 'Asserts agency by refusing Alicent’s attempt to end her pregnancy and refusing separation from Jaehaera. Her visions intensify while she keeps rejecting the warrior-dragonrider role.',
    whatTheyveLost: 'Jaehaerys (before S3), her freedom, most of her family structure',
    discourse: 'Making her a noncombatant dragonrider is a significant adaptation debate; Saban’s performance and the Dreamfyre vision were well received.',
    audienceReaction: 'INTENSELY PROTECTED. Generates unusually little hostility. Enormous excitement about Dreamfyre finally appearing, and viewers are decoding her visions rather than dismissing them. The instinct is \'protect Helaena at all costs\'.',
  },
  {
    id: 'Ormund Hightower', name: 'Ormund Hightower', actor: 'James Norton',
    house: 'House Hightower', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive, controls Tumbleton, holds Corlys prisoner, and has secretly turned Ulf. A large Black northern host is closing on him.',
    arcThisSeason: "The Greens' most competent strategist: anti-Targaryen in rhetoric, entirely willing to exploit Daeron's Targaryen blood and dragon.",
    whatTheyveLost: 'Very little so far',
    discourse: 'Norton widely praised; criticism that Ormund feels implausibly omniscient because too many covert operations succeed perfectly.',
    audienceReaction: 'LOVE TO HATE. \'I hate this man, give me more of this man.\' People hate what he does to Daeron and enjoy watching him do it. Note the difference from Alicent criticism: nobody wants Ormund\'s scenes removed, they want to analyse them.',
  },
  {
    id: 'Daeron Targaryen', name: 'Daeron Targaryen', actor: 'Benjamin Evan Ainsworth',
    house: 'House Hightower', allegiance: 'Green',
    dragon: { name: 'Tessarion', notes: 'Blue she-dragon; used in the killing of Kat’s brother Leo' },
    statusEnteringFinale: 'Alive at Tumbleton, resisting Ormund’s attempts to make him a puppet king, with Gwayne acting as a counterweight.',
    arcThisSeason: 'Forced by Ormund to execute Leo in E4. Caught between his Targaryen identity and Hightower upbringing, and increasingly recoiling from his own side.',
    whatTheyveLost: 'His innocence, and any illusion about what Ormund wants from him',
    discourse: 'Broadly praised — gives the Greens an unusually sympathetic internal dissenter.',
    audienceReaction: 'A SUCCESS. Landed well with show-only viewers. Audiences particularly like his genuine affection for Tessarion set against Ormund\'s coldly instrumental view of dragons. Some book-reader complaints that he has been changed too much.',
  },
  {
    id: 'Hugh Hammer', name: 'Hugh Hammer', actor: 'Kieran Bew',
    house: 'The Dragonseeds', allegiance: 'Black',
    dragon: { name: 'Vermithor', notes: 'The Bronze Fury, one of the largest living dragons' },
    statusEnteringFinale: 'Alive and STILL BLACK-ALIGNED on screen. Tied to occupied Tumbleton through his wife Kat, who refuses to leave with him. Loyalty strained — but no defection has happened.',
    arcThisSeason: 'His dragon makes him enormously powerful while Rhaenyra’s handling of the dragonseeds leaves him caught between duty and family.',
    whatTheyveLost: "Domestic stability, Kat's trust",
    discourse: 'Critics question why Kat refuses obvious chances to leave Tumbleton. Book-reader discourse about Hugh is heavily contaminated — do not pre-empt his choice.',
    audienceReaction: 'UNDER-DISCUSSED relative to Ulf. A suspense character rather than a fandom character — the conversation is about Kat, the dragonseeds and what he will choose, rather than about him.',
  },
  {
    id: 'Ulf the White', name: 'Ulf the White', actor: 'Tom Bennett',
    house: 'The Dragonseeds', allegiance: 'Green',
    dragon: { name: 'Silverwing', notes: 'Gentler disposition' },
    statusEnteringFinale: 'Alive and SECRETLY TURNED TO THE GREENS in E7, won over by Ormund with respect, pleasure and the promise of Driftmark. CRITICALLY: nobody on Team Black knows. Rhaenyra and Daemon still count him and Silverwing as theirs. The audience knows; the characters do not.',
    arcThisSeason: 'A lowborn rider desperate for status is belittled, restricted and finally struck by Daemon. Ormund exploits exactly those resentments.',
    whatTheyveLost: 'Loyalty to Rhaenyra; any trust in Black leadership',
    discourse: 'One of the more successful causal rewrites — even critics hostile to the adaptation can see why THIS version of Ulf defects.',
    audienceReaction: 'SURPRISINGLY WELL LIKED. Obnoxious, but the show made his resentment comprehensible — \'Ulf\'s motives are completely understandable\' is a common note. Viewers condemn the behaviour while buying the psychology.',
  },
  {
    id: 'Corlys Velaryon', name: 'Corlys Velaryon', actor: 'Steve Toussaint',
    house: 'House Velaryon', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive but a PRISONER of Ormund at Tumbleton, missing a finger — sent to Alyn as proof.',
    arcThisSeason: 'Survives the Gullet, finally acknowledges Addam and Alyn as his sons, clashes with Rhaenyra over legitimising them, then is abducted by Bold Jon Roxton.',
    whatTheyveLost: 'High Tide, fleet strength, Jace, his freedom, a finger',
    discourse: 'Criticism centres on how implausibly easily such an experienced warlord is kidnapped.',
    audienceReaction: 'SYMPATHETIC, though viewers find it implausible that so experienced a warlord was kidnapped so easily.',
  },
  {
    id: 'Addam of Hull', name: 'Addam of Hull', actor: 'Clinton Liberty',
    house: 'House Velaryon', allegiance: 'Black',
    dragon: { name: 'Seasmoke', notes: 'Formerly Laenor Velaryon’s' },
    statusEnteringFinale: 'Alive and an active Black dragonrider; helped contain Sheepstealer and escort the queen’s retreat.',
    arcThisSeason: 'Stays loyal despite Rhaenyra refusing to grant him the Velaryon name, becoming one of her most dependable riders.',
    whatTheyveLost: 'Security of Driftmark; an uncomplicated relationship with Corlys',
    discourse: 'Much less controversial than Hugh or Ulf; his loyalty increasingly contrasts with Rhaenyra’s mistrust of dragonseeds.',
    audienceReaction: 'QUIETLY LIKED. His loyalty reads well against Rhaenyra\'s mistrust of the dragonseeds.',
  },
  {
    id: 'Alyn of Hull', name: 'Alyn of Hull', actor: 'Abubakar Salim',
    house: 'House Velaryon', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive, commanding Velaryon forces, and has just received proof of Corlys’s captivity.',
    arcThisSeason: 'Kills Sharako Lohar at the Gullet, confronts Corlys over decades of neglect, and grows closer to Baela.',
    whatTheyveLost: 'High Tide’s security; an uncomplicated relationship with his father',
    discourse: 'Salim’s Gullet material is praised, especially his rage when Corlys appears to fall.',
    audienceReaction: 'WELL RECEIVED, especially his rage at the Gullet when Corlys appears to fall.',
  },
  {
    id: 'Rhaena Targaryen', name: 'Rhaena Targaryen', actor: 'Phoebe Campbell',
    house: 'The Blacks', allegiance: 'Black',
    dragon: { name: 'Sheepstealer', notes: 'Wild, large, never reliably obedient. Badly wounded in E7 and now separated from her.' },
    statusEnteringFinale: "Alive, returned to King's Landing with Rhaenyra after her secret was exposed. Sheepstealer is wounded and gone.",
    arcThisSeason: 'Gets what she desperately wanted — becoming a dragonrider — but Sheepstealer’s uncontrolled intervention helps cause Jace’s death. Daemon hid her secret until Rhaenyra found out.',
    whatTheyveLost: 'Jace, safety in the Vale, and now Sheepstealer',
    discourse: 'One of S3’s most disputed adaptation choices, and after E7 a large wave of fan sympathy for Sheepstealer.',
    audienceReaction: 'POLARIZED — and notably less liked than her dragon. Some credit her finally getting agency; a substantial contingent blames her for dragging Sheepstealer into a war he had no part in. Rule of thumb: Rhaena is a debate, Sheepstealer is applause.',
  },
  {
    id: 'Baela Targaryen', name: 'Baela Targaryen', actor: 'Bethany Antonia',
    house: 'The Blacks', allegiance: 'Black',
    dragon: { name: 'Moondancer', notes: 'Smaller, agile' },
    statusEnteringFinale: 'Alive, reconciled with Rhaena, still one of Rhaenyra’s functioning riders.',
    arcThisSeason: 'Survives the Gullet and develops a closer relationship with Alyn.',
    whatTheyveLost: 'Jace, her betrothed; High Tide’s security',
    discourse: 'Some find the Alyn romance under-developed; others welcome Baela having a life beyond being Jace’s fiancée.',
    audienceReaction: 'LIKED. Some find the Alyn romance under-developed; others are glad she has a life beyond being Jace\'s fiancée.',
  },
  {
    id: 'Alys Rivers', name: 'Alys Rivers', actor: 'Gayle Rankin',
    house: 'Harrenhal', allegiance: 'Neutral',
    dragon: null,
    statusEnteringFinale: 'Alive at Harrenhal, standing over the poisoned Aemond, and in possession of a hidden clutch of dragon eggs.',
    arcThisSeason: 'Reverses Aemond’s power dynamic entirely — healer, mystic, confidante and finally lover, while hiding dragon eggs.',
    whatTheyveLost: 'Nothing clear this season',
    discourse: 'Rankin’s uncanny performance is praised; the Aemond romance has enthusiastic fans and viewers exhausted by another Harrenhal vision-loop.',
    audienceReaction: 'DIVISIVE BUT COMPELLING. Rankin\'s uncanny performance is praised; the Aemond material splits between enthusiasm and Harrenhal fatigue.',
  },
  {
    id: 'Mysaria', name: 'Mysaria', actor: 'Sonoya Mizuno',
    house: 'The Blacks', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: "Alive in King's Landing as Rhaenyra's spymaster and intimate partner.",
    arcThisSeason: 'Her network becomes central to Rhaenyra’s government, but she conceals information and increasingly mixes influence with intimacy. She caught Alicent and Helaena attempting to flee.',
    whatTheyveLost: 'Her image of dispassionate control',
    discourse: 'Criticism focuses on inconsistent competence and the abruptness of her renewed intimacy with Rhaenyra.',
    audienceReaction: 'ONE OF THE CLEAREST AUDIENCE LOSERS — but the complaint is screen time, not the character. \'The fact Mysaria gets more scenes than Aegon is criminal.\' The argument is that the Rhaenyra/Mysaria material crowds out the war, Aegon and the dragons. Some viewers do like the chemistry.',
  },
  {
    id: 'Larys Strong', name: 'Larys Strong', actor: 'Matthew Needham',
    house: 'The Greens', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive but has ABANDONED Aegon and Tyland rather than face the confrontation. Destination not established.',
    arcThisSeason: 'Becomes Aegon’s brutally honest caretaker on the road — a pairing that humanises both — then chooses survival when it gets dangerous.',
    whatTheyveLost: "King's Landing power base and control of events",
    discourse: 'Aegon/Larys is repeatedly singled out as one of S3’s most entertaining relationships.',
    audienceReaction: 'ENJOYED. The Aegon/Larys/Tyland road story is a strong approval area, and Larys finally snapping at Aegon was called \'so damn satisfying\'.',
  },
  {
    id: 'Gwayne Hightower', name: 'Gwayne Hightower', actor: 'Freddie Fox',
    house: 'House Hightower', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive at Tumbleton, increasingly opposed to Ormund and protective of Daeron. Exposed a fake Baratheon assassination attempt.',
    arcThisSeason: 'His horror at Criston’s moral collapse grows until he abandons Cole’s doomed army, then becomes the counterweight to Ormund.',
    whatTheyveLost: 'Army comrades, Criston, faith in the campaign',
    discourse: 'His moral disgust gives the Green ground war a necessary internal opposition.',
    audienceReaction: 'LIKED as the Green side\'s conscience.',
  },
  {
    id: 'Tyland Lannister', name: 'Tyland Lannister', actor: 'Jefferson Hall',
    house: 'The Greens', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive, revealed to have survived the Gullet, and staying with Aegon after volunteering to stand beside him.',
    arcThisSeason: 'Rejoins Aegon and Larys on the road; central to the unresolved mystery of the missing royal gold.',
    whatTheyveLost: 'The royal treasury he was responsible for',
    discourse: 'Part of the Aegon/Larys/Tyland trio widely enjoyed as unexpected comic-human relief.',
    audienceReaction: 'ENJOYED as part of the Aegon/Larys/Tyland trio.',
  },
  {
    id: 'Roderick Dustin', name: 'Roderick Dustin', actor: 'Tommy Flanagan',
    house: 'The North and Riverlands', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive, commanding the Winter Wolves, closing on the Hightower position at Tumbleton.',
    arcThisSeason: 'Arrives as the aged, death-seeking commander of the Winter Wolves and helps destroy Criston’s force at the Butcher’s Ball.',
    whatTheyveLost: 'Men in the campaign',
    discourse: 'Flanagan’s dry, brutal veteran performance is a well-liked addition.',
    audienceReaction: 'WELL LIKED. The dry, brutal veteran is a popular addition.',
  },
  {
    id: 'Oscar Tully', name: 'Oscar Tully', actor: 'Archie Barnes',
    house: 'The North and Riverlands', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive, co-commanding the Riverlands force closing on Tumbleton.',
    arcThisSeason: 'Co-leads the coalition that annihilates Criston Cole’s army at the Butcher’s Ball.',
    whatTheyveLost: 'Men in the campaign',
    discourse: null,
    audienceReaction: 'POSITIVE but lower profile.',
  },
  {
    id: 'Alysanne Blackwood', name: 'Alysanne Blackwood', actor: 'Annie Shapero',
    house: 'The North and Riverlands', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive with the Black river host. Known as Black Aly.',
    arcThisSeason: 'Personally fired the three arrows that killed Criston Cole at the Butcher’s Ball — confirmed by Shapero after the episode.',
    whatTheyveLost: null as unknown as string,
    discourse: 'Forbes’s initial recap called the killer an unnamed northern archer; the actor’s later interview identifies Black Aly. Treat Black Aly as canon.',
    audienceReaction: 'A POINT OF INTEREST since it emerged she personally shot Criston Cole.',
  },
  {
    id: 'Bold Jon Roxton', name: 'Bold Jon Roxton', actor: 'Joplin Sibtain',
    house: 'House Hightower', allegiance: 'Green',
    dragon: null,
    statusEnteringFinale: 'Alive; Ormund’s operative, having successfully kidnapped Corlys.',
    arcThisSeason: 'Executes the abduction of Corlys Velaryon on Ormund’s behalf.',
    whatTheyveLost: null as unknown as string,
    discourse: null,
    audienceReaction: 'LOW PROFILE.',
  },
  {
    id: 'Kat', name: 'Kat', actor: '—',
    house: 'The Dragonseeds', allegiance: 'Neutral',
    dragon: null,
    statusEnteringFinale: 'Alive in occupied Tumbleton, refusing to leave with Hugh.',
    arcThisSeason: 'Sexually assaulted by a Hightower soldier in E4; her brother Leo was then executed by Daeron for striking the man while defending her. She has since refused to flee with Hugh.',
    whatTheyveLost: 'Her brother Leo; her safety',
    discourse: 'Critics question why she refuses obvious opportunities to leave the occupied town.',
    audienceReaction: 'SYMPATHETIC, though viewers question why she will not leave Tumbleton.',
  },
  {
    id: 'Grand Maester Orwyle', name: 'Grand Maester Orwyle', actor: 'Kurt Egyiawan',
    house: 'The Blacks', allegiance: 'Neutral',
    dragon: null,
    statusEnteringFinale: "Alive in King's Landing, serving whichever regime holds it.",
    arcThisSeason: 'Intervened to stop Jasper Wylde’s assault on Alicent and had him arrested. Caught between regimes.',
    whatTheyveLost: 'Any pretence of neutrality',
    discourse: null,
    audienceReaction: 'LOW PROFILE.',
  },
  {
    id: 'Torrhen Manderly', name: 'Torrhen Manderly', actor: 'Dan Fogler',
    house: 'The North and Riverlands', allegiance: 'Black',
    dragon: null,
    statusEnteringFinale: 'Alive as far as E7 establishes. His exact position late in the season is NOT re-established — do not invent a battlefield location for him.',
    arcThisSeason: 'A northern representative in Rhaenyra’s expanding coalition and her governance discussions.',
    whatTheyveLost: 'Nothing depicted',
    discourse: 'Far less developed than Roddy Dustin.',
    audienceReaction: 'LOW PROFILE.',
  },
]

// ─── Dragons ─────────────────────────────────────────────────────────────────
// Dragons are reaction characters in their own right this season — Sheepstealer
// and Sunfyre generate more audience feeling than most of the humans. The GM
// will log dragon events, so they need to resolve like anyone else.

export interface DragonProfile {
  name: string
  rider: string | null
  allegiance: Allegiance
  status: string
  audienceReaction: string
}

export const dragons: DragonProfile[] = [
  { name: 'Sheepstealer', rider: 'Rhaena Targaryen (separated)', allegiance: 'Black',
    status: 'Badly wounded in E7 after fighting Syrax, Seasmoke and Caraxes at once. Daemon deliberately let him escape. Alive, alone, injured.',
    audienceReaction: "THE BREAKOUT OF THE SEASON. 'Justice for Sheepstealer' is the dominant meme — viewers treat him as an innocent dragged into Targaryen nonsense who was 'minding his own business taking sheep'. Genuine sadness, not only jokes, about him being set on by three dragons. Widely admired for surviving 3-v-1. He is more sympathetic to the audience than his own rider." },
  { name: 'Sunfyre', rider: 'Aegon II Targaryen', allegiance: 'Green',
    status: 'Alive, severely scarred, returned in E7 and killed the Black soldiers confronting Aegon. The show does not explain how he survived.',
    audienceReaction: "ENORMOUSLY POPULAR. His return is the crowd-pleaser of the season — 'Sunfyre really saved the episode'. Viewers respond to the mirroring: scarred king, scarred dragon, both wrecked by the same war. Aegon calling him 'his boy' is widely quoted." },
  { name: 'Vhagar', rider: 'Aemond Targaryen', allegiance: 'Green',
    status: 'Alive. WHEREABOUTS UNKNOWN — deliberately left unclear since E5. Do not place her.',
    audienceReaction: 'Her absence is one of the season\'s most-discussed open questions.' },
  { name: 'Caraxes', rider: 'Daemon Targaryen', allegiance: 'Black',
    status: 'Alive. Fought Sheepstealer in E7; Daemon chose not to finish him.',
    audienceReaction: 'Respected. The choice not to kill Sheepstealer earned Daemon credit.' },
  { name: 'Syrax', rider: 'Rhaenyra Targaryen', allegiance: 'Black',
    status: 'Alive. Took part in the Sheepstealer fight.', audienceReaction: 'Neutral.' },
  { name: 'Seasmoke', rider: 'Addam of Hull', allegiance: 'Black',
    status: 'Alive. Took part in the Sheepstealer fight.', audienceReaction: 'Positive, tied to goodwill toward Addam.' },
  { name: 'Vermithor', rider: 'Hugh Hammer', allegiance: 'Black',
    status: 'Alive. The Bronze Fury, one of the largest living dragons — and the reason Hugh matters strategically.',
    audienceReaction: 'Treated as a looming strategic factor rather than a personality.' },
  { name: 'Silverwing', rider: 'Ulf the White', allegiance: 'Green',
    status: 'Alive. Goes with Ulf to the Greens after his secret defection — Team Black does not know.',
    audienceReaction: 'Discussed mostly as the asset Ulf is taking with him.' },
  { name: 'Tessarion', rider: 'Daeron Targaryen', allegiance: 'Green',
    status: 'Alive at Tumbleton. Used in the killing of Kat\'s brother Leo.',
    audienceReaction: "Well liked. Viewers respond to Daeron calling her 'his girl' — read as a genuine bond, set against Ormund's purely instrumental view of dragons." },
  { name: 'Dreamfyre', rider: 'Helaena Targaryen', allegiance: 'Neutral',
    status: 'Alive. Appeared in E7 only inside Helaena\'s VISION — she has not flown into combat.',
    audienceReaction: 'Big excitement at finally seeing her; a wave of explainers and edits since E7.' },
  { name: 'Moondancer', rider: 'Baela Targaryen', allegiance: 'Black',
    status: 'Alive.', audienceReaction: 'Neutral to positive.' },
]

export function getDragon(name: string): DragonProfile | undefined {
  const q = name.trim().toLowerCase()
  return dragons.find((d) => d.name.toLowerCase() === q)
      ?? dragons.find((d) => q.includes(d.name.toLowerCase()))
}

// ─── Episode recaps ───────────────────────────────────────────────────────────

export const episodeRecaps: EpisodeRecap[] = [
  { episode: 1, title: 'Salt and Sea, Fire and Blood', events: [
    'Rhaena bonds with Sheepstealer, which does not reliably obey her',
    'The Battle of the Gullet against the Triarchy',
    'Jace confines Rhaenyra at Dragonstone and flies into battle himself',
    'Jacaerys and Vermax die; Sharako Lohar killed by Alyn; High Tide sacked',
    'Corlys goes overboard, fate initially unknown',
    'Aegon II and Larys captured while fleeing the capital',
    'Aemond kisses Alicent, who is visibly distressed',
  ]},
  { episode: 2, title: "Queen's Landing", events: [
    'Corlys found alive; Jace’s body returned to Rhaenyra',
    'Aemond kills Simon Strong and his sons at Harrenhal and is badly wounded',
    'Alys Rivers begins tending Aemond',
    'Jasper Wylde attempts to assault Alicent; Orwyle intervenes',
    "Alicent flips the city defences and Gold Cloaks; the Blacks take King's Landing",
    'Rhaenyra executes Otto Hightower and takes the Iron Throne',
  ]},
  { episode: 3, title: 'Rhaenyra Triumphant', events: [
    'The treasury is empty; the capital faces food shortages',
    'Corlys asks Rhaenyra to legitimise Addam and Alyn; she stalls',
    'The High Septon resists her legitimacy; Rhaenyra hallucinates Jace',
    'The rat banquet: she humiliates nobles hoarding food',
    'Ormund seizes Tumbleton and fools Daemon with a fake Daeron',
  ]},
  { episode: 4, title: 'Tumbleton', events: [
    'A Hightower soldier sexually assaults Kat; Ormund orders him maimed',
    'Ormund forces Daeron to execute Kat’s brother Leo, using Tessarion',
    'Daemon discovers Rhaena is Sheepstealer’s rider',
    'Daemon murders and burns a shepherd to fake the rider’s corpse',
  ]},
  { episode: 5, title: 'Unbowed and Unbent', events: [
    'Tyland Lannister revealed alive and rejoins Aegon and Larys',
    'Aegon commits to killing Aemond rather than Rhaenyra',
    'Aemond kills men attempting to assault Alys',
    "Vhagar is no longer at Aemond's side; whereabouts deliberately unclear",
    'The Feast for Traitors: murdered Gold Cloaks staged around a table',
    'Helaena revealed pregnant; refuses Alicent’s attempt to end it',
    'Alicent and Helaena try to flee; Mysaria catches them',
  ]},
  { episode: 6, title: 'Faceless Men', events: [
    "The Butcher's Ball annihilates Criston Cole's force",
    'Criston Cole killed by three arrows from Alysanne Blackwood',
    'Gwayne reaches Tumbleton; Daeron rejects Ormund’s puppet plan',
    'Daemon humiliates Ulf for drinking against orders',
    'Hugh visits Kat in Tumbleton; she refuses to leave',
    'Alys shows Aemond a hidden clutch of dragon eggs',
    'Bold Jon Roxton kidnaps Corlys for Ormund',
    'Alicent agrees to go to Harrenhal and kill Aemond to protect Helaena',
  ]},
  { episode: 7, title: 'The Dragon in Winter', events: [
    'Rhaenyra discovers Rhaena is Sheepstealer’s rider',
    'Sheepstealer fights Syrax, Seasmoke and Caraxes and is badly wounded',
    'Rhaena returns to the capital; Daemon lets Sheepstealer escape',
    'Sunfyre is alive and reunites with Aegon, killing the soldiers confronting him',
    'Larys abandons Aegon and Tyland',
    'Ormund sends Alyn one of Corlys’s fingers',
    'Ulf agrees to defect to Ormund, with Silverwing',
    'Aemond and Alys become sexual; he hallucinates Alicent during it',
    'Alicent poisons Aemond with nightshade; he collapses, no death shown',
    'Helaena’s vision shows Dreamfyre; Baela and Rhaena reconcile',
    'Rhaenyra and Mysaria become intimate',
  ]},
]

export const stateOfPlay =
  "Rhaenyra holds King's Landing but is broke, short of food and losing the trust of her dragonseeds. " +
  'Ormund holds Tumbleton with Corlys as a prisoner and Ulf secretly turned, while a large Black northern host closes on him. ' +
  'Aemond lies poisoned at Harrenhal and Vhagar is missing. Aegon is back on his feet with Sunfyre. ' +
  'Hugh Hammer is still loyal to the Blacks, and Helaena is pregnant and held in the capital.'

// ─── Criticism ────────────────────────────────────────────────────────────────

export const criticism: CriticismItem[] = [
  { category: 'adaptation', spoiler: false, prevalence: 'widespread in book fandom, increasingly general after E7',
    point: 'Giving Rhaena the Sheepstealer story makes her emotionally central but ties her directly to Jace’s death, and collapses a distinct book character into her.' },
  { category: 'adaptation', spoiler: false, prevalence: 'common but contested',
    point: 'The Gullet is radically personalised — Jace confining Rhaenyra, Sheepstealer disrupting friendly dragons — which readers say transfers blame and changes who Jace is at the end.' },
  { category: 'adaptation', spoiler: false, prevalence: 'widespread among adaptation critics, praised by others',
    point: "The fall of King's Landing is driven entirely by Alicent, contorting the civil war around the Rhaenyra/Alicent relationship." },
  { category: 'adaptation', spoiler: false, prevalence: 'book-fandom concentrated, increasingly mainstream',
    point: 'Helaena is deliberately a noncombatant dragonrider; the show frames her as understanding dragons as purely destructive.' },
  { category: 'pacing', spoiler: false, prevalence: 'strong but not consensus',
    point: 'The complaint is not that nothing happens but that major characters revisit the same dilemma for several episodes while the battlefield advances elsewhere. Aemond stuck wounded at Harrenhal draws direct comparison to Daemon’s much-criticised S2 Harrenhal loop.' },
  { category: 'pacing', spoiler: false, prevalence: 'critic-specific',
    point: 'Esquire called E7 "major stalling" — characters wait, brood and see visions rather than change the board.' },
  { category: 'characterisation', spoiler: false, prevalence: 'common and highly divisive',
    point: 'Alicent poisoning Aemond is called baffling by critics who argue it does not follow from two seasons of maternal motivation.' },
  { category: 'characterisation', spoiler: false, prevalence: 'common but contested',
    point: 'Critics argue characters around Rhaenyra are repeatedly made less competent so the war can continue.' },
  { category: 'characterisation', spoiler: false, prevalence: 'critic-specific but persuasive',
    point: 'Criston Cole dies eight minutes into E6 and almost nobody processes it afterward, cashing out none of the season’s character work on him.' },
  { category: 'characterisation', spoiler: false, prevalence: 'notably positive',
    point: 'Ulf’s defection is one rewrite that improves causality — he is belittled, restricted and struck by Daemon, and Ormund wins him with respect and flattery.' },
  { category: 'incest-discourse', spoiler: false, prevalence: 'widespread',
    point: 'S3 changes the KIND of incest it foregrounds: from culturally normalised Targaryen dynastic marriage to mother-son eroticism framed as pathology. Aemond kisses Alicent in E1 and hallucinates her while sleeping with Alys in E7.' },
  { category: 'incest-discourse', spoiler: false, prevalence: 'important nuance',
    point: 'Alicent is framed as disturbed and repelled, never as consenting. The scenes are coercive and psychologically disturbed, so "classic Targaryens" is NOT a safe punchline for the Aemond/Alicent material.' },
  { category: 'incest-discourse', spoiler: false, prevalence: 'the actual shape of the reaction',
    point: 'There is a clear double standard, and it is the interesting part: audiences treat Targaryen uncle-niece and brother-sister marriage (Rhaenyra and Daemon) as unremarkable world-building, and react to Aemond and Alicent with genuine revulsion. Same show, same house, opposite response.' },
  { category: 'sexual-violence', spoiler: false, prevalence: 'recurring critical objection',
    point: 'S3 repeatedly uses sexual violence against women as shorthand for military collapse — the village girl in E1, Alicent in E2, Kat in E4, Alys in E5. Critics argue the Alicent assault in particular adds nothing her existing lack of agency had not established.' },
  { category: 'production', spoiler: false, prevalence: 'widely praised',
    point: 'The Gullet took roughly two years of R&D; production built wet and dry tanks and ship gimbals, shooting most of the water and ship action practically. E7’s multi-dragon confrontation and the Sunfyre/Dreamfyre work are singled out.' },
  { category: 'production', spoiler: false, prevalence: 'unverified — do not assert',
    point: 'Some viewers still complain scenes are too dark to see. There is NO credible S3 source confirming day-for-night is being used; do not claim it is.' },
  { category: 'praise', spoiler: false, prevalence: 'broad',
    point: 'Variety praised the shift toward more action after S2. Forbes called E7 possibly the season’s best. Aegon/Larys/Tyland became an unexpected comic-human trio, and Ormund works as an antagonist whose weapons are logistics and manipulation rather than another giant dragon.' },
  { category: 'praise', spoiler: false, prevalence: 'the fairest summary',
    point: 'S3’s greatest strength and weakness are opposites: the war finally moves, but several principal characters are deliberately trapped in psychological loops while it does.' },

  // ── Spoiler-tagged: kept for grounding, never sent to the model ──
  { category: 'adaptation', spoiler: true, prevalence: 'very widespread among book readers',
    point: 'In Fire & Blood both Ulf AND Hugh turn against Rhaenyra at Tumbleton. Through E7 only Ulf has turned. Readers treat Hugh’s Kat storyline as setup.' },
  { category: 'adaptation', spoiler: true, prevalence: 'long-running book dispute',
    point: 'In the book Sheepstealer’s rider is Nettles, a separate lowborn dragonseed whose relationship with Daemon has consequences the show has not dramatised.' },
]

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function getCharacter(nameOrId: string): CharacterProfile | undefined {
  const q = nameOrId.trim().toLowerCase()
  return (
    characters.find((c) => c.id.toLowerCase() === q) ??
    characters.find((c) => c.name.toLowerCase() === q) ??
    characters.find((c) => c.name.toLowerCase().includes(q)) ??
    characters.find((c) => q.includes(c.name.toLowerCase().split(' ')[0]))
  )
}

export function isDead(name: string): boolean {
  const q = name.trim().toLowerCase()
  return theDead.some((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()))
}

/** Criticism safe to show the model — spoiler-tagged items are excluded. */
export function safeCriticism(category?: CriticismCategory): CriticismItem[] {
  return criticism.filter(
    (c) => !c.spoiler && (category == null || c.category === category),
  )
}

export function hasEncyclopedia(): boolean {
  return characters.length > 0
}

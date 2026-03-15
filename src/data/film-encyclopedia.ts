// src/data/film-encyclopedia.ts
// Rich content for all nominated films — used in the Home tab's Browse section
// Each entry includes: synopsis, critical reception, Oscar storyline, controversy/snubs, key facts

export interface FilmProfile {
    id: string; // matches draft_entity film ID or a slug
    title: string;
    year: number;
    director: string;
    stars: string[];
    genre: string;
    runtime: string;
    rtScore: number; // Rotten Tomatoes critics %
    metacritic: number;
    boxOffice: string;
    synopsis: string;
    whyNominated: string;
    oscarStoryline: string;
    controversy: string | null;
    keyFacts: string[];
    nominations: number;
    predictedWins: string;
  }
  
  export const filmEncyclopedia: FilmProfile[] = [
    {
      id: 'sinners',
      title: 'Sinners',
      year: 2025,
      director: 'Ryan Coogler',
      stars: ['Michael B. Jordan', 'Hailee Steinfeld', 'Miles Caton', 'Delroy Lindo', 'Wunmi Mosaku', 'Jack O\'Connell'],
      genre: 'Horror / Musical / Period Drama',
      runtime: '2h 17m',
      rtScore: 97,
      metacritic: 84,
      boxOffice: '$370M+ worldwide',
      synopsis: 'Set in 1932 Mississippi during the Jim Crow era, twin brothers Smoke and Stack (both played by Michael B. Jordan) return to their hometown of Clarksdale after working for the mob in Chicago. They plan to open a juke joint using their stolen money, recruiting their cousin Sammie, a gifted blues guitarist. But when a supernatural evil — vampires drawn to the otherworldly power of the blues — descends on their establishment, the brothers must fight to protect their community, their music, and their souls.',
      whyNominated: 'Shattered the all-time record with 16 Academy Award nominations — more than Titanic, All About Eve, or La La Land ever received. The film earned nominations across nearly every branch of the Academy, from acting to technical categories, reflecting its universal appeal to voters. It represents Ryan Coogler\'s first original screenplay after years working within existing IP (Creed, Black Panther), and critics called it the full realization of his singular vision.',
      oscarStoryline: 'The central question of Oscar night: can Sinners pull off the Best Picture upset against One Battle After Another\'s precursor sweep? The film\'s 16 nominations give it the broadest support base in Academy history. Under the preferential ballot system used for Best Picture, breadth of support (being many voters\' second or third choice) can beat depth (being fewer voters\' first choice). If Sinners wins, it would be the first horror film to take Best Picture since The Silence of the Lambs in 1992.',
      controversy: 'Some critics argued the film is overhyped relative to its narrative complexity. User reviews on IMDB are polarized — the 97% RT score contrasts with more mixed audience reactions. The film\'s genre-blending (horror + musical + period drama + social commentary) was divisive; some found it incoherent while others called it revolutionary.',
      keyFacts: [
        'First film ever to receive 16 Oscar nominations',
        'Ryan Coogler\'s first original screenplay — not a franchise/sequel',
        'Shot on 65mm with IMAX cameras, with 10 IMAX 70mm prints',
        'Michael B. Jordan plays twin brothers using dual performance techniques',
        'Ludwig Göransson composed the score drawing from Delta blues traditions',
        'Autumn Durald Arkapaw is the first woman of color nominated for Best Cinematography',
        'Grossed $200M domestic — first original film to do so since Coco (2017)',
        'Miles Caton\'s film debut — he learned guitar specifically for the role',
        'Ruth E. Carter could become the first Black three-time Oscar winner via Costume Design',
        'Zinzi Coogler (Ryan\'s wife, producer) would be the first Black woman to win Best Picture if it wins',
        'Screened in Clarksdale, Mississippi (where it\'s set) — the town had no working movie theater, so the civic auditorium hosted six showings'
      ],
      nominations: 16,
      predictedWins: '~7 wins projected (Variety): Original Screenplay (lock), Cinematography, Score, Costume Design, Sound, Makeup, Song'
    },
    {
      id: 'one-battle-after-another',
      title: 'One Battle After Another',
      year: 2025,
      director: 'Paul Thomas Anderson',
      stars: ['Leonardo DiCaprio', 'Sean Penn', 'Benicio del Toro', 'Teyana Taylor', 'Regina Hall', 'Chase Infiniti'],
      genre: 'Action / Black Comedy / Political Thriller',
      runtime: '2h 42m',
      rtScore: 94,
      metacritic: 88,
      boxOffice: '$180M+ worldwide',
      synopsis: 'Loosely inspired by Thomas Pynchon\'s novel Vineland, the film follows Bob Ferguson (DiCaprio), an ex-revolutionary and stoned single father hiding from his past. When his longtime nemesis Colonel Lockjaw (Sean Penn), a xenophobic military officer, resurfaces after 16 years to hunt down Bob\'s daughter Willa (Chase Infiniti), the former members of the revolutionary group "French 75" must reunite. Part political thriller, part dark comedy, part family drama — Anderson uses the story to comment on immigration, white supremacy, and political polarization in America.',
      whyNominated: '13 nominations. PTA swept every major precursor award — Golden Globe, Critics Choice, BAFTA, PGA, DGA — a historically unprecedented run. No film has ever won all five of those and lost Best Picture. The film is widely considered PTA\'s most "entertaining" and accessible work, combining his trademark character depth with genuine action set pieces.',
      oscarStoryline: 'This is Paul Thomas Anderson\'s long-awaited coronation. After 14 career nominations and zero wins, PTA is considered the most "overdue" filmmaker in Hollywood. The precursor sweep makes Director and Adapted Screenplay near-locks. The only question is whether Best Picture follows. The "overdue genius finally gets his night" narrative is irresistible to voters.',
      controversy: 'Some critics found the film\'s political commentary heavy-handed, with one side portrayed as "entirely evil with no redeeming qualities." The $175M budget was a massive bet for a PTA film (his previous highest-grossing film, There Will Be Blood, made only $76M). Released during the Trump 2.0 era, the film\'s commentary on nationalism and immigration was seen as either urgently necessary or politically lecturing, depending on the viewer.',
      keyFacts: [
        'PTA\'s 10th feature film and most commercially successful ever',
        'Loosely adapted from Thomas Pynchon\'s 1990 novel Vineland',
        'Shot using VistaVision — one of the first films to use the format since the 1960s',
        'DiCaprio received his standard $25M fee',
        'Budget ballooned from $115M to $175M during production',
        'Sean Penn\'s villain "Colonel Lockjaw" ranked among the best villain performances of 2025',
        'Chase Infiniti\'s film debut as Willa — discovered through open casting',
        'Teyana Taylor\'s breakout dramatic role as Perfidia Beverly Hills',
        'Jonny Greenwood (Radiohead) composed the score using eclectic instruments including xylophone and marimba',
        'Anderson had wanted to adapt Vineland since the early 2000s',
        'If PTA wins Director, it ends a 14-nomination, 0-win drought — one of the longest in Academy history'
      ],
      nominations: 13,
      predictedWins: '~3 wins projected: Director (near-lock), Adapted Screenplay (lock), possibly Best Picture'
    },
    {
      id: 'marty-supreme',
      title: 'Marty Supreme',
      year: 2025,
      director: 'Josh Safdie',
      stars: ['Timothée Chalamet', 'Gwyneth Paltrow', 'Odessa A\'zion', 'Kevin O\'Leary', 'Tyler, the Creator', 'Fran Drescher'],
      genre: 'Sports / Comedy-Drama',
      runtime: '2h 29m',
      rtScore: 92,
      metacritic: 86,
      boxOffice: '$179M worldwide',
      synopsis: 'In 1952 New York City, Marty Mauser (Chalamet) is a shoe salesman on the Lower East Side with an obsession: becoming the world champion of table tennis and making ping-pong a respected sport in America. Part hustler, part dreamer, all ego — Marty charms, exploits, and bulldozes everyone around him in pursuit of his goal. Loosely based on real-life table tennis champion Marty Reisman, the film is a kinetic character study of American ambition at its most charismatic and toxic.',
      whyNominated: '9 nominations including Best Picture. Josh Safdie\'s first solo directorial effort (without brother Benny) is being called a companion piece to Uncut Gems. Chalamet gives what critics describe as the defining performance of his career — fully physical, darkly funny, and deeply committed. A24\'s highest-grossing film ever.',
      oscarStoryline: 'Chalamet became the youngest actor since Marlon Brando to receive three Best Actor nominations, and at 30, the youngest ever nominated for both acting and producing in the same year. He won the Golden Globe (Musical/Comedy) and Critics Choice, but was stunned by Michael B. Jordan\'s SAG win — setting up the night\'s biggest toss-up in Best Actor.',
      controversy: 'Chalamet stirred backlash days before the ceremony by commenting that "no one cares" about ballet or opera in a conversation with Matthew McConaughey. The Metropolitan Opera, Royal Ballet, Seattle Opera, and Misty Copeland (who had previously helped promote his film) publicly pushed back. The Oscars reportedly added a ballet performance by Copeland partly in response. Since voting closed March 5 (after the comments went viral), the impact on his odds is unclear.',
      keyFacts: [
        'Loosely based on Marty Reisman, a real 1950s table tennis champion and hustler',
        'Chalamet trained in table tennis for years — performs his own shots in long takes',
        'Josh Safdie\'s first film without brother Benny since 2008',
        'Darius Khondji (Se7en, The Immigrant) shot on 35mm film',
        'Jack Fisk (David Lynch\'s brother-in-law, designer of Days of Heaven and There Will Be Blood) did production design',
        'Daniel Lopatin (Oneohtrix Point Never) composed the score',
        'Kevin O\'Leary (Shark Tank) plays a supporting role — not stunt casting, actually effective',
        'A24\'s highest-grossing film ever at $179M worldwide',
        'The "sperm credit sequence" became a viral talking point',
        'Chalamet is also a producer on the film'
      ],
      nominations: 9,
      predictedWins: 'Best Actor is a genuine toss-up between Chalamet and Jordan. Possible wins in Editing, Production Design.'
    },
    {
      id: 'hamnet',
      title: 'Hamnet',
      year: 2025,
      director: 'Chloé Zhao',
      stars: ['Jessie Buckley', 'Paul Mescal', 'Emily Watson', 'Jacobi Jupe', 'Noah Jupe', 'Joe Alwyn'],
      genre: 'Historical Drama',
      runtime: '2h 08m',
      rtScore: 86,
      metacritic: 84,
      boxOffice: '$18M domestic',
      synopsis: 'Based on Maggie O\'Farrell\'s acclaimed 2020 novel, the film imagines the family life of William Shakespeare (Mescal) and his wife Agnes (Buckley) in 1580s England. It traces their passionate romance, the birth of their children — including twins Hamnet and Judith — and the devastating loss of 11-year-old Hamnet to plague. The film suggests this tragedy directly inspired Shakespeare\'s masterpiece Hamlet, exploring how art is born from grief and how love endures beyond death.',
      whyNominated: '8 nominations. Jessie Buckley\'s performance is the ceremony\'s biggest lock — she swept every precursor (Golden Globe, Critics Choice, BAFTA, SAG). Chloé Zhao\'s direction marks her comeback after the Eternals misfire, returning to the intimate, naturalistic filmmaking of Nomadland. The film won the People\'s Choice Award at Toronto.',
      oscarStoryline: 'Jessie Buckley is the night\'s surest thing at -3500 betting odds (97% implied probability). If she wins, she\'d be the first Irish actress to win Best Actress. The film also represents Chloé Zhao\'s validation — proof that Eternals was the aberration, not the rule. Paul Mescal was notably NOT nominated for Best Actor, which some see as a snub.',
      controversy: 'Some critics found the grief sequences "overly demonstrative" and "histrionic." The Roger Ebert review noted that the film\'s depiction of loss felt "uncomfortably voyeuristic" at times. Others pushed back on the historical liberties taken with Shakespeare\'s life. The modest $18M box office (in 1,276 theaters) raised questions about whether Academy voters saw it.',
      keyFacts: [
        'Adapted from Maggie O\'Farrell\'s 2020 bestselling novel (O\'Farrell co-wrote the screenplay)',
        'Shakespeare is never referred to by name in the source novel',
        'Jessie Buckley has won roughly 40 critics group awards this season',
        'Chloé Zhao\'s first feature since Eternals (2021) — a return to intimate drama',
        'Produced by Steven Spielberg, Sam Mendes, and Pippa Harris',
        'Cinematographer Lukasz Zal previously shot Cold War and Ida',
        'Max Richter composed the score',
        'Sound designer Johnnie Burn won an Oscar for The Zone of Interest',
        'Jacobi Jupe\'s performance as young Hamnet has been called one of the year\'s best child performances',
        'Won the Golden Globe for Best Motion Picture — Drama'
      ],
      nominations: 8,
      predictedWins: 'Best Actress (absolute lock). Possible: Adapted Screenplay (though PTA is favored), Casting.'
    },
    {
      id: 'frankenstein',
      title: 'Frankenstein',
      year: 2025,
      director: 'Guillermo del Toro',
      stars: ['Jacob Elordi', 'Oscar Isaac', 'Mia Goth', 'Christoph Waltz'],
      genre: 'Gothic Horror / Drama',
      runtime: '2h 24m',
      rtScore: 89,
      metacritic: 82,
      boxOffice: '$145M worldwide',
      synopsis: 'Guillermo del Toro\'s passion project — a faithful and visually stunning adaptation of Mary Shelley\'s original 1818 novel. Jacob Elordi stars as the Creature, not as a lumbering monster but as a tragic, eloquent being grappling with consciousness, abandonment, and the cruelty of his creator Victor Frankenstein. Del Toro spent decades developing this vision, emphasizing the novel\'s themes of parental responsibility, scientific hubris, and what it means to be human.',
      whyNominated: '9 nominations, mostly in craft categories. Del Toro\'s visual mastery shines through — the film is a feast of practical effects, makeup, and Gothic production design. Jacob Elordi\'s transformation into the Creature (via extensive prosthetics) earned a Supporting Actor nod. The film is a technical showcase.',
      oscarStoryline: 'Frankenstein is projected to sweep the craft categories — Makeup and Hairstyling, Production Design, Costume Design, and possibly Cinematography and Score. It\'s del Toro\'s most personal project but faces stiff competition from Sinners and OBAA in the above-the-line categories.',
      controversy: null,
      keyFacts: [
        'Guillermo del Toro spent decades developing this adaptation',
        'Jacob Elordi wore extensive prosthetic makeup for the Creature role',
        'Dan Laustsen (del Toro\'s frequent DP) shot the film',
        'Alexandre Desplat composed the score',
        'Emphasis on practical effects over CGI',
        'Faithful to Mary Shelley\'s 1818 novel, not the 1931 Boris Karloff film',
        'Del Toro also wrote the adapted screenplay'
      ],
      nominations: 9,
      predictedWins: '~3 wins projected in craft: Makeup, Production Design, possibly Costume Design'
    },
    {
      id: 'sentimental-value',
      title: 'Sentimental Value',
      year: 2025,
      director: 'Joachim Trier',
      stars: ['Renate Reinsve', 'Stellan Skarsgård', 'Elle Fanning', 'Inga Ibsdotter Lilleaas'],
      genre: 'Drama',
      runtime: '2h 11m',
      rtScore: 91,
      metacritic: 85,
      boxOffice: '$28M worldwide',
      synopsis: 'Norwegian filmmaker Joachim Trier\'s intimate family drama follows multiple generations of a family as they navigate grief, memory, and the objects we attach meaning to. Renate Reinsve (The Worst Person in the World) leads an ensemble that includes Stellan Skarsgård, Elle Fanning, and Inga Ibsdotter Lilleaas in a film that critics compared to the emotional precision of Ingmar Bergman.',
      whyNominated: '7 nominations including Best Picture, Director, Actress, Supporting Actor (Skarsgård), Supporting Actress (Fanning and Lilleaas — two nominees from the same film), Original Screenplay, Editing, and International Feature. Norway\'s submission for International Feature is also in the race.',
      oscarStoryline: 'The Supporting Actress race is the night\'s most unpredictable category, and Sentimental Value has two nominees in it (Elle Fanning and Inga Ibsdotter Lilleaas). If both split votes, it could open the door for Amy Madigan or another contender.',
      controversy: null,
      keyFacts: [
        'Joachim Trier directed The Worst Person in the World (2021), also starring Reinsve',
        'Co-written by Trier and Eskil Vogt (who also co-wrote Worst Person)',
        'Elle Fanning and Inga Ibsdotter Lilleaas are both nominated for Supporting Actress from this film',
        'Stellan Skarsgård won the Golden Globe for Supporting Actor',
        'Norway\'s official submission for Best International Feature',
        'The film is also nominated for Best Film Editing'
      ],
      nominations: 7,
      predictedWins: 'Could win International Feature. Supporting Actress is a wild card.'
    },
    {
      id: 'bugonia',
      title: 'Bugonia',
      year: 2025,
      director: 'Yorgos Lanthimos',
      stars: ['Emma Stone', 'Jesse Plemons', 'Willem Dafoe'],
      genre: 'Sci-Fi / Dark Comedy',
      runtime: '1h 54m',
      rtScore: 82,
      metacritic: 78,
      boxOffice: '$95M worldwide',
      synopsis: 'Yorgos Lanthimos reunites with Emma Stone for their third collaboration (after The Favourite and Poor Things). A darkly comic sci-fi film about two whistleblowers who kidnap the CEO of a major corporation, believing she\'s an alien leading a global conspiracy. Adapted from the 2003 South Korean film Save the Green Planet!',
      whyNominated: '3 nominations: Best Picture, Best Actress (Stone), Best Original Score (Jerskin Fendrix). Stone\'s nomination continues her remarkable streak with Lanthimos — she won for Poor Things just two years ago.',
      oscarStoryline: 'Emma Stone is a long shot for Best Actress against Buckley\'s historic sweep, but her nomination extends her status as one of the most consistently Academy-recognized actresses of her generation.',
      controversy: null,
      keyFacts: [
        'Third Lanthimos-Stone collaboration',
        'Adapted from the 2003 South Korean film Save the Green Planet!',
        'Jerskin Fendrix\'s eccentric score earned a nomination',
        'Stone is also a producer on the film'
      ],
      nominations: 3,
      predictedWins: 'Long shot in all categories.'
    },
    {
      id: 'f1',
      title: 'F1',
      year: 2025,
      director: 'Joseph Kosinski',
      stars: ['Brad Pitt', 'Damson Idris', 'Kerry Condon', 'Javier Bardem'],
      genre: 'Sports / Action',
      runtime: '2h 15m',
      rtScore: 78,
      metacritic: 72,
      boxOffice: '$350M+ worldwide',
      synopsis: 'Brad Pitt stars as Sonny Hayes, a veteran Formula 1 driver who makes a comeback to the sport. Directed by Joseph Kosinski (Top Gun: Maverick), the film was shot during actual F1 race weekends with real teams and drivers appearing alongside the actors. A massive commercial hit that brought racing to mainstream audiences.',
      whyNominated: '4 nominations: Best Picture, Sound, Visual Effects, Editing. The Best Picture nod was considered a surprise inclusion — a testament to its commercial success and technical achievements rather than critical acclaim.',
      oscarStoryline: 'F1 sneaking into Best Picture was the biggest surprise of the nominations. It\'s not expected to win anything but could contend in Sound and VFX.',
      controversy: 'Its Best Picture nomination was controversial among critics who felt it took a slot from more artistically ambitious films. Some viewed it as the Academy rewarding box office performance.',
      keyFacts: [
        'Shot during real Formula 1 race weekends',
        'Brad Pitt drove actual F1 cars on real circuits',
        'Directed by Joseph Kosinski (Top Gun: Maverick)',
        'Produced by Jerry Bruckheimer and Brad Pitt',
        'Grossed over $350M worldwide',
        'Best Picture nomination was the ceremony\'s biggest surprise'
      ],
      nominations: 4,
      predictedWins: 'Could win Sound. VFX is a possibility.'
    },
    {
      id: 'train-dreams',
      title: 'Train Dreams',
      year: 2025,
      director: 'Clint Bentley & Greg Kwedar',
      stars: ['Joel Edgerton', 'Felicity Jones', 'William Fichtner'],
      genre: 'Drama / Western',
      runtime: '1h 48m',
      rtScore: 88,
      metacritic: 80,
      boxOffice: '$12M domestic',
      synopsis: 'Based on Denis Johnson\'s celebrated novella, the film follows Robert Grainer, a day laborer in the American West at the turn of the 20th century, whose life unfolds against the backdrop of immense natural beauty and devastating personal loss. A quiet, meditative film about one ordinary man\'s journey through an extraordinary century of American change.',
      whyNominated: '4 nominations: Best Picture, Cinematography, Adapted Screenplay, Original Song. Nick Cave co-wrote the title song with Bryce Dessner.',
      oscarStoryline: 'A small, intimate film that earned a surprise Best Picture nomination. The novella adaptation is praised for its restraint and visual poetry.',
      controversy: null,
      keyFacts: [
        'Based on Denis Johnson\'s 2002 novella (originally published in The Paris Review)',
        'Nick Cave co-wrote the title song "Train Dreams"',
        'Directors Clint Bentley and Greg Kwedar previously made Jockey (2021)',
        'Adolpho Veloso\'s cinematography nominated'
      ],
      nominations: 4,
      predictedWins: 'Long shot in all categories.'
    },
    {
      id: 'the-secret-agent',
      title: 'The Secret Agent',
      year: 2025,
      director: 'Emilie Lesclaux (producer) / Kleber Mendonça Filho (director)',
      stars: ['Wagner Moura', 'Sônia Braga'],
      genre: 'Political Thriller',
      runtime: '2h 20m',
      rtScore: 90,
      metacritic: 83,
      boxOffice: '$15M worldwide',
      synopsis: 'Brazilian political thriller following a covert operative navigating the complexities of political intrigue in contemporary South America. Wagner Moura (Pablo Escobar in Narcos) delivers a Golden Globe-winning performance as the lead.',
      whyNominated: '3 nominations: Best Picture, International Feature (Brazil), Casting. Wagner Moura won the Golden Globe for Best Actor — Drama for his role.',
      oscarStoryline: 'Moura is a long shot for Best Actor but his Globe win for Drama (separate from Chalamet\'s Musical/Comedy win) keeps him in the conversation.',
      controversy: null,
      keyFacts: [
        'Brazil\'s official submission for Best International Feature',
        'Wagner Moura won the Golden Globe for Best Actor — Drama',
        'Directed by Kleber Mendonça Filho (Aquarius, Bacurau)',
        'Gabriel Domingues nominated for inaugural Best Casting category'
      ],
      nominations: 3,
      predictedWins: 'Could win International Feature.'
    },
    {
      id: 'kpop-demon-hunters',
      title: 'KPop Demon Hunters',
      year: 2025,
      director: 'Chris Appelhans',
      stars: ['Voice cast'],
      genre: 'Animated / Action-Comedy',
      runtime: '1h 42m',
      rtScore: 94,
      metacritic: 82,
      boxOffice: '$280M worldwide',
      synopsis: 'An animated action-comedy following a K-pop group that discovers they must battle supernatural demons while maintaining their pop star personas. A genre-blending animated film that combines Korean pop culture with supernatural horror-comedy.',
      whyNominated: '2 nominations: Best Animated Feature, Best Original Song ("Golden"). The front-runner for Animated Feature after sweeping precursor awards.',
      oscarStoryline: 'The heavy favorite for Best Animated Feature — considered a lock after winning the Annie Award and BAFTA.',
      controversy: null,
      keyFacts: [
        'The heavy favorite for Best Animated Feature',
        '"Golden" is nominated for Best Original Song',
        'Combines K-pop culture with supernatural action-comedy',
        'Grossed $280M worldwide'
      ],
      nominations: 2,
      predictedWins: 'Best Animated Feature (lock). Song is a long shot.'
    }
  ];
  
  // === SNUBS & SURPRISES ===
  export interface SnubEntry {
    name: string;
    category: string;
    description: string;
  }
  
  export const biggestSnubs: SnubEntry[] = [
    {
      name: 'Wicked: For Good',
      category: 'Complete shutout',
      description: 'The biggest snub of the year. After Wicked Part One earned 10 nominations and 2 wins last year, Part Two received zero nominations. Ariana Grande, Cynthia Erivo, and new Stephen Schwartz songs were all locked out. A shocking reversal.'
    },
    {
      name: 'Adam Sandler',
      category: 'Best Actor',
      description: 'Extended his infamous Oscar drought, missing for Jay Kelly. Sandler has never been nominated despite acclaimed performances in Uncut Gems, Punch-Drunk Love, and others.'
    },
    {
      name: 'Daniel Day-Lewis',
      category: 'Best Actor',
      description: 'Came out of retirement for a comeback role and was not nominated. Day-Lewis has three Best Actor Oscars — the most ever — but his return went unrecognized.'
    },
    {
      name: 'Paul Mescal',
      category: 'Best Actor',
      description: 'Despite anchoring Hamnet alongside Jessie Buckley, Mescal was not nominated for Best Actor. Some considered this a snub given the film\'s other 8 nominations.'
    },
    {
      name: 'Avatar: Fire and Ash',
      category: 'Best Picture',
      description: 'James Cameron\'s third Avatar film was shut out of Best Picture despite massive box office. It earned only Costume Design and Visual Effects nominations.'
    },
    {
      name: 'F1 (surprise inclusion)',
      category: 'Best Picture',
      description: 'Not a snub but a surprise: F1 making the Best Picture lineup was widely unexpected. Many felt it took a slot from more critically acclaimed films.'
    }
  ];
  
  // === KEY STORYLINES ===
  export interface Storyline {
    title: string;
    description: string;
  }
  
  export const ceremonyStorylines: Storyline[] = [
    {
      title: 'Sinners vs. One Battle After Another',
      description: 'The defining rivalry of the night. OBAA swept every precursor; Sinners broke the all-time nominations record. If Sinners pulls off Best Picture, it\'s the biggest upset since Crash beat Brokeback Mountain.'
    },
    {
      title: 'PTA\'s Coronation',
      description: 'Paul Thomas Anderson has 14 career nominations and zero wins. After sweeping DGA, BAFTA, Globe, and Critics Choice for Director, this is widely seen as his night. If he loses, it\'s historic.'
    },
    {
      title: 'Best Actor: Jordan vs. Chalamet',
      description: 'The race flipped at SAG. Chalamet was the presumed lock after Globe and Critics Choice wins. Then Jordan stunned everyone at SAG. Now it\'s a genuine 55/45 toss-up.'
    },
    {
      title: 'Jessie Buckley\'s Historic Lock',
      description: 'Buckley swept all four televised precursors: Globe, Critics Choice, BAFTA, SAG. At -3500 odds, she\'s the ceremony\'s biggest lock. She\'d be the first Irish actress to win Best Actress.'
    },
    {
      title: 'The Supporting Actress Three-Way',
      description: 'Three different women won the three biggest precursors: Amy Madigan (SAG, Critics Choice), Wunmi Mosaku (BAFTA), Teyana Taylor (Globe). The most unpredictable category of the night.'
    },
    {
      title: 'Inaugural Best Casting',
      description: 'The first new Oscar category in decades. Casting directors have worked behind the scenes for Hollywood\'s entire history — tonight they get their own award for the first time.'
    },
    {
      title: 'The Chalamet Controversy',
      description: 'Days before the ceremony, Chalamet said "no one cares" about ballet or opera. Backlash from the Met Opera, Royal Ballet, and Misty Copeland followed. The Oscars added a Copeland ballet performance, seemingly in response.'
    },
    {
      title: 'Record Representation',
      description: '74 women nominated (a record). 10 Black individuals nominated from Sinners alone (a record for a single film). Autumn Durald Arkapaw is the first woman of color ever nominated for Cinematography.'
    }
  ];
  
  export default filmEncyclopedia;
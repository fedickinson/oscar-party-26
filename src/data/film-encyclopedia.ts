// src/data/film-encyclopedia.ts
// Rich content for all nominated films — used in the Home tab's Browse section
// Each entry includes: synopsis, critical reception, Oscar storyline, controversy/snubs, key facts

export type FilmCategory =
  | 'best-picture'
  | 'animated-feature'
  | 'international-feature'
  | 'documentary-feature'
  | 'animated-short'
  | 'documentary-short'
  | 'live-action-short'

export interface FilmProfile {
    id: string; // matches draft_entity film ID or a slug
    title: string;
    year: number;
    director: string;
    stars: string[];
    genre: string;
    runtime: string;
    rtScore: number | null; // Rotten Tomatoes critics % (null if unavailable)
    metacritic: number | null;
    boxOffice: string;
    synopsis: string;
    whyNominated: string;
    oscarStoryline: string;
    controversy: string | null;
    keyFacts: string[];
    nominations: number;
    predictedWins: string;
    category?: FilmCategory; // defaults to 'best-picture' for legacy entries
    nomineeIds?: string[]; // optional list of nominee UUIDs for winner lookup
  }
  
  export const filmEncyclopedia: FilmProfile[] = [
    {
      id: 'sinners',
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
      category: 'best-picture',
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
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // LIVE ACTION SHORTS
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'the-singers',
      category: 'live-action-short',
      title: 'The Singers',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Musical / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A lively short film set in a bar where characters break into song, capturing warmth and communal joy.',
      whyNominated: 'A crowd-pleasing bar musical that won over audiences with its infectious energy and accessibility.',
      oscarStoryline: 'Heading into ceremony night, The Singers is seen as the populist pick — audiences responding warmly to its musical warmth and accessibility.',
      controversy: null,
      keyFacts: [
        'Considered the crowd-pleaser of the Live Action Short category',
      ],
      nominations: 1,
      predictedWins: 'Strong contender in the Live Action Short category.',
    },
    {
      id: 'two-people-exchanging-saliva',
      category: 'live-action-short',
      title: 'Two People Exchanging Saliva',
      year: 2025,
      director: 'TBD',
      stars: ['Vicky Krieps (narrator)'],
      genre: 'Surrealist / Dystopian / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A bizarre, darkly comic French short narrated by acclaimed actress Vicky Krieps, exploring intimacy through surrealist dystopian imagery.',
      whyNominated: 'A bold and provocative entry that represents the Academy recognizing challenging, boundary-pushing short filmmaking.',
      oscarStoryline: 'A wildly different entry from The Singers — Academy voters heading into ceremony night face a stark choice between crowd-pleasing warmth and challenging surrealist provocation.',
      controversy: null,
      keyFacts: [
        'Narrated by Vicky Krieps (Phantom Thread)',
        'French production with surrealist dystopian imagery',
      ],
      nominations: 1,
      predictedWins: 'An arthouse favorite but a tough sell for the full Academy.',
    },
    {
      id: 'a-friend-of-dorothy',
      category: 'live-action-short',
      title: 'A Friend of Dorothy',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Drama / LGBTQ+ / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A tender short exploring queer identity and friendship, drawing on the classic coded language of "Friend of Dorothy."',
      whyNominated: 'A heartfelt exploration of LGBTQ+ identity that resonated with voters for its emotional intimacy and warmth.',
      oscarStoryline: 'Heading into the ceremony, A Friend of Dorothy is noted for its heartfelt LGBTQ+ themes and emotional intimacy.',
      controversy: null,
      keyFacts: [
        'Title references classic LGBTQ+ coded phrase',
      ],
      nominations: 1,
      predictedWins: 'A sentimental favorite with strong emotional appeal.',
    },
    {
      id: 'butchers-stain',
      category: 'live-action-short',
      title: 'Butcher\'s Stain',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Drama / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A Palestinian butcher is falsely accused in the aftermath of October 7, exploring identity, suspicion, and injustice.',
      whyNominated: 'A debut director\'s Student Academy Award winner that leapt directly to an Oscar nomination — a rare and remarkable trajectory.',
      oscarStoryline: 'One of the most talked-about short film entries heading into ceremony night — a debut director\'s Student Academy Award winner that leapt directly to an Oscar nomination, depicting a Palestinian worker falsely accused after October 7.',
      controversy: null,
      keyFacts: [
        '24-year-old director\'s debut film',
        'Went from Student Academy Awards directly to an Oscar nomination',
      ],
      nominations: 1,
      predictedWins: 'A strong contender with a compelling backstory.',
    },
    {
      id: 'jane-austens-period-drama',
      category: 'live-action-short',
      title: 'Jane Austen\'s Period Drama',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Comedy / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A comedic short that playfully subverts Jane Austen conventions, mixing period drama tropes with modern sensibilities.',
      whyNominated: 'A witty meta-comedy that charmed festival audiences with its playful subversion of Austen genre conventions.',
      oscarStoryline: 'The category\'s wild card heading into ceremony night — a playful meta-comedy that has charmed festival audiences with its wit.',
      controversy: null,
      keyFacts: [
        'Comedic take on Austen genre conventions',
      ],
      nominations: 1,
      predictedWins: 'The category\'s wild card.',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ANIMATED SHORTS
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'the-girl-who-cried-pearls',
      category: 'animated-short',
      title: 'The Girl Who Cried Pearls',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Fairy Tale / Short',
      runtime: '~10m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A whimsical animated short about a girl whose tears turn to pearls, weaving together folklore and coming-of-age themes.',
      whyNominated: 'An evocative fairy-tale animated short praised for its delicate hand-crafted visual language and emotional resonance.',
      oscarStoryline: 'Heading into the ceremony, The Girl Who Cried Pearls is praised for its delicate hand-crafted visual language and emotional resonance.',
      controversy: null,
      keyFacts: [
        'Evocative fairy-tale visual style',
      ],
      nominations: 1,
      predictedWins: 'A strong emotional contender in Animated Short.',
    },
    {
      id: 'butterfly-papillon',
      category: 'animated-short',
      title: 'Butterfly (Papillon)',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Drama / Short',
      runtime: '~12m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A French animated short (Papillon) following the metaphorical journey of transformation and freedom through stunning butterfly imagery.',
      whyNominated: 'French craftsmanship and poetic visual storytelling have made it a critical favorite in the animated shorts race.',
      oscarStoryline: 'The international contender in the animated shorts category — French craftsmanship and poetic visual storytelling have made it a critical favorite heading in.',
      controversy: null,
      keyFacts: [
        'French production with striking visual design',
      ],
      nominations: 1,
      predictedWins: 'The international favorite in Animated Short.',
    },
    {
      id: 'forevergreen',
      category: 'animated-short',
      title: 'Forevergreen',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Environmental / Short',
      runtime: '~14m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'An eco-themed animated short about a child\'s relationship with a dying forest, rendered in lush hand-drawn animation.',
      whyNominated: 'A heart-on-sleeve contender whose ecological message and warm visual style have resonated widely with audiences and voters.',
      oscarStoryline: 'Heading into ceremony night, Forevergreen is seen as the heart-on-sleeve contender — its ecological message and warm visual style have resonated widely.',
      controversy: null,
      keyFacts: [
        'Environmental themes with hand-drawn animation',
      ],
      nominations: 1,
      predictedWins: 'The crowd favorite in Animated Short.',
    },
    {
      id: 'retirement-plan',
      category: 'animated-short',
      title: 'Retirement Plan',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Dark Comedy / Short',
      runtime: '~8m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A darkly comic animated short about an elderly person whose retirement "plan" takes an unexpected surreal turn.',
      whyNominated: 'Sharp comedy and inventive design have earned it buzz as the category\'s most distinctive entry.',
      oscarStoryline: 'The animated shorts category\'s dark horse — sharp comedy and inventive design have earned it buzz heading into the ceremony.',
      controversy: null,
      keyFacts: [
        'Dark comedy with surreal twists',
      ],
      nominations: 1,
      predictedWins: 'The dark horse of Animated Short.',
    },
    {
      id: 'the-three-sisters',
      category: 'animated-short',
      title: 'The Three Sisters',
      year: 2025,
      director: 'Submitted as "Timur Kognov" (fake identity)',
      stars: [],
      genre: 'Animated / Drama / Short',
      runtime: '~15m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'An emotionally rich animated adaptation exploring themes of distance, family, and longing, based on Chekhov.',
      whyNominated: 'A technically accomplished and emotionally devastating animated adaptation that earned its nomination despite — or because of — its extraordinary off-screen story.',
      oscarStoryline: 'The biggest off-screen story of the short film categories heading into ceremony night: a Russian director submitted the film under a completely fabricated identity to hide his nationality amid the Ukraine war. The Academy nominated a film without knowing who truly made it — an unprecedented situation in Oscar history.',
      controversy: null,
      keyFacts: [
        'Russian director submitted under a completely fake identity ("Timur Kognov") to conceal his nationality due to the Ukraine war',
        'The Academy does not know who actually made the film',
        'An unprecedented situation in Oscar history',
      ],
      nominations: 1,
      predictedWins: 'The most discussed entry regardless of outcome.',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // DOCUMENTARY SHORTS
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'all-the-empty-rooms',
      category: 'documentary-short',
      title: 'All the Empty Rooms',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary / Short',
      runtime: '~30m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A documentary short examining abandoned spaces and the human stories left behind — memory, displacement, and erasure.',
      whyNominated: 'Recognized for its quiet power and poetic visual approach to documentary storytelling.',
      oscarStoryline: 'Heading into the ceremony, All the Empty Rooms is recognized for its quiet power and poetic visual approach to documentary storytelling.',
      controversy: null,
      keyFacts: [
        'Meditative visual style',
        'Winner of festival documentary prizes',
      ],
      nominations: 1,
      predictedWins: 'A poetic entry in Documentary Short.',
    },
    {
      id: 'armed-only-with-a-camera',
      category: 'documentary-short',
      title: 'Armed Only with a Camera',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary / Short',
      runtime: '~25m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A documentary short profiling conflict journalists who document war zones with nothing but their cameras.',
      whyNominated: 'A tribute to the courage of conflict journalists that has resonated with Academy voters for its urgency and moral clarity.',
      oscarStoryline: 'One of the most urgent entries in the documentary shorts category heading in — a tribute to the courage of conflict journalists that has resonated with Academy voters.',
      controversy: null,
      keyFacts: [
        'Profiles frontline journalists in active conflict zones',
      ],
      nominations: 1,
      predictedWins: 'A timely and urgent contender.',
    },
    {
      id: 'children-no-more',
      category: 'documentary-short',
      title: 'Children No More: Were and Are Gone',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary / Short',
      runtime: '~28m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A devastating documentary short about children affected by conflict and displacement, examining both individual stories and systemic failure.',
      whyNominated: 'An unflinching and deeply serious documentary that has made it one of the category\'s most discussed entries.',
      oscarStoryline: 'A deeply serious contender heading into ceremony night — its unflinching focus on children in conflict has made it one of the category\'s most discussed entries.',
      controversy: null,
      keyFacts: [
        'Subject matter related to child casualties in conflict',
      ],
      nominations: 1,
      predictedWins: 'A heavyweight in Documentary Short.',
    },
    {
      id: 'the-devil-is-busy',
      category: 'documentary-short',
      title: 'The Devil Is Busy',
      year: 2025,
      director: 'Geeta Gandbhir',
      stars: [],
      genre: 'Documentary / Short',
      runtime: '~22m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A documentary short exploring faith, community, and resilience in a marginalized American community.',
      whyNominated: 'Directed by Geeta Gandbhir, who is also nominated for Best Documentary Feature (The Perfect Neighbor) — the first person ever nominated in both documentary categories simultaneously.',
      oscarStoryline: 'The extraordinary dual nomination story: heading into ceremony night, Geeta Gandbhir is making history as the first person ever nominated for both Best Documentary Feature and Best Documentary Short in the same year. A win in either category would be historic.',
      controversy: null,
      keyFacts: [
        'Directed by Geeta Gandbhir',
        'Gandbhir is also nominated for Best Documentary Feature (The Perfect Neighbor)',
        'First person ever nominated in both documentary categories simultaneously',
      ],
      nominations: 1,
      predictedWins: 'The dual-nomination narrative gives it a unique edge.',
    },
    {
      id: 'the-voice-of-hind-rajab',
      category: 'documentary-short',
      title: 'The Voice of Hind Rajab',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary / Short',
      runtime: '~30m',
      rtScore: null,
      metacritic: null,
      boxOffice: '',
      synopsis: 'A documentary short about Hind Rajab, a 6-year-old Palestinian girl killed in Gaza, and the humanitarian workers who tried to save her.',
      whyNominated: 'After receiving the longest standing ovation in Venice Film Festival history (23 minutes), the film has become the most talked-about documentary short of the year.',
      oscarStoryline: 'The most talked-about documentary short heading into ceremony night. After receiving the longest standing ovation in Venice Film Festival history (23 minutes), the film faces a new controversy: its central figure may be barred from the ceremony due to US travel restrictions. The film has sparked intense debate about political art and whose stories get told.',
      controversy: 'Central figure may be prevented from attending the ceremony due to US travel restrictions.',
      keyFacts: [
        'Received a 23-minute standing ovation at Venice — the longest in festival history',
        'Central figure may be barred from the ceremony due to US travel restrictions',
        'Has sparked intense debate about political art and whose stories get told',
      ],
      nominations: 1,
      predictedWins: 'The emotional and political heavyweight of the category.',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ANIMATED FEATURES
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'zootopia-2',
      category: 'animated-feature',
      title: 'Zootopia 2',
      year: 2025,
      director: 'Byron Howard & Rich Moore',
      stars: ['Ginnifer Goodwin (voice)', 'Jason Bateman (voice)'],
      genre: 'Animated / Action-Comedy',
      runtime: '1h 49m',
      rtScore: 82,
      metacritic: 74,
      boxOffice: '$1B+ worldwide (franchise)',
      synopsis: 'The long-awaited sequel returns to the mammal metropolis, with Judy Hopps and Nick Wilde investigating a new conspiracy threatening the city\'s fragile peace.',
      whyNominated: 'Disney\'s animated franchise sequel delivering on the original\'s themes of bias and cooperation.',
      oscarStoryline: 'Heading into ceremony night, Zootopia 2 is the box office giant in the animated feature race — its billion-dollar franchise pedigree gives it mainstream recognition, though awards-circuit prestige films from other studios loom as serious competition.',
      controversy: null,
      keyFacts: [
        'First Zootopia sequel',
        'Original grossed $1B worldwide',
        'Returning directors Byron Howard and Rich Moore',
      ],
      nominations: 1,
      predictedWins: 'Franchise recognition but faces stiff competition from prestige animation.',
    },
    {
      id: 'elio',
      category: 'animated-feature',
      title: 'Elio',
      year: 2025,
      director: 'Adrian Molina & Domee Shi',
      stars: ['Yonas Kibreab (voice)'],
      genre: 'Animated / Sci-Fi',
      runtime: '1h 38m',
      rtScore: 88,
      metacritic: 79,
      boxOffice: '',
      synopsis: 'Pixar\'s latest follows Elio, a boy accidentally launched into space who must represent Earth in an intergalactic community.',
      whyNominated: 'Pixar\'s emotional sci-fi original tackling belonging and identity with characteristic depth.',
      oscarStoryline: 'Heading into the ceremony, Elio is Pixar\'s emotional bet — an original story that has drawn comparisons to the studio\'s golden age, making it the critical favorite in a strong animated feature field.',
      controversy: null,
      keyFacts: [
        'Pixar\'s return to original storytelling after sequels',
        'Directed by Adrian Molina (co-directed Coco) and Domee Shi (directed Turning Red)',
      ],
      nominations: 1,
      predictedWins: 'The critical favorite for Animated Feature.',
    },
    {
      id: 'arco',
      category: 'animated-feature',
      title: 'Arco',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Drama',
      runtime: '~1h 30m',
      rtScore: 91,
      metacritic: 84,
      boxOffice: '',
      synopsis: 'A Spanish animated feature following a child navigating a fantastical world built from fractured memories of a deceased parent.',
      whyNominated: 'A visually stunning and emotionally devastating international animated film that swept European animation awards.',
      oscarStoryline: 'The international dark horse heading into ceremony night — Arco\'s critical scores rival any animated film of the year, and its emotional depth has made it the arthouse favorite in the category.',
      controversy: null,
      keyFacts: [
        'International animated entry from Spain',
        'Swept European animation awards',
      ],
      nominations: 1,
      predictedWins: 'The arthouse favorite — could upset the bigger studios.',
    },
    {
      id: 'little-amelie',
      category: 'animated-feature',
      title: 'Little Amelie or the Character of Rain',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Animated / Coming-of-Age',
      runtime: '~1h 25m',
      rtScore: 87,
      metacritic: 80,
      boxOffice: '',
      synopsis: 'A French animated coming-of-age film following a girl discovering her identity through rain-soaked streets of Paris, with visual nods to the live-action Amelie.',
      whyNominated: 'A charming French animated film that captures childhood wonder with inventive visual storytelling.',
      oscarStoryline: 'The Francophone contender heading in — its Amelie-adjacent sensibility has charmed international audiences and Academy voters drawn to its handcrafted warmth.',
      controversy: null,
      keyFacts: [
        'French production',
        'Deliberately evokes Amelie aesthetic',
      ],
      nominations: 1,
      predictedWins: 'A charming underdog in the Animated Feature race.',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // DOCUMENTARY FEATURES
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'mr-nobody-against-putin',
      category: 'documentary-feature',
      title: 'Mr. Nobody Against Putin',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary',
      runtime: '1h 52m',
      rtScore: 94,
      metacritic: 88,
      boxOffice: '',
      synopsis: 'A Russian schoolteacher secretly filmed state propaganda infiltrating his school\'s curriculum, documenting the Kremlin\'s indoctrination machine. He eventually fled Russia and now lives in European asylum.',
      whyNominated: 'A courageous act of documentary filmmaking — a schoolteacher risking his life to document state propaganda from inside Russia.',
      oscarStoryline: 'Heading into ceremony night, Mr. Nobody Against Putin carries enormous moral weight — its subject risked imprisonment to document what he witnessed, then fled his country. The documentary world has rallied behind it as a statement about press freedom and resistance.',
      controversy: null,
      keyFacts: [
        'Subject is now in asylum in Europe',
        'Filmed clandestinely inside Russia',
        'Documents the Kremlin\'s educational propaganda machine',
      ],
      nominations: 1,
      predictedWins: 'The moral weight favorite for Documentary Feature.',
    },
    {
      id: 'the-perfect-neighbor',
      category: 'documentary-feature',
      title: 'The Perfect Neighbor',
      year: 2025,
      director: 'Geeta Gandbhir',
      stars: [],
      genre: 'Documentary',
      runtime: '1h 35m',
      rtScore: 89,
      metacritic: 82,
      boxOffice: '',
      synopsis: 'A documentary examining HOA culture, property disputes, and the racial and class tensions that simmer beneath suburban American life.',
      whyNominated: 'A revealing portrait of American suburban anxiety that finds systemic issues in intimate neighborhood conflicts.',
      oscarStoryline: 'Geeta Gandbhir\'s double nomination is the talk of the documentary world heading into ceremony night — nominated for both this film and The Devil Is Busy (documentary short), a feat no one has accomplished before.',
      controversy: null,
      keyFacts: [
        'Directed by Geeta Gandbhir',
        'Gandbhir is also nominated for Best Documentary Short (The Devil Is Busy)',
        'First person ever nominated in both documentary categories simultaneously',
      ],
      nominations: 1,
      predictedWins: 'The dual-nomination story gives it unique visibility.',
    },
    {
      id: 'the-alabama-solution',
      category: 'documentary-feature',
      title: 'The Alabama Solution',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary',
      runtime: '1h 28m',
      rtScore: 91,
      metacritic: 85,
      boxOffice: '',
      synopsis: 'An investigation into Alabama\'s prison system and the political forces that have resisted reform for decades, told through the lives of incarcerated people and their families.',
      whyNominated: 'A rigorous investigative documentary exposing systemic failures in the American carceral system.',
      oscarStoryline: 'One of the most politically charged documentary contenders heading in — its unflinching look at Alabama\'s prison system has been called essential viewing by critics and advocacy groups alike.',
      controversy: null,
      keyFacts: [
        'Examines systemic prison reform failures in Alabama',
        'Called essential viewing by critics and advocacy groups',
      ],
      nominations: 1,
      predictedWins: 'A politically charged contender for Documentary Feature.',
    },
    {
      id: 'come-see-me-in-the-good-light',
      category: 'documentary-feature',
      title: 'Come See Me in the Good Light',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary',
      runtime: '1h 45m',
      rtScore: 96,
      metacritic: 91,
      boxOffice: '',
      synopsis: 'A documentary following a terminally ill poet who uses their remaining time to finish a final collection, exploring creativity, mortality, and legacy.',
      whyNominated: 'A transcendent documentary about creativity and mortality that has been called one of the most moving films of the year.',
      oscarStoryline: 'The emotional favorite heading into ceremony night — Come See Me in the Good Light has left critics searching for new words to describe its impact. With the highest critical scores in the category, it enters as a strong contender.',
      controversy: null,
      keyFacts: [
        'Follows a real poet during the final chapter of their life',
        'Highest critical scores of any Documentary Feature nominee',
      ],
      nominations: 1,
      predictedWins: 'The critical and emotional favorite for Documentary Feature.',
    },
    {
      id: 'cutting-through-rocks',
      category: 'documentary-feature',
      title: 'Cutting Through Rocks',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Documentary',
      runtime: '1h 32m',
      rtScore: 88,
      metacritic: 80,
      boxOffice: '',
      synopsis: 'A documentary about female farmers in a developing nation fighting land rights battles while navigating patriarchal systems and environmental degradation.',
      whyNominated: 'A documentary capturing women\'s resilience in the face of intersecting systemic barriers — patriarchy, environmental collapse, and economic inequality.',
      oscarStoryline: 'Heading into ceremony night, Cutting Through Rocks has earned praise for its intimate access and global resonance — its subjects\' fight for land rights speaks to broader struggles worldwide.',
      controversy: null,
      keyFacts: [
        'Focus on women\'s land rights in agricultural communities',
        'Praised for intimate access and global resonance',
      ],
      nominations: 1,
      predictedWins: 'A globally resonant entry in Documentary Feature.',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNATIONAL FEATURES
    // ═══════════════════════════════════════════════════════════════════════════

    {
      id: 'it-was-just-an-accident',
      category: 'international-feature',
      title: 'It Was Just an Accident',
      year: 2025,
      director: 'Jafar Panahi',
      stars: [],
      genre: 'Drama',
      runtime: '1h 56m',
      rtScore: 93,
      metacritic: 88,
      boxOffice: '',
      synopsis: 'Jafar Panahi\'s latest film, shot while under house arrest in Iran, follows a series of chance encounters that spiral into a meditation on guilt, memory, and political complicity.',
      whyNominated: 'A quietly devastating film from one of cinema\'s most persecuted artists — made against extraordinary odds under government restriction.',
      oscarStoryline: 'Heading into ceremony night, It Was Just an Accident carries enormous off-screen weight: Jafar Panahi, who has been repeatedly imprisoned and restricted by the Iranian government, made this film while under house arrest. The Academy\'s nomination is widely seen as a statement about artistic freedom.',
      controversy: null,
      keyFacts: [
        'Directed by Jafar Panahi while under house arrest in Iran',
        'Iran\'s submission for Best International Feature',
        'Panahi has been repeatedly imprisoned and restricted by the Iranian government',
      ],
      nominations: 1,
      predictedWins: 'Carries enormous moral authority for International Feature.',
    },
    {
      id: 'sirat',
      category: 'international-feature',
      title: 'Sirat',
      year: 2025,
      director: 'TBD',
      stars: [],
      genre: 'Drama / Dystopian',
      runtime: '1h 45m',
      rtScore: 87,
      metacritic: 81,
      boxOffice: '',
      synopsis: 'Spain\'s entry follows a family traversing a harsh desert landscape in a near-future setting, blending road movie and dystopian allegory.',
      whyNominated: 'A visually stunning Spanish film that combines genre filmmaking with political allegory to striking effect.',
      oscarStoryline: 'Spain\'s entry heading into ceremony night is one of the more genre-inflected films in the international category — its near-future desert setting and allegorical ambitions have drawn comparisons to the great Spanish genre films of recent decades.',
      controversy: null,
      keyFacts: [
        'Spain\'s official Oscar submission',
        'Dystopian near-future setting',
        'Draws comparisons to great Spanish genre films',
      ],
      nominations: 1,
      predictedWins: 'Spain\'s genre-inflected contender.',
    },
    {
      id: 'the-seed-of-the-sacred-fig',
      category: 'international-feature',
      title: 'The Seed of the Sacred Fig',
      year: 2025,
      director: 'Mohammad Rasoulof',
      stars: ['Missagh Zareh', 'Soheila Golestani'],
      genre: 'Political Thriller',
      runtime: '2h 48m',
      rtScore: 96,
      metacritic: 89,
      boxOffice: '',
      synopsis: 'A judge in Tehran\'s Revolutionary Court becomes paranoid about his family as Iran\'s 2022 uprising unfolds, in this political thriller shot secretly in Iran.',
      whyNominated: 'A gripping political thriller made at enormous personal risk — Rasoulof fled Iran after completing the film, which depicts the Islamic Republic\'s judicial apparatus from inside.',
      oscarStoryline: 'Heading into ceremony night, The Seed of the Sacred Fig is one of the most politically charged films in the international race — its director fled Iran after completing it, and the film\'s unflinching portrait of the regime has made it a flashpoint for discussions about art under authoritarian pressure. Germany\'s submission.',
      controversy: null,
      keyFacts: [
        'Director Mohammad Rasoulof fled Iran after filming',
        'Shot clandestinely inside Iran',
        'Germany\'s official Oscar submission',
        'Depicts the Islamic Republic\'s judicial apparatus from inside',
      ],
      nominations: 1,
      predictedWins: 'Among the strongest entries in International Feature.',
    },
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
  
  // === PRESENTER DATA ===
export interface PresenterEntry {
  category: string;       // matches CategoryRow.name (use ILIKE-friendly names)
  presenter: string;      // display name(s)
  about: string;          // who they are
  oscarConnection: string; // why they're presenting this category
}

export const categoryPresenters: PresenterEntry[] = [
  { category: 'Best Supporting Actor', presenter: 'Kieran Culkin', about: 'Won Best Actor at 97th Oscars for A Real Pain', oscarConnection: 'Returned as prior year\'s lead winner. Noted Sean Penn was absent.' },
  { category: 'Best Animated Short Film', presenter: 'Will Arnett', about: 'Voice of Batman in LEGO Movie and BoJack Horseman', oscarConnection: 'Recurring Oscar presenter known for comedic delivery.' },
  { category: 'Best Documentary Short Film', presenter: 'Kumail Nanjiani', about: 'Oscar-nominated screenwriter for The Big Sick (2017)', oscarConnection: 'First nomination was for writing, not acting.' },
  { category: 'Best Live Action Short Film', presenter: 'Priyanka Chopra Jonas', about: 'Former Miss World, global star of Quantico and Bollywood', oscarConnection: 'Previously presented at the 2016 Oscars.' },
  { category: 'Best Costume Design', presenter: 'Anne Hathaway & Anna Wintour', about: 'Hathaway won Best Supporting Actress 2013 for Les Mis\u00e9rables', oscarConnection: 'Co-hosted 83rd Oscars in 2011. Devil Wears Prada tie-in with Wintour.' },
  { category: 'Best Makeup and Hairstyling', presenter: 'Anne Hathaway & Anna Wintour', about: 'Presented both categories in a Devil Wears Prada-inspired moment', oscarConnection: 'Marketing tie-in to the 2026 sequel.' },
  { category: 'Best Sound', presenter: 'Pedro Pascal', about: 'Star of The Mandalorian and The Last of Us', oscarConnection: 'Never nominated despite massive cultural impact.' },
  { category: 'Best Visual Effects', presenter: 'Sigourney Weaver', about: 'Three-time Oscar nominee. Sci-fi icon from Alien franchise', oscarConnection: 'Quoted her Aliens line onstage near the Grogu appearance. Never won.' },
  { category: 'Best Production Design', presenter: 'Chris Evans', about: 'Captain America in the MCU', oscarConnection: 'Part of the Marvel reunion segment at this ceremony.' },
  { category: 'Best Film Editing', presenter: 'Bill Pullman & Lewis Pullman', about: 'Father-son actors. Bill: Independence Day. Lewis: Thunderbolts', oscarConnection: 'First father-son duo to present at the same ceremony.' },
  { category: 'Best Cinematography', presenter: 'Channing Tatum', about: 'Known for Magic Mike and Jump Street franchise', oscarConnection: 'Regular Oscar presenter in recent years.' },
  { category: 'Best Animated Feature', presenter: 'Demi Moore', about: 'First Oscar nom at 97th Oscars for The Substance after 40+ year career', oscarConnection: 'Her late-career nomination made her a crowd favorite.' },
  { category: 'Best International Feature Film', presenter: 'Javier Bardem', about: 'Won Best Supporting Actor 2008 for No Country for Old Men', oscarConnection: 'One of only six actors nominated for a non-English performance.' },
  { category: 'Best Documentary Feature', presenter: 'Ewan McGregor', about: 'Known for Trainspotting and Star Wars prequels', oscarConnection: 'Never nominated despite 30+ year career.' },
  { category: 'Best Original Score', presenter: 'Nicole Kidman', about: 'Won Best Actress 2003 for The Hours. Six total nominations', oscarConnection: 'One of the most frequent presenters in modern Oscar history.' },
  { category: 'Best Original Song', presenter: 'Lionel Richie', about: 'Legendary musician. Won this category in 1986 for Say You, Say Me', oscarConnection: 'Previous winner of the exact category he presented. Standing ovation.' },
  { category: 'Best Adapted Screenplay', presenter: 'Jimmy Kimmel', about: 'Hosted Oscars four times (2017, 2018, 2023, 2024)', oscarConnection: 'Onstage during the La La Land / Moonlight mix-up. Stepped to presenter this year.' },
  { category: 'Best Original Screenplay', presenter: 'Paul Mescal', about: 'Irish actor nominated for Aftersun at 95th Oscars', oscarConnection: 'One of youngest Best Actor nominees in recent history at age 26.' },
  { category: 'Best Casting', presenter: 'Paul Mescal, Gwyneth Paltrow, Chase Infiniti, Wagner Moura, Delroy Lindo', about: 'Fab Five format -- each introduced a nominee from their film', oscarConnection: 'First-ever presentation of this new category. Moura and Lindo were current nominees.' },
  { category: 'Best Director', presenter: 'Adrien Brody', about: 'Won Best Actor at 75th Oscars for The Pianist at age 29', oscarConnection: 'Youngest solo Best Actor winner at the time. Known for emotional speeches.' },
  { category: 'Best Supporting Actress', presenter: 'Zoe Salda\u00f1a', about: 'Won Best Supporting Actress at 97th Oscars for Emilia P\u00e9rez', oscarConnection: 'Returned per tradition as prior year\'s winner of the same category.' },
  { category: 'Best Actress', presenter: 'Kieran Culkin', about: 'Won Best Actor at 97th Oscars for A Real Pain', oscarConnection: 'Per tradition, prior year\'s Best Actor presents Best Actress.' },
  { category: 'Best Actor', presenter: 'Mikey Madison', about: 'Won Best Actress at 97th Oscars for Anora', oscarConnection: 'Per tradition, prior year\'s Best Actress presents Best Actor.' },
  { category: 'Best Picture', presenter: 'Gwyneth Paltrow', about: 'Won Best Actress 1999 for Shakespeare in Love', oscarConnection: 'Her 1999 win and tearful speech is one of the most iconic Oscar moments.' },
];

export default filmEncyclopedia;
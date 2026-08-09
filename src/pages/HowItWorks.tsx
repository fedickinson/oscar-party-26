/**
 * HowItWorks — the pregame explainer. A link you send out hours before.
 *
 * WHY THIS PAGE EXISTS
 * Everything in this app is easy to use and impossible to guess. Watch groups,
 * remote-holders, drift beacons and the resume countdown are a coherent system
 * once someone explains the idea underneath them — one screen, one playback,
 * one person who touches it — and a pile of confusing buttons if nobody does.
 * Explaining that live, over the cold open, costs the first act of the episode.
 *
 * So it gets explained once, in advance, in a link.
 *
 * THE DISCLOSURE RULE
 * Everything that changes how somebody BEHAVES tonight is visible without a
 * tap: the pact, the remote, the pause sequence. Everything that is a number,
 * a ladder or an edge case sits inside a <Disclosure>. A reader who taps
 * nothing still knows how to play; a reader who taps everything knows the
 * scoring. Hiding the behavioural half would defeat the point of sending it.
 *
 * That split also survives the rules moving. Tonight's games are still being
 * tuned in parallel, and the parts that churn — tier values, line bonuses,
 * draft scoring — are exactly the parts behind a disclosure. Rewriting a
 * ladder is a contained edit; the visible spine does not move.
 *
 * THIS IS NOT A RULES REFERENCE
 * The in-app PhaseExplainer covers each mini-game at the moment you need it.
 * This page is what comes first: what we are agreeing to, and why the pauses
 * work the way they do.
 *
 * PUBLIC, AND DELIBERATELY SO
 * No room, no player, no Supabase read — this renders for a stranger with the
 * link. It has to, because it is read before anyone has joined anything.
 *
 * EDITING TONIGHT'S DETAILS
 * Everything that changes party to party is in TONIGHT below. Nothing else in
 * this file needs touching to re-point it at another night.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Grid3X3,
  Hand,
  MessageCircle,
  Pause,
  Play,
  Tv,
  Users,
} from 'lucide-react'
import { Hallmark } from '../components/ui/Hallmarks'

// ─── Tonight ──────────────────────────────────────────────────────────────────
// The only block that changes between parties. `null` on any time renders a
// quiet placeholder rather than an empty row, so the page is sendable before
// the schedule is settled.

const TONIGHT = {
  event: 'House of the Dragon',
  episode: 'Season 3, the finale',
  date: 'Sunday 9 August',
  /** Shown big at the bottom. null hides the code block entirely. */
  roomCode: null as string | null,
  /** Who has the console and the final word on what happened. */
  gameMaster: 'Franklin',
  /**
   * The Signature Beats SYSTEM is settled (see the v4 variety pass); the beat
   * content is still being loaded into the app. While this is false the draft
   * card carries a note saying individual beats may still move, so nobody
   * memorises a list that is about to change. The rules above it are safe.
   */
  draftBeatsLive: false,
  /**
   * Times carry ET explicitly on every row. We are not all in one timezone —
   * the watch groups tonight span at least two — and a bare "8:00" in an
   * explainer is exactly the ambiguity that puts somebody in the room an hour
   * after the draft finished.
   */
  schedule: [
    {
      time: '8:15pm ET' as string | null,
      title: 'Room opens',
      detail:
        'The link lands in the group chat around then. Join and pick an avatar — the room keeps your spot, so you can do it and close the tab.',
    },
    {
      time: '8:30pm ET' as string | null,
      title: 'The draft, then activation',
      detail:
        'Pick a dragon and four characters in turns, then choose the three moments each character scores on. The one part where everyone has to be in the app at once, and it does not wait.',
    },
    {
      time: '8:50pm ET' as string | null,
      title: 'Say where you are',
      detail:
        'Two taps: the place you are watching from, and whether you are the one holding the remote there.',
    },
    {
      time: '9:00pm ET' as string | null,
      title: 'Press play together',
      detail:
        'The episode is out at nine. We start it when everyone is actually ready rather than at nine sharp — both screens count down and press play on the same beat.',
    },
  ],
}

// ─── The pact ─────────────────────────────────────────────────────────────────
// Five, not ten. A list nobody finishes reading protects nothing. Deliberately
// never collapsed — this is the payload of the whole page.

const PACT = [
  {
    title: 'The show never waits for the game.',
    body: 'Nothing in here needs you mid-scene. A bingo claim is two taps. Scoring happens without you. The draft is finished before the episode starts.',
  },
  {
    title: 'We stop between scenes, together.',
    body: 'Every scene plays all the way through — nothing stops mid-shot or over dialogue. At the break we stop as a group, and every screen freezes on the same second.',
  },
  {
    title: 'The stops are the night, not an interruption of it.',
    body: 'That is when the game catches up and when we get to react to what just happened. Chat is open all evening, but the real conversation happens while we are stopped — and there is no timer on it. We go again when we are ready.',
  },
  {
    title: 'Do not react ahead.',
    body: 'If your screen is ahead of the other one, you are a spoiler. The app tells you when it happens and which way to fix it. Fix it.',
  },
  {
    title: `${TONIGHT.gameMaster} calls it, and that is the call.`,
    body: 'Someone has to decide what counted and who it counted for. Argue at the break, in good faith, briefly — then let it go and watch the show.',
  },
]

// ─── Bingo tiers ──────────────────────────────────────────────────────────────
// Mirrors BOARD_TIER_MIX and TIER_POINTS in lib/bingo-utils.ts. Kept as a local
// literal rather than an import: this page renders for someone who has not
// joined, and pulling the game's runtime constants into a public marketing-ish
// route couples the two for no benefit. If the ladder changes, change it here.

const TIERS = [
  { label: 'Likely', chance: '60%+', perCard: 7, points: 1 },
  { label: 'Toss-up', chance: '40–59%', perCard: 9, points: 2 },
  { label: 'Long shot', chance: '20–39%', perCard: 6, points: 3 },
  { label: 'Chaos', chance: 'under 20%', perCard: 2, points: 5 },
]

// ─── Draft odds ladder ────────────────────────────────────────────────────────
// From the Signature Beats v4 variety pass (`game.odds_ladder`). A separate
// ladder from the bingo tiers above, and deliberately so: bingo prices a square
// you were dealt, this prices a bet you chose.

const BEAT_ODDS = [
  { label: 'Likely', chance: 'better than 55%', points: 20 },
  { label: 'Coin flip', chance: '30–55%', points: 25 },
  { label: 'Long shot', chance: '10–30%', points: 35 },
  { label: 'Wild', chance: 'under 10%', points: 45 },
]

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    // Entrance is on mount, deliberately NOT scroll-triggered. A whileInView
    // reveal leaves every section below the fold at opacity 0 until an
    // IntersectionObserver fires; on a page whose entire job is to be read
    // once, on someone else's phone, that trades nothing for the chance of
    // showing a stranger a blank page.
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--t-ornament-muted)' }}
        >
          {eyebrow}
        </span>
        <h2
          className="text-[24px] leading-tight"
          style={{ fontFamily: 'var(--font-family-display)', color: 'var(--t-text)' }}
        >
          {title}
        </h2>
      </div>
      {children}
    </motion.section>
  )
}

/**
 * The v10 hallmark relief palette.
 *
 * Every mark paints from `--hm-*` with a `currentColor` fallback, and the app
 * sets none of them — so by default the whole library renders as a flat
 * silhouette. Binding the facet tokens is what turns a mark back into the
 * carved drawing it was made as: pale upper-left planes, dark lower-right
 * planes, faction device colour at the heads and wings.
 *
 * Declared here rather than in index.css on purpose. That file is about to be
 * replaced wholesale by the design window's app-theme.css, and a stray block
 * from this page would either be lost in the swap or conflict with it.
 */
const HALLMARK_RELIEF: React.CSSProperties = {
  color: 'var(--t-ashlar)',
  '--hm-base': 'var(--t-ashlar)',
  '--hm-light': '#e6dcc8',
  '--hm-shadow': '#3f3a33',
  '--hm-cut': '#2a2622',
  '--hm-device': 'var(--t-madder)',
  '--hm-edge': 'var(--t-madder-light)',
  '--hm-core': 'var(--t-vellum-light)',
  '--hm-egg-cut': '#e6dcc8',
  '--hm-eye': 'var(--t-jet)',
  '--hm-impact': 'var(--t-vellum-light)',
  '--hm-impression': 'var(--t-wax-dark)',
  '--hm-metal': 'var(--t-mortar)',
  '--hm-metal-light': 'var(--t-vellum-light)',
  '--hm-metal-dark': 'var(--t-ashlar-deep)',
  '--hm-rivet': 'var(--t-ornament-muted)',
  '--hm-roundel': 'var(--t-ashlar-deep)',
  '--hm-roundel-cut': 'var(--t-iron-dark)',
  '--hm-team-a-device': 'var(--t-team-a-device)',
  '--hm-team-a-field': 'var(--t-team-a-field)',
  '--hm-team-b-device': 'var(--t-team-b-device)',
  '--hm-team-b-field': 'var(--t-team-b-field)',
  '--hm-wax': 'var(--t-wax)',
  '--hm-wax-light': 'var(--t-wax-light)',
  '--hm-wax-shadow': 'var(--t-wax-dark)',
} as React.CSSProperties

/** Body copy. One place, so the reading colour and measure stay consistent. */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14px] leading-[1.65]" style={{ color: 'var(--t-text-muted)' }}>
      {children}
    </p>
  )
}

/** The one idea a section hangs on, set apart so it survives skim-reading. */
function KeyLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="border-l-2 pl-4 py-1 text-[18px] leading-snug"
      style={{
        fontFamily: 'var(--font-family-display)',
        color: 'var(--t-text)',
        borderColor: 'var(--t-accent)',
      }}
    >
      {children}
    </p>
  )
}

/**
 * A tap-to-open detail block.
 *
 * The label has to say what is inside, not "more" — a row of identical
 * "Learn more" chevrons is a page nobody opens. The whole row is the target
 * and it clears 44px.
 */
function Disclosure({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t" style={{ borderColor: 'var(--t-line-soft)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
      >
        <span className="text-[14px] font-semibold" style={{ color: 'var(--t-text-muted)' }}>
          {label}
        </span>
        <ChevronDown
          size={16}
          className="flex-shrink-0 transition-transform"
          style={{
            color: 'var(--t-accent-light)',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A points ladder: name, the odds behind it, the payout on the right.
 *
 * Both games price things by likelihood, so both get the same shape — the
 * reader learns the layout once and can then read either one at a glance.
 */
function Ladder({
  rows,
}: {
  rows: Array<{ label: string; note: string; value: string }>
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-baseline gap-2 text-[14px]"
          style={{ color: 'var(--t-text-muted)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--t-text)' }}>
            {row.label}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--t-text-dim)' }}>
            {row.note}
          </span>
          <span
            className="ml-auto tabular-nums font-semibold whitespace-nowrap"
            style={{ color: 'var(--t-accent-light)' }}
          >
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A game card: always-readable summary on top, detail behind taps below. */
function GameCard({
  icon,
  title,
  summary,
  children,
}: {
  icon: React.ReactNode
  title: string
  summary: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="relief-glass p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span style={{ color: 'var(--t-accent-light)' }}>{icon}</span>
        <h3 className="text-[16px] font-semibold" style={{ color: 'var(--t-text)' }}>
          {title}
        </h3>
      </div>
      <div className="text-[14px] leading-[1.6]" style={{ color: 'var(--t-text-muted)' }}>
        {summary}
      </div>
      {children}
    </div>
  )
}

function Rule() {
  return <div className="motif-band narrow" aria-hidden />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HowItWorks() {
  return (
    <div
      className="flex flex-col gap-10"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}
    >
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex flex-col items-center text-center gap-3 pt-4"
      >
        {/* Wrapped rather than styled directly: Hallmark deliberately exposes
            only id/size/className, and the relief tokens have to be inherited
            from an ancestor. 88px sits inside the Dance's declared 48–160
            drawing range, where its heads and membrane fingers actually read. */}
        <span style={HALLMARK_RELIEF}>
          <Hallmark id="hallmark-dance" size={88} />
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.3em]"
          style={{ color: 'var(--t-ornament-muted)' }}
        >
          Party Night
        </span>
        <h1
          className="text-[36px] leading-none"
          style={{ fontFamily: 'var(--font-family-display)', color: 'var(--t-text)' }}
        >
          Fire &amp; Blood
        </h1>
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px]" style={{ color: 'var(--t-text-muted)' }}>
            {TONIGHT.event} &middot; {TONIGHT.episode}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--t-text-dim)' }}>
            {TONIGHT.date}
          </p>
        </div>
      </motion.header>

      {/* ── The invitation, on parchment ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        className="material-vellum deckled px-6 py-7"
      >
        <p
          className="text-[16px] leading-[1.5] font-semibold"
          style={{ fontFamily: 'var(--font-family-manuscript)', color: 'var(--t-ink)' }}
        >
          We are watching the finale together, from more than one couch. There is a game
          running underneath it &mdash; a draft, a scoreboard, a bingo card, and a group
          chat with some very opinionated dead nobles in it.
        </p>
        <p
          className="text-[16px] leading-[1.5] font-semibold mt-4"
          style={{ fontFamily: 'var(--font-family-manuscript)', color: 'var(--t-ink)' }}
        >
          The whole thing is built so you never have to take your eyes off the TV to play
          it. Read the bold parts before you arrive; open the rest if you want the numbers.
        </p>
      </motion.div>

      <Rule />

      {/* ── The pact ─────────────────────────────────────────────────────── */}
      <Section eyebrow="First, the only part that matters" title="The pact">
        <P>
          One thing outranks the game: we are actually here to watch the show. Everything
          else in this app is designed around that, and it only holds if we all agree to
          the same five things.
        </P>

        <ol className="flex flex-col gap-3">
          {PACT.map((item, i) => (
            <li key={item.title} className="relief-glass p-4 flex gap-3.5">
              <span
                className="flex-shrink-0 grid place-items-center w-7 h-7 border text-[14px]"
                style={{
                  fontFamily: 'var(--font-family-display)',
                  color: 'var(--t-accent-light)',
                  borderColor: 'var(--t-line)',
                }}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-1.5 min-w-0">
                <h3
                  className="text-[16px] leading-snug font-semibold"
                  style={{ color: 'var(--t-text)' }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-[14px] leading-[1.6]"
                  style={{ color: 'var(--t-text-muted)' }}
                >
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Rule />

      {/* ── The games ────────────────────────────────────────────────────── */}
      <Section eyebrow="The game" title="Three things, and one of them is watching">
        <P>
          Each card below tells you everything you have to do. Open the rows underneath if
          you want to know how the points actually work.
        </P>

        <div className="flex flex-col gap-3">
          {/* Draft — Signature Beats. The system is locked; the beat lists are
              still being loaded, hence the draftBeatsLive note at the bottom. */}
          <GameCard
            icon={<Users size={18} />}
            title="Before — you draft"
            summary={
              <>
                One dragon each, then four characters each, taken in turns. Drafting the
                character is only half of it: for every character you take, you then choose
                exactly <strong style={{ color: 'var(--t-text)' }}>three</strong> of their
                Signature Beats &mdash; specific moments only that character can trigger.
                An activated beat scores if it happens tonight. A beat you left off pays
                nothing, however loudly it happens.
              </>
            }
          >
            <Disclosure label="Why no character is the best pick">
              <P>
                Every legal set of three lands in the same 60&ndash;90 point band. How many
                beats you get to choose <em>between</em> depends on the character &mdash;
                seven for a central one, six for a major support, five for a support &mdash;
                but the totals match either way, so the headline number on a card tells you
                nothing about who is worth taking.
              </P>
              <P>
                What differs is the shape of the bet. Three likely moments at 20 each, or
                one long shot at 35 with two safer ones behind it. Same card value, wildly
                different night. You are drafting a character and then building a portfolio
                for them, and the second half is where the game actually is.
              </P>
            </Disclosure>
            <Disclosure label="What a beat is worth">
              <P>Beats are priced by how likely they are to happen:</P>
              <Ladder
                rows={BEAT_ODDS.map((o) => ({
                  label: o.label,
                  note: o.chance,
                  value: `${o.points} pts`,
                }))}
              />
              <P>
                Characters score at one and a half times, so a 45-point wild beat actually
                pays 67 &mdash; enough to swing the whole night on one moment. That is
                deliberate, and it is why the wild band has to stay genuinely unlikely.
                Dragons pay at face value.
              </P>
            </Disclosure>
            <Disclosure label="You are allowed to bet both ways">
              <P>
                Beats come in forks. Daemon can make peace with Rhaenyra or openly defy her.
                Rhaena&rsquo;s Sheepstealer can take her back or turn on her. Alicent can
                fight to save Aemond or leave him where he lies.
              </P>
              <P>
                You may activate both sides of a fork. It nearly guarantees you a payout on
                that storyline, and it costs you a slot you could have spent somewhere else
                on the same character. Deciding when that trade is worth it is the whole
                game.
              </P>
            </Disclosure>
            <Disclosure label="Some beats pay two people">
              <P>
                Eight beats name two characters, and both drafters score. If a conscious
                Aemond confronts Alicent about the poisoning, whoever holds Aemond and
                whoever holds Alicent each take 35.
              </P>
              <P>
                These sit on top of your three activated beats &mdash; you do not spend a
                slot on them and you cannot choose them. They are there so that two people
                at the table have a stake in the same shot, which is when a room actually
                shouts.
              </P>
            </Disclosure>
            <Disclosure label="Dragons work differently">
              <P>
                Dragons go first, everyone gets exactly one, and there are only eleven, so
                somebody is not getting the one they wanted. Take that round seriously.
              </P>
              <P>
                A dragon has one or two beats and they are always live &mdash; no activation
                choice to make, because there is nothing to choose between. They score at
                face value rather than one and a half times.
              </P>
            </Disclosure>
            <Disclosure label="How the round actually runs">
              <P>
                Snake order, 45 seconds a pick &mdash; miss the clock and it moves on
                without you. This is the only part of the night that needs everyone in the
                app at the same time.
              </P>
              <P>
                Activation happens after the picking and before the episode starts. Once the
                episode is running, your three are locked.
              </P>
              {!TONIGHT.draftBeatsLive && (
                <p
                  className="text-[12px] leading-relaxed border-l-2 pl-3"
                  style={{ color: 'var(--t-pending)', borderColor: 'var(--t-pending)' }}
                >
                  The beat lists are still being loaded into the app. Everything above is
                  settled; a few individual beats may still move before the draft, and
                  whatever is on your card at the time is what counts.
                </p>
              )}
            </Disclosure>
          </GameCard>

          {/* Bingo — current as of the rebalanced 75-square researched pool. */}
          <GameCard
            icon={<Grid3X3 size={18} />}
            title="During — you watch"
            summary={
              <>
                That is genuinely the instruction. Your score moves on its own as{' '}
                {TONIGHT.gameMaster} logs what happens on screen. The only thing that wants
                your thumb is a 5&times;5 bingo card: tap a square when you see it happen,
                confirm, and it goes to {TONIGHT.gameMaster} to approve.
              </>
            }
          >
            <Disclosure label="Read the square before you claim it">
              <P>
                Every square has a strict win condition that spells out what does{' '}
                <em>not</em> count, and tapping a square shows you that wording before you
                commit. &ldquo;Named Dragon Snack&rdquo; needs a dragon to actually use its
                teeth on someone with a name &mdash; burning them does not count.
              </P>
              <P>
                So it is two taps, not one: select, read, confirm. Then say it out loud,
                because a claim sits pending until {TONIGHT.gameMaster} approves it.
              </P>
            </Disclosure>
            <Disclosure label="What a square is worth">
              <P>
                Squares are priced by how unlikely they are, and every card is dealt the
                same mix of them. Nobody gets the easy card &mdash; two cards have the same
                expected score before the episode starts. What differs is what actually
                happens and who catches it.
              </P>
              <Ladder
                rows={TIERS.map((tier) => ({
                  label: tier.label,
                  note: `${tier.chance} · ${tier.perCard} on your card`,
                  value: `${tier.points} pt${tier.points === 1 ? '' : 's'}`,
                }))}
              />
              <P>
                The long shots and the chaos squares carry a small mark in the corner of the
                grid. Those eight are the ones worth watching for.
              </P>
            </Disclosure>
            <Disclosure label="Lines, and the blackout myth">
              <P>
                Your first line is worth 15, your second 10, and every line after that 5. A
                blackout pays 25 &mdash; across twelve thousand simulated cards it came up
                zero times, so treat it as folklore rather than a plan.
              </P>
              <P>
                A typical night lands somewhere around 25 points, and lines are genuinely
                rare, which is what makes one feel like a spike rather than the only way to
                score. Bingo is not meant to decide the night. It decides between people who
                drafted equally well.
              </P>
            </Disclosure>
          </GameCard>

          <GameCard
            icon={<MessageCircle size={18} />}
            title="Underneath — the chat"
            summary={
              <>
                All of us, plus seven AI companions who are watching along and have opinions
                about it. They react to what actually happens, live.
              </>
            }
          >
            <Disclosure label="Who is in there">
              <P>
                Cersei passes judgement, Tyrion drinks and knows things, Olenna is unkind
                about everyone, Ned keeps the record, Arya keeps a list, Daenerys believes,
                and Joffrey is exactly as bad as you remember.
              </P>
              <P>
                They are reading the same scoreboard you are, so they will have something to
                say when your pick dies.
              </P>
            </Disclosure>
          </GameCard>
        </div>
      </Section>

      <Rule />

      {/* ── The remote ───────────────────────────────────────────────────── */}
      <Section eyebrow="The one concept to get" title="The remote">
        <P>
          Everything about keeping us together comes down to a single idea, and if you only
          remember one thing from this page, remember this one.
        </P>

        <KeyLine>One screen. One playback. One person who touches it.</KeyLine>

        <P>
          However many of us are sitting on a couch, that couch has one remote. So when you
          join, you say where you are watching, and one person in that place taps{' '}
          <em>I have the remote here</em>. That person is not in charge of the game and has
          no extra powers. They have exactly one job: they are the only one who touches play
          and pause, so the screens cannot drift apart by accident.
        </P>

        <div className="relief-glass p-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <Tv size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--t-text-dim)' }} />
            <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--t-text-muted)' }}>
              Watching on your own? You are your own remote-holder by definition. Skip the
              place name, control your own playback, pause whenever you like.
            </p>
          </div>
          <Disclosure label="Use a real place name, not “together”">
            <P>
              The app groups people by the place they name, and everyone in a group is
              treated as sharing one screen. An earlier version offered
              &ldquo;Together&rdquo; and &ldquo;Watching alone&rdquo; as the options, and two
              people in different countries both truthfully picked &ldquo;Watching
              alone&rdquo; and got silently merged onto one imaginary screen.
            </P>
            <P>
              So name the actual place &mdash; &ldquo;Alec&rsquo;s,&rdquo; &ldquo;Tulum,&rdquo;
              &ldquo;my sofa.&rdquo; A place name cannot be ambiguous in that way. A
              relationship word always can.
            </P>
          </Disclosure>
        </div>
      </Section>

      <Rule />

      {/* ── Drift ────────────────────────────────────────────────────────── */}
      <Section eyebrow="While the episode runs" title="How we stay together">
        <P>
          Two screens playing the same episode will slide apart. Someone answers the door,
          someone&rsquo;s stream buffers, someone starts four minutes late. Twenty minutes
          in, one room is reacting to a death the other room has not seen yet. That is the
          thing that actually ruins a remote watch-along &mdash; not pausing.
        </P>

        <P>
          You do not have to manage any of it. If a gap opens up, the app tells you, and it
          tells you which direction to fix it in.
        </P>

        <div className="relief-glass p-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <Clock
              size={18}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--t-text-dim)' }}
            />
            <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--t-text-muted)' }}>
              Nobody types a timestamp. Nobody reads a clock out loud. Nobody has to ask
              &ldquo;where are you?&rdquo; in the group chat.
            </p>
          </div>
          <Disclosure label="How it knows where you are">
            <P>
              Your phone starts a clock the moment your screen starts, and it runs in real
              time from there. Every 45 seconds the remote-holders quietly publish their
              position to each other in the background.
            </P>
            <P>
              A gap under a few seconds is ignored, because that is inside human reaction
              time. Past that you get a plain instruction &mdash; <em>skip forward 20s</em>,
              or <em>pause and let them catch up</em> &mdash; and doing it clears the
              warning.
            </P>
          </Disclosure>
        </div>
      </Section>

      <Rule />

      {/* ── Scene breaks ─────────────────────────────────────────────────── */}
      <Section eyebrow="The rhythm of the night" title="How we stop, and how we start again">
        <P>
          Stopping is not a failure state, it is the rhythm of the night. It is where the
          game gets to be loud without talking over the episode. Two rules make it work:
          it happens at a scene break rather than in the middle of one, and everybody stops
          and starts at the same moment.
        </P>

        {/* One card, four compact rows. A four-step sequence has to be readable
            at a glance to be followed in a dark room; as four paragraph cards it
            was taller than the section it describes. The reasoning moved down
            into the disclosure, where it costs nothing. */}
        <div className="relief-glass p-4 flex flex-col gap-3">
          <ol className="flex flex-col gap-3">
            {[
              {
                icon: <Hand size={16} />,
                title: 'The scene plays out',
                body: 'Nothing stops mid-scene. If you want a break, it happens at the end of the one we are in.',
              },
              {
                icon: <Pause size={16} />,
                title: 'We stop together',
                body: 'The remote-holder pauses at the break and confirms it. Every screen freezes on the same second.',
              },
              {
                icon: <MessageCircle size={16} />,
                title: 'The game catches up, and we react',
                body: 'Squares claimed, the board settled, then the shouting. No timer on it — as long as the scene earned.',
              },
              {
                icon: <Play size={16} />,
                title: 'Everyone taps ready',
                body: 'Both screens count down from five and press play together.',
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="flex-shrink-0 grid place-items-center w-6 h-6 border mt-0.5"
                  style={{ color: 'var(--t-accent-light)', borderColor: 'var(--t-line)' }}
                  aria-hidden
                >
                  {step.icon}
                </span>
                <div className="min-w-0">
                  <h3
                    className="text-[14px] leading-snug font-semibold"
                    style={{ color: 'var(--t-text)' }}
                  >
                    <span style={{ color: 'var(--t-text-dim)' }}>{i + 1}. </span>
                    {step.title}
                  </h3>
                  <p
                    className="text-[14px] leading-[1.55]"
                    style={{ color: 'var(--t-text-muted)' }}
                  >
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Disclosure label="Why we count down instead of just pressing play">
            <P>
              When the remote-holder confirms the pause, both clocks freeze on the same
              second, so nothing drifts while we are stopped. Starting again is the fragile
              part.
            </P>
            <P>
              If one screen pressed play and the other followed a couple of seconds later,
              we would manufacture fresh drift at the exact moment the pause finished fixing
              it. So instead both screens count down to the same instant and release
              together.
            </P>
          </Disclosure>
        </div>
      </Section>

      <Rule />

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <Section eyebrow="Tonight" title="The shape of it">
        <P>
          The episode drops at nine, and the room opens about three quarters of an hour
          before it on purpose. That window is the whole plan: it absorbs late arrivals, it
          gets the draft done without anybody rushing their activations, and it means nine
          o&rsquo;clock is a starting gun rather than a scramble.
        </P>

        <ol className="flex flex-col">
          {TONIGHT.schedule.map((slot, i) => (
            <li key={slot.title} className="flex gap-4">
              {/* Spine: a continuous rule with a node per step. */}
              <div className="flex flex-col items-center flex-shrink-0 w-3" aria-hidden>
                <span
                  className="w-2 h-2 rounded-full mt-1.5"
                  style={{ background: 'var(--t-accent)' }}
                />
                {i < TONIGHT.schedule.length - 1 && (
                  <span className="w-px flex-1" style={{ background: 'var(--t-line)' }} />
                )}
              </div>
              <div className="flex flex-col gap-1 pb-6 min-w-0">
                <span
                  className="text-[12px] font-semibold uppercase tracking-[0.14em] tabular-nums"
                  style={{ color: slot.time ? 'var(--t-accent-light)' : 'var(--t-text-dim)' }}
                >
                  {slot.time ?? 'time to come'}
                </span>
                <h3 className="text-[16px] font-semibold" style={{ color: 'var(--t-text)' }}>
                  {slot.title}
                </h3>
                <p
                  className="text-[14px] leading-[1.6]"
                  style={{ color: 'var(--t-text-muted)' }}
                >
                  {slot.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Join ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex flex-col gap-4"
      >
        {TONIGHT.roomCode && (
          <div className="relief-glass p-5 flex flex-col items-center gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'var(--t-ornament-muted)' }}
            >
              Room code
            </span>
            <span
              className="text-[36px] leading-none tabular-nums tracking-[0.14em]"
              style={{ fontFamily: 'var(--font-family-display)', color: 'var(--t-text)' }}
            >
              {TONIGHT.roomCode}
            </span>
          </div>
        )}

        {/* Enamel texture, but on the accent field rather than the allegiance
            field — this renders for someone who has not joined and therefore
            has no allegiance, and the default (jet) is near-black on near-black. */}
        <Link
          to="/"
          className="w-full min-h-[52px] flex items-center justify-center gap-2 px-4 text-[16px] font-semibold relief-raised material-enamel"
          style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-vellum-light)' }}
        >
          Join the room
          <ArrowRight size={18} />
        </Link>

        <p className="text-[12px] text-center leading-relaxed" style={{ color: 'var(--t-text-dim)' }}>
          Join any time before the draft &mdash; the room holds your spot even if you close
          the tab.
        </p>
      </motion.div>
    </div>
  )
}

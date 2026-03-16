# Second Act Studios presents: Oscar Party 26

**Real-time multiplayer Oscar party game, designed, built, and shipped in a weekend for the 98th Academy Awards.**

> Demo video coming soon.

---

## Teaser Page

The invite page sent to players before the ceremony. Built as a standalone HTML file using the same design system as the app.

Open `teaser.html` in a browser, or [view the source](./teaser.html). If this repo has GitHub Pages enabled, it renders live at `/teaser.html`.

---

## The Experience

Picture four friends on their phones, huddled around the same TV, drafting actors and films before the broadcast starts.

As winners are announced live, the leaderboard shifts in real-time. Points cascade through confidence picks, draft rosters, and bingo cards simultaneously.

Four AI companions live in the group chat: one delivers clean verdicts after every category, one connects everything to her 21 nominations, one roasts whoever is in last place, and one is having the time of his life without fully understanding the game.

When the Best Picture envelope opens, every phone in the room lights up.

---

## Tech Stack

- **React 19 + TypeScript + Vite**: UI framework, type safety, and dev/build tooling
- **Supabase**: hosted Postgres database, WebSocket-based Realtime sync, and Row Level Security for auth
- **Tailwind CSS v4 + Framer Motion**: styling and animations
- **Anthropic Claude API**: powers the four AI chat companions during the live ceremony
- **lucide-react + canvas-confetti**: icons and winner celebration effects
- **Recharts + jsPDF**: score timeline charts and post-ceremony recap PDF export

---

## Architecture

**No backend server.** This was a deliberate choice for a one-night app with an unpredictable spike: four people playing for three hours, then never again. A REST API would mean a server to provision, deploy, and keep alive for exactly one evening. Supabase eliminates that entirely.

**React talks directly to Supabase.** The frontend talks to Supabase over HTTPS and WebSockets, with no middleware, no proxy, and no API routes. Reads, writes, and real-time subscriptions all flow through the Supabase JS client in the browser.

**Multiplayer via Realtime.** Supabase Realtime runs WebSocket subscriptions on top of Postgres logical replication. When the host confirms a winner, the DB row updates and every connected client receives the change within milliseconds. No polling, no manual broadcast, no shared server state to manage.

**Authorization at the database layer.** Row Level Security policies live in Postgres itself. There is no token validation code, no middleware stack, no auth service to maintain. The database enforces who can read and write what.

**The full multiplayer loop:**

```
User action -> Supabase write -> Realtime broadcast -> all clients update state -> React re-renders
```

That single pattern handles every phase transition, every winner announcement, every score update, and every bingo mark in the app.

---

## Three Games

**1. Ensemble Draft**
Snake draft where players claim actors and films from the year's nominees. Points accumulate automatically when your picks win. No manual scoring needed.

**2. Prestige Picks**
Predict the winner for all 24 categories and assign confidence values 1-24, each used exactly once. Max confidence on a longshot win is the fastest way to flip the leaderboard.

**3. Oscars Bingo**
Randomized 5x5 cards filled with ceremony moments: acceptance speech clichés, camera cuts, host bits. Subjective squares require host confirmation. Colored bands highlight completed bingo lines in real-time.

---

## AI Companions

Four characters live in the group chat throughout the ceremony.

**The Academy** announces every winner first: factual, clean, with the rare editorial flourish of someone who has been on air for thirty years.

**Meryl** arrives with context, name-drops, and finds a way to connect every category to one of her 21 nominations.

**Nikki** roasts your picks because she is nervous. She hosted the Globes and has opinions about everyone in that room.

**Will** is an enthusiastic outsider who occasionally does not understand why bingo and a snake draft are happening at the same time but is absolutely thrilled about it.

All four are powered by Claude Sonnet via a serverless Vercel proxy.

---

## Run Locally

**Prerequisites:** Node 20+, a Supabase project with the schema applied.

```bash
git clone <this-repo>
cd oscar-party-26
npm install
```

Copy the env template and fill in your credentials:

```bash
cp .env.local.example .env.local
```

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional, only required for AI companions
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open `http://localhost:5173`. Create a room, share the 4-character code, and join from a second device or browser tab to test multiplayer.

---

## Room Flow

```
lobby -> ensemble -> prestige -> live (with bingo) -> finished
```

Each phase transition is a single DB write. The host advances the room; all players navigate automatically via Realtime subscription.

---

## Project Structure

```
src/
  components/    - UI components organized by feature
  context/       - GameContext: room + player identity (localStorage)
  data/          - Static config: avatars, bingo squares, AI companions
  hooks/         - Supabase orchestration (fetch + subscribe + state)
  lib/           - Pure functions: scoring, draft logic, bingo detection
  pages/         - Route-level components
  types/         - Supabase row types + derived game types
```

Pure functions live in `lib/` with no React or Supabase imports. Side effects live in `hooks/`. This separation keeps the scoring and game logic unit-testable and the components thin.

---

## Links

- [Improvements After Live Testing](./IMPROVEMENTS.md)
- [Product Roadmap](./ROADMAP.md)

---

*A Second Act Studios production. Built with love for the 98th Academy Awards, March 2026.*

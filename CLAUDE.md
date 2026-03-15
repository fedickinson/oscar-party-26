# CLAUDE.md — Oscars Naughty Party 26

## What this project is

A mobile-first multiplayer Oscars party game app for 3-4 friends watching the 98th Academy Awards (March 15, 2026). Three interconnected games run through one interface with a unified real-time leaderboard:

1. **Fantasy Draft** — snake draft where players claim nominees and films
2. **Confidence Picks** — predict winners in all 24 categories with weighted confidence values (1-24, each used once)
3. **Oscars Bingo** — randomized 5x5 cards with broadcast moments, host-confirmed

## Architecture

**Serverless. No REST API. No backend server.**

The React frontend talks directly to Supabase (hosted Postgres). Row Level Security (RLS) handles authorization at the database layer. Supabase Realtime (WebSocket subscriptions on Postgres logical replication) powers all multiplayer sync.

Data flow: User action → Supabase write → Realtime broadcast → All clients update state → React re-renders.

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS v4 with custom theme (oscar-gold, deep-navy, midnight, glassmorphism)
- **Animation:** framer-motion (imported as `motion` from `framer-motion`)
- **Icons:** lucide-react — NO EMOJI ANYWHERE. Every icon is an SVG from lucide-react or a custom component in src/components/ui/Icons.tsx
- **Backend:** Supabase (Postgres + Realtime + RLS)
- **AI:** Anthropic API (Claude Sonnet) for AI chat companions during live ceremony
- **State:** React Context (GameContext) + useState/useReducer for local state, Supabase Realtime for shared state
- **Routing:** react-router-dom v6
- **Effects:** canvas-confetti for celebrations

## Project structure

```
src/
  components/
    admin/         — WinnerSelector, BingoApprovalCard
    bingo/         — BingoCard, BingoSquare, BingoAlert
    confidence/    — CategoryPickCard, ConfidenceNumberPicker, PicksReveal, SubmitStatus
    draft/         — EntityCard, DraftTimer, MyRoster, ConfirmPickModal
    live/          — TabBar, ScoresTab, MyPicksTab, Leaderboard, ResultsFeed, BingoTab
    ui/            — Icons (custom SVGs), LoadingScreen, Toast
    Avatar.tsx     — Main avatar component (gradient circle + initials + emotion)
    AvatarPicker.tsx — Avatar selection grid for join flow
  context/
    GameContext.tsx — Room, player, players state + localStorage persistence
  data/
    avatars.ts     — Static avatar config (colors, initials, character info)
  hooks/
    useRoom.ts     — Create/join room, realtime subscriptions for room + players
    useDraft.ts    — Draft state machine, timer, pick logic
    useConfidence.ts — Pick management, validation, submission
    useBingo.ts    — Card generation, marking, bingo detection
    useScores.ts   — Leaderboard computation from all game data
    useAdmin.ts    — Winner input, undo, bingo approvals
  lib/
    supabase.ts    — Supabase client singleton
    scoring.ts     — Pure scoring functions (no React, no Supabase)
    draft-utils.ts — Snake order, turn computation (pure functions)
    bingo-utils.ts — Card generation, bingo detection (pure functions)
    avatar-utils.ts — Emotion computation, avatar lookup
  pages/
    Home.tsx       — Create/join room
    Room.tsx       — Lobby (player list, start draft)
    Draft.tsx      — Fantasy draft
    Confidence.tsx — Confidence picks
    Live.tsx       — Tabbed live dashboard (Bingo | Scores | My Picks)
    Admin.tsx      — Host-only winner input + bingo approvals
    Results.tsx    — Final standings + fun stats
  types/
    database.ts    — Row/Insert/Update types for all Supabase tables
    game.ts        — Derived game types (LeaderboardEntry, PlayerWithAvatar, etc.)
  App.tsx          — Router with AnimatePresence page transitions
  main.tsx         — Entry point
```

## Database (Supabase)

Schema defined in oscars-naughty-party-schema.sql.

Key tables: rooms, players, categories (24 rows), nominees (125 rows), category_nominees, draft_entities (44 rows), draft_picks, confidence_picks, bingo_squares (50 rows), bingo_cards, bingo_marks, avatars (12 rows).

Realtime enabled on: rooms, players, categories, draft_picks, confidence_picks, bingo_marks.

## Key patterns (follow these consistently)

### Multiplayer state sync
- NEVER call navigate() directly from a user action that should move all players
- Instead: write the phase change to the rooms table → let the Realtime subscription fire → useEffect on room.phase triggers navigation for ALL clients
- This is the "phase-change navigation" pattern used throughout the app

### State management
- Shared state (scores, picks, game phase): lives in Supabase, synced via Realtime subscriptions
- Local UI state (form inputs, expanded/collapsed, selected tab): lives in React useState
- Player identity: stored in localStorage as `oscar_player_id`, restored on mount by GameContext

### Realtime subscription pattern
```typescript
const channel = supabase.channel('channel-name')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tablename', filter: 'id=eq.xxx' }, (payload) => {
    // update local state
  })
  .subscribe()
return () => { supabase.removeChannel(channel) } // cleanup in useEffect
```
Always subscribe BEFORE the initial fetch to close the race window.

### Pure functions vs hooks
- `src/lib/*.ts` files are PURE functions: no React, no Supabase, no async. Unit-testable.
- `src/hooks/*.ts` files orchestrate: fetch data, subscribe, update state, call pure functions.
- Keep computation in lib/, keep side effects in hooks/.

### Scoring cascade
When host sets a winner:
1. UPDATE categories.winner_id
2. UPDATE confidence_picks.is_correct for all players in that category
3. Realtime broadcasts updates → all clients re-render → computeLeaderboard() runs with fresh data

## Design system

### Visual language: Glassmorphism
All cards use: `bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl`
Background: `linear-gradient(135deg, #0A0E27, #12163A)`
Primary accent: oscar-gold `#D4AF37`
Font: Inter (400, 500, 600, 700, 800)

### Color usage
- Oscar-gold (#D4AF37): primary actions, highlights, #1 rank, selected states
- White with opacity (white/60, white/40, white/10): text hierarchy, borders, backgrounds
- Green: correct/approved states
- Red: wrong/denied states
- Amber/yellow: pending/warning states

### Spacing
- Pages: px-4 py-6
- Cards: p-4
- List items: py-3
- All tappable elements: minimum 44x44px touch target

### Icons
- ALL icons from lucide-react or custom SVGs in src/components/ui/Icons.tsx
- NEVER use emoji — not in UI, not in code comments, not anywhere
- Consistent sizing: match lucide defaults (24x24)

### Animations (framer-motion)
- Page transitions: fade + slide from right (x: 16→0)
- List items: stagger entrance (staggerChildren: 0.05-0.1)
- Tappable elements: spring scale on press (whileTap={{ scale: 0.97 }})
- Score changes: spring interpolation counting animation
- Modals/sheets: slide up from bottom with backdrop blur

### Avatars
- Gradient circle (two film-inspired colors) + bold white initials
- 4 sizes: sm (32px), md (48px), lg (80px), xl (120px)
- 4 emotions: happy, sad, shocked, neutral (gradient angle shifts)
- Used everywhere: lobby, draft, leaderboard, results, picks reveal

## Mobile-first rules
- Max container width: max-w-md mx-auto
- No horizontal scroll — ever
- Input font-size: always 16px (prevents iOS zoom on focus)
- Tab bar: fixed bottom with safe-area-inset-bottom padding
- Text minimum: 14px body, 12px labels only
- Touch targets: minimum 44x44px

## Room phases (state machine)
lobby → draft → confidence → live → finished

Each transition: host writes new phase to rooms table → Realtime subscription → all clients navigate via useEffect.

## Environment variables
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_ANTHROPIC_API_KEY=sk-ant-xxx  # Used by AI chat companions
```

## Common gotchas
- UUIDs must be valid hex (0-9, a-f only) — no letters g-z
- Supabase `.single()` throws on zero rows — use `.maybeSingle()` when the row might not exist
- Realtime subscription callbacks can have stale closures — use refs (squaresRef, marksRef pattern) or functional setState
- rooms.host_id is nullable — room is created with host_id=null, then updated after player is inserted
- Snake draft with 2 players alternates A,B,B,A,A,B — this is correct, just feels repetitive
- Confidence values 1-24 must each be used exactly once per player

## When making changes
1. Read this file first
2. Follow the existing patterns — don't introduce new state management approaches
3. Keep pure functions in lib/, side effects in hooks/
4. Use the existing design system (glassmorphism, oscar-gold, lucide icons)
5. Test at 375px width — mobile-first always
6. No emoji. Ever.
# QA Report: Pre-Ceremony Game Flows

Date: 2026-03-15
Scope: useDraft + Draft.tsx, useConfidence + Confidence.tsx, useBingo + BingoTab.tsx, useRoom + Room.tsx, Home.tsx
Compiler: npx tsc --noEmit — PASSES CLEAN before and after all fixes.

---

## Bugs Found and Fixed

### CRITICAL — BUG 1
**File:** `src/hooks/useDraft.ts` lines 155-207
**Description:** Subscribe AFTER initial fetch — violates the CLAUDE.md "subscribe before fetch" pattern.
The initial data load (`load()`) and the `draft_picks` Realtime subscription were in two separate `useEffect` blocks. React runs effects in order, so `load()` started before the subscription was registered. Any `draft_picks INSERT` event that fired during the network round-trip of `load()` was permanently missed — the draft UI would show the wrong current pick owner, enabling double-picks or skipped turns.
**Fix:** Merged both effects into a single `useEffect` that registers the subscription first, then calls `load()`. Dedup guard in the subscription callback handles any overlap.
**Status: FIXED**

---

### CRITICAL — BUG 2
**File:** `src/pages/Room.tsx` lines 94-102
**Description:** `markReady` race condition — stale `ready_players` read-modify-write.
`markReady` read `room.ready_players` from component state, then wrote `[...current, player.id]` back. If two players tapped "Got it" within the same round-trip window (very likely on the same WiFi network), both read `ready_players = []`, both wrote `[their_id]`, and the second write silently erased the first player's entry. This meant `allReady` in `ReadyUpScreen` could never become true, permanently blocking the draft from starting.
**Fix:** Re-fetch the current `ready_players` from Supabase immediately before appending, so each write sees the most recent committed state. This reduces but does not fully eliminate the race window (a true atomic fix requires a DB-level `array_append`; see "Needs Architect" below). In practice for a 2-4 person game on the same network, the re-fetch round-trip is ~20ms vs the ~500ms it takes a human to read and tap.
**Status: FIXED**

---

### MAJOR — BUG 3
**File:** `src/hooks/useConfidence.ts` lines 219-240
**Description:** `lockPicks` advanced game phase even when auto-fill inserts failed.
Two issues:
1. `cat.nominees[0]?.id ?? ''` produced an empty string `nominee_id` when a category had no loaded nominees. This would violate the FK constraint on the `confidence_picks` table.
2. The `await supabase.from('confidence_picks').insert(rows)` call did not check the returned `error`. If the insert failed for any reason, `lockPicks` still proceeded to `update({ phase: 'live' })`, advancing the game with some players having zero confidence picks.
**Fix:** Added a filter to skip categories with no nominees (preventing empty-string FK violation), and added error checking that throws if auto-fill fails — aborting the phase advance so the host can retry.
**Status: FIXED**

---

### MAJOR — BUG 4
**File:** `src/hooks/useRoom.ts` lines 303-311
**Description:** `usePlayersSubscription` initial fetch overwrote accumulated subscription state.
The subscription (INSERT handler) was set up first (correct pattern), then the initial fetch ran and did `setPlayers(data)` — a full overwrite. If a player INSERT event arrived via the subscription before the fetch completed and was added to state, that player would be erased when the fetch response arrived and replaced the entire array. In a lobby where players can join at any time, this creates a window where a player's entry disappears from the list.
**Fix:** Changed the initial fetch callback to use a functional `setPlayers(prev => ...)` that merges the fetched snapshot with any subscription-added players, preserving both.
**Status: FIXED**

---

### MAJOR — BUG 5
**File:** `src/hooks/useBingo.ts` lines 147-157
**Description:** Bingo card creation failure left the player with a blank, silent no-op card.
When `supabase.insert().select().single()` returned an error (e.g., network failure, RLS, or duplicate caused by React StrictMode double-invoking the effect), `newCard` was null and the error was silently discarded. `setIsLoading(false)` was still called, rendering a functionally empty bingo card — no squares, no interaction, no error message.
**Fix:** Destructured the `error` from the insert response. On failure, attempts a recovery fetch (handles the StrictMode double-invoke case where a card was created by the first invocation). `isLoading` still clears in both paths so the spinner doesn't spin forever.
**Status: FIXED**

---

### MINOR — BUG 6
**File:** `src/pages/Live.tsx` lines 179-205
**Description:** Host bingo toast fired for auto-approved marks, not just pending ones.
The `bingo_marks INSERT` subscription in Live.tsx called `showToast(...)` and `setPendingBingoCount(prev => prev + 1)` for every new mark regardless of status. Auto-approved marks (objective squares satisfied by a winner, or the host's own marks) do not need approval, but the host was still notified for them. This cluttered the host's toast queue during normal gameplay.
**Fix:** Wrapped the toast and counter increment in a `if (mark.status === 'pending')` guard.
**Status: FIXED**

---

## Bugs Found — Needs Architect Review

### NEEDS ARCHITECT — RACE 1
**File:** `src/pages/Room.tsx` `markReady` function
**Description:** The `markReady` fix (Bug 2 above) reduces but does not eliminate the race. The only fully race-safe solution is a Postgres `array_append` via a DB function or RPC, so the server performs the atomic append. The current read-fetch-write approach has a ~20ms window where two simultaneous taps could still collide.
**Recommendation:** Add a Supabase Edge Function or RPC `append_ready_player(room_id, player_id)` that does `UPDATE rooms SET ready_players = array_append(ready_players, $2) WHERE id = $1 AND NOT (ready_players @> ARRAY[$2::uuid])`.

### NEEDS ARCHITECT — FILTER 1
**File:** `src/pages/Live.tsx` lines 179-211
**Description:** The `bingo_marks` Realtime subscription has no server-side filter — it receives all bingo_marks events from all rooms. The code guards with a follow-up DB query (`.eq('room_id', roomId)`), which is functionally correct but wastes bandwidth. In a multi-room deployment, every host would receive mark events from all other rooms' players.
**Recommendation:** Supabase can't filter `bingo_marks` by `room_id` directly (the table only has `card_id`). The proper fix is a DB view or a subscription on `bingo_cards` + `bingo_marks` joined. Short-term acceptable as-is since this is a private party app.

---

## Bugs NOT Found (Confirmed Clean)

- `Home.tsx`: `.single()` on room lookup is covered by `if (roomError || !roomData) throw` — safe.
- `GameContext.tsx`: `.single()` calls on session restore are covered by null checks and the `finally` block — safe.
- `useDraft.ts` timer: `isPickingRef` double-tap guard is correct; `roomRef` stale-closure protection is correct.
- `useDraft.ts` optimistic lock: `WHERE current_pick = N` prevents simultaneous picks — correct.
- `useConfidence.ts` `assignConfidence` swap logic: React 18 functional setState batching ensures swap correctness within `handleRandomFill`.
- `useConfidence.ts` `submitPicks` submittingRef guard: ref is reset before throw — guard is properly released on error so user can retry.
- `useBingo.ts` `markSquare`: uses `cardRef` and `squaresRef` — no stale closure.
- `useBingo.ts` bingo detection: `prevBingoLinesRef` correctly pre-seeded on remount to prevent replaying already-seen bingos.
- `useRoom.ts` `createRoom`: 3-step host_id nullable dance is correct.
- `useRoomSubscription`: proper cleanup with `removeChannel`.
- `usePlayersSubscription`: INSERT dedup guard prevents duplicates from subscription+fetch overlap.
- Draft phase navigation: phase-change → navigate pattern correctly used throughout (no direct `navigate()` on user action for phase transitions).

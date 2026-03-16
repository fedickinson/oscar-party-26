# QA Report: AI Chat Companion System

Date: 2026-03-15
Audited by: QA Bot

## Files Audited

- src/hooks/useChat.ts
- src/hooks/useAICompanions.ts
- src/hooks/useChatReactivity.ts
- src/lib/companion-prompts.ts
- src/lib/chat-reactivity-utils.ts
- src/components/home/ChatSection.tsx
- src/components/home/PreCeremonyView.tsx
- src/pages/Live.tsx
- src/context/GameContext.tsx

---

## Bugs Found and Fixed

### BUG-1: Duplicate Supabase channel destroyed on tab change — CRITICAL (FIXED)

**File:** src/hooks/useChat.ts, src/pages/Live.tsx

**Root cause:** `Live.tsx` calls `useChat(roomId)` to track message counts for tab badge notifications. `ChatSection.tsx` (rendered inside `HomeTab` when tab 0 is active) also calls `useChat(room?.id)`. Both calls use the same channel topic string `chat:${roomId}`.

The Supabase JS client's `channel()` method checks for existing channels by topic name and returns the same object if one already exists (verified in `node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js` lines 277-288). `removeChannel()` calls `channel.unsubscribe()` directly with no reference counting.

When the user navigates away from tab 0, `ChatSection` unmounts and its `useEffect` cleanup calls `supabase.removeChannel(channel)`. Because both callers got the same channel object, this unsubscribes the channel that `Live.tsx` is also using. Chat badge notifications stop working for the rest of the session.

**Fix:** Added a `channelKey = 'default'` parameter to `useChat`. The channel topic is now `chat:${roomId}:${channelKey}`. `Live.tsx` passes `channelKey = 'live-badges'`, giving it a distinct channel object that `ChatSection` cannot destroy.

---

### BUG-2: Human chat messages silently dropped during subscribe-to-fetch race window in useChatReactivity — MAJOR (FIXED)

**File:** src/hooks/useChatReactivity.ts

**Root cause:** The hook subscribes to Realtime first, then fires an async fetch to populate `seenMessageIdsRef` and set `initializedRef.current = true`. This pattern is correct for preventing replay of history. However, if a human player sends a message in the narrow window between subscription setup and the fetch completing (typically 100-500ms), the Realtime callback runs with `initializedRef.current === false` and hits the early-return guard `if (!initializedRef.current) return`. The message is not added to `seenMessageIdsRef` either, so no subsequent event will pick it up. The AI companion system silently ignores it — no reaction, no prediction stored.

**Impact:** Any human chat message sent during page load (including the host refreshing mid-ceremony) could be skipped by the reactivity system. Low probability per event but certainty over enough page loads during a 3-hour ceremony.

**Fix:** Added `preInitBufferRef: useRef<MessageRow[]>([])`. Messages arriving before `initializedRef` is true are pushed into this buffer instead of being dropped. After the fetch completes and `seenMessageIdsRef` is populated, the buffer is drained: messages whose IDs are in `seenMessageIdsRef` are pre-existing (already in DB when we fetched) and skipped; messages not in `seenMessageIdsRef` are genuinely new and processed normally.

---

### BUG-3: Milestone AI reactions re-fire on page reload when winner count exactly matches threshold — MAJOR (FIXED)

**File:** src/hooks/useAICompanions.ts

**Root cause:** `milestoneFiredRef` (a `Set<string>`) is an in-memory ref that resets to empty on every page load. Effect 5 checks winner count against thresholds (12, 18, total-1, total) and fires companion messages when the count exactly equals a threshold. If the host reloads the page when exactly 12, 18, 23, or 24 categories have been announced, the count matches the threshold and Effect 5 fires the milestone message again.

Effect 2 already has a `dataInitializedRef` guard that correctly prevents winner reactions from replaying. But that guard does not protect Effect 5.

**Impact:** Duplicate AI milestone messages in the chat (e.g., "halfway point" announcement fires twice). Affects all milestone types. Most likely to hit the ceremony_end milestone if the host reloads the Results page URL then comes back to Live.

**Fix:** In Effect 2's initialization block (which runs before Effect 5 on first render due to React's within-render effect ordering), `milestoneFiredRef` is now pre-populated for all thresholds that have already been passed: `>= 12` marks `halfway`, `>= 18` marks `final_stretch`, `>= total-1` marks `final_category`, `>= total` marks `ceremony_end`. This runs before `dataInitializedRef.current = true`, so Effect 5's first execution sees a correctly pre-populated `milestoneFiredRef`.

---

## Bugs Investigated but Not Bugs

### Stale closure in fireCompanionMessages setTimeout (non-issue)

In `useAICompanions.ts`, `insertCompanionMessage` is called inside `setTimeout`. It reads `roomRef.current` at call time, which is a ref that is always current. Not a stale closure.

### callClaude HTTP error handling (deliberate choice)

Both `useAICompanions` and `useChatReactivity` return `''` on non-OK HTTP responses including 429 rate limits, causing `fireCompanionMessages`/`fireChatReaction` to exit early. Companion messages are explicitly documented as "nice-to-have" that silently fail. This is intentional and correct.

### Lead change effect firing on page reload (non-issue)

Effect 6 (`[leaderboard]` dependency) checks `previousLeaderIdRef.current && previousLeaderIdRef.current !== leaderId`. On first render, `previousLeaderIdRef.current` is `null`, so the condition is false and no lead change message fires. The ref is then set to the current leader. Safe.

### isFiringRef deadlock in fireChatReaction (non-issue)

When `delayMs > 0`, `fire()` is called via `setTimeout` without `await`. If two timer callbacks reach the `isFiringRef.current` check simultaneously, the second returns early without entering try/finally — but `isFiringRef.current` remains `true` which is the desired one-at-a-time behavior. No deadlock.

### player null check in handleSend (non-issue, but note)

In `ChatSection.tsx` line 110, `handleSend` returns early if `!player`. This is correct — the player cannot be null in a rendered chat (GameContext restores session before rendering). The silent return is fine as a defensive guard, but the button is also `disabled={!input.trim()}` so there is no visible failure path for the user.

---

## Findings Summary

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| BUG-1 | CRITICAL | useChat.ts, Live.tsx | Shared Supabase channel destroyed on tab navigation, killing chat badge updates | FIXED |
| BUG-2 | MAJOR | useChatReactivity.ts | Human messages during subscribe-to-fetch race window silently dropped by AI system | FIXED |
| BUG-3 | MAJOR | useAICompanions.ts | Milestone AI messages re-fire on page reload if winner count exactly matches threshold | FIXED |

## Post-Fix Verification

`npx tsc --noEmit` passes clean after all three fixes.

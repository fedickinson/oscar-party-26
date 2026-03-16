# QA Report: PDF Export / Recap Feature

**Reviewed files:**
- `/src/lib/recap-pdf.ts`
- `/src/hooks/useRecap.ts`
- `/src/pages/Results.tsx`
- `/src/components/home/PostCeremonyView.tsx`

**Context files reviewed:**
- `/src/types/database.ts`
- `/src/types/game.ts`
- `/src/hooks/useScores.ts`
- `/src/lib/scoring.ts`
- `package.json`

---

## Bugs Found

### FIXED — MAJOR: `bestPredictor` always set even with 0 correct picks

**File:** `/src/lib/recap-pdf.ts`, `computeHighlights()`, line 76

**Description:** The guard `if (!bestPredictor || correct > bestPredictor.correctCount)` set `bestPredictor` to the first player in the array even when `correctCount` was 0. If all categories were announced but no player predicted correctly (e.g. all upsets), the PDF would print a "BEST PREDICTOR" highlight card reading "PlayerName -- 0 correct picks", which is misleading.

**Fix:** Added `correct > 0` as an additional guard, so `bestPredictor` is only set when a player has at least one correct pick.

```typescript
// Before
if (!bestPredictor || correct > bestPredictor.correctCount) {

// After
if (correct > 0 && (!bestPredictor || correct > bestPredictor.correctCount)) {
```

---

### FIXED — MAJOR: Chat row background height computed with wrong wrap width

**File:** `/src/lib/recap-pdf.ts`, chat transcript section, line ~487

**Description:** The alternating row background for even-indexed messages computed its height using `doc.splitTextToSize(msg.text, contentWidth - 10)`, but the actual message text was then rendered using `doc.splitTextToSize(msg.text, contentWidth - 8)`. If the different widths caused the text to wrap differently, the background rectangle would be too short (cutting off text background) or too tall (leaving blank background after text).

**Fix:** Changed the row height calculation to use `contentWidth - 8` to match the actual text rendering width.

---

### FIXED — MINOR: Unused `leaderboard` binding in `computeHighlights` destructure

**File:** `/src/lib/recap-pdf.ts`, `computeHighlights()`, line 66

**Description:** The destructure `const { leaderboard, categories, ... } = data` included `leaderboard` but the function never references the local binding — all leaderboard access in `generateRecapPDF` uses `data.leaderboard` directly. Dead binding.

**Fix:** Removed `leaderboard` from the destructure.

---

### FIXED — MINOR: `WHITE_20` color constant was nearly invisible on dark background

**File:** `/src/lib/recap-pdf.ts`, line 33

**Description:** `WHITE_20` was set to `#333333` (dark grey). Since jsPDF renders on an opaque dark background (`#0A0E27`), `#333333` text would be almost indistinguishable from the background. The constant is used for timestamp text in chat transcripts and footer sub-text — both would render as near-invisible.

The naming convention implies a 20%-opacity white blended onto the dark navy background. The actual blended value is approximately `#3B3E52`. The constant was updated to `#5A5E7A` which is slightly brighter for readability while still conveying the "muted/secondary" hierarchy.

**Note:** This was present in the initial version but was also present in the rewritten version. Fixed in both passes.

---

## Bugs NOT Fixed (no issue)

### jsPDF import pattern — VALID

`import { jsPDF } from 'jspdf'` is correct for jsPDF v4.2.0. The package exports a named `jsPDF` class via an ambient module declaration (`declare module "jspdf"`). The Vite/ESM build environment correctly handles this via the `browser` export condition (`dist/jspdf.es.min.js`).

### Supabase `messages` table query — VALID

`useRecap.ts` queries `supabase.from('messages').select('id, room_id, player_id, text, created_at').eq('room_id', roomId)`. Column names match `MessageRow` exactly. Table name matches the `Database` type registration. No error.

### `isGenerating` double-tap guard — VALID

The `if (!roomId || !roomCode || isGenerating) return` guard in `downloadRecap()` reads `isGenerating` from the React state at render time. Because `downloadRecap` is redefined on every render, this always reads the current value — no stale closure.

### Props contract between `Results.tsx` and `PostCeremonyView` — VALID

All required/optional props are passed with matching types. `ScoredPlayer` (from `scoring.ts`) has `player: PlayerRow` which contains `avatar_id`, `name`, etc. — all fields used by `PostCeremonyView` are present.

### `tie_winner_id` references in recap-pdf.ts — VALID

`CategoryRow` was updated to include `tie_winner_id: string | null`. The upsets and groupThinkFail logic correctly checks both `cat.winner_id` and `cat.tie_winner_id` when determining whether a pick was correct or wrong.

### `GREEN` and `RED` constants declared but unused — ACCEPTABLE

TypeScript's `noUnusedLocals` does not flag module-level `const` declarations. These constants exist as reserved values for potential future use (e.g. correct/incorrect indicators in the leaderboard). They cause no runtime error.

### Supabase query error not surfaced to user — ACCEPTABLE

`useRecap.ts` uses `const { data: messages } = await supabase.from('messages')...` without destructuring `error`. If the query fails, `messages` is `null` and falls back to `[]` (PDF generates without chat transcript). The outer try/catch logs to console. Surfacing a toast error would be a feature addition, not a bug fix.

---

## Verification

`npx tsc --noEmit` passes clean (exit 0) after all fixes.

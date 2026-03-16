# Improvements After Live User Testing

This app was used live during the 98th Academy Awards on March 15, 2026, with a group of friends on separate devices. During the ceremony itself, I kept notes on everything I noticed: moments where the UX broke down, features that surprised us, and ideas that only become obvious when you're actually using the product in real-time with real people. The next day, I did a focused iteration round, fixing bugs and improving the experience based on everything I observed.

---

## What I Noticed During the Show

### 1. Tie Handling

During the ceremony, Best Live Action Short was awarded to two films simultaneously. My data model assumed exactly one winner per category. I couldn't enter both winners, which meant one had to be left out of the scoring entirely. A rare edge case, and exactly the kind of thing you can't anticipate until you're live.

### 2. Prestige Picks Cognitive Load

Assigning unique confidence numbers 1-24 to every single category was a lot. My most competitive friend loved the strategy. The other two found it overwhelming, especially for minor categories they didn't care about. The numbers themselves created decision paralysis.

### 3. Rapid-Fire Categories

Some stretches of the ceremony announced 3 categories in under 5 minutes. The full spotlight flow, opening nominees, letting everyone read, revealing the winner, celebrating, dismissing, was designed for one-at-a-time pacing. When the show moved fast, the app felt slow.

### 4. Pre-Game Timing

We were still finishing the Ensemble draft and Prestige picks when the ceremony had already started. With three players, the setup took longer than expected. We were rushing through picks instead of enjoying them.

### 5. Bingo Adoption Curve

Nobody touched the Bingo tab for the first hour. But during the ceremony's slower middle section, technical categories, montages, commercial breaks, everyone started exploring it. By the halfway point, people were checking each other's boards and getting genuinely competitive. The feature found its moment on its own.

### 6. Bingo Content

The bingo squares worked but felt generic. Squares like "someone cries" or "standing ovation" are fine, but the really fun moments were the ones specific to this ceremony's storylines. More event-specific, funnier squares would make bingo a standout feature rather than a side activity.

### 7. AI Companion Pacing

The AI companions were a huge hit. People loved reading what Meryl and Nikki said after each winner. But the pacing needed work. Sometimes all four companions fired within seconds of each other, flooding the chat. Other times there were long gaps. The stagger timing and the decision about which companions speak on which categories needed tuning.

### 8. Winner Announcement Impact

When a winner was announced, people wanted to immediately see how it affected everyone, not just their own score. The pop-up only showed the current player's confidence result. Everyone wanted to see who else scored and whether the lead changed.

---

## What I Fixed the Next Day

### 1. Tie Support

Updated the data model to support co-winners per category, allowing multiple entries in `room_winners` for the same `category_id`. The scoring cascade now awards points to players who picked either co-winner.

### 2. AI Companion Reliability

Fixed a mutex lock in the `useAICompanions` hook that was blocking companions from responding after the first category. A global `isGeneratingRef` was staying locked during API calls, silently dropping any winners announced during that window. Removed the redundant mutex and adjusted cooldown timers.

### 3. Spotlight Interaction

Fixed the "Tap to dismiss" button on the category spotlight that wasn't responding. An event handler was swallowing the click before it reached the dismiss function.

### 4. Prestige Randomizer

Fixed the auto-fill randomizer that was producing incomplete results for the second and third players. The logic was checking nominee and confidence number usage globally instead of per-player.

### 5. Winner Pop-Up Enhancement

Updated the winner announcement pop-up to show all players' confidence results, not just the current player's. Now everyone can see who scored and the lead change impact at a glance.

### 6. General Bug Pass

Did a systematic QA pass using Claude Code agents, fixing race conditions in the ready-up countdown, subscription-before-fetch ordering in the draft, and several null safety issues across the app.

---

## Designed but Not Yet Implemented

These are solutions I designed based on observations but haven't built yet.

**Simple Mode** — an 8-category version with tier-based confidence (High / Medium / Low) for casual players who found 24 categories overwhelming.

**Async Pre-Game** — an invite-link flow where players draft and pick days before the show. Picks lock 30 minutes before showtime.

**Quick-Announce Mode** — lightweight winner selection that skips the full spotlight for rapid-fire stretches of the ceremony.

**Bingo Content System** — a richer set of event-specific, funnier bingo squares with better UI for reading and marking them. More focus on bingo as a first-class feature rather than a side activity.

---

*Every item on this list came from using the app live with real users during a real event. That feedback loop, build, ship, observe, improve, is the most valuable part of the project.*

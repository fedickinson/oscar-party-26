# Post-Ceremony Plan — Saved for Later

## Overview
When all 24 categories are announced and the host ends the ceremony, the Home tab transforms into a post-ceremony debrief with data storytelling.

## Core Feature: Interactive Score Timeline
- Line chart: x-axis = each category announced (1-24), y-axis = cumulative score
- Each player is a line in their avatar's primary color
- Tap any point → detail: category, winner, who scored what
- Lines animate from left to right on mount

## Layout: PostCeremonyView
1. "The Night Is Over" header + winning player celebration (avatar xl + confetti)
2. ScoreTimeline — main combined chart (all scores combined, ~250px tall)
3. TurningPoints — algorithmically identified key moments (max 3-4 cards)
4. MiniTimelines — three smaller breakdown charts:
   - Confidence cumulative (line chart)
   - Draft cumulative (line chart)
   - Bingo (horizontal bars — doesn't correlate to categories)
5. HeadToHead card — closest rivalry highlighted
6. "Final Stretch" narrative — what happened in the last 6 categories
7. Chat (still active)
8. "Write Your Hot Take" button → navigates to hot take page

## Files to Build
- src/lib/timeline-utils.ts — pure functions: computeScoreTimeline, identifyTurningPoints, identifyHeadToHead, describeFinalStretch
- src/components/home/ScoreTimeline.tsx — recharts LineChart with player colors
- src/components/home/MiniTimelines.tsx — three smaller breakdown charts
- src/components/home/TurningPoints.tsx — key moment cards with descriptions
- src/components/home/PostCeremonyView.tsx — full layout
- Update HomeTab.tsx — add third state for finished/hot_takes/morning_after phases

## Data Types Needed
- TimelinePoint: categoryIndex, categoryName, winnerName, playerScores (cumulative + delta per game type)
- TurningPoint: categoryIndex, description (natural language)
- HeadToHead: two players, how long they were close, narrative

## Prerequisites
- announced_at timestamp on categories table (for ordering)
  SQL: ALTER TABLE categories ADD COLUMN announced_at TIMESTAMPTZ;
- Update setWinner to write announced_at = now()
- Install recharts: npm install recharts

## Replay Mode (Future Enhancement)
- Auto-play timelapse: graph builds one category at a time with pause between each
- Play/pause button + scrubber slider
- Each reveal shows a mini winner card
- Manual scrub to jump to any point
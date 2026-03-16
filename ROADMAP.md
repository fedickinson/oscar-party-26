# Product Roadmap

This app was built as a weekend project for the 2026 Oscars, but the architecture is event-agnostic. The same engine, real-time multiplayer, draft/prediction scoring, AI companions, bingo, works for any live event with outcomes announced in real-time. Here's where this goes next.

---

## Platform Expansion

### 1. Any Award Show

The same system works for Grammys, Emmys, Golden Globes, BAFTAs, SAG Awards, Tonys, and ESPYs. Each show requires: categories, nominees, scoring tiers, bingo squares, and AI companion context. A content management layer would let non-technical editors configure a new show in hours instead of requiring code changes.

### 2. Sports Events

The architecture extends naturally to live sports. Super Bowl (draft players, predict prop bets, bingo for broadcast moments), World Cup (draft teams, predict match outcomes), March Madness (bracket predictions with confidence scoring), and weekly leagues (recurring rooms with season-long leaderboards).

Award shows happen 10-15 times a year. Sports happen every week. This transforms the addressable market from thousands of niche users per event to millions of fans with recurring weekly engagement.

### 3. Reality TV and Live Events

Bachelor and Survivor finales, election night watch parties, product launch events (Apple keynote bingo), Eurovision. Any event where a group of friends watches together and wants to predict outcomes.

---

## Product Features

### 4. Native App via Capacitor

The biggest UX friction was mobile web viewport behavior: browser chrome fighting with the app's tab bar, unreliable scrolling, no push notifications. Capacitor wraps the existing React codebase in a native iOS/Android shell with minimal changes. Same codebase, no browser chrome, real App Store distribution, and push notifications for bingo alerts and score updates.

### 5. Simple vs Extended Mode

Two difficulty levels. Simple Mode offers the 8 main categories with tier-based confidence (High / Medium / Low) and a smaller bingo card. Extended Mode is the full 24-category experience with exact confidence numbers. Casual friends vs film nerds.

### 6. Async Pre-Game with Invite Links

Players join a room via invite link days before the event. They complete their draft and predictions on their own schedule. Picks lock 30 minutes before showtime. Eliminates the onboarding scramble that happened when setup overlapped with the ceremony starting.

### 7. Auto-Scraping Live Results

Connect to a live results API or scrape a results page to auto-announce winners as they happen. Eliminates the need for a host to manually select each winner. Could use polling every 30 seconds with a confirmation step to prevent false positives.

### 8. Auto-Verified Bingo

Use the live results feed to automatically check objective bingo squares ("Best Picture goes to a film with 10+ nominations"). Only subjective squares ("someone cries during a speech") would still require host approval.

---

## Business Model

### 9. B2B White-Label for Media Companies

License the platform to entertainment media companies like Variety, The Hollywood Reporter, or streaming services. They get an interactive "play along" experience that keeps their audience engaged for the full broadcast instead of just reading a recap the next day.

The AI companions could be configured with the publication's voice and expertise. Imagine THR's critics as the AI personalities commenting on your picks. This is the highest-value commercial path.

---

*The core engine, real-time multiplayer rooms, draft/prediction scoring, AI-powered companions, bingo, and a post-event analysis pipeline, is built and proven. Everything above is an extension of what already works.*

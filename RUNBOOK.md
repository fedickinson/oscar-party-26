# Show-night runbook — hotfixes without losing the game

The load-bearing fact: **every piece of game state lives in Supabase, not in
the app.** Picks, marks, scores, messages, teams, episode clocks, welcomes —
all of it survives any deploy, any reload, any phone dying. The app is a
disposable window onto the database. Everything below follows from that.

## Mid-game hotfix, in order

1. **Fix locally** → `npx tsc -p tsconfig.app.json --noEmit` → `npm run build`.
   The build being green is the gate; nothing ships red.
2. If the change touches backend writes, run `npx tsx scripts/dogfood-e2e.mts`
   (50 checks against the live DB; cleans up after itself).
3. **Commit, push, deploy**: `git add -A && git commit && git push && npx vercel --prod`.
   (Vercel is on Pro as of tonight — no daily deploy cap.)
4. **Get phones onto the new code**: deploys do NOT auto-reload open tabs.
   Post in the game chat: "everyone pull down to refresh." Reload is safe by
   design — identity restores from localStorage, phase routing returns everyone
   to Live, and every host-side scheduler has a reload-recovery guard
   (intros, welcomes, companion reactions, bingo lines all re-derive from the DB).

### What a reload actually costs

- A companion message that was mid-delay when the host reloaded (one lost chat
  line, at most).
- A manual clock nudge on the sync bar (the derived clock takes back over;
  beacons re-correct within a minute).
- Nothing else.

## Mixed-version rule

Between the deploy and the last phone refreshing, old and new bundles talk to
the same DB. Therefore mid-game changes must be **backward-compatible**:
additive columns only (`ADD COLUMN IF NOT EXISTS`, nullable or defaulted),
never renames/drops/type changes, never repurposing a value's meaning. Save
destructive migrations for tomorrow.

## Rollback (seconds, no redeploy)

Aliasing an existing deployment is not a new deployment:

    npx vercel ls                      # pick the last good deployment URL
    npx vercel alias set <that-url> watch-the-dance.vercel.app

Every deploy of the night is retained — the whole evening is a rollback menu.

## Database disaster recovery

`scripts/snapshot-game.mts --loop 300` dumps all 15 tables to
`.private/snapshots/<stamp>/` every 5 minutes (runs on the host laptop during
the show; paginates past the 1000-row PostgREST page). Worst case — a bad
migration, an errant DELETE — restore the affected table from a minutes-old
snapshot with plain REST inserts, the same pattern that archived and reseeded
the Oscars data.

Code is mirrored on GitHub (`git push` after every commit — the repo is public;
remember that before committing anything sensitive).

## Division of labor during the show

The host phone runs the GM console and fires all AI companions — **keep that
tab open**; if it must reload, the recovery guards re-derive everything from
the DB. Deploys/rollbacks/snapshots run from the laptop, which is not part of
the game and can churn freely.

## The operator layer (discovered live, 8/9)

The night proved the game has three layers, and we'd only built two:

1. **The game** — what players see: declare, mark, chat, scores.
2. **The narrative engine** — the cast reacting to declared facts
   (now `scripts/companion-daemon.mts`, phone-independent).
3. **The operator's lens** — the GM's out-of-band view: who is actually
   playing, whether the engines are alive, what just happened as data, and
   the power to repair the world (restore, undo, catch-up) without touching
   the party. Tonight this layer was a dev session; its first product
   primitives are:

   - `scripts/gm-pulse.mts --room CODE` — one-shot room dashboard: per-player
     last-seen / declares / marks, the last six facts, cast liveness
   - the sentinel (anomaly alarms), snapshots (5-min undo for reality),
     and the daemon logs

   Long-term this becomes an operator UI: presence, activity feed, engine
   health, referee actions (undo with a public banner), and restore — the
   difference between hosting a game and merely being in one.

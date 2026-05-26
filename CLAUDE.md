# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Urban 3D Quest is a mobile-first PWA treasure hunt game. Players geolocate themselves on a map, walk to physical objects in the city, and scan QR codes to validate finds. Two game modes:
- **Quête** (`activeGameMode = 'fixed'`): fixed beacons, solo progression, players collect "polaroids"
- **Flash** (`activeGameMode = 'unique'`): unique treasures, competitive, first player to scan wins

## Commands

```bash
# Lint JS
npm run lint

# No build step — index.html is served directly (static PWA)
# No test suite

# Switch to staging env in browser: append ?env=stg to URL
```

## Architecture

**`index.html`** (~330 lines) contains only HTML markup and script/link tags — no inline CSS, no inline JS logic. CSS is in `css/`, all JavaScript is in `js/` (11 modules). There is no bundler, no modules system, no transpilation. `admin.html` is in the separate `urban3DQuest-admin` repository.

`appsscript.gs` is the legacy Google Sheets backend — no longer used. The current backend is **Supabase** (PostgreSQL + RLS + Storage).

### Design system

`css/design-tokens.css` is the source of truth for shared design tokens (colors, fonts, radii). `design/design-system.html` is the visual reference documenting all tokens, components, and patterns.

### Supabase schema

4 tables: `treasures`, `players`, `events`, `config`

- `treasures.type`: `'fixed'` (Quête) or `'unique'` (Flash)
- `treasures.found_by`: for `unique`, single pseudo; for `fixed`, comma-separated pseudos CSV
- `players.score`: sum of `duration_sec` values (lower = faster = better); updated server-side by trigger `trg_events_sync_player_stats`
- `players.session_token`: UUID replaced on each login; used to kick concurrent sessions
- `config` table drives: `proximityRadius`, `gameActive`, `mapCenter`, `gameCode`, `fixedTotal`, `activeQuests`
- `events` table is the source of truth for all finds (score/found_count denormalized to `players` via trigger)

SQL files (`setup.sql`, `setup_secure_rls.sql`, `migration_*.sql`) are in the **`urban3DQuest-admin`** repository.

### Two environments

Selected via `?env=stg` URL param or `localStorage('u3dq_env')`:
- `PROD`: full auth (password required, session token enforced)
- `STG`: no password, session trusted from localStorage — body gets class `env-stg`, orange banner shown

### Environment workflow rule (team)

- Until game launch: work and validate directly in `PROD` first.
- After first launch validation: copy current state to `STG` (preprod), then continue iterative changes in `STG` before promoting again.
- If this rule conflicts with older notes or habits, this section is the source of truth.

### Repository policy (team)

- We use two code repositories only: `urban3DQuest` (game) and `urban3DQuest-admin` (admin).
- We no longer maintain a separate staging code repository.
- `STG` remains an environment, not a separate repo.

### Key global state

```js
activeGameMode   // 'fixed' | 'unique' — drives all UI branching
myPseudo / myToken  // session identity, stored in localStorage
treasures[]      // loaded from Supabase at init, cached for the session
playerLat/playerLng/playerAccuracy  // current GPS position
proximityR       // proximity radius in meters (from config, default 100)
```

### Key functions

| Function | File | Role |
|---|---|---|
| `initGame()` | `game-init.js` | Entry point after login; loads config, treasures, starts GPS, renders UI |
| `renderMarkers()` | `map-init.js` | Draws treasure markers on minimap — must be called in `setGameMode()` to filter by mode |
| `updateRadar()` | `gps.js` | Main proximity loop; fires on each GPS fix; updates radar bar, unlocks clues |
| `captureFixed()` | `gps.js` | Proximity FAB trigger (fixed mode) |
| `_doCheckin()` | `game-init.js` | QR checkin handler: GPS proximity check (client-side), then calls `processFindById()` |
| `processFindById(id)` | `find.js` | Updates `treasures.found_by`, inserts `events` row; score/found_count updated server-side via trigger |
| `setGameMode(mode)` | `game-init.js` | Switches between `'fixed'` and `'unique'`; calls `renderMarkers()` |
| `loadLeaderboard()` | `leaderboard.js` | Fetches all events, recalculates scores client-side, renders leaderboard |
| `startLbPolling()` | `leaderboard.js` | Polls `loadLeaderboard()` every 10s |

### Known limitations

- GPS proximity check in `_doCheckin()` is client-side only (no server-side validation).

## Commit conventions

All commits made with Claude Code must follow this format:

```
[claude] <verb in imperative> <what changed>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Examples:
- `[claude] fix renderMarkers to filter by activeGameMode`
- `[claude] add proximity photo reveal on approaching fixed beacon`
- `[claude] move score update to postgres trigger on events`

This makes Claude-assisted commits immediately identifiable in `git log`.

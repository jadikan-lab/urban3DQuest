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

**Everything lives in `index.html`** (~3100 lines). CSS, HTML, and all JavaScript are in a single file. There is no bundler, no modules, no transpilation. `admin.html` is a separate standalone admin dashboard.

`appsscript.gs` is the legacy Google Sheets backend — it is no longer used. The current backend is **Supabase** (PostgreSQL + RLS + Storage).

### Supabase schema

4 tables: `treasures`, `players`, `events`, `config`

- `treasures.type`: `'fixed'` (Quête) or `'unique'` (Flash)
- `treasures.found_by`: for `unique`, single pseudo; for `fixed`, comma-separated pseudos CSV
- `players.score`: sum of `duration_sec` values (lower = faster = better)
- `players.session_token`: UUID replaced on each login; used to kick concurrent sessions
- `config` table drives: `proximityRadius`, `gameActive`, `mapCenter`, `gameCode`, `fixedTotal`, `activeQuests`
- `events` table is the source of truth for all finds (score/count are denormalized onto `players`)

SQL files: `setup.sql` (initial schema, RLS off — dev only), `setup_secure_rls.sql` (production RLS baseline), `migration_add_auth.sql`.

### Two environments

Selected via `?env=stg` URL param or `localStorage('u3dq_env')`:
- `PROD`: full auth (password required, session token enforced)
- `STG`: no password, session trusted from localStorage — body gets class `env-stg`, orange banner shown

### Key global state

```js
activeGameMode   // 'fixed' | 'unique' — drives all UI branching
myPseudo / myToken  // session identity, stored in localStorage
treasures[]      // loaded from Supabase at init, cached for the session
playerLat/playerLng/playerAccuracy  // current GPS position
proximityR       // proximity radius in meters (from config, default 100)
```

### Key functions

| Function | Role |
|---|---|
| `initGame()` | Entry point after login; loads config, treasures, starts GPS, renders UI |
| `renderMarkers()` | Draws treasure markers on minimap — **must be called in `setGameMode()`** to filter by mode |
| `updateRadar()` | Main proximity loop; fires on each GPS fix; updates radar bar, unlocks clues |
| `captureFixed()` | Triggered by FAB (fixed mode); checks proximity then calls `_doCheckin()` |
| `_doCheckin(t)` | Validates capture: proximity check (client-side), then `processFindById()` |
| `processFindById(id)` | Writes to Supabase (`events` insert + `players` update + `treasures` update), shows found modal |
| `setGameMode(mode)` | Switches between `'fixed'` and `'unique'`; must call `renderMarkers()` |
| `loadLeaderboard()` | Fetches all events, recalculates scores client-side, renders leaderboard |
| `startLbPolling()` | Polls `loadLeaderboard()` every 10s |

### Known bugs (do not regress)

- `renderMarkers()` does not filter by `activeGameMode` — unique treasures appear on the map in Quête mode. Any change to marker rendering must add this filter.
- Score is written to `players` directly from the client in `processFindById()`. A PostgreSQL trigger on `events` should eventually replace this.
- GPS proximity check is client-side only in `_doCheckin()`.

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

# Changelog

All notable changes to this project will be documented in this file.

## v3.14.25 - 2026-05-30
- Prod cache consistency: add `version.json` runtime manifest and normalize `cachebust` URL parameter to the active asset version.
- Version safety: add minimum supported app version gate (`minSupportedVersion` / `minAppVersion` in `config`) with blocking fullscreen prompt.
- Runtime control: enforce the same version gate both at game init and during periodic config refresh.

## v3.14.3 - 2026-05-20
- Duration display: add day count to long captures (>24h) showing format "Xj Yh Zmin".
- Data consistency: add rollback protection in capture flow when event insertion fails.
- Auth hardening: add explicit error handling for session token updates on login.

## v3.14.2 - 2026-05-19
- Flash mode map: keep already-taken flash treasures visible as archive points with a distinct color.
- Team process: add cache-buster and QA release convention in CONTRIBUTING.
- Versioning process: document SemVer + release steps (bump, changelog, tag, QA).

## v3.14.1 - 2026-05-19
- Runtime refactor: externalize CSS from index and switch runtime loading to modular scripts.
- Scores: add social sharing from leaderboard card (native share + clipboard fallback).
- Compatibility: add fallback for environments missing `treasures.activated_at`.

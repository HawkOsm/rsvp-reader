# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning:
[Semantic Versioning](https://semver.org/) — one version number, kept in sync
across `package.json`, `src-tauri/tauri.conf.json` and
`android/app/build.gradle`'s `versionName` (see DECISIONS.md's Phase 9 log).

## [Unreleased]

Nothing yet.

## [0.1.0] — one-codebase migration, in progress on `next`

The TypeScript rewrite described in the migration plan, replacing the
separate PyQt6, JavaScript-PWA and Kotlin codebases with one shipped to
web, desktop (Tauri) and Android (Capacitor). Not yet merged to `main` —
still on the `next` branch pending the Phase 10 real-world usage check.

### Added

- Core RSVP engine ported from `rsvp_engine.py`/`text_extract.py`
  (tokenizer, pacing, ORP, drift-corrected playback), verified against the
  Python originals with golden-fixture parity tests
- Dexie (IndexedDB) storage layer mirroring the old SQLite schema
- TXT/PDF/EPUB parsers running in a Web Worker
- React UI: library, RSVP reader (canvas word display), book/reflow mode
  with a PDF page panel, settings, keyboard shortcuts, touch controls,
  screen wake lock
- Gutendex search and import, with a CORS-proxy fallback for Gutenberg
  file downloads on web
- PWA support (installable, offline app shell, prompt-to-update)
- Tauri desktop shell (Linux `.deb`/`.rpm`/AppImage verified building
  locally; Windows/macOS via CI)
- Capacitor Android shell (JS/Gradle-config side complete; no local
  Android SDK to verify an actual build — see DECISIONS.md's Phase 8 log)

### Changed

- License: stayed GPL-3.0-or-later end to end (decided explicitly in
  Phase 9, rather than relicensing the new code to something permissive)

## Earlier: PyQt6 / web / Kotlin (pre-migration)

See `git log` on the `v-legacy` tag for the prior desktop (PyQt6), web
(vanilla JS PWA) and Android (Kotlin) codebases this migration replaces.

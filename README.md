# RSVP Reader

**A local speed reader.** Words from a document are flashed one at a time at
a fixed screen position, so your eyes never move across the page. When you
want to read normally instead, it reflows into columns or shows the real PDF
page.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![CI](https://github.com/HawkOsm/rsvp-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/HawkOsm/rsvp-reader/actions/workflows/ci.yml)

Each word is aligned by its **Optimal Recognition Point** — one letter,
slightly left of centre, is highlighted and pinned to the exact same pixel for
every word, so there is no horizontal drift to track.

One TypeScript codebase, built for four targets: the web (installable PWA),
desktop (Linux/Windows/macOS, via [Tauri](https://tauri.app)), and Android
(via [Capacitor](https://capacitorjs.com)). This replaced three separate
codebases — a PyQt6 desktop app, a vanilla-JS PWA, and a native Kotlin
Android app — kept around, untouched, on the [`legacy`
branch](https://github.com/HawkOsm/rsvp-reader/tree/legacy) and the
`v-legacy` tag. `DECISIONS.md` in this repo is the running log of *why* the
new codebase is built the way it is, including where it still falls short of
the old one and exactly what's unverified.

### What it does

- **RSVP playback** at 50–1500 WPM, live-adjustable, with pacing that slows
  for long words, punctuation and paragraph breaks
- **ORP alignment** computed from real font metrics (canvas
  `measureText`), so the focus letter lands on the same pixel for every word
- **Book mode** — PDFs render their real pages; text and EPUB files reflow
  into book-shaped columns, current word highlighted, click any word to jump
- **Library with resume** — IndexedDB-backed, remembers your place in every
  document and prompts to continue
- **Fully local.** No account, no telemetry. Your files and reading
  positions never leave the device.

## Where to get it

- **Web (PWA)** — **[hawkosm.github.io/rsvp-reader](https://hawkosm.github.io/rsvp-reader/)**
  once deployed (see `DECISIONS.md`'s Phase 6 log for the current, deliberately-not-yet-live
  state of that cutover). Installable to the home screen on iOS/Android,
  and to the dock/taskbar on desktop; works offline after first load.
- **Desktop (Linux/Windows/macOS)** — `.deb`/`.rpm`/AppImage/`.msi`/`.dmg`
  installers, attached to each [release](https://github.com/HawkOsm/rsvp-reader/releases)
  once one is cut. Built with Tauri: a few MB, not the ~100 MB the old PyQt6
  build was, since it uses the OS's own webview instead of bundling one.
- **Android** — an APK attached to each release, same sideloading caveats
  as before (not on the Play Store; Android will ask you to allow installs
  from the source). Declares no permissions at all, like the old Kotlin app.
- **iPhone** — the PWA is the only option, same as before: Apple doesn't
  allow sideloading, and native iOS needs a Mac, Xcode, and a $99/year
  developer account just to try.

## Building it yourself

```bash
git clone https://github.com/HawkOsm/rsvp-reader.git
cd rsvp-reader
pnpm install
pnpm dev          # web dev server
pnpm build        # production web build, in dist/
pnpm test         # full test suite
```

Desktop, via [Tauri](https://tauri.app/start/prerequisites/) (needs Rust +
your OS's webview dev packages):

```bash
pnpm tauri build
```

Android, via [Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup)
(needs the Android SDK and a JDK Gradle actually supports — see
`DECISIONS.md`'s Phase 8 log for a real gotcha there):

```bash
pnpm build && npx cap sync android
cd android && ./gradlew assembleDebug
```

## Keyboard shortcuts

Unchanged from the previous version — same keys, same behavior, ported
directly.

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Back / forward one word |
| `Shift`+`←` / `→` | Back / forward ten words |
| `↑` / `↓` | Speed up / down by 25 WPM |
| `Home` / `End` | Jump to start / end |
| `P` | Show / hide the page panel |
| `B` | Book mode / back to RSVP |
| `Esc` | Back to the library |
| `Ctrl+L` | Library |
| `Ctrl+O` | Add book |

In book mode:

| Key | Action |
| --- | --- |
| `Space` / `→` / `↓` | Onward a word/page |
| `←` / `↑` | Back the same way |
| `PgUp` / `PgDn` | Turn the page regardless |
| `Home` / `End` | First / last page |

The progress bar is clickable and draggable — scrub it to jump anywhere in
the document. WPM is live-adjustable while playing; the new rate takes
effect on the next word. Touch: tap the middle to play/pause, tap the left
and right edges to step a word.

## Resuming

Your position is written every 20 words, and again whenever you pause, go
back to the library, hide the tab, or close the app. Re-opening a book
you're partway through asks whether to **Resume**, **Start over**, or
**Cancel**.

## Pacing

Base delay is `60000 / WPM` milliseconds per word, adjusted by:

| Condition | Effect |
| --- | --- |
| Word longer than 6 characters | `+30 ms` per extra character |
| Ends in `,` `;` `:` `—` | × 1.5 |
| Ends in `.` `!` `?` `…` | × 2.5 |
| Last word of a paragraph | `+350 ms` flat |

Trailing quotes and brackets are looked past, so `said."` still counts as a
sentence end. The constants live in `src/core/pacing.ts`.

## Where your data lives

IndexedDB, in the browser/webview's own per-origin storage — no server, no
account. Mirrors the old SQLite schema's shape (`DECISIONS.md`'s Phase 2 log
has the exact differences and why): a `books` table, a `tokens` table (the
whole word list per book, so a large PDF never re-parses), a `progress`
table (word index, WPM, mode — separate so frequent saves don't touch the
book list), a `settings` table, and a `files` table (the original bytes, for
offline PDF rendering — there's no file path to reopen later on the web, so
this is new since the desktop version).

If you already used the previous web version at this same URL: opening the
new app upgrades your existing library in place, automatically — no export
step needed. See `DECISIONS.md`'s Phase 10 log for exactly how, and how
it's tested.

## Layout

| Path | Purpose |
| --- | --- |
| `src/core/` | The engine: tokenizer, pacing, ORP, playback — no DOM, ported from `rsvp_engine.py`/`text_extract.py` |
| `src/storage/` | Dexie (IndexedDB) library, mirroring the old SQLite schema |
| `src/parse/` | TXT/PDF/EPUB parsers, running in a Web Worker |
| `src/ui/` | React: screens, components, hooks |
| `src-tauri/` | The desktop shell (Rust) |
| `android/` | The Android shell (generated by Capacitor — don't hand-edit; re-run `npx cap sync android`) |
| `tests/fixtures/` | Sample books (PDF/EPUB) used across the test suite |
| `DECISIONS.md` | Why the codebase is built the way it is — the most detailed doc in this repo |
| `THIRD_PARTY.md` | Dependency license audit |

## Contributing

Issues and pull requests are welcome. `pnpm lint`, `pnpm exec tsc -b`, and
`pnpm test` should all stay clean — `pnpm build` too, before anything gets
merged.

## Licence

**GNU General Public License v3.0 or later** — see [LICENSE](LICENSE).

The previous version's GPL/AGPL requirement came from PyQt6 and PyMuPDF,
which this stack no longer uses — the new code's dependencies are all
permissively licensed (see `THIRD_PARTY.md` for the full audit: MIT,
Apache-2.0, and a handful of other permissive licenses, nothing copyleft).
Relicensing to something permissive was a real, available option at that
point; the project stayed GPL-3.0-or-later anyway, as a deliberate choice
rather than a dependency forcing it — see `DECISIONS.md`'s Phase 9 log.

You may use, study, share and modify this program freely. If you distribute
a modified version, you must release your source under the same licence, so
that whoever receives it keeps the same freedoms.

Copyright © 2026 Osman Sahin Guler.

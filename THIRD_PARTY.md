# Third-party licenses

This project (`src/`, `src-tauri/`) is GPL-3.0-or-later — see [LICENSE](LICENSE).
Keeping that license end to end (rather than relicensing to something
permissive, which the new TS/Rust stack would otherwise allow — see
DECISIONS.md's Phase 9 log) meant one thing to actually check: that every
dependency's license permits being distributed as part of a GPL-3.0-or-later
work. All of them do — everything below is MIT/Apache-2.0/BSD/ISC/MPL-2.0/
Zlib/Unicode-3.0 or a dual license that includes one of those, which the
[FSF's own compatibility guidance](https://www.gnu.org/licenses/license-list.html)
treats as GPL-compatible.

## How this was checked

```bash
# npm/pnpm production dependencies
npx license-checker-rseidelsohn --summary --production

# Rust dependencies (from src-tauri/)
cargo install cargo-license --locked
cargo license
```

Re-run both whenever dependencies change, particularly before a release —
this file is a snapshot, not something CI re-verifies automatically yet
(a natural fit for the license-check step in `.github/workflows/build.yml`
Phase 9 already added; not yet made to fail the build on a license change,
since that needs a maintained allow-list to compare against first).

## Direct npm/pnpm dependencies (production)

| Package                          | Version | License            |
| --------------------------------- | ------- | ------------------- |
| @capacitor/android                | 8.5.2   | MIT                  |
| @capacitor/app                    | 8.1.1   | MIT                  |
| @capacitor/core                   | 8.5.2   | MIT                  |
| @capacitor/splash-screen          | 8.0.2   | MIT                  |
| @capacitor/status-bar             | 8.0.3   | MIT                  |
| @tauri-apps/api                   | 2.12.0  | Apache-2.0 OR MIT    |
| @tauri-apps/plugin-fs             | 2.6.0   | MIT OR Apache-2.0    |
| @tauri-apps/plugin-http           | 2.7.0   | MIT OR Apache-2.0    |
| @tauri-apps/plugin-window-state   | 2.5.0   | MIT OR Apache-2.0    |
| dexie                              | 4.4.6   | Apache-2.0           |
| jszip                              | 3.10.2  | MIT OR GPL-3.0-or-later (used under the MIT term) |
| pdfjs-dist                         | 5.7.284 | Apache-2.0           |
| react / react-dom                  | 19.3.0  | MIT                  |
| react-router / react-router-dom    | 7.18.4  | MIT                  |
| workbox-core / workbox-window      | 7.4.1   | MIT                  |
| zustand                            | 5.0.15  | MIT                  |

(Transitive dependencies of the above — `pako`, `readable-stream`, `cookie`,
etc. — are all MIT/ISC/0BSD/`(MIT AND Zlib)`; full list via the
`license-checker-rseidelsohn` command above.)

## Rust dependencies (src-tauri/)

474 crates at last count (mostly transitive, pulled in by `tauri`,
`webkit2gtk`, and the plugin crates) — far too many to hand-list here
without this file going stale immediately. License *types* present, per
`cargo license`: MIT, Apache-2.0, BSD-3-Clause, ISC, MPL-2.0, Zlib,
Unicode-3.0, CDLA-Permissive-2.0, and dual/triple combinations of those
(e.g. `Apache-2.0 OR MIT OR Zlib`). No crate is GPL/AGPL/copyleft-only.
Run `cargo license` from `src-tauri/` for the full, current, per-crate list.

## Fonts and icons

The app's own icon (`share/rsvp-reader.svg` and its generated PNG/ICO/ICNS
variants) is this project's own work, under the same GPL-3.0-or-later
license as the rest of the repo — not third-party.

# Third-party licenses

This project (`src/`, `src-tauri/`) is GPL-3.0-or-later — see [LICENSE](../LICENSE).
Every dependency's license has to permit being distributed as part of a
GPL-3.0-or-later work. All of them do. Everything below is MIT/Apache-2.0/
BSD/ISC/MPL-2.0/Zlib/Unicode-3.0 (or a dual license that includes one of
those), which the
[FSF's own compatibility guidance](https://www.gnu.org/licenses/license-list.html)
treats as GPL-compatible — with **one copyleft exception, MuPDF** (below).

## MuPDF is AGPL-3.0-or-later

`mupdf` (Artifex's MuPDF compiled to WebAssembly) reads and draws every PDF.
It is the same engine PyMuPDF wrapped, and carries the same licence:
AGPL-3.0-or-later (or a commercial licence from Artifex).

- **It is compatible with this project.** GPLv3 section 13 and AGPLv3 section
  13 explicitly allow combining the two, so the app is distributed under
  GPL-3.0-or-later. Section 13 of GPLv3 also says the AGPL's network terms
  apply to the combination as such: if someone offers a _modified_ build as a
  service that users interact with over a network, they must offer those users
  its source. This project runs nothing server-side, but a host of the PWA is
  in that position if they modify it.
- **Distributing the app conveys MuPDF.** The installers, the APK and a
  hosted PWA each contain MuPDF's compiled WebAssembly, so the corresponding
  source has to be available to recipients (GPLv3 section 6): this repository
  for the app, <https://github.com/ArtifexSoftware/mupdf.js> and
  <https://mupdf.com> for MuPDF at the version in the table below. Settings
  carries the same notice in the app.
- **It limits relicensing the distributed app.** Everything this project
  wrote could be licensed more permissively, but an app that includes MuPDF
  still has to meet the AGPL, unless Artifex's commercial licence is bought or
  MuPDF is replaced.

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

| Package                         | Version | License                                                                       |
| ------------------------------- | ------- | ----------------------------------------------------------------------------- |
| @capacitor/android              | 8.5.2   | MIT                                                                           |
| @capacitor/app                  | 8.1.1   | MIT                                                                           |
| @capacitor/core                 | 8.5.2   | MIT                                                                           |
| @capacitor/splash-screen        | 8.0.2   | MIT                                                                           |
| @capacitor/status-bar           | 8.0.3   | MIT                                                                           |
| @tauri-apps/api                 | 2.12.0  | Apache-2.0 OR MIT                                                             |
| @tauri-apps/plugin-fs           | 2.6.0   | MIT OR Apache-2.0                                                             |
| @tauri-apps/plugin-http         | 2.7.0   | MIT OR Apache-2.0                                                             |
| @tauri-apps/plugin-window-state | 2.5.0   | MIT OR Apache-2.0                                                             |
| dexie                           | 4.4.6   | Apache-2.0                                                                    |
| jszip                           | 3.10.2  | MIT OR GPL-3.0-or-later (used under the MIT term)                             |
| linkedom                        | 0.18.14 | ISC                                                                           |
| mupdf                           | 1.28.1  | **AGPL-3.0-or-later** (see above)                                             |
| tesseract.js                    | 7.0.0   | Apache-2.0                                                                    |
| tesseract.js-core               | 7.0.0   | Apache-2.0                                                                    |
| @tesseract.js-data/eng, /tur    | 1.0.0   | MIT (package); the trained models are tesseract-ocr/tessdata_best, Apache-2.0 |
| react / react-dom               | 19.3.0  | MIT                                                                           |
| react-router / react-router-dom | 7.18.4  | MIT                                                                           |
| workbox-core / workbox-window   | 7.4.1   | MIT                                                                           |
| zustand                         | 5.0.15  | MIT                                                                           |

(Transitive dependencies of the above — `pako`, `readable-stream`, `cookie`,
etc. — are all MIT/ISC/0BSD/`(MIT AND Zlib)`; full list via the
`license-checker-rseidelsohn` command above.)

## Rust dependencies (src-tauri/)

528 crates at last count (mostly transitive, pulled in by `tauri`,
`webkit2gtk`, and the plugin crates) — far too many to hand-list here
without this file going stale immediately. License _types_ present, per
`cargo license`: MIT, Apache-2.0, BSD-3-Clause, ISC, MPL-2.0, Zlib,
Unicode-3.0, CDLA-Permissive-2.0, and dual/triple combinations of those
(e.g. `Apache-2.0 OR MIT OR Zlib`). No crate is GPL/AGPL/copyleft-only.
Run `cargo license` from `src-tauri/` for the full, current, per-crate list.

Added for desktop sync sign-in (all `Apache-2.0 OR MIT`): `keyring` (the OS keychain, with
`secret-service`/`dbus-secret-service` on Linux), `ureq` (HTTPS to Google's token endpoint,
with `rustls`, `Apache-2.0 OR ISC OR MIT`, and `ring`, `Apache-2.0 AND ISC`) and
`tauri-plugin-opener` (the system browser). Licence types they brought in, each an option
alongside MIT or Apache-2.0: `MIT OR Unlicense`, `Apache-2.0 OR CC0-1.0 OR MIT-0`,
`Apache-2.0 OR LGPL-2.1-or-later OR MIT`.

## Fonts and icons

The app's own icon (`assets/icon.svg` and its generated PNG/ICO/ICNS
variants) is this project's own work, under the same GPL-3.0-or-later
license as the rest of the repo — not third-party.

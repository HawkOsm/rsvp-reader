# Decisions

Why the new codebase is built the way it is. Add to this as decisions are made;
don't rewrite history here, append.

| Area    | Choice                           | Why                                                          |
| ------- | --------------------------------- | ------------------------------------------------------------ |
| Language | TypeScript, strict mode           | Catches parsing and storage bugs; reads well on a portfolio  |
| UI      | React + Vite, canvas for the focus word | Already used in `web/` (React + Vite + Tailwind)       |
| Storage | Dexie (IndexedDB)                 | Same code in browser, Tauri and Capacitor                    |
| PDF     | pdf.js in a Web Worker            | Apache-2.0, gives word positions for the page panel           |
| EPUB    | epub.js or JSZip + DOMParser      | Works offline in every shell                                  |
| Tests   | Vitest                            | Runs the parity tests against Python output                   |
| Desktop | Tauri 2                           | Small installers, Rust shell                                  |
| Android | Capacitor                         | Wraps the same web build                                      |
| iPhone  | PWA only                          | Native needs a Mac and Apple's $99/year fee                    |
| Book sources | Gutendex + local import      | Free, legal, no scraping                                      |

## Phase 0 log

- Tagged the pre-migration state `v-legacy` (PyQt `main.py`/`ui/`, the old `web/`
  PWA, and the Kotlin `android/` app as they stood on 2026-09-28). The migration
  lives on a `next` branch in the same repo rather than a separate repo, so
  history stays linear; `main` keeps shipping the old GitHub Pages PWA until
  Phase 6 replaces it.
- Scaffolded with `pnpm create vite` (react-ts template). The scaffold ships
  `oxlint` by default now instead of ESLint — swapped it for ESLint + Prettier
  since the plan calls for those explicitly and the rest of the toolchain
  (typescript-eslint, eslint-plugin-react-hooks) assumes ESLint's config
  format.
- Tailwind wired in via `@tailwindcss/vite` (v4, CSS-first — no `tailwind.config.js`
  needed for the default setup) rather than the older PostCSS plugin route.
- `strict` and `noUncheckedIndexedAccess` added to both `tsconfig.app.json` and
  `tsconfig.node.json`.
- Vitest configured inside `vite.config.ts` (via `vitest/config`'s
  `defineConfig`) with `environment: 'jsdom'`, rather than a separate
  `vitest.config.ts`, so there's one source of truth for the Vite plugins.
- `create-vite`'s default versions (Vite 8 + `@vitejs/plugin-react` 6, which
  requires Vite 8) don't line up with the Vitest most people would reach for
  (3.x only peers up to Vite 7) — pinned to Vitest `^5.0.2` instead, whose
  peer range covers Vite 8. Confirmed a single resolved `vite` version with
  `pnpm why vite` before trusting `tsc -b`, `eslint`, `vite build` and
  `vitest run` all actually pass.
- Test fixtures in `tests/fixtures/`:
  - `stevenson-jekyll-and-hyde.txt` — short TXT (~160 KB), Project Gutenberg #43
  - `melville-moby-dick.txt` — long TXT (~1.2 MB), Project Gutenberg #2701
  - `austen-pride-and-prejudice.epub` — EPUB (no-images variant, ~550 KB),
    Project Gutenberg #1342
  - `two-column-text.pdf` — synthetic 2-column PDF generated with `reportlab`
    from the Jekyll & Hyde text, exercising multi-column reading order
  - `hyphenated-line-breaks.pdf` — synthetic PDF with hand-placed line-end
    hyphens (`extraor-\ndinary`, `under-\nstand`, etc.), exercising the
    hyphen-rejoin logic in `tokenize.ts`

  The two PDFs are generated rather than sourced, because finding a real
  public-domain PDF that reliably exercises both column order and line-end
  hyphenation on command is unreliable; a synthetic fixture guarantees the
  edge case is actually present and lets the fixture-generation script
  (`tests/fixtures/generate_pdfs.py`, needs `reportlab` — not in
  `requirements.txt` since it's a fixture-only dev tool) be re-run if more
  coverage is needed.

## Phase 1 log

- `src/core/{tokenize,pacing,orp,engine}.ts` port `text_extract.py`'s
  `normalize()`/`tokenize()` and `rsvp_engine.py`'s `delay_for()`/
  `orp_index()`/`RsvpEngine` word for word. `src/core/unicode.ts` holds
  codepoint-aware helpers (`stripChars`, `isAlnum`, ...) so JS string
  indexing — which counts UTF-16 code units — doesn't drift from Python's,
  which counts codepoints.
- **Golden fixtures** (`tests/parity/*.json`) come from
  `tests/parity/generate_fixtures.py`, which imports `rsvp_engine.py` and
  `text_extract.py` directly and dumps `{text, paraEnd, orp, delayMs}` per
  token at 300 and 600 WPM. Re-run it (`.venv/bin/python
  tests/parity/generate_fixtures.py`) whenever the Python engine or these
  fixture source books change.
  - Dumping every token of Moby-Dick was a 31 MB JSON file — too big to
    commit sensibly. Fixtures longer than 4000 tokens are sampled: the
    first ~3800 tokens (where most punctuation/pacing cases show up) plus
    the last 200 (to keep the true end-of-book `paraEnd` covered), with
    `totalTokenCount`/`headCount`/`tailCount` in the JSON so
    `tests/parity/txt.parity.test.ts` can still assert the *full* TS token
    count matches Python's, even though only the sampled slice is compared
    token-by-token.
  - Only the two TXT books are consumed by a parity test so far — `tokenize.ts`
    has no PDF-extraction counterpart yet (that's `pdf.js` in Phase 3, a
    different algorithm entirely from PyMuPDF's `tokenize_pdf()`). The two
    PDF fixtures are dumped now and will be compared once that parser exists.
- **ORP rule for non-Latin text, decided now rather than deferred**: no
  `Intl.Segmenter`/grapheme clustering. `orp_index()` in Python indexes by
  Python `str` codepoints, and Turkish `ı`/`ğ` are each already a single
  codepoint, so Python's existing behavior already treats them as one
  letter each — grapheme clustering would only matter for base+combining-mark
  sequences, which Python's version doesn't handle specially either. Matching
  codepoint-for-codepoint (via `Array.from`/`unicode.ts`) keeps the TS port in
  exact parity with the Python original; reaching for `Intl.Segmenter` would
  make the *port* more sophisticated than the thing it's supposed to match,
  which isn't the goal of a parity port.
- **Engine timing**: `engine.ts` takes injectable `now`/`setTimer`/`clearTimer`
  (defaulting to `performance.now`/`setTimeout`/`clearTimeout`) specifically
  so `tests/core/engine.test.ts` can drive it with a hand-rolled clock rather
  than `vi.useFakeTimers()` — Vitest's fake timers fire a callback at its own
  scheduled instant no matter how far you advance the clock, so they can't
  express "this callback actually ran later than it was scheduled for" (tab
  throttling, a busy main thread, GC pause), which is the real-world case
  drift correction exists for. The 100-words-at-600-WPM timing tolerance test
  does use `vi.useFakeTimers()` (with `performance` in `toFake`), since it
  only needs elapsed-time accuracy, not a way to inject lateness.

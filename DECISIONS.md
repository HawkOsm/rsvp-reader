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

## Phase 2 log

- `src/storage/schema.ts` mirrors `db.py`'s two tables but isn't a literal
  copy — three real differences, each forced by moving off SQLite/a
  filesystem:
  - **`tokens` is one Dexie row per book**, holding the whole token array as
    its value, instead of one SQL row per word. `db.py`'s comment already
    says the per-word design is what it is because SQLite needs rows;
    IndexedDB doesn't, so there's no reason to pay N inserts per book.
  - **`progress` is a separate table** (`bookId, wordIndex, wpm, mode,
    updatedAt`) instead of a `last_index` column on `books`, because it's
    the row saved on every ~20 words / pause / tab-hide (Phase 4), and
    splitting it out means those frequent writes don't touch the `books`
    row the library list reads from.
  - **No `path` column.** There's no stable file path on web to key off of,
    so `books.fingerprint` (`v<CACHE_VERSION>:<size>:<lastModified>`, from
    `fingerprintOf(file: File)`) is what `addBook()` dedups local imports
    by; a Gutendex import dedups by `sourceId` instead, since re-fetching
    the same remote book can yield slightly different bytes (and so a
    different fingerprint) than the first import produced.
  - `settings` (key/value) and `files` (original bytes, for offline PDF
    rendering) are both new — `db.py` has no equivalent of either, since the
    desktop app keeps settings in Qt's own config and always has the
    original file on disk.
- **Migration test**: `schema.ts` is still only at version 1, so
  `tests/storage/migration.test.ts` doesn't test *the* schema — it defines
  its own inline v1/v2 Dexie classes to prove Dexie's
  `.version(2).stores({...}).upgrade(...)` mechanism actually carries old
  rows forward in this project's setup (Dexie + fake-indexeddb). Replace the
  inline classes with the real schema once it grows an actual version 2.
- **fake-indexeddb + jsdom can't round-trip a `Blob`.** Storing a `Blob` via
  Dexie/fake-indexeddb and reading it back came out as `{}` — not missing
  methods, an *empty plain object*, constructor `Object`. The cause:
  fake-indexeddb clones stored values with `structuredClone`, and whatever
  `structuredClone` shim jsdom's test environment installs doesn't
  recognize jsdom's own `Blob` class, so it falls through to a generic
  (property-copying) clone path and jsdom's `Blob` has no *own* enumerable
  properties (`size`/`type` are getters on the prototype) — nothing to
  copy. Node's native `Blob`/`File` (`node:buffer`) has no such gap and
  clones correctly, so `tests/setup.ts` swaps `globalThis.Blob`/`File` for
  Node's before any test runs. Real browsers, Tauri's webview and
  Capacitor's WebView all support `structuredClone`-ing a `Blob` natively —
  this only ever bit the test environment.
- **Backup format** (`src/storage/backup.ts`): one JSON file, base64-encoding
  any included file bytes so the whole thing stays a single document
  (`src/storage/base64.ts`, plain-JS chunked `btoa`/`atob` rather than
  Node's `Buffer`, so it also runs in the browser/Tauri/Capacitor). Tokens
  are deliberately left out of the backup — they're cheap to rebuild from
  the source (an included file, a re-added local file matched by
  fingerprint, or a Gutendex re-fetch by `sourceId`) and would otherwise
  make the backup as large as the whole library.

## Phase 3 log

- **pdf.js is pinned to `^5.4.149`, resolving to `5.7.284`, and imported from
  its `legacy` build.** The current `pdfjs-dist@6.x` dropped the `legacy`
  build entirely and its modern build calls `Uint8Array.prototype.toHex()`,
  a very recent engine feature — `Uint8Array.prototype.toHex` doesn't exist
  even in plain Node 24 here, and opening any PDF threw
  `hashOriginal.toHex is not a function` before a single page was read. The
  `legacy` build (still shipped by `5.x`) has no such requirement and is
  the safer choice anyway given the plan's own flagged risk around
  WebKitGTK (Phase 7) — broader engine compatibility, not just newer-is-better.
- **No nested pdf.js worker.** `getDocument()` normally spawns its own
  internal worker; since `parsePdf()` already only ever runs inside *our*
  `parse.worker.ts` (Phase 3's shared worker), there's no separate
  `pdf.worker.mjs` to bundle or offline-serve — pdf.js just runs on the
  calling (our worker's) thread, which keeps the UI thread unblocked either
  way. This also means there's nothing to configure for Tauri/Capacitor
  offline use, unlike the plan's original "bundle the pdf.js worker file"
  wording assumed.
- **PDF word extraction is a heuristic, not exact.** pdf.js's
  `getTextContent()` returns style *runs* (`TextItem`), not words — most
  PDF generators (including this project's own fixtures) emit a whole line
  as one run with real spaces inside it, so splitting on whitespace
  recovers most words directly (`src/parse/pdf/lines.ts`). A word's bbox is
  a *proportional* estimate from the run's total width, not real glyph
  metrics — fine for a highlight rectangle or click-to-jump target, not
  pixel-accurate. Two runs with no whitespace between them and no real
  horizontal gap are glued into one word (a font/style change mid-word);
  this only operates within one line, never across a line break — that's a
  separate concern:
  - **Hyphen rejoin** (`src/parse/pdf/flatten.ts`) uses the same heuristic
    as `rsvp_engine.py`'s `tokenize_pdf()`: a line-final hyphen followed by
    a lowercase start on the next line means the hyphen only existed to
    break the line (drop it, join); anything else is treated as a real
    hyphen (kept). This is a known-imperfect heuristic in *both*
    implementations — `tests/parse/pdf.test.ts`'s hyphenated fixture
    documents two cases (`self-same` -> `selfsame`, `half-remembered` ->
    `halfremembered`) where the heuristic reads a real compound as a
    line-break artifact. That's the heuristic doing what it's defined to
    do, not a bug — Python's version would make the identical call on the
    identical input.
  - **Multi-column reading order** (`src/parse/pdf/columns.ts`) clusters
    lines by left-edge (`x0`) position (single-linkage, threshold scaled to
    page width) rather than real layout analysis. Works for the common
    case; can be fooled by heavily indented or ragged-left layouts. There's
    no PyMuPDF "block" concept to lean on here the way `tokenize_pdf()`
    does for paragraph breaks, so **paragraph-break detection**
    (`paragraphs.ts`) is its own heuristic too: a page/column turn always
    breaks; otherwise a line-to-line vertical gap noticeably bigger than
    the page's own median gap does.
  - **Header/footer stripping** (`repeats.ts`) is new — `db.py`/PyMuPDF's
    version has no equivalent. A page's first or last line gets dropped if
    that same (page-number-digits-normalised) line appears on at least half
    the document's pages.
  - Together, these are why the *golden* PDF fixtures generated in Phase 1
    (`tests/parity/two-column-text.json`, `hyphenated-line-breaks.json`)
    were never meant to be compared token-for-token against the TS PDF
    parser — pdf.js's layout model is fundamentally different from
    PyMuPDF's. What *does* match Python exactly: the two-column fixture's
    **total token count** (2200, both sides) — strong independent evidence
    the extraction is sound even though the algorithms differ completely.
- **EPUB chapter titles**: Project Gutenberg's own EPUB conversions
  sometimes embed an illustration's caption *inside* the following
  chapter's `<h2>` itself (`<span class="caption">...</span>` nested in the
  heading) — found by testing against the real `austen-pride-and-prejudice`
  fixture, not something that would show up in a hand-written test HTML
  snippet. `extractBlocks()` strips any `.caption`-classed element from a
  block before reading its text, alongside the footnote-marker (`[12]`)
  stripping the plan already called for.
- **Text extraction fallback encoding is windows-1254, not latin-1.**
  `text_extract.py` tries utf-8, utf-8-sig, then latin-1 (which never
  actually fails — it's a full 256-byte-value mapping, so it was really
  functioning as "give up gracefully", not a real Turkish-text fallback).
  The *plan* asks for windows-1254 specifically for old Turkish files, so
  that's what `parseTextFile()` does; being a real single-byte encoding
  with genuine invalid sequences, `TextDecoder('windows-1254')` can still
  fail to be the *right* answer for some other legacy encoding, but it's a
  closer match to the stated intent than latin-1 was.
- **Cancellation** is plumbed through as a standard `AbortSignal` end to
  end (`parseFile` -> `parsePdf`/`parseEpub`, checked once per page/spine
  document — coarse-grained, not mid-page, since that's the natural unit of
  work each parser already progress-reports at) rather than a bespoke
  cancel token type.
- **`src/parse/client.ts` (the worker-communication layer) has no unit
  tests.** jsdom has no real Web Worker implementation, and the file is
  thin postMessage plumbing around `parseFile()` (in `index.ts`), which has
  full coverage. Confirmed the Vite worker-bundling itself works — `new
  Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module'
  })` — with a throwaway smoke build (temporarily importing `client.ts`
  from `main.tsx`, confirming pdf.js + JSZip + the parse logic all land in
  a separate `parse.worker-*.js` chunk, then reverting the import); full
  runtime verification (progress bar, cancel button) happens once Phase 4
  wires a real "Add book" flow up to it.

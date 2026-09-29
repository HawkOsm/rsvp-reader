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

## Phase 4 log

- **Colors and the ORP display's exact geometry came straight from
  `ui/style.py` and `ui/reader_view.py`**, not redesigned: `FOCUS_X_RATIO =
  0.42`, `BASE_FONT_PX = 56`, the same two-pass shrink-to-fit (min 12px, 12px
  side margin), the same tick-mark guides, the same dark palette
  (`#16181d`/`#ff5a5f`/etc.). `src/ui/theme.ts` and `src/index.css` hold the
  same hex values in two places on purpose — canvas drawing needs plain
  JS values, Tailwind utilities need CSS custom properties, and duplicating
  nine small constants was simpler than routing canvas draws through
  `getComputedStyle()`. The light theme has no PyQt equivalent — new,
  picked for reasonable contrast against the same accent red.
- **Runtime dark/light switching with Tailwind v4** uses `@theme inline`
  mapping `--color-*` tokens to themselves (`--color-bg: var(--color-bg)`),
  so generated utilities like `bg-[var(--color-bg)]`-equivalent classes
  read a CSS custom property at paint time instead of a value baked in at
  build time — confirmed by switching the Settings theme selector live in
  the browser and watching the whole app repaint without a reload.
- **Keeping the token list out of React state**: `RsvpCanvas` and
  `TransportBar` each subscribe to the engine directly and hold their own
  local `useState` for just the piece they draw (current word; index/
  playing/wpm) — a step/play/pause only re-renders whichever of those two
  actually cares, never a shared parent. Both are wrapped in `React.memo`
  too, since `ReaderBody` itself re-renders on the wake-lock's
  playing-state change (needed there to drive `useWakeLock`), and without
  `memo` that would cascade into both children even though neither one's
  own props changed.
- **Found live, not by reading the code**: an early version of the ↑/↓ WPM
  shortcut called the Zustand store's `setWpm`, which only touched UI
  state — never `engine.setWpm()`. Typecheck, lint and the full test suite
  were all green, because nothing exercised the keyboard shortcut against
  a real running engine. It surfaced immediately when actually pressing
  ArrowUp in the browser and watching the WPM field not move. Fixed by
  having the shortcut call `engine.setWpm()` directly, removing the
  now-pointless `wpm`/`setWpm`/`currentBookId`/`setCurrentBook` fields from
  the store entirely, and giving the engine its own `'wpm'` event so
  `TransportBar` picks up a change made anywhere, not just from its own
  input. This is the reason `tests/ui/TransportBar.test.tsx` specifically
  covers "a WPM change made elsewhere" as its own case, and why component
  tests exist at all rather than trusting typecheck/lint alone for wiring
  bugs like this one.
- **Book mode is one page/reflow view, not the plan's fuller two-page
  spread + draggable side panel.** `PagePanel` picks `PdfPagePanel`
  (renders the current page via pdf.js, current word highlighted by its
  stored bbox — no click-to-jump; hit-testing a click against every word's
  proportional bbox on a rendered page is real extra work, left for later)
  or `TextReflowPanel` (CSS multi-column reflow, current word highlighted,
  click any word to jump — this one fully implements the plan's "click a
  word to jump" for text/EPUB). No draggable-width divider, no D (page
  layout)/F (fit) shortcuts, since single-page-at-a-time doesn't need
  them. `P` toggles this panel alongside RSVP mode; `B` switches to it
  full-screen.
- **`TextReflowPanel` renders a bounded window** (±1500 tokens around the
  current position, re-centering once the reader drifts >400 tokens from
  the window's center) rather than the whole book as one flow of per-word
  `<span>`s — a 200k-word book (Moby-Dick) would be 200k DOM nodes laid
  out at once otherwise.
- **Routing is `HashRouter`, not `BrowserRouter`**: this is a static
  export (GitHub Pages / Cloudflare Pages, Phase 6), so a hard refresh or
  a shared link to `/reader/5` needs to resolve without server-side
  rewrite rules. `HashRouter` keeps that working with zero server config,
  at the cost of a `#` in the URL — worth it for a client-only app with no
  backend to add rewrite rules to.
- **`Ctrl+O` (add book) and `Ctrl+L` (library) are split across two
  hooks**, not one shared table: `useGlobalShortcuts()` (Ctrl+L only,
  mounted once at the app root) needs no `EngineProvider`, while
  `useReaderKeyboardShortcuts()` (space/arrows/P/B/Esc) needs the engine
  and reading-mode state that only exist inside the reader. `Ctrl+O` lives
  as a tiny local listener in `LibraryScreen` itself, since only it holds
  the file-input ref to click. `Ctrl+Q` (quit) is skipped — meaningless in
  a browser tab; revisit for Tauri (Phase 7).
- **No "is this book's cached content still fresh" check on open.**
  `db.py`'s desktop app always has the original file on disk to re-stat;
  the storage layer already has `tokensAreFresh()` (Phase 2) for exactly
  this, but nothing calls it yet — the Reader screen trusts whatever
  tokens are already cached from import. Re-deriving tokens for a local
  file that changed after import needs the user to re-pick that file (no
  stable path on web to silently re-read), which is a real UI flow
  (probably from the library row's menu) not yet built. Fine for now:
  the common case (import once, read many times) works; the edit-after-
  import edge case doesn't yet.

## Phase 5 log

- **CORS test, run from a real page's `fetch()` in the browser (not
  `curl`, which doesn't enforce CORS and would give a false read) on
  2026-09-28:**
  - `gutenberg.org` book file downloads (`/cache/epub/<id>/pg<id>.txt`,
    `/ebooks/<id>.epub.noimages`) are **blocked by CORS** — confirmed
    cleanly: a normal `fetch()` throws `TypeError: Failed to fetch`, while
    the identical URL with `mode: 'no-cors'` succeeds (opaque response),
    which is the specific signature of "the server responded, the browser
    just won't hand the body to script because there's no
    `Access-Control-Allow-Origin`" rather than a network failure. This is
    exactly the risk the plan's own table already named.
  - `gutendex.com`'s search endpoint (`/books?search=...` or any other
    query string, e.g. `?languages=en`) **could not be cleanly tested** —
    every request with a `?` in the URL hung until timeout, in both `cors`
    and `no-cors` mode, while the bare path `/books` (no query string)
    resolved in ~200ms. A real CORS block fails fast; a real network
    outage would fail the bare path too. That specific pattern — query
    strings hang, everything else on the same host is fine, and an
    unrelated cross-origin host (`api.github.com`) works fine with real
    CORS headers — points at this sandbox's own browser tooling
    mishandling query strings for this host, not at `gutendex.com` itself.
    Documented honestly rather than guessed past: `src/sources/gutendex.ts`
    is written to call `fetch()` directly (consistent with Gutendex being
    a public API designed for exactly this, unlike Gutenberg's raw file
    host), but this needs a real re-check once the app is actually
    deployed and reachable from an unrestricted browser — flagged in the
    PR/README rather than silently assumed.
  - Net effect, matching the plan's own fallback exactly: search calls
    Gutendex directly; book *file* downloads go through a small
    allow-listed proxy (below) on web, and through Tauri's/Capacitor's
    native HTTP plugins once those shells exist (Phase 7/8), which skip
    browser CORS entirely.
- **`src/sources/proxy-worker.ts`**: the Cloudflare Worker source for that
  proxy — forwards only `GET` requests whose path matches
  `gutenberg.org`/`www.gutenberg.org` file paths, adds
  `Access-Control-Allow-Origin: *` to the response, and 403s anything else,
  so it can't become an open proxy. **Not deployed** — deploying it needs a
  Cloudflare account and `wrangler login`, neither of which exists in this
  environment (checked: `wrangler` isn't installed here at all). Deploying
  it is a one-time step for whoever owns the Cloudflare account:
  `npx wrangler deploy src/sources/proxy-worker.ts`, then set
  `VITE_GUTENBERG_PROXY_URL` to the resulting `*.workers.dev` URL. Until
  that happens, Gutendex *search* works but *importing* a found book over
  the web build will fail with a clear "couldn't download" error — the
  code path exists and is tested against the abstraction
  (`src/sources/http.ts`'s `httpGet()`), just not against a live proxy.
- **`requestJson()` (in `gutendex.ts`) times out after 15s**
  (`AbortSignal.timeout()`), found necessary while testing the Search
  screen live: whatever is going on with this sandbox's handling of
  query-string URLs to `gutendex.com` (above) left a real `fetch()` call
  hanging with no error and no response, ever — confirmed by watching the
  Search screen sit on "Searching…" indefinitely. A production app can't
  assume every network condition resolves either way in finite time, so
  the timeout stays regardless of whether that specific hang turns out to
  be sandbox-only.
- **Chapter list / a dedicated "About" screen from the plan's optional
  bullets were skipped for time.** The Gutenberg license note and source
  credit live as a footer line on the Search screen itself instead of a
  separate About screen — same information, no extra screen.

## Phase 6 log

- **Manifest and icons reused as-is from the old `web/` PWA**
  (`web/manifest.webmanifest`, `web/icons/icon-{192,512,512-maskable}.png`),
  copied into `public/icons/` rather than regenerated — same name, same
  `#16181d` theme color, same maskable icon, already correct. `vite-plugin-pwa`'s
  `manifest` option in `vite.config.ts` mirrors that file's fields exactly.
- **`registerType: 'prompt'`**, not `'autoUpdate'`: a new service-worker
  version must never silently reload mid-read (the plan's own requirement,
  matching the README's resume-position guarantees). `UpdatePrompt.tsx`
  uses `vite-plugin-pwa`'s `virtual:pwa-register/react` hook
  (`useRegisterSW()`) for the actual "reload now / later" banner, and an
  "offline ready" toast the first time the precache completes. Needed an
  explicit `workbox-window` dependency (`vite-plugin-pwa`'s React hook
  imports it, but doesn't declare it — the build fails with an unresolved
  import otherwise) and a `/// <reference types="vite-plugin-pwa/client" />`
  in `vite-env.d.ts` so TypeScript knows about the `virtual:pwa-register/react`
  module at all.
- **Service worker registration could not be verified live in this
  sandbox, and that's recorded honestly rather than assumed working.**
  Confirmed independently working: the manifest resolves and its three
  icons all 200 with the right content-type; `dist/sw.js` and the workbox
  runtime chunk are both syntactically valid (`node --check`); `curl`
  against `dist/sw.js` (served via `vite preview`) returns a completely
  ordinary `200 text/javascript` response — nothing about the file or its
  headers looks wrong. But `navigator.serviceWorker.register('/sw.js')`,
  run directly in the Browser pane against that same running preview
  server, fails every time with Chrome's generic `"An unknown error
  occurred when fetching the script"` — the same error whether triggered
  by the app's own `useRegisterSW()` or called by hand. Service worker
  registration is unusually strict about proxying/header rewriting (more
  so than a normal `fetch()`), and this environment's Browser pane likely
  proxies `localhost` preview traffic in a way that trips it — consistent
  with everything else about the response looking correct. This needs a
  real check in an unrestricted browser before relying on offline support
  actually working; noting it here rather than either claiming success or
  silently dropping the feature.
- **The new deploy workflow (`.github/workflows/deploy-app.yml`) is
  `workflow_dispatch`-only, not wired to `push: main` yet.** The existing
  `pages.yml` already deploys `web/` (the old PWA) to the *same* GitHub
  Pages site on every push to `main` — turning on a second workflow that
  also deploys to `main` right now would mean every ordinary commit to
  this feature branch's eventual merge could silently overwrite the
  currently-live, working PWA with a mid-migration build. That cutover
  (delete `pages.yml`, point this workflow at `push: main`) belongs at the
  Phase 10 "retire the old versions" step the plan already describes, once
  the new app has actually been used as a daily reader — not now. Until
  then this workflow exists, is reviewable, and can be run by hand from
  the Actions tab to sanity-check a real deploy without touching the live
  site's current content.

## Phase 7 log

- **No dialog plugin.** The plan calls for "the native file dialog to pick
  books," and it turns out a plain HTML `<input type="file">` — the same
  element the web build already uses (Phase 4) — already shows the real
  OS file picker once it's running inside Tauri's system webview
  (WebKitGTK/WebView2/WKWebView), with zero Tauri-specific code. Started
  by adding `tauri-plugin-dialog` per the plan's checklist wording, then
  removed it once this became clear — it would have been a second way to
  do something the existing code already does.
- **`fs` plugin is for one thing only: reading a file path passed on the
  command line** (`rsvp-reader ~/books/essay.pdf`), an explicit plan
  checklist item. Rust captures `std::env::args()` at launch
  (`src-tauri/src/lib.rs`) and hands it back once via a
  `pending_open_file` command — pull-based rather than a Tauri event,
  specifically to avoid a startup race between the frontend's listener
  attaching and Rust emitting before it's ready. `src/ui/tauri-open.ts`
  reads it into a `File` via `@tauri-apps/plugin-fs`, then feeds it
  through the exact same `importLocalFile()` pipeline the drag-and-drop
  and file-picker paths already use.
- **`http` plugin skips CORS entirely for Gutendex/Gutenberg**, as the
  plan expects — `src/sources/http.ts` now branches on `isTauri()` first,
  before the web proxy logic, so the whole "does gutenberg.org send CORS
  headers" question (Phase 5) simply doesn't apply inside Tauri. Scoped in
  `capabilities/default.json` to exactly `gutendex.com` and
  `*.gutenberg.org` — nothing else.
- **`window-state` plugin needed no application code at all** — just
  registering it in `lib.rs` is the entire feature (remembers window size
  and position across launches automatically).
- **Capabilities file only grants what's actually used**: `fs:allow-read-file`/
  `allow-read-text-file` scoped to `$HOME/**` (the CLI-open feature could
  reasonably point anywhere under the user's home directory — not root-level
  access), the three HTTP origins above, and `window-state:default`. No
  `dialog:*` permission, since nothing calls that plugin.
- **Identifier**: `io.github.hawkosm.rsvpreader` (was the `com.tauri.dev`
  placeholder) — reverse-DNS under the actual GitHub repo, the common
  convention for a project with no owned domain.
- **License left as GPL-3.0-or-later** in `src-tauri/Cargo.toml`, matching
  the repo's current top-level `LICENSE` — *not* pre-emptively switched to
  MIT/Apache-2.0. The plan's own Phase 9 explicitly treats relicensing (now
  legally possible, since the GPL/AGPL requirement came from PyQt6/PyMuPDF,
  neither of which this stack uses) as its own deliberate step; doing it
  piecemeal here, in one `Cargo.toml`, ahead of that decision would leave
  the repo in a half-relicensed state.
- **`tauri build` checks that the Rust crate and JS package for each
  plugin are on the same major.minor** — `cargo add tauri-plugin-http@2.7`
  looked like it pinned the Rust side to match `@tauri-apps/plugin-http`
  (2.7.0, the latest non-alpha), but `"2.7"` in Cargo.toml is a caret
  requirement (`>=2.7.0, <3.0.0`), so it happily resolved back to the
  newer 2.8.0 already in `Cargo.lock` and the build failed the version
  check again, identically, on the very next attempt. Needed `@=2.7.0`
  (exact) to actually pin it. `fs` and `window-state` matched their JS
  packages already, by luck of when each was last released.
- **Verified for real, not just `cargo check`**: `pnpm tauri build`
  (release) ran to completion locally (Arch Linux, WebKitGTK 4.1) and
  produced all three Linux targets:
  `rsvp-reader_0.1.0_amd64.deb` (6.07 MiB),
  `rsvp-reader-0.1.0-1.x86_64.rpm` (6.07 MiB), and
  `rsvp-reader_0.1.0_amd64.AppImage` (101 MiB — expected to be much
  bigger than the other two; unlike them it bundles its own WebKitGTK
  runtime instead of depending on the system's). The `.deb`/`.rpm` sizes
  are the actual point here: **6 MB versus the PyQt build's ~100 MB** —
  the exact win the plan named going in. Then launched the built binary
  directly (`./src-tauri/target/release/app`) against this machine's real
  Wayland session: it ran for several seconds with no crash and no error
  output before being stopped, which is as far as verification goes
  without either a user watching the window or `computer-use` access to
  actually interact with it — not attempted here, since granting that
  access wasn't asked for and the build/launch check already answers the
  question this phase needed answered (does it build, does it start).
  Windows and macOS builds need their own runners (GitHub Actions'
  windows-latest/macos-latest, per the existing `build.yml`, which Phase 9
  should extend to build Tauri instead of the old PyInstaller spec) —
  nothing to verify locally on Linux for those.

## Phase 8 log

- **The old Kotlin `android/` directory was renamed to
  `android-legacy-kotlin/`, in place, on `next`** — not deleted, not moved
  to a separate branch yet. Capacitor's tooling wants the path `android/`
  specifically and refuses to touch it if something's already there; the
  real archival (a `legacy/` branch, per the plan's Phase 10) is a
  deliberate later step, not something to improvise here just to clear a
  directory name. The existing `.github/workflows/android.yml` (old
  Kotlin CI, path-triggered on `android/**`) simply goes dormant on this
  branch as a result — nothing under that path exists here anymore for it
  to trigger on. Phase 9 should replace it with a Capacitor-based one.
- **`INTERNET` permission: kept, asked the user first.** The old Kotlin
  app's manifest declared zero permissions on purpose (its own comment:
  "the app cannot phone home"); Capacitor's default template adds
  `INTERNET` unconditionally, and unlike web/desktop, Android's WebView
  can't make *any* network request — including the Gutendex
  search/import feature from Phase 5 — without it being declared. This is
  a real, user-visible change from the old app's privacy stance, not a
  build detail, so it went through `AskUserQuestion` rather than being
  picked silently either way. Decided: keep it, so Gutendex works on
  Android like every other platform. `tools/check-android-permissions.sh`
  encodes that decision as a checkable allow-list (exactly `INTERNET`,
  nothing else) — the plan's "CI check that fails if the manifest gains
  any [permission]" adjusted for the fact that this app, unlike the old
  one, has a permission it's supposed to have; Phase 9 should wire this
  script into the CI workflow.
- **No dialog plugin here either** (see Phase 7's identical `<input
  type="file">` reasoning) — Capacitor's WebView shows the same native
  Android document picker for a plain HTML file input, no plugin needed.
- **No keep-awake plugin.** `useWakeLock` (Phase 4) already uses the
  standard Web Wake Lock API, which Android's WebView — real Chromium,
  auto-updated via Play Store — has supported since 2020 (Chrome 84).
  Adding `@capacitor-community/keep-awake` on top would be a second way to
  do something the existing code should already do on any reasonably
  current device; skipped for the same reason the Tauri dialog plugin was.
- **`CapacitorHttp: { enabled: true }`** (`capacitor.config.ts`) patches
  `window.fetch` to route through native networking — `src/sources/http.ts`
  needed *zero* code changes for Capacitor, unlike the explicit
  `isTauri()` branch Phase 7 needed (Tauri's plugin uses its own `fetch`
  export rather than patching the global one).
- **Icons and splash screens generated via `@capacitor/assets`** from
  `share/rsvp-reader.png` (the existing 512×512 project icon) — adaptive
  icons, all mipmap densities, and light/dark splash screens, 74 files
  from one source image and one command.
- **No signing keystore generated.** The plan calls for a real release
  keystore instead of the debug key — deliberately not done here. Unlike
  everything else in this phase, a release keystore is a permanent
  identity: Google Play requires the *same* key for every future update
  of an app, so generating one means choosing (and being responsible for
  never losing) a real password and identity, not a build artifact I
  should invent and hold on someone else's behalf. That command
  (`keytool -genkeypair -v -keystore release.keystore -alias rsvp-reader
  -keyalg RSA -keysize 2048 -validity 10000`) is for the repo owner to run
  themselves, whenever they're actually ready to sign a release build —
  along with backing up the resulting file somewhere durable, per the
  plan's own warning.
- **No actual Android build could be verified**, and it's worth being
  precise about exactly where it stops, since there are two independent
  blockers, not one: (1) no Android SDK is installed in this environment
  at all (same gap Phase 0 already flagged for Android Studio) — no
  `ANDROID_HOME`, no `sdkmanager`; and, found only by actually trying,
  (2) even the Gradle wrapper itself can't run here — this machine's only
  installed JDK is OpenJDK 27, and Gradle 8.14.3 (what Capacitor's
  template pins) fails immediately with `Unsupported class file major
  version 71` trying to compile its own Groovy build script under it,
  before ever reaching the point where the missing SDK would matter.
  Fixing either one (installing an older JDK system-wide, or downloading
  the multi-GB Android SDK and accepting its license) is a real
  environment change beyond what this session should do unprompted;
  documented rather than silently skipped. What *is* verified: `cap sync
  android` runs clean and picks up all three registered plugins, the
  generated `AndroidManifest.xml` has exactly the one intended permission,
  and the web build this all wraps has its own full test suite (177
  tests) passing.

## Phase 9 log

- **Licensing: asked the user, kept GPL-3.0-or-later end to end** rather
  than relicensing the new TS/Rust code to something permissive, even
  though the plan noted that's now legally possible (the GPL/AGPL
  requirement came from PyQt6/PyMuPDF, neither of which the new stack
  uses). Checked it was actually a free choice first: `license-checker-
  rseidelsohn` (npm, production deps) and `cargo license` (474 transitive
  Rust crates) both come back entirely permissive — MIT, Apache-2.0,
  BSD-3-Clause, ISC, MPL-2.0, Zlib, Unicode-3.0, CDLA-Permissive-2.0, or a
  dual/triple license that includes one of those — so every dependency is
  fine to redistribute inside a GPL-3.0-or-later work either way; the
  license choice really was just the user's call to make, not something
  a dependency forced. `THIRD_PARTY.md` records the audit and how to
  re-run it; `package.json` and `src-tauri/Cargo.toml` both now declare
  `GPL-3.0-or-later` explicitly (`package.json` had no `license` field at
  all before this, which is why `license-checker` flagged this project's
  own package as `UNLICENSED` in its first pass).
- **`ci.yml` is new** (lint, type-check, full test suite, build, bundle-size
  check, Android manifest check) — the plan's "Workflow 1, on every push."
  Deliberately separate from `build.yml` (the *existing* workflow, still
  building the old PyInstaller binaries) rather than repurposing it: on
  `next`, right now, both a Python app and a TypeScript app technically
  exist in the same repo, and `build.yml` has its own job for exactly the
  Python one. Phase 10's real retirement of the old codebase is where
  `build.yml` should actually go away — until then, having a second,
  independent CI file for the new stack means neither can accidentally
  break the other's checks.
- **`release.yml` (tag-triggered, multi-platform) is written but
  unverified beyond `pnpm build`'s and the Android permission check's own
  steps**, which this session ran directly rather than through the
  workflow file. There's no way to actually run a Windows/macOS runner or
  a working Android SDK from here (see Phase 7/8's logs) — it's built from
  `tauri-action`'s and `android-actions/setup-android`'s own documented,
  widely-used patterns, not verified end to end. It also duplicates
  `build.yml`'s existing `tags: ['v*']` trigger — the same overlap
  `build.yml`/`ci.yml` have, same reasoning, same "Phase 10 resolves it."
  A real release tag shouldn't be pushed until this workflow has been
  sanity-checked (`workflow_dispatch` first, on a throwaway tag) at least
  once.
- **`android/app/build.gradle` gained a conditional `signingConfigs.release`
  block** that only activates when `android/release.keystore` exists —
  reads its password/alias from environment variables
  (`ANDROID_KEYSTORE_PASSWORD` etc.), never from a committed file. Local
  `assembleDebug` and an unsigned `assembleRelease` are both unaffected
  either way. Still no keystore generated — same reasoning as Phase 8's
  log entry (a release-signing key is a permanent identity, not something
  to invent on the user's behalf); `release.yml` falls back to an unsigned
  debug APK when the `ANDROID_KEYSTORE_BASE64` secret isn't set, so the
  workflow itself doesn't silently produce a real-looking-but-unsigned
  release artifact without saying so in the build log.
- **`tools/check-bundle-size.mjs`**: gzip-size budgets for the main JS
  entry chunk (400 KB), the lazy-loaded `parse.worker` chunk — pdf.js +
  JSZip, so it gets a much bigger 700 KB budget since it never blocks
  first paint — and total CSS (30 KB). Current actual sizes (258 KB / 170
  KB / 4 KB) are well under all three; the budgets have real headroom on
  purpose, since the point is catching a future regression (an
  accidentally-bundled heavy dependency), not fighting today's bundle
  down to the wire.
- **Version stayed at `0.1.0` everywhere** (`package.json`,
  `src-tauri/tauri.conf.json`, `android/app/build.gradle`'s
  `versionName`, matching what Phase 7 already set) — nothing here
  warranted a version bump on its own; `CHANGELOG.md` (new, Keep a
  Changelog format) logs the whole migration-in-progress under that one
  `[0.1.0]` heading rather than inventing intermediate version numbers for
  work that hasn't shipped anywhere yet.

# Decisions

Why the new codebase is built the way it is. Add to this as decisions are made;
don't rewrite history here, append.

| Area         | Choice                                  | Why                                                         |
| ------------ | --------------------------------------- | ----------------------------------------------------------- |
| Language     | TypeScript, strict mode                 | Catches parsing and storage bugs; reads well on a portfolio |
| UI           | React + Vite, canvas for the focus word | Already used in `web/` (React + Vite + Tailwind)            |
| Storage      | Dexie (IndexedDB)                       | Same code in browser, Tauri and Capacitor                   |
| PDF          | pdf.js in a Web Worker                  | Apache-2.0, gives word positions for the page panel         |
| EPUB         | epub.js or JSZip + DOMParser            | Works offline in every shell                                |
| Tests        | Vitest                                  | Runs the parity tests against Python output                 |
| Desktop      | Tauri 2                                 | Small installers, Rust shell                                |
| Android      | Capacitor                               | Wraps the same web build                                    |
| iPhone       | PWA only                                | Native needs a Mac and Apple's $99/year fee                 |
| Book sources | Gutendex + local import                 | Free, legal, no scraping                                    |

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
    `tests/parity/txt.parity.test.ts` can still assert the _full_ TS token
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
  make the _port_ more sophisticated than the thing it's supposed to match,
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
  `tests/storage/migration.test.ts` doesn't test _the_ schema — it defines
  its own inline v1/v2 Dexie classes to prove Dexie's
  `.version(2).stores({...}).upgrade(...)` mechanism actually carries old
  rows forward in this project's setup (Dexie + fake-indexeddb). Replace the
  inline classes with the real schema once it grows an actual version 2.
- **fake-indexeddb + jsdom can't round-trip a `Blob`.** Storing a `Blob` via
  Dexie/fake-indexeddb and reading it back came out as `{}` — not missing
  methods, an _empty plain object_, constructor `Object`. The cause:
  fake-indexeddb clones stored values with `structuredClone`, and whatever
  `structuredClone` shim jsdom's test environment installs doesn't
  recognize jsdom's own `Blob` class, so it falls through to a generic
  (property-copying) clone path and jsdom's `Blob` has no _own_ enumerable
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
  internal worker; since `parsePdf()` already only ever runs inside _our_
  `parse.worker.ts` (Phase 3's shared worker), there's no separate
  `pdf.worker.mjs` to bundle or offline-serve — pdf.js just runs on the
  calling (our worker's) thread, which keeps the UI thread unblocked either
  way. This also means there's nothing to configure for Tauri/Capacitor
  offline use, unlike the plan's original "bundle the pdf.js worker file"
  wording assumed.
- **PDF word extraction is a heuristic, not exact.** pdf.js's
  `getTextContent()` returns style _runs_ (`TextItem`), not words — most
  PDF generators (including this project's own fixtures) emit a whole line
  as one run with real spaces inside it, so splitting on whitespace
  recovers most words directly (`src/parse/pdf/lines.ts`). A word's bbox is
  a _proportional_ estimate from the run's total width, not real glyph
  metrics — fine for a highlight rectangle or click-to-jump target, not
  pixel-accurate. Two runs with no whitespace between them and no real
  horizontal gap are glued into one word (a font/style change mid-word);
  this only operates within one line, never across a line break — that's a
  separate concern:
  - **Hyphen rejoin** (`src/parse/pdf/flatten.ts`) uses the same heuristic
    as `rsvp_engine.py`'s `tokenize_pdf()`: a line-final hyphen followed by
    a lowercase start on the next line means the hyphen only existed to
    break the line (drop it, join); anything else is treated as a real
    hyphen (kept). This is a known-imperfect heuristic in _both_
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
  - Together, these are why the _golden_ PDF fixtures generated in Phase 1
    (`tests/parity/two-column-text.json`, `hyphenated-line-breaks.json`)
    were never meant to be compared token-for-token against the TS PDF
    parser — pdf.js's layout model is fundamentally different from
    PyMuPDF's. What _does_ match Python exactly: the two-column fixture's
    **total token count** (2200, both sides) — strong independent evidence
    the extraction is sound even though the algorithms differ completely.
- **EPUB chapter titles**: Project Gutenberg's own EPUB conversions
  sometimes embed an illustration's caption _inside_ the following
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
  The _plan_ asks for windows-1254 specifically for old Turkish files, so
  that's what `parseTextFile()` does; being a real single-byte encoding
  with genuine invalid sequences, `TextDecoder('windows-1254')` can still
  fail to be the _right_ answer for some other legacy encoding, but it's a
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
    Gutendex directly; book _file_ downloads go through a small
    allow-listed proxy (below) on web, and through Tauri's/Capacitor's
    native HTTP plugins once those shells exist (Phase 7/8), which skip
    browser CORS entirely.
- **`workers/gutenberg-proxy.ts`**: the Cloudflare Worker source for that
  proxy — forwards only `GET` requests whose path matches
  `gutenberg.org`/`www.gutenberg.org` file paths, adds
  `Access-Control-Allow-Origin: *` to the response, and 403s anything else,
  so it can't become an open proxy. **Not deployed** — deploying it needs a
  Cloudflare account and `wrangler login`, neither of which exists in this
  environment (checked: `wrangler` isn't installed here at all). Deploying
  it is a one-time step for whoever owns the Cloudflare account:
  `npx wrangler deploy workers/gutenberg-proxy.ts`, then set
  `VITE_GUTENBERG_PROXY_URL` to the resulting `*.workers.dev` URL. Until
  that happens, Gutendex _search_ works but _importing_ a found book over
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
  `pages.yml` already deploys `web/` (the old PWA) to the _same_ GitHub
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
  the repo's current top-level `LICENSE` — _not_ pre-emptively switched to
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
  can't make _any_ network request — including the Gutendex
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
  needed _zero_ code changes for Capacitor, unlike the explicit
  `isTauri()` branch Phase 7 needed (Tauri's plugin uses its own `fetch`
  export rather than patching the global one).
- **Icons and splash screens generated via `@capacitor/assets`** from
  `share/rsvp-reader.png` (the existing 512×512 project icon) — adaptive
  icons, all mipmap densities, and light/dark splash screens, 74 files
  from one source image and one command.
- **No signing keystore generated.** The plan calls for a real release
  keystore instead of the debug key — deliberately not done here. Unlike
  everything else in this phase, a release keystore is a permanent
  identity: Google Play requires the _same_ key for every future update
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
  documented rather than silently skipped. What _is_ verified: `cap sync
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
  Deliberately separate from `build.yml` (the _existing_ workflow, still
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

## Phase 10 log — partial: real-world usage can't be simulated

Most of Phase 10 is explicitly gated by the plan itself on "the new app
has actually been used as a daily reader for about two weeks" —
reading real books on each platform, logging real bugs, and only then
retiring `main.py`/`ui/`/`db.py`/`android-legacy-kotlin/`/old `web/` to a
`legacy/` branch and rewriting the README. None of that can be
substituted with anything done in this session — there's no way to make
two weeks of a person's actual reading habit happen, and doing the
archival/README-rewrite step now would jump straight past the validation
it exists to wait for. Left undone, on purpose, for the repo owner.

One item _was_ independently checkable without the two-week wait, and
turned into real, load-bearing work once actually looked into rather than
deferred with everything else:

- **The old web app's IndexedDB and the new app's Dexie database use the
  same name — `"rsvp-reader"` — found while checking the plan's "confirm
  the migration path works" item.** That's not a coincidence to shrug
  off: the plan's own deployment approach (Phase 6) replaces the old PWA
  at the _same URL_, meaning the same origin, meaning both databases
  would genuinely collide in a real user's browser. Before this fix, that
  collision would have been silent and specifically dangerous: opening
  the new app would `indexedDB.open("rsvp-reader", 1)`, find a database
  already at version 1 (the old app's), and — since IndexedDB only runs
  an upgrade when the _requested_ version is higher than the existing one
  — skip any upgrade entirely and just use the old app's raw structure
  as-is. The new code would then throw the first time it touched an index
  the old structure never had (`fingerprint`, `source`, ...), or silently
  read/write the wrong shape.
  - Fixed by declaring `RsvpDatabase`'s `.version(1)` to _exactly_ match
    what `web/js/library.js` actually creates (bare `books`/`tokens`/`files`
    stores, no secondary indexes — not this app's own "day one" schema,
    which now lives at `.version(2)`), then adding a real
    `.version(2).upgrade()` that transforms every existing record: `books`
    gains `source`/`fingerprint` (synthesized from the old `size` field,
    since the old schema never recorded `lastModified` to compute a real
    one from — harmless, since nothing re-derives tokens from it yet, see
    Phase 4's log), a `progress` row is created from the old `lastIndex`
    field (only for books with actual progress), and `files` rows go from
    a bare `{bookId, data: ArrayBuffer}` to the new `{bookId, blob,
fileName, mimeType}` shape. A PDF book's `pages` (a field the old
    schema never stored at all) gets computed from the _existing_ tokens'
    own page numbers, in the same upgrade pass.
  - This is exactly the plan's "confirm the migration path works... export
    from the old web app, import into the new one, positions intact" —
    except automatic rather than a manual export/import file, since the
    old app never had an export feature to begin with and both databases
    living at the same name/origin makes an in-place upgrade the more
    direct fix anyway.
  - Verified twice, not once: `tests/storage/legacy-migration.test.ts`
    builds a database with _raw_ `indexedDB.open()` calls copied line for
    line from `web/js/library.js`'s actual behavior (not Dexie, not a
    simulation of Dexie) and checks the upgrade — TXT book, PDF book with
    computed `pages`, a multi-book library, and the brand-new-user no-op
    case. Then, live in the browser pane: seeded a real `"rsvp-reader"`
    IndexedDB database by hand to the old shape, loaded the new app fresh
    against it, and watched "Legacy Book" appear in the library at the
    correct 33% progress, the resume dialog offer correctly, and Resume
    land on the exact right word (index 1 of 3) — the same
    live-verification standard used throughout this migration, applied to
    the one Phase 10 item that didn't require two weeks to check.

### Old code retired early, at the user's explicit request

The rest of Phase 10 stayed blocked on the two-week usage gate right up
until the user directly asked to "clean the old codes" — overriding that
gate deliberately, not something this session decided on its own. Once
asked, the archival step itself was mechanical and low-risk (full git
history, plus the `v-legacy` tag, made every removed file recoverable),
so it went ahead rather than re-litigating a call the user had just made:

- **`legacy` branch created from the `v-legacy` tag** (not from `next`,
  which now has old and new code intermixed) and pushed to `origin` —
  durable, not just a local ref. It's an exact copy of the pre-migration
  state: PyQt6 (`main.py`, `db.py`, `text_extract.py`, `pdf_render.py`,
  `rsvp_engine.py`, `ui/`), the old vanilla-JS PWA (`web/`), and the
  original Kotlin Android app still at its original `android/` path
  (predates the Phase 8 rename to `android-legacy-kotlin/` entirely,
  since `v-legacy` was tagged before any migration work began).
- **Removed from `next`**: all of the above, plus the Python
  packaging/dev scripts (`install.sh`, `serve.py`, `rsvp-reader.spec`,
  `requirements.txt`, the `rsvp-reader` launcher), the old icon-generation
  scripts in `tools/` (superseded by `pnpm tauri icon` and
  `@capacitor/assets`), and the local `.venv/` (not tracked by git, but
  no longer useful without `rsvp_engine.py`/`text_extract.py` to import).
  Checked first that nothing in the active codebase or test suite
  actually imports any of it — the handful of hits were all comments
  documenting the Python origin of a port (`// Ported from
rsvp_engine.py's RsvpEngine`, etc.), which stayed, since they're still
  accurate and still useful context.
  - One real dependency, not just a comment:
    `tests/parity/generate_fixtures.py` (Phase 1's golden-fixture
    generator) does `from rsvp_engine import ...` for real. It doesn't
    need to run for the test suite to pass — the fixture JSON it produces
    is already committed — but it would need `rsvp_engine.py`/
    `text_extract.py` checked out from `legacy` to run again. Its
    docstring now says so explicitly, rather than just silently breaking
    for whoever tries it next.
- **`docs/`'s three screenshots removed**, not kept — they showed the old
  PyQt6 UI, which no longer exists in this tree, and a screenshot of a
  removed interface is actively misleading in a way that stale prose
  isn't. New ones weren't generated to replace them: capturing a
  screenshot in this session's Browser pane produces an image visible in
  the conversation, but there's no tool available here to save that image
  to a file on disk for the repo — a real tooling gap, not a skipped
  step. Whoever next has a real browser handy can add them back.
- **`README.md` rewritten** — kept what still holds exactly as it was
  (the keyboard shortcut tables, the pacing table and its formula, the
  "fully local, no telemetry" claims, the GPL rationale reshaped around
  the Phase 9 relicensing decision instead of PyQt6/PyMuPDF forcing it),
  replaced what changed (build instructions for four targets instead of
  one Python install, the storage section now describing Dexie/IndexedDB
  and pointing at the Phase 10 migration above, the file-layout table).
  Download links for the desktop/Android releases point at GitHub
  Releases as before, but nothing has actually been released from this
  codebase yet — those links resolve once `release.yml` (Phase 9) is
  actually run against a real tag.

## Gutendex search removed

The Project Gutenberg search (Phase 5) was taken out at the user's request:
Gutendex, the free API in front of it, was too slow to be usable. Measured
2026-09-29 with curl: an uncached search took 21–80 s (well past the app's
15 s timeout), and only repeat queries came back in under a second. The
imported EPUBs were also the with-images variant, ~45× the size of the
text-only one (24.8 MB vs 0.56 MB for Pride and Prejudice).

Gone with it: `src/sources/`, the search screen and its cache, the Cloudflare
CORS proxy (never deployed), Tauri's http plugin and its URL allow-list,
`CapacitorHttp`, and Android's `INTERNET` permission — the app is back to
reading local files only, with no network access on any platform.
`tools/check-android-permissions.sh` now allows no permissions. Books
already imported from Gutendex keep working (their tokens are stored);
`BookSource` still includes `'gutendex'` so those rows type-check, and the
Dexie `source`/`sourceId` indexes stay so no schema bump is needed.

A local copy of Gutenberg's own catalog (`pg_catalog.csv.gz`, 5.6 MB,
searched in IndexedDB) was considered as a replacement and declined as not
worth the effort for now.

## v0.2 release: first run of the release pipeline

CI had failed on every run (9 of 9) and `release.yml` had never run. Fixed
before tagging v0.2: `package.json` now pins `packageManager`
(`pnpm/action-setup` refuses to guess); `release.yml` read a secret in a
step `if:`, which GitHub rejects, so the file was invalid — the secret is
now exposed as a job env var; and the Android job now runs `cap sync`,
since `android/`'s copy of the web app is gitignored and the APK would
otherwise ship without it. The legacy `build.yml`, `android.yml` and
`pages.yml` (PyInstaller, the Kotlin app and `web/`, all retired) were
deleted — two of them also fired on `v*` tags. The old PyQt6 release was
renamed from v1.0 to v0.1 so the new app's version sorts after it.

Follow-up: v0.2 shipped eight files (deb, rpm, AppImage, msi, setup.exe, dmg,
app.tar.gz, apk). `release.yml` now builds one download per platform with
plain, version-free names — `rsvp-reader-linux-x86_64.AppImage`,
`rsvp-reader-windows-x86_64-setup.exe`, `rsvp-reader-macos-universal.dmg`,
`rsvp-reader.apk` — via `tauri build --bundles` instead of tauri-action, and
a final `publish` job attaches them with `gh`. If the token still can't
create the release, create the draft by hand and re-run only that job.

## PDF engine: MuPDF, and OCR

Moved PDF reading, page drawing and scanned-PDF OCR off pdf.js and onto
MuPDF (WebAssembly, `mupdf` on npm) and Tesseract (`tesseract.js`). Design in
`docs/ARCHITECTURE.md`.

- **Why MuPDF.** The original Python reader used PyMuPDF, and its extraction
  was visibly better than pdf.js's (real glyph boxes, MuPDF's own block and
  reading order, no guessing columns from x positions). `mupdf` is the same
  engine compiled to WebAssembly, so it runs offline in the PWA, Tauri and
  Android alike with no server. The new extractor reproduces the legacy
  Python output exactly on the PDF fixtures (words, paragraph ends, page
  starts): `tests/parse/pdf-legacy-parity.test.ts` against
  `tests/fixtures/legacy-pdf/`.
- **Cost, accepted.** `mupdf` is AGPL-3.0-or-later (see `THIRD_PARTY.md`), so
  relicensing to something permissive is no longer free, and its ~10 MB
  WebAssembly module is precached by the PWA so PDFs still open offline. The
  main bundle got smaller (pdf.js left it).
- **One worker, one engine.** A single long-lived PDF worker both reads a PDF
  at import and keeps the open book for drawing, so a phone holds one copy of
  the engine. It is stopped after 30 s unused. Workers are built as ES
  modules because MuPDF awaits its WebAssembly at the top level.
- **Coordinates.** `Token.bbox` is PDF-style (origin bottom-left, y up). MuPDF
  and the screen are y-down; every conversion is in `src/pdf/geometry.ts`.
  New imports store boxes on the page _as displayed_ (rotation and crop
  applied) and say so: `layout.boxSpace: 'displayed'`. Books imported by the
  pdf.js versions have no marker; their boxes are in raw PDF user space, and
  on a rotated page or one with an offset box that is nowhere near where the
  page is drawn. So for them the page view takes the page's own
  user-to-page transform from the worker (`PDFPage.getTransform()`) and
  converts on the fly (`userBoxToScreen` / `screenToUserPoint`), tested
  against rotated, offset and cropped pages built by hand
  (`tests/pdf/legacy-boxes.test.ts`). On an ordinary page the transform is a
  plain flip, so nothing changes for them.
- **Paragraphs.** A change of MuPDF block is a paragraph end, as in the
  Python reader; the old gap-between-lines guess and the x-position column
  sorter are gone. Running headers/footers are still dropped.
- **OCR.** A PDF with under five words a page is offered OCR (never run
  silently: it takes seconds a page). Tesseract's LSTM engine with bundled
  English and Turkish data, drawn at 3x. Lines are grouped by Tesseract's
  layout _block_, not its paragraphs, which split plain paragraphs after a
  short first line. OCR'd books are flagged (`ocr: true`) and have no
  selectable text layer, since there is no text in the file.
- **OCR assets** (`public/ocr/`, copied from `node_modules` by
  `scripts/copy-ocr-assets.mjs` before `dev`/`build`, git-ignored) are
  deliberately outside the PWA precache and cached on first use. They are
  fetched from fixed URLs rather than passed in as bytes because
  tesseract.js 7.0.0 uses `Lang.data` as the language _name_ when given
  `{code, data}`.
- **Error classes now cross the worker boundary.** Messages like "This PDF is
  password protected" were being lost: errors became plain `Error`s on the way
  out of the worker, so the library screen only ever showed "Could not add
  that file." (`parse/worker-errors.ts`.)
- **Small behaviour fixes made on the way:** hyphen rejoining now treats any
  lowercase letter (not just a-z) as a continuation, so Turkish words rejoin.
- **Drawing is cancellable and bounded.** The PDF worker keeps renders in a
  queue of its own, one at a time with a gap between, and drops a render
  whose page has been asked for again or whose request was cancelled before
  it started. The page view cancels the draw it supersedes (a resize, a page
  turn). Without it, every width change queued an 8-48 MB bitmap.
- **The client survives the engine dying.** Open books are tracked by id; a
  crash tells each handle (`onLost`), which stops answering, and
  `usePdfDocument` reopens the book (up to 3 times). Previously a handle kept
  sending to a fresh worker that had never opened it, and the open-book count
  could go negative and let the idle timer kill the worker under a book.
- **Older browsers.** MuPDF's WebAssembly needs exception handling (Chrome
  and WebView 95, Safari 15.2, Firefox 100). The APK declares
  `minWebViewVersion: 95` with `server.errorPath` pointing at
  `webview-too-old.html` (Capacitor only logs the version check unless an
  error page is set), so an old WebView shows "update Android System
  WebView" instead of a broken app; a PWA in an older browser gets "This
  browser is too old to open PDFs" when a PDF is added. pdf.js's legacy build ran on
  older engines; this is the price of the engine.
- **Letter-spaced headings** ("C H A P T E R O N E") come out of MuPDF, as
  they did out of PyMuPDF, as one-letter words. A line made only of single
  capital letters (five or more) and short numbers is joined back into words
  by the width of the gaps. Not applied to digits, lowercase, symbols or
  short runs, which would turn `1 2 3 4 5` into `12345`.
- **OCR can no longer hang.** tesseract.js 7.0.0 never settles `createWorker`
  if the language data fails to load, so start-up is raced against its error
  handler, a timeout and the cancel button, and a worker that starts late is
  shut down (`ocr/startup.ts`). The files are checked fetchable first, so the
  failure is a message ("connect once to download"), not a spinner. Cancel
  also interrupts the page being recognised, not just between pages.
- **Offline OCR needs one online use per language.** The engine and language
  data are not precached; the service worker caches them on first use, in a
  cache named for the tesseract.js version (older versions' caches are left
  behind; they are never read). tesseract.js and tesseract.js-core are both
  pinned exactly, because the engine files are copied from the latter.
- **Import is one at a time and dies with the screen.** The library refuses a
  second import while one runs, aborts it on leaving, and hands back a book
  already in the library instead of reading (or OCRing) it again.
- **Hyphenated word that ends a paragraph:** when a paragraph's last line is
  only the tail of a hyphenated word, the paragraph pause is kept (it was
  lost).
- **Known and left alone:** a hyphen split across a page or block break puts
  the paragraph pause one word early (as in the Python reader); the parse
  worker's bundle still contains an unused copy of the MuPDF loader (~88 KB);
  the OCR'd flag is shown as a small "OCR" tag in the library and nowhere else.

## Page view is an overlay, not a split

Opening the page beside the RSVP word squeezed the word, which on a phone made
most words unreadable. The page is now an overlay (`ui/page-overlay.ts`) over
the reading area, with one rule: it never covers the word. The word sits on a
full-width band across the middle (long words are shrunk to the width, never
made taller), and the overlay takes the taller strip above or below that band
plus breathing space (20-48 px, scaled to the text size), preferring above, in
the top-right corner, at most 560 px wide. The band comes from `ui/rsvp-geometry.ts`, which the canvas
also draws from, so the two cannot drift. A property sweep over screen and text
sizes (`tests/ui/page-overlay.test.ts`) checks the overlay never touches the
band. If there is no room (a phone on its side, or very large text) there is no
overlay: the Page button is disabled with the reason, rather than cover the word.

## One in-process API between backend and UI; a frozen page size per book

- **`src/api/` is the only way the UI reaches storage, parsing, PDF and OCR.** It
  is a typed function boundary inside the app, not REST or WebSocket (there is
  no server, by decision). It carries values, never database handles or rows'
  internals (`listBooks()`, `loadBook(id)`, `openBookPdf(id)`, `loadSetting`,
  `importLocalFile`, `resolvePage`, ...). `eslint.config.js` forbids `src/ui`
  from importing `storage`, `parse`, `pdf` or `ocr` directly.
- **Every book has a `page` (`core/page-spec.ts`):** width and height in PDF
  points, measured once at import (a PDF's first page, from MuPDF) and frozen;
  the default for anything without pages (text, EPUB). Sizes are named presets
  (`book`, `letter`, `a4`) with `DEFAULT_PAGE` as the one global default. Books
  from before this (Dexie v4) take the default. It is not re-measured.
- **The page pop-up changes nothing under it.** It floats in the corner above
  the word's baseline limit, does not catch clicks (`pointer-events: none`; only
  its own prev/next opt back in), and no longer docks beside the word or
  resizes anything. A PDF's own page is shown with no container; anything else
  is drawn on a bone-coloured sheet shaped like the book's `page`.

## 2026-10-24: Feature folders on top of the MuPDF code, and docs that describe the code

**Situation.** Two restructures had been made in parallel. `main` got feature folders and
per-task service classes (on the pdf.js code); `next` got the MuPDF/OCR switch and a single
`src/api/` facade. The branches differed in 196 files.

**Decided.**

- `next` is the base. `main`'s _folder layout_ was redone on top of it: `app/`, `features/<name>/`
  (components, hooks, `api/`), `components/`, `lib/`, `stores/`, with the backend (`parse`,
  `pdf`, `ocr`, `storage`) and `core` unchanged. Then `main` is to be reset to that result, so
  there is one branch again.
- `src/api/` was split into the features that use it (`features/library/api`,
  `features/reader/api`), plus `stores/api/settings.ts` for the app store.
- **Plain functions, not service classes plus a Repository interface.** `main` had
  `LibraryService` / `ReadingService` / `DexieRepository` singletons. The storage functions
  already take `db` as an argument and are tested on fake-indexeddb, so the extra indirection
  bought no testability. Add an interface when a second implementation (sync) actually exists.
- ESLint enforces the layers (rule messages say what to do instead), the `@/` alias replaces
  `../` in UI code, and `tsconfig.test.json` now type-checks `tests/`. That surfaced type errors
  in five test files, which were fixed. Prettier's width is 100, and CI runs `format:check`.
- Book-layout geometry moved to `lib/book-layout.ts` (the shared store needs it), the global
  Ctrl+L shortcut moved to `app/hooks/`, and `resolvePage` moved to `core/page-spec.ts`.
- Docs: a short root `ARCHITECTURE.md` (map, layers, invariants), `docs/architecture/` for deep
  dives, `CONTRIBUTING.md` (with a definition of done and a smoke test), and `AGENTS.md`. This
  file moved here from the root. The old draft `docs/ARCHITECTURE.md` was a finished plan and is
  now in `archive/`.

**Rejected.** Merging `main` into `next`: every moved file would conflict, and `main`'s pdf.js
code would be thrown away anyway.

## 2026-10-24: A browser smoke test in CI

Unit tests passed while the app kept breaking at runtime, so CONTRIBUTING.md's manual smoke test is
now automated with Playwright (`e2e/smoke.spec.ts`). It runs against the production build
(`vite preview`), not the dev server, at three window sizes (desktop, a short window, a phone),
and fails on any console error. The very first runs found a real bug: on a mode switch,
`useAutosaveProgress` saved the mode being _left_, so closing the app soon after switching
reopened the book in the wrong mode at an older word (about 1 run in 13). It now saves the mode
being switched to; `tests/features/reader/useAutosaveProgress.test.tsx` pins it.

The web server is started as `node node_modules/vite/bin/vite.js preview`, not through `pnpm`:
through pnpm, Playwright's stop signal never reached Vite and the run never exited.

## 2026-10-24: Native builds checked on pull requests, from one definition

Desktop and Android builds used to run only on a version tag, so a change that broke them (a Node
or Gradle version, an SDK package) was found on release day. The build jobs moved out of
`release.yml` into a reusable workflow, `build-apps.yml`, which both `release.yml` and the new
`native-check.yml` call. A PR builds exactly what a release will.

The check runs only when native files or dependencies change (the user's choice: the builds take
several minutes, macOS the longest), and builds the unsigned debug APK because it gets no secrets.

## 2026-10-24: The principles of large cross-platform apps, scaled down

Compared with how Discord and Facebook ship one app to every device, the repo already had one
core with thin shells, layers, tests and versioned data. It lacked four things, now added, each
with its own enforcement:

- **Platform interface** (`src/platform/`). Native APIs had been called from five places, each
  checking for itself. Lint now confines `@tauri-apps` and `@capacitor` to that folder. Two
  behaviour fixes came with it: the Android status bar follows the theme (it was always dark),
  and the service worker is web-only (in a native build it could serve old files after an
  upgrade).
- **Design system** (`src/components/`, colour utilities, docs/architecture/ui.md).
- **Feature flags** (`src/lib/flags.ts`), so `main` is always releasable.
- **A local error log** (`src/lib/error-log.ts`), never sent anywhere.

`docs/architecture/principles.md` lists all ten principles and their mechanisms. Not done:
GitHub branch protection, which needs the repository owner to turn it on; and moving the
reader-only view state out of the shared store.

**Rejected:** React Native for mobile (Discord's route). A rewrite of the UI for one maintainer,
when the Capacitor shell already runs the same build.

## 2026-10-24: `main` is protected, and `next` is gone

Branch protection on `main` requires the CI `test` job to pass on a branch that is up to date
with `main`, applies to admins too (so every change goes through a PR), and refuses force-pushes
and deletion. The native build checks are not required: they run only when native files change,
so requiring them would leave other PRs waiting for a check that never comes. No review is
required, since there is one maintainer.

The `next` branch, a leftover from the migration, is deleted and dropped from CI's triggers.

## 2026-10-25: EPUBs are parsed with linkedom, not DOMParser

EPUB import failed in every real browser with "DOMParser is not defined": EPUBs are parsed in
`parse.worker.ts`, and dedicated workers have no DOMParser. The unit tests ran the parser in
jsdom on the main thread, so they never saw it. `parse/epub/dom.ts` now parses the OPF and the
chapter HTML with linkedom (ISC, plain JS, bundled), so the same code runs in the worker and in
the tests. For the Austen fixture the result is identical to DOMParser's: same title, author,
126,684 tokens and 66 chapters.

linkedom has no XML namespaces and never reports a parse error. `opf.ts` finds Dublin Core
elements by the prefix the OPF declares for that namespace, and malformed XML now surfaces as a
missing rootfile or an empty spine rather than a "Malformed XML" error.
`tests/e2e/epub.spec.ts` imports the fixture in a real browser.

**Rejected:** parsing the chapters on the main thread and only unzipping in the worker. A novel's
worth of HTML would block the UI, and the worker would need a second message round trip.

## 2026-10-25: the RSVP word gets a sentence line, and the overlay keeps clear of it

The RSVP canvas now draws the words around the current one, faintly, on a line under the guides,
with the current word centred under the focus letter, so a reader who loses the thread can see
where they are without opening the page. It stops at paragraph ends (`features/reader/context.ts`).
`wordZoneHalfHeight` includes that line, on both sides, so the page overlay never covers it. On a
short screen the overlay is now hidden a little sooner.

**Rejected:** a DOM line under the canvas. It would move the word's centre line, which
`page-overlay.ts` and the browser tests rely on, whenever the line wrapped.

## 2026-10-25: shelves are their own table, holding book ids

Schema v6 adds `shelves` (`++id`): a name, a colour and `bookIds`. Membership lives on the shelf,
not the book row, so a book row never changes when it is shelved, there is nothing to migrate
(every existing book is on no shelf), and the library loads all shelves in one read. `removeBook`
takes the book off every shelf in the same transaction, since a later book can reuse the id.
A shelf's colour is one of five colour tokens (`accent` and the new `shelf-*` tokens), stored by
token name, so each theme draws it in its own shade.

**Rejected:** a `shelfIds` multi-entry index on the book row. It would need an upgrade over every
book and makes shelving a book rewrite its row; the library never has enough shelves for an index
to matter.

## 2026-10-25: bookmarks keep a few words, and open the reader with `?at=`

Schema v7 adds `bookmarks` (`++id, bookId`): a book id, a word index and an excerpt, the eight
words from the mark. The excerpt is stored so the library's bookmark list never has to load a
book's tokens to say where a mark is. A new table only, so nothing is migrated. `removeBook`
deletes a book's bookmarks with it.

The library opens a bookmark at `/reader/:id?at=<word>`; `useLoadedBook` starts there instead of
at the saved progress when the index is inside the book (`startIndexFor`), and keeps the saved
speed and mode. The reader header's bookmark button marks the current word, or unmarks it if it
is already marked.

## 2026-10-25: a book's chapters are kept on its row, and old books get none

The EPUB parser has always found chapters (`ParseResult.chapters`, one per heading), but the
import threw them away. Schema v8 gives `BookRecord` a `chapters` list, saved at import; the
upgrade sets it to `[]` on every existing row, and `normalizeBookRecord` does the same for old
backups. Books imported before this keep an empty list for good: finding their chapters would
mean parsing the book again, which a migration must never do. Re-adding the same file does not
fill it in either, since the import returns a whole book without reading it.

The list is required, not optional, so the UI asks "are there chapters?" (`length > 0`) rather
than "is the field there?". It lives on the book row, not in its own table, because the reader
already loads the row and a novel's chapter list is a few kilobytes.

**Rejected:** a `chapters` table keyed by book id, like `tokens`. One more read and one more
table to clear on removal, for data that is small and always wanted with the book.

## 2026-10-25: the RSVP word stands alone again

The sentence line under the RSVP word and the long guide lines along its ticks (added earlier the
same day) are gone. In use they pulled the eye off the word, which defeats RSVP: the point is one
word at a time, read at the focus letter without moving the eyes. The two short ticks that mark
the focus letter stay; they come from the original Python reader. `wordZoneHalfHeight` is back to
the word and its ticks, so the page overlay may again sit closer to the word.
`features/reader/context.ts` is removed with its test.

## 2026-10-25: clicking a word on a PDF page picks it in book mode too

`PdfPageView` only turned a click into a jump in the small page shown beside the RSVP word
(`peek`); in book mode a click on a PDF page did nothing, a rule carried over from the pdf.js
version with no recorded reason. Picking the word RSVP goes on from is one of book mode's two
jobs (the other is reading normally), and the reflowed view of text and EPUBs already allowed it,
so PDFs now do the same. A click that ends a text selection still does nothing.

## 2026-10-25: reflowed books scroll down one column

Book mode laid text and EPUBs out in CSS columns inside a fixed-height box. The columns
overflowed sideways, and bringing the current word into view scrolled sideways to wherever it
landed, cutting the text off at the left edge. The reflowed page is now one centred column that
scrolls down. Its window of rendered words grows as the reader scrolls (`reflow-window.ts`), so
reading on by scrolling never runs out of text, and it moves to the current word only when that
word changes. Each word, with the space after it, takes clicks across the whole line height, so
a click between lines still picks a word.

**Rejected:** fixed two-column pages turned with buttons (the design canvas's look). It needs
page breaking that matches what CSS columns lay out, and the reflowed page's job is reading on
and picking a word, which scrolling does without it.

## 2026-10-26: a book's author is kept only when it is clean

The EPUB parser has always read `dc:creator`, but the import dropped it. It is now kept on the
book row (`BookRecord.author`, a field that already existed for old Gutendex imports, so no schema
version), and shown beside a tile's status, on the Continue reading card and under the title in
the reader. `parse/author.ts` decides what counts: spaces tidied, and nothing that is a
placeholder ("Unknown", "Anonymous", "N/A", a tool's name), a path, a file name, an address, or no
letters at all. A book without a clean author shows nothing in its place, never "Unknown author".
Books imported before keep none: finding theirs would mean reading the file again.

## 2026-10-25: Sync phase 1, as registers

Phase 1 of docs/architecture/sync.md is built: the clock, the merge, the change log, book ids, an
in-memory transport and `syncOnce`, tested with two simulated devices. Nothing in the app calls
it, so no flag is needed yet; the one visible effect is that saving progress, a synced setting or
a book now also writes a row to `syncRegisters`, in the same transaction.

Every value phase 1 syncs is "newest wins", so the log is a set of registers, one per book or
setting, each with the clock of its last local change, rather than an append-only outbox. The
queue stays bounded however often progress is saved. A change takes its clock when it is saved,
not sent, so an offline change can't win by arriving late. Sequence numbers are given at send
time, and a device that crashed mid-send reads its own log back rather than reuse one.

Reflowed books are hashed from their words, not their file: they keep no file, and a book added
before sync has to be given the same id later from what it keeps. Schema v6 has no upgrade
function, because hashing can't run inside an IndexedDB transaction; `ensureSyncIds` fills ids
in at the start of each sync run.

**Rejected:** a Drive transport now. It needs a Google OAuth client, which only the owner can
make, and it ends invariant 1 for anyone who connects, which deserves its own change.

## 2026-10-26: sync's schema version is v9, not v6

Sync phase 1 was built on a branch alongside shelves, bookmarks and chapters, and both took schema
v6. Neither had shipped, so on merging, sync's tables and the `books.syncId` index became **v9**,
after shelves (v6), bookmarks (v7) and chapters (v8); the entry above that says v6 means v9.
Nothing else about it changed. `bookTables` and `deleteBookRows` now include bookmarks and
shelves, so a book removed by another device loses its bookmarks and leaves every shelf, as a
local removal does. Shelves and bookmarks themselves are not synced yet.

## 2026-10-26: invariant 1 allows the sync the user turns on

Invariant 1 was "no network at runtime". It now reads "no network at runtime, except the sync the
user turns on": once the user connects Google Drive (Settings → Sync, behind the `sync` flag while
it is unfinished), the app talks to Google's sign-in script and token endpoint and to the Drive
REST API, using the `drive.appdata` scope only, and to nothing else. Until then it makes no
request at all: the sign-in script is loaded when the user presses Connect, not at start-up, and
the e2e tests fail on any request that leaves the app's own origin.

Sync is the one feature that cannot work without a network, and sync.md decision 6 already made
it opt-in. Everything else (reading, OCR, import) stays offline.

**Rejected:** a server of our own, or any third-party service besides Google Drive (sync.md
decision 10).

## 2026-10-26: the desktop OAuth client's secret is built into the app

Desktop sign-in for sync uses a Google OAuth client of type "Desktop app", with PKCE and a
loopback redirect. Google's token endpoint expects that client's secret, and Google's own
documentation says an installed app's secret "is obviously not treated as a secret": anyone
can read it out of the app. So, with the owner's agreement, it is committed in
`src/platform/tauri.ts` beside the client ID, as the web client's ID already is. The rule that
no secret is committed still holds for everything else (API keys, service accounts, signing
keys). PKCE is what protects a sign-in, not the secret.

**Rejected:** putting it in CI only and injecting it at build time. It would end up in the
installer just the same, while making local builds unable to sign in.

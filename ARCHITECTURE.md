# Architecture

The map of this codebase: what lives where, which way imports point, and the rules that keep it
from turning back into a pile of ideas. Read this before changing anything structural. The deep
dives are in [docs/architecture/](docs/architecture/README.md).

## Bird's-eye view

RSVP Reader shows a book one word at a time, at a set pace, with the word's optimal recognition
point (ORP) pinned to the same spot. It can also show the book as pages ("book mode") and keeps
the two in step: a page is a range of word indices, so switching modes never loses your place.

It is a **client-only app**. There is no server and never will be: parsing, storage and reading
all happen on the device, offline. One web build (React + Vite) ships three ways:

- the web/PWA, from GitHub Pages
- desktop, wrapped by Tauri (`src-tauri/`)
- Android, wrapped by Capacitor (`android/`, generated)

A book goes through one pipeline, once:

```
File ──▶ parser (in a worker) ──▶ Token[] ──▶ IndexedDB ──▶ engine ──▶ screen
         txt / md / epub / pdf               books, tokens,   play, pause,
         (PDF via MuPDF, OCR via             progress, files  seek, pace
          Tesseract for scans)
```

A `Token` (`src/core/types.ts`) is one displayed word: its text, whether it ends a paragraph,
and for PDFs its page and box. Everything downstream of the parser works on tokens only, never on
the original file. The one exception is that a PDF keeps its bytes so the pages can be drawn.

## Code map

```
src/
  main.tsx            entry: mounts <App/>
  app/                the shell: routes, ErrorBoundary, UpdatePrompt, app-wide hooks
  features/
    library/          the book list, importing a file, the OCR offer
    reader/           RSVP view, book mode, page overlay, transport, shortcuts
    settings/         the settings screen
  components/         the design system: Page, Dialog, Field, Button, WpmInput
  lib/                shared pure helpers (theme, keyboard, book-layout geometry)
  stores/             the zustand app store (persisted settings + reading mode)
  platform/           the device: web, Tauri, Capacitor behind one interface
  core/               engine, pacing, ORP, tokenizer, page spec — pure TypeScript
  parse/              format registry and parsers (text, markdown, EPUB, PDF → tokens)
  pdf/                the only code that touches MuPDF; one long-lived PDF worker
  ocr/                Tesseract for scanned PDFs, opt-in
  storage/            Dexie (IndexedDB): schema, migrations, small accessor functions
tests/                mirrors src/; tests/e2e/ is the Playwright test of the built app (tests/features/reader/… tests src/features/reader/…)
```

Inside a feature:

```
features/<name>/
  components/         React components, including the screen
  hooks/              React hooks used only by this feature
  api/                the feature's only door to the backend (parse, pdf, ocr, storage)
  *.ts                pure logic for this feature (e.g. reader/book-nav.ts)
```

## Layers

Imports point **downward only**. ESLint enforces every arrow below (`eslint.config.js`, the
`layers` block); `pnpm lint` fails on a violation, with a message saying what to do instead.

```
app                      composes features; nothing imports it
  │
features/<name>          never imports another feature
  │    └─ api/           the only UI code that may import the backend
  │
components · lib · stores · platform   shared; never import a feature or app
  │                └─ stores/api/   the store's door to settings storage
  │                         platform/ is the only code that imports @tauri-apps or @capacitor
  │
parse · pdf · ocr · storage      the "backend"; never import UI code
  │
core                     pure; imports nothing in src/ but core
```

Why it's shaped like this:

- **`core/` is pure** (no DOM, no React, no I/O), so the engine runs the same in a worker, in
  Vitest and in the UI, and its tests are fast and exact.
- **The backend never imports UI code**, so parsers can run in a worker without dragging React
  in.
- **The UI reaches the backend only through `api/` folders.** They are plain functions that
  take and return values, never a database handle. Swapping Dexie, or adding sync, changes the
  `api/` files and nothing above them.
- **Features don't import each other.** A change in the reader can't break the library. If two
  features need the same thing, it moves down to `components/`, `lib/` or `stores/`.
- **Imports across folders use `@/…`** (`@/` is `src/`). `../` is not allowed in UI code;
  `./x` is fine for siblings.

## Invariants

Things that are true everywhere and must stay true. Breaking one is a bug even if tests pass.

1. **No network at runtime.** Nothing fetches from the internet. OCR language data is bundled
   (`public/ocr/`, copied by `scripts/copy-ocr-assets.mjs`). The Android build is checked in CI
   for having no network permission.
2. **A book is parsed once.** Its tokens are stored and never re-derived. A schema change
   migrates stored rows (`storage/schema.ts`); it doesn't re-extract.
3. **The format is decided at import and stored** (`BookRecord.formatId`). Nothing re-derives
   it from the file name later.
4. **UI branches on `book.layout`, not on fields.** `layout` is
   `{ kind: 'paged', pages } | { kind: 'reflow' }`, so the compiler forces every view to handle
   both.
5. **Word index is the position.** RSVP and book mode share one number. Paging maths turns a
   page into an index range (`features/reader/book-nav.ts`), never the other way round.
6. **One MuPDF instance.** A single long-lived worker serves both import and reading
   (`pdf/service.ts`), because phones can't afford two. Only `pdf/document.ts` calls MuPDF.
7. **OCR is never run silently.** A PDF with no text layer throws `NoTextLayerError`, and the
   library offers OCR.
8. **Existing libraries keep working.** Each Dexie version upgrade has a test against an old
   database (`tests/storage/legacy-migration.test.ts`, `book-record.test.ts`).
9. **The page overlay never covers the word** (`features/reader/page-overlay.ts`). If there is
   no room for it, it isn't shown.
10. **No code outside `platform/` asks which device it is on.** It asks the platform to do
    something, and each platform does it its own way (or does nothing).

## Cross-cutting concerns

| Concern  | Where                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Errors   | `parse/errors.ts` (`ExtractionError`, `NoTextLayerError`), revived across worker boundaries by `parse/worker-errors.ts`. Anything unexpected goes to `lib/error-log.ts` (on this device only; Settings → Error log), including render crashes caught by `app/ErrorBoundary.tsx`, uncaught errors and PDF engine crashes. |
| Workers  | `parse/parse.worker.ts` (one per non-PDF file, then terminated); `pdf/pdf.worker.ts` (one, long-lived, idle-shutdown)                                                                                                                                                                                                    |
| Settings | `stores/app-store.ts`, persisted through `stores/api/settings.ts`                                                                                                                                                                                                                                                        |
| Theme    | `lib/theme.ts` sets CSS variables; components use `var(--color-…)` via Tailwind                                                                                                                                                                                                                                          |
| Platform | `platform/`: one `Platform` interface (launch file, back button, status bar, splash, keep screen on, self-update) with web, Tauri and Capacitor implementations; `getPlatform()` picks one at start-up                                                                                                                   |
| Offline  | `vite-plugin-pwa` precaches the shell and MuPDF's WASM; OCR data is cached on first use                                                                                                                                                                                                                                  |

## Where to go next

- [docs/architecture/principles.md](docs/architecture/principles.md): the engineering
  principles behind all of this, and what enforces each.
- [docs/architecture/](docs/architecture/README.md): deep dives on the reader, formats, the PDF
  pipeline, storage, and the sync design.
- [docs/architecture/decisions.md](docs/architecture/decisions.md): the decision log (why
  things are the way they are), append-only.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to set up, check and ship a change.
- [AGENTS.md](AGENTS.md): the short version for AI coding agents.

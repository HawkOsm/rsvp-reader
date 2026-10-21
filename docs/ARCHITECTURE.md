# Architecture (draft)

Status: proposal, no code yet. Scope: restructure the existing client-only app so formats are
pluggable, PDF extraction moves to MuPDF (WASM), and the sync design in
[SYNC-DESIGN.md](SYNC-DESIGN.md) has somewhere to land.

## 1. Constraints (decided)

- **No server, ever.** Everything runs on the device: web/PWA, Tauri, Capacitor. Python is not
  part of the runtime; the `v-legacy` tag is only a reference for extraction quality.
- **Local-first and offline.** Parsing, storage and reading never need a network.
- **TypeScript stays.** This is a refactor of the existing code, not a rewrite. `core/`
  (tokenizer, pacing, ORP, engine) and `storage/` keep their behaviour and tests.
- **PDF extraction uses MuPDF compiled to WASM** (`mupdf` on npm): the same engine PyMuPDF wraps,
  so it is the closest match to the extraction quality the Python version had.
- **Licence:** `mupdf` is AGPL-3.0-or-later. The project stays GPL-3.0-or-later (GPLv3 section 13
  allows the combination). It becomes the one copyleft dependency, so `THIRD_PARTY.md` must say
  so, and a proprietary fork would need Artifex's commercial licence.

## 2. What is wrong today

- `parseFile()` is an if-chain on file extension.
- `pages?: number` doubles as "this is a PDF". The reader screen, page panel, keyboard shortcuts
  and hints all test `pages !== undefined`.
- `ParseResult` carries "PDFs only" and "EPUBs only" optional fields.
- UI code reaches into parser internals (`usePdfDocument` imports `parse/pdf/worker-src`).
- The stored `kind: 'pdf' | 'txt'` predates EPUB.
- ~~`book-nav.ts` mixes pure paging maths with DOM scrolling and a module-level mutable flag.~~
  Fixed: DOM scrolling is in `ui/book-scroll.ts`, the flag is in the store.

## 3. Layers

Imports point downward only.

```
ui/        screens, store, hooks, components
formats/   registries + one folder per format (pdf, epub, text)
storage/   Dexie tables, migrations, small accessor functions
core/      tokenizer, pacing, ORP, engine (pure; no DOM, no React, no formats)
```

`sync/` (Merge, Clock, Identity, Transport, Auth, Coordinator) sits beside `storage/` when it is
built and depends on `core/` and `storage/` only.

## 4. Formats

Each format is one folder. Two registries, keyed by the same format id, because the parser runs
in a worker and must not pull in React:

| Registry | Lives in | Contains | Used by |
|---|---|---|---|
| Parser registry | worker-safe | `id`, `extensions`, `capabilities`, `parse(file, opts) -> ParseResult` | `parse.worker.ts` |
| View registry | UI side | `id`, page panel and controls for that format | `ReaderScreen` |

- `parseFile` looks the handler up in the parser registry by extension. The text parser is the
  fallback for unknown extensions (current behaviour).
- Parsers stay lazy (`import()`), as today, so MuPDF and JSZip load only when needed.
- The **format id is stored on the book at import time.** It is never re-derived from the file
  name later.
- Adding a format = one folder + one entry in each registry. Nothing else changes.

### Capabilities, not field sniffing

Each parser declares what its output supports; the UI asks that instead of checking for fields.

- `paged`: has real pages and renders the original (PDF).
- `chapters`: offers chapter jump (EPUB).
- `reflow`: text is re-laid-out by the app (text, EPUB).

The book record replaces `pages?: number` with a discriminated union:
`layout: { kind: 'paged', pages } | { kind: 'reflow' }`, plus an optional chapters list. The
compiler then forces every UI branch to handle both cases.

## 5. PDF engine: MuPDF for extraction, rendering and OCR input

One engine does everything PDF. pdf.js is gone. See the end of `DECISIONS.md` for the
reasoning and the measurements; this is the shape.

- `src/pdf/document.ts` is the only code that touches MuPDF. `PdfDocument`: page count, title,
  page size and user-to-page transform, lines (MuPDF's block order), render, close.
- `src/pdf/service.ts` + `pdf.worker.ts`: **one long-lived worker** serves import (`parse`) and the
  open book (`open`, `pageSize`, `render`, `lines`, `close`), so a phone holds one engine. Renders
  go through a queue that coalesces and honours cancel. `src/pdf/client.ts` is the main-thread
  side: idle shutdown, crash recovery (`onLost`), cached sizes and lines.
- `src/parse/pdf/extract.ts` turns a `PdfDocument` into tokens: `extractPdf` for a text layer,
  and `linesToTokens` (shared with OCR) for header/footer removal, letter-spaced heading joining,
  paragraph ends (a block change), hyphen rejoining.
- `src/ocr/`: scanned PDFs (`NoTextLayerError`) are offered OCR, never run silently.
  `extractByOcr` draws each page through the same worker and `recognizer.ts` reads it with
  Tesseract (bundled English and Turkish data, `public/ocr/`). Lines are grouped by Tesseract's
  layout block. Start-up is guarded against hangs (`startup.ts`).
- Coordinates: `Token.bbox` is y-up. New books store it on the displayed page
  (`layout.boxSpace: 'displayed'`); legacy books (no marker) store raw user space and are
  converted with the page's transform. All of it is in `src/pdf/geometry.ts`.
- The page view (`PdfPageView`) draws the worker's RGBA bitmap onto a canvas, puts the highlight
  over the token's box, and lays a transparent text layer (`PdfTextLayer`, one span per MuPDF
  line, with line breaks so copying keeps them) over it.

## 6. Pacing

`delayFor` is currently hard-wired. Optional: the engine takes an injected pacing function
(it already injects `now` and the timers); today's behaviour becomes the default. Only worth doing
when a second profile is wanted. Deferred.

## 7. Cleanups bundled with the move

- Module-level `arriveAtBottom` in `book-nav.ts` moves into the store or a ref.
- `book-nav.ts` splits into pure paging maths and DOM scrolling.
- `ReaderScreen`'s inline DB loading becomes a `useLoadedBook(bookId)` hook.
- The legacy `kind` field goes once the format id exists.

## 8. Migration and risk

- Existing books get a `formatId` and `layout` filled in by a Dexie migration. Their stored
  tokens are untouched; they are not re-extracted.
- The `pages` field is derived into `layout` in the migration, so old libraries keep working.
- Acceptance for the MuPDF switch (and for deleting pdf.js): run the real high-quality PDFs through the legacy Python
  output (tag `v-legacy`), `pdfjs` and `mupdf`, and compare token counts and a text diff. This
  runs as a check during the migration rather than a gate before it.

## 9. Order of work

1. Book record: `formatId` + `layout` union, with migration and tests. **Done.**
   `FormatId` and `ContentLayout` live in `core/types.ts`; `normalizeBookRecord` in
   `storage/schema.ts` serves both the Dexie v3 upgrade and old-backup import.
2. Parser registry replaces the if-chain. **Done.** Split in two so the UI can import the
   extension table without pulling parser code into the main bundle: `parse/formats.ts` (pure
   data) and `parse/registry.ts` (loaders), both keyed by `FormatId`.
3. UI checks capabilities / the union instead of `pages`. **Done.** The `layout` union alone was
   enough; the separate capabilities descriptor from section 4 is not needed yet (add it when a
   format needs something `paged`/`reflow` cannot express, e.g. chapters). The view registry is
   deferred too: until the MuPDF work, `paged` means the PDF renderer (`PagePanel`).
4. MuPDF wrapper + extractor; compared against the Python reference. **Done.** The `PdfExtractor`
   seam was not built: with pdf.js gone there is one text extractor (`extractPdf`) and OCR
   (`extractByOcr`), sharing `linesToTokens`.
5. MuPDF render worker, text layer and viewport maths; then delete pdf.js. **Done.**
6. OCR extractor and its opt-in UI. **Done.**
7. Bundled cleanups (section 7). **Done** for `book-nav`/`book-scroll`, the `arriveAtBottom` flag
   and `useLoadedBook`; the legacy `kind` field is still in the v2 migration types on purpose.
8. Later, separately: injectable pacing, extractor setting / hybrid, sync.

## 10. Decisions

- Rendering moves to MuPDF; pdf.js is removed after the acceptance check. (decided)
- OCR is in scope, opt-in only. (decided)
- The selectable text layer is built from MuPDF structured text, so every PDF concern stays in
  MuPDF. (decided)
- One MuPDF instance, shared: a single long-lived PDF worker serves parsing and rendering (the
  app must run on phones, so memory matters more than isolation). The per-file throwaway parse
  worker is replaced for PDFs by requests to this worker. (decided)
- Extractor choice is automatic for now; a setting or a per-page hybrid is added only if the
  automatic choice causes problems. (decided)

## 11. Open questions

None. (The text layer is built from MuPDF's lines, and one worker serves import and reading.)

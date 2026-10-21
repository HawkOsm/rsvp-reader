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
- `book-nav.ts` mixes pure paging maths with DOM scrolling and a module-level mutable flag.

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

## 5. PDF engine: MuPDF for extraction and rendering

One engine does everything PDF: extraction, page rendering, and (later) feeding OCR. pdf.js is
removed once the acceptance check in section 8 passes, which also pays back part of MuPDF's
size (`mupdf` is ~14 MB unpacked; pdf.js and its worker go away).

### Extractor Strategy

A `PdfExtractor` is selected at import, **automatically** for now:

| Extractor | Role | Status |
|---|---|---|
| `mupdf` | default for any PDF with a text layer | new; lazy-loaded WASM |
| `ocr` | PDF with no usable text layer | in scope; see below |
| `pdfjs` | current implementation | transitional fallback only; deleted after the acceptance check |

Auto-pick: try `mupdf`; if the result is under the existing "words per page" threshold
(`SCANNED_PDF_WORDS_PER_PAGE`), the file is classed as scanned and `ocr` is offered. If automatic
choice proves wrong, add a setting to force an extractor, or a hybrid (per-page: text layer where
present, OCR for pages without). The seam is built so either is an additive change.

All extractors return the same token shape and bbox convention.

### OCR

`tesseract.js` (Apache-2.0, WASM, offline). It is slow, so it is **opt-in per file with a
visible progress bar and cancel**, never silent. Page images for OCR come from MuPDF's renderer,
so no second engine is needed. Tesseract reports word boxes in image pixels; they are converted
to the bbox convention using the render scale. OCR'd books are marked as such on the record,
since their quality differs from a real text layer.

### Rendering

Parsing today uses one throwaway worker per file. Rendering needs the opposite: a **long-lived
render worker that holds the open document** and answers `pageSizes`, `renderPage(page, scale)`
(returns a transferable bitmap) and cancellation, so flipping pages does not reparse the file.
Parse worker and render worker share the same MuPDF wrapper module but have different
lifecycles; both stay in worker-safe code.

Things the pdf.js version gave for free that must be rebuilt:

- **Selectable text layer.** `PdfPageView` uses pdf.js `TextLayer`. Replacement: an invisible
  text layer built from MuPDF's structured text (or from the page's own tokens, which already
  carry word boxes). Decide which when this is built; tokens are simpler but only cover
  extracted words.
- **Viewport maths.** `convertToViewportPoint` / `convertToPdfPoint` (highlight and
  click-to-word) become small pure functions in `formats/pdf/`, covered by unit tests.
- **Cancellation** of an in-flight render when a newer one is requested.
- **Fit scales** (`fitScales` in `book-nav.ts`) only need page sizes at scale 1, so they carry
  over unchanged.

### Coordinate convention

`Token.bbox` drives the highlight and click-to-word. MuPDF and pdf.js disagree on origin. The
convention is fixed once, in `core/types.ts` (PDF points, one stated origin), and the extractors,
the renderer's viewport maths and OCR conversion all go through one shared helper.

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

1. Book record: `formatId` + `layout` union, with migration and tests. **Done** (uncommitted).
   `FormatId` and `ContentLayout` live in `core/types.ts`; `normalizeBookRecord` in
   `storage/schema.ts` serves both the Dexie v3 upgrade and old-backup import.
2. Parser registry replaces the if-chain.
3. UI checks capabilities / the union instead of `pages`.
4. MuPDF wrapper + `PdfExtractor` seam; compare against `pdfjs` and the Python reference.
5. MuPDF render worker, text layer and viewport maths; then delete pdf.js.
6. OCR extractor and its opt-in UI.
7. Bundled cleanups (section 7).
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

None blocking. Revisit once the render worker exists.

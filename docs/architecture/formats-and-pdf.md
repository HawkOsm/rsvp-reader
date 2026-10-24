# Formats, parsing and the PDF pipeline

`src/parse/`, `src/pdf/`, `src/ocr/`.

## The format registry

A format is identified by a `FormatId` (`'pdf' | 'epub' | 'text'`, in `core/types.ts`). Two
tables are keyed by it, and both are `Record<FormatId, …>`, so a format missing from either one
is a compile error:

| File                | Holds                                       | Why separate                                                |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `parse/formats.ts`  | extensions per format, the file-picker list | pure data; the UI imports it without pulling in parser code |
| `parse/registry.ts` | a lazy `import()` loader per format         | each parser (and JSZip or MuPDF) loads only when needed     |

Unknown extensions fall back to the text parser. A parser returns a `ParseResult`
(`parse/types.ts`): `title`, `tokens`, `formatId`, `layout`, `page` (the page size), and `ocr`
if the words were recognised from images.

### Adding a format

1. Add the id to `FormatId` in `core/types.ts`.
2. Add its extensions to `FORMAT_EXTENSIONS` and its loader to `LOADERS` (the compiler will ask).
3. Write the parser in `parse/<format>/`. It returns tokens, nothing else. Put a fixture in
   `tests/fixtures/` and tests in `tests/parse/`.
4. If it has real pages, return `layout: { kind: 'paged', … }` and see the reader's
   `PagePanel`. Otherwise use `reflow`, and the text panel just works.

## Where parsing runs

`parse/client.ts` → `parseFileInWorker(file)`:

- **PDF** goes to the shared PDF worker (`pdfClient.parse`), the same one that later draws pages.
- **Everything else** gets a fresh `parse.worker.ts`, terminated when it finishes, fails or is
  cancelled. One file per worker, so a parser that leaks or hangs can't affect the next import.

Errors can't cross `postMessage` as classes. `parse/worker-errors.ts` flags them on the way out
and rebuilds `ExtractionError` and `NoTextLayerError` on the way in, so the UI can still
`instanceof` them.

## PDF: MuPDF only

pdf.js is gone. MuPDF (WASM, `mupdf` on npm, AGPL-3.0) extracts, renders and feeds OCR.

- `pdf/document.ts` is **the only file that calls MuPDF**. `PdfDocument` gives page count, title,
  page size with its user-to-page transform, lines (in MuPDF's block order), render, and close.
- `pdf/service.ts` + `pdf/pdf.worker.ts`: one long-lived worker answers `parse`, `open`,
  `pageSize`, `render`, `lines` and `close`. Renders are queued; a newer request for the same view
  replaces an older one, and cancelled ones are dropped.
- `pdf/client.ts`, on the main thread, shuts the worker down when idle, caches sizes and lines,
  and reports a crash through `onLost` on every open `PdfHandle`.
- `parse/pdf/extract.ts` turns lines into tokens: it removes repeated headers and footers
  (`repeats.ts`), joins letter-spaced headings (`spaced.ts`), ends paragraphs on a block change
  (`paragraphs.ts`), and rejoins hyphenated line ends. `linesToTokens` is shared with OCR.

### Scanned PDFs (OCR)

A PDF with no text layer throws `NoTextLayerError`. The library then offers OCR
(`OcrDialog`); it never runs on its own. `ocr/ocr-pdf.ts` draws each page through the PDF worker,
`ocr/recognizer.ts` reads it with Tesseract (English and Turkish are bundled under
`public/ocr/`), and the lines go through the same `linesToTokens`. `ocr/startup.ts` guards the
Tesseract start-up against hangs (a bad language file never settles) with a timeout and an abort
signal.

### Coordinates

`Token.bbox` is `[x0, y0, x1, y1]` in PDF points with **y up**. Books imported since the MuPDF
switch store it on the page as displayed (`layout.boxSpace: 'displayed'`). Older books stored
raw user space and are converted with the page's transform when drawn. All of this is in
`pdf/geometry.ts`, the only place screen and PDF coordinates meet.

## Licence note

MuPDF is the one copyleft dependency. The app is GPL-3.0-or-later and combines with it under
GPLv3 §13. Any new dependency must be permissive or GPL-compatible, and must be added to
`docs/THIRD_PARTY.md`.

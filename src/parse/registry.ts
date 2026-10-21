import type { FormatId } from '../core/types'
import type { ParseOptions, ParseResult } from './types'

export type ParseFn = (file: File, options: ParseOptions) => Promise<ParseResult>

// Which extensions belong to which format is in formats.ts. This is the
// other half: how to parse each one. Keyed by `FormatId`, so a format
// without a parser (or a duplicate) does not compile.
//
// These are dynamic imports so the main bundle never contains parser code,
// and a format's dependencies (JSZip, MuPDF) are fetched only when a file of
// that format is opened. In the app a PDF is read by the PDF worker
// (pdf/client.ts), so the `pdf` loader here serves tests and any caller
// already off the main thread.
const LOADERS: Record<FormatId, () => Promise<ParseFn>> = {
  pdf: async () => (await import('./pdf')).parsePdf,
  epub: async () => (await import('./epub')).parseEpub,
  text: async () => (await import('./text')).parseTextFile,
}

export function loadParser(id: FormatId): Promise<ParseFn> {
  return LOADERS[id]()
}

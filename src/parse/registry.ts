import type { FormatId } from '../core/types'
import type { ParseOptions, ParseResult } from './types'

export type ParseFn = (file: File, options: ParseOptions) => Promise<ParseResult>

// Which extensions belong to which format is in formats.ts. This is the
// other half: how to parse each one. Keyed by `FormatId`, so a format
// without a parser (or a duplicate) does not compile.
//
// These are dynamic imports so the main bundle never contains parser code.
// The parse worker is built as a single script, so pdf.js and JSZip still
// download with the worker; they are only *run* when a file needs them.
const LOADERS: Record<FormatId, () => Promise<ParseFn>> = {
  pdf: async () => (await import('./pdf')).parsePdf,
  epub: async () => (await import('./epub')).parseEpub,
  text: async () => (await import('./text')).parseTextFile,
}

export function loadParser(id: FormatId): Promise<ParseFn> {
  return LOADERS[id]()
}

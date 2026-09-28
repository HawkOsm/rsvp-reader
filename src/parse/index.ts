import { ExtractionError } from './errors'
import { TEXT_EXTENSIONS, parseTextFile } from './text'
import type { ParseResult, ProgressCallback } from './types'

export type { ParseResult, ParseProgress, ProgressCallback, ParsedChapter } from './types'
export { ExtractionError } from './errors'

export interface ParseFileOptions {
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}

/**
 * File -> ParseResult, dispatching by extension. Every parser returns the
 * same shape, so callers (the worker, and anything testing this directly)
 * never care which one ran.
 *
 * PDF and EPUB parsing are dynamically imported: pdf.js and JSZip are only
 * needed once a user actually opens one of those, not on every worker
 * startup or text-file import.
 */
export async function parseFile(file: File, options: ParseFileOptions = {}): Promise<ParseResult> {
  const ext = extensionOf(file.name)

  if (ext === 'pdf') {
    const { parsePdf } = await import('./pdf')
    return parsePdf(file, options)
  }

  if (ext === 'epub') {
    const { parseEpub } = await import('./epub')
    return parseEpub(file, options)
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return parseTextFile(file)
  }

  // Unknown extension: try to read it as text rather than refusing
  // outright, matching text_extract.py's extract_text() fallback.
  try {
    return await parseTextFile(file)
  } catch (error) {
    if (error instanceof ExtractionError) throw error
    throw new ExtractionError(`Could not read this file: ${(error as Error).message}`)
  }
}

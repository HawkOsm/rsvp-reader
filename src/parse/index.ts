import { ExtractionError } from './errors'
import { FALLBACK_FORMAT, formatOfFileName } from './formats'
import { loadParser } from './registry'
import type { ParseOptions, ParseResult } from './types'

export type { ParseOptions, ParseResult } from './types'
export { ExtractionError, NoTextLayerError } from './errors'

/**
 * File -> ParseResult, using whichever parser is registered for the
 * file's extension. Every parser returns the same shape, so callers (the
 * worker, and anything testing this directly) never care which one ran.
 */
export async function parseFile(file: File, options: ParseOptions = {}): Promise<ParseResult> {
  const format = formatOfFileName(file.name)
  if (format) {
    return (await loadParser(format))(file, options)
  }

  // Unknown extension: try to read it as text rather than refusing
  // outright, matching text_extract.py's extract_text() fallback.
  try {
    return (await loadParser(FALLBACK_FORMAT))(file, options)
  } catch (error) {
    if (error instanceof ExtractionError) throw error
    throw new ExtractionError(`Could not read this file: ${(error as Error).message}`)
  }
}

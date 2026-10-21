import type { FormatId } from '../core/types'
import { extensionOf } from './file-name'

// Pure data, no imports of parser code: the UI reads this (for the file
// picker), and anything that touches a parser's loader would drag that
// parser's chunk into the main bundle. Loaders live in registry.ts.

/** The extensions each format is read from (lower-case, no dot). Keyed by
 * `FormatId`, so adding a format to the union is a compile error until it
 * has an entry here and in registry.ts. */
export const FORMAT_EXTENSIONS: Record<FormatId, readonly string[]> = {
  pdf: ['pdf'],
  epub: ['epub'],
  text: ['txt', 'md', 'markdown', 'text', 'rst', 'org'],
}

export const FORMAT_IDS = Object.keys(FORMAT_EXTENSIONS) as FormatId[]

/** What a file of an unrecognised type is tried as. */
export const FALLBACK_FORMAT: FormatId = 'text'

/** The format registered for this file name's extension, if any. */
export function formatOfFileName(fileName: string): FormatId | undefined {
  const ext = extensionOf(fileName)
  return FORMAT_IDS.find((id) => FORMAT_EXTENSIONS[id].includes(ext))
}

/** Extensions the file picker should offer, with the leading dot. */
export const ACCEPTED_EXTENSIONS: readonly string[] = FORMAT_IDS.flatMap((id) =>
  FORMAT_EXTENSIONS[id].map((ext) => `.${ext}`),
)

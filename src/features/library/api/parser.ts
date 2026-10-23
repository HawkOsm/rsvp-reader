import { parseFile, type ParseResult } from '@/parse'
import { parseFileInWorker } from '@/parse/client'

export interface ImportOptions {
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
}

/** How a file becomes tokens (Strategy). The import service doesn't care
 * which one it was given. */
export interface BookParser {
  parse(file: File, options: ImportOptions): Promise<ParseResult>
}

/** The app's parser: off the UI thread, one worker per file. */
export const workerParser: BookParser = {
  parse: (file, options) => parseFileInWorker(file, options),
}

/** Same parsers, on the calling thread — for tests, since jsdom has no
 * real Worker. */
export const inlineParser: BookParser = {
  parse: (file, options) =>
    parseFile(file, {
      signal: options.signal,
      onProgress: (p) => options.onProgress?.(p.fraction, p.message),
    }),
}

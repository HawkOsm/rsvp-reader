import type { Token } from '../core/types'

export interface ParsedChapter {
  title: string
  startTokenIndex: number
}

/** Every parser returns this same shape, so the UI never cares about the
 * source file type. */
export interface ParseResult {
  title: string
  author?: string
  tokens: Token[]
  /** PDFs only. */
  pages?: number
  /** EPUBs only — lets the UI offer a chapter jump. */
  chapters?: ParsedChapter[]
}

export interface ParseProgress {
  /** 0..1 */
  fraction: number
  message?: string
}

export type ProgressCallback = (progress: ParseProgress) => void

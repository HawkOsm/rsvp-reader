import type { Token } from '../core/types'
import type { ReadingMode } from '../storage/schema'

export type { ReadingMode }

/** Where the reader is in a book, and how it was reading. */
export interface ReadingPosition {
  wordIndex: number
  wpm: number
  mode: ReadingMode
}

/** Everything the reader needs to start playing a book. */
export interface OpenedBook {
  id: number
  title: string
  /** PDFs only — drives the page panel and the "page N / M" readout. */
  pages?: number
  tokens: Token[]
  /** The saved position, or the start of the book. */
  position: ReadingPosition
}

export interface OpenOptions {
  /** The WPM for a book with no saved position yet. */
  defaultWpm?: number
}

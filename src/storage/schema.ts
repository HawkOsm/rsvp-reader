import Dexie, { type Table } from 'dexie'
import type { Token } from '../core/types'

/** Bumped whenever the packed token format changes, so caches written by an
 * older version stop matching and get rebuilt on next open. Mirrors
 * db.py's CACHE_VERSION. */
export const CACHE_VERSION = 1

export type BookSource = 'local' | 'gutendex'

export interface BookRecord {
  id?: number
  title: string
  source: BookSource
  /** Gutendex book id, for re-import dedup; absent for local files. */
  sourceId?: string
  /** Gutendex imports only — text_extract.py has no author concept for
   * local files. */
  author?: string
  totalWords: number
  /** PDFs only — drives the page panel's PDF-vs-reflow choice and the
   * transport bar's "page N / M". */
  pages?: number
  /** `v<CACHE_VERSION>:<size>:<lastModified>` — no file path exists on
   * web, so this (not a path) is what decides whether cached tokens are
   * still good. */
  fingerprint: string
  addedAt: number
  lastOpenedAt: number | null
}

export interface TokenRecord {
  bookId: number
  /** The whole book's tokens as one value, not one Dexie row per word —
   * keeps writes fast (see DECISIONS.md). */
  tokens: Token[]
}

export type ReadingMode = 'rsvp' | 'book'

export interface ProgressRecord {
  bookId: number
  wordIndex: number
  wpm: number
  mode: ReadingMode
  updatedAt: number
}

export interface SettingRecord {
  key: string
  value: unknown
}

export interface FileRecord {
  bookId: number
  blob: Blob
  fileName: string
  mimeType: string
}

export class RsvpDatabase extends Dexie {
  books!: Table<BookRecord, number>
  tokens!: Table<TokenRecord, number>
  progress!: Table<ProgressRecord, number>
  settings!: Table<SettingRecord, string>
  files!: Table<FileRecord, number>

  constructor(name = 'rsvp-reader') {
    super(name)
    // Versioned from day one — a later schema change adds a new
    // `.version(2).stores({...}).upgrade(...)` block rather than editing
    // this one, so existing users migrate instead of losing their library.
    this.version(1).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
    })
  }
}

let instance: RsvpDatabase | null = null

/** The shared database instance. Pass a name only from tests, to isolate
 * each test's data. */
export function getDb(name?: string): RsvpDatabase {
  if (name) return new RsvpDatabase(name)
  if (!instance) instance = new RsvpDatabase()
  return instance
}

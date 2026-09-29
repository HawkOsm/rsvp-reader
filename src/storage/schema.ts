import Dexie, { type Table, type Transaction } from 'dexie'
import { DEFAULT_WPM } from '../core/pacing'
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

/** The old `web/js/library.js`'s raw-IndexedDB shape — same database name
 * ("rsvp-reader") and version (1) as this class's own `.version(1)`, which
 * is not a coincidence: it's what lets `.version(2)`'s `.upgrade()` below
 * carry a real user's existing library forward instead of erroring or
 * silently ignoring it once the new app is served from the same origin
 * (see DECISIONS.md's Phase 10 log). Loose types on purpose — this shape
 * only ever exists mid-migration.
 */
interface LegacyBookRecord {
  id: number
  title: string
  kind: 'pdf' | 'txt'
  size: number
  totalWords: number
  lastIndex: number
  lastOpenedAt: number | null
  addedAt: number
}
interface LegacyFileRecord {
  bookId: number
  data: ArrayBuffer
}

export class RsvpDatabase extends Dexie {
  books!: Table<BookRecord, number>
  tokens!: Table<TokenRecord, number>
  progress!: Table<ProgressRecord, number>
  settings!: Table<SettingRecord, string>
  files!: Table<FileRecord, number>

  constructor(name = 'rsvp-reader') {
    super(name)

    // Matches the old web app's raw-IndexedDB structure exactly (same
    // store names, same keyPaths, no secondary indexes) — not this app's
    // own "day one" schema. Declaring it any differently would either
    // make Dexie recreate stores a real existing database already has
    // (fine for a brand-new user, but Dexie also uses this declaration to
    // recognize "nothing to upgrade" when a same-named/versioned database
    // already exists — get it wrong and an existing user's real library
    // silently keeps using structure this app never actually declared).
    this.version(1).stores({
      books: '++id',
      tokens: 'bookId',
      files: 'bookId',
    })

    this.version(2)
      .stores({
        books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
        tokens: 'bookId',
        progress: 'bookId, updatedAt',
        settings: 'key',
        files: 'bookId',
      })
      .upgrade((tx) => migrateFromLegacyWebApp(tx))
  }
}

async function migrateFromLegacyWebApp(tx: Transaction): Promise<void> {
  const booksTable = tx.table<LegacyBookRecord, number>('books')
  const tokensTable = tx.table<TokenRecord, number>('tokens')
  const filesTable = tx.table<LegacyFileRecord, number>('files')
  const progressTable = tx.table<ProgressRecord, number>('progress')

  const legacyBooks = await booksTable.toArray()

  for (const legacy of legacyBooks) {
    const tokenRow = await tokensTable.get(legacy.id)
    let pages: number | undefined
    if (legacy.kind === 'pdf' && tokenRow?.tokens?.length) {
      const maxPage = tokenRow.tokens.reduce((max: number, t: Token) => Math.max(max, t.page), -1)
      if (maxPage >= 0) pages = maxPage + 1
    }

    const migrated: BookRecord = {
      id: legacy.id,
      title: legacy.title,
      source: 'local',
      totalWords: legacy.totalWords ?? 0,
      pages,
      // No lastModified was ever recorded, so this can't match a real
      // fingerprintOf(file) — fine, since nothing currently re-derives
      // tokens from it (see DECISIONS.md's Phase 4 log); it only needs to
      // be a stable, book-unique value for addBook()'s dedup check.
      fingerprint: `legacy:${legacy.size ?? 0}:${legacy.id}`,
      addedAt: legacy.addedAt ?? Date.now(),
      lastOpenedAt: legacy.lastOpenedAt ?? null,
    }
    await booksTable.put(migrated as never)

    if (typeof legacy.lastIndex === 'number' && legacy.lastIndex > 0) {
      const progress: ProgressRecord = {
        bookId: legacy.id,
        wordIndex: legacy.lastIndex,
        wpm: DEFAULT_WPM,
        mode: 'rsvp',
        updatedAt: legacy.lastOpenedAt ?? legacy.addedAt ?? Date.now(),
      }
      await progressTable.put(progress)
    }

    const legacyFile = await filesTable.get(legacy.id)
    if (legacyFile?.data) {
      const mimeType = legacy.kind === 'pdf' ? 'application/pdf' : 'text/plain'
      const ext = legacy.kind === 'pdf' ? 'pdf' : 'txt'
      const fileRecord: FileRecord = {
        bookId: legacy.id,
        blob: new Blob([legacyFile.data], { type: mimeType }),
        fileName: `${legacy.title || 'book'}.${ext}`,
        mimeType,
      }
      await filesTable.put(fileRecord as never)
    }
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

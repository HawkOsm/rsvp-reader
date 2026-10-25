import Dexie, { type Table, type Transaction } from 'dexie'
import { DEFAULT_WPM } from '@/core/pacing'
import { DEFAULT_PAGE, type PageSpec } from '@/core/page-spec'
import type { ContentLayout, FormatId, Token } from '@/core/types'

/** Bumped whenever the packed token format changes, so caches written by an
 * older version stop matching and get rebuilt on next open. Mirrors
 * db.py's CACHE_VERSION. */
export const CACHE_VERSION = 1

/** `'gutendex'` only on books imported by the since-removed Project
 * Gutenberg search; kept so those rows still type-check. */
export type BookSource = 'local' | 'gutendex'

/** Where a chapter starts, as the parser found it (EPUB headings). */
export interface BookChapter {
  title: string
  startTokenIndex: number
}

export interface BookRecord {
  id?: number
  title: string
  source: BookSource
  /** Legacy Gutendex imports only: the Gutenberg book id and author. */
  sourceId?: string
  author?: string
  totalWords: number
  /** Which parser produced this book. Chosen at import, never re-derived
   * from a file name later. */
  formatId: FormatId
  /** Paged or reflowed. Every reader-UI branch on page-ness keys on this,
   * as does saving the original file at import. */
  layout: ContentLayout
  /** The size of the book's page, scanned once at import and never changed
   * (a PDF's first page; the default for anything without pages). */
  page: PageSpec
  /** The book's chapters, in reading order. Empty for a format without
   * them, and for any book imported before chapters were kept: those are
   * never parsed again to find theirs. */
  chapters: BookChapter[]
  /** `v<CACHE_VERSION>:<size>:<lastModified>` — no file path exists on
   * web, so this (not a path) is what decides whether cached tokens are
   * still good. */
  fingerprint: string
  /** The words were recognised from page images (OCR), not read from a
   * text layer. */
  ocr?: true
  addedAt: number
  lastOpenedAt: number | null
}

/** A book row as an older version wrote it: `pages` instead of `layout`, and
 * no `formatId`. Only ever read by `normalizeBookRecord`. */
export type StoredBookRecord = Omit<BookRecord, 'formatId' | 'layout' | 'page' | 'chapters'> &
  Partial<Pick<BookRecord, 'formatId' | 'layout' | 'page' | 'chapters'>> & { pages?: number }

/** Bring a book row from any earlier version up to the current shape.
 * Shared by the Dexie upgrade and by backup import, so an old backup file
 * restores the same way an old database upgrades.
 *
 * Rows from before `formatId` existed had a page count only if they were
 * PDFs, so that is the one thing format is inferred from. An EPUB saved by
 * an older version comes out as `'text'`: it reads identically (both
 * reflow), and nothing stored says otherwise. */
export function normalizeBookRecord(raw: StoredBookRecord): BookRecord {
  const { pages, formatId, layout, page, chapters, ...rest } = raw
  const resolvedLayout: ContentLayout =
    layout ?? (pages !== undefined ? { kind: 'paged', pages } : { kind: 'reflow' })
  return {
    ...rest,
    formatId: formatId ?? (resolvedLayout.kind === 'paged' ? 'pdf' : 'text'),
    layout: resolvedLayout,
    page: page ?? DEFAULT_PAGE,
    chapters: chapters ?? [],
  }
}

export interface TokenRecord {
  bookId: number
  /** The whole book's tokens as one value, not one Dexie row per word —
   * keeps writes fast (see docs/architecture/decisions.md). */
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

/** A book's cover image, for the library grid. Backups leave it out: a PDF's
 * is drawn again from its file, an EPUB's comes back when it is re-added. */
export interface CoverRecord {
  bookId: number
  blob: Blob
}

/** The colours a shelf's dot can take: colour tokens, see docs/architecture/ui.md. */
export const SHELF_COLORS = [
  'accent',
  'shelf-blue',
  'shelf-green',
  'shelf-amber',
  'shelf-violet',
] as const
export type ShelfColor = (typeof SHELF_COLORS)[number]

/** A named set of books, kept by the reader. The shelf holds the book ids,
 * so a book on no shelf costs nothing and a book row never changes. */
export interface ShelfRecord {
  id?: number
  name: string
  color: ShelfColor
  bookIds: number[]
  createdAt: number
}

/** A word the reader marked, to come back to. */
export interface BookmarkRecord {
  id?: number
  bookId: number
  wordIndex: number
  /** The first few words from the mark, so the list says where it is
   * without loading the book's tokens. */
  excerpt: string
  createdAt: number
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
 * (see docs/architecture/decisions.md's Phase 10 log). Loose types on purpose — this shape
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
  covers!: Table<CoverRecord, number>
  shelves!: Table<ShelfRecord, number>
  bookmarks!: Table<BookmarkRecord, number>

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

    // Same tables; only the shape of a book row changes (`pages` ->
    // `formatId` + `layout`).
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<StoredBookRecord, number>('books')
          .toCollection()
          .modify((book) => {
            const next = normalizeBookRecord(book)
            delete book.pages
            book.formatId = next.formatId
            book.layout = next.layout
          }),
      )

    // Every book gets a page size. Older ones have none stored (their PDFs were
    // never measured), so they take the default, frozen like any other.
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<StoredBookRecord, number>('books')
          .toCollection()
          .modify((book) => {
            book.page ??= DEFAULT_PAGE
          }),
      )

    // Cover images for the library grid. A new table only: covers are made
    // when the library next shows a book, never here.
    this.version(5).stores({ covers: 'bookId' })

    // Shelves. A new table only: every existing book starts on no shelf.
    this.version(6).stores({ shelves: '++id' })

    // Bookmarks. A new table only: no book has any yet.
    this.version(7).stores({ bookmarks: '++id, bookId' })

    // Every book gets a chapter list. Older ones have none stored and get an
    // empty one: finding theirs would mean parsing the book again.
    this.version(8)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<StoredBookRecord, number>('books')
          .toCollection()
          .modify((book) => {
            book.chapters ??= []
          }),
      )
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

    const migrated: StoredBookRecord = {
      id: legacy.id,
      title: legacy.title,
      source: 'local',
      totalWords: legacy.totalWords ?? 0,
      pages,
      // No lastModified was ever recorded, so this can't match a real
      // fingerprintOf(file) — fine, since nothing currently re-derives
      // tokens from it (see docs/architecture/decisions.md's Phase 4 log); it only needs to
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

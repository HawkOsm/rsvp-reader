import { DEFAULT_WPM } from '@/core/pacing'
import type { PageSpec } from '@/core/page-spec'
import type { ContentLayout, FormatId, Token } from '@/core/types'
import { fingerprintOf } from './fingerprint'
import type {
  BookChapter,
  BookRecord,
  BookSource,
  ProgressRecord,
  ReadingMode,
  RsvpDatabase,
} from './schema'
import { recordChange, syncTables } from './sync-log'

// Ported from db.py's Database class — same operations, backed by Dexie
// instead of SQLite. See docs/architecture/decisions.md for how the table shapes differ
// (packed one-row-per-book tokens, a separate progress table, no file path).

export interface AddBookInput {
  title: string
  source: BookSource
  fingerprint: string
  formatId: FormatId
  layout: ContentLayout
  page: PageSpec
  /** Left out for a format without chapters. */
  chapters?: BookChapter[]
  /** Only a clean one (`parse/author.ts`); left out otherwise. */
  author?: string
  ocr?: true
  syncId?: string
}

/** Add a book, or return the existing row if it's already in the library. */
export async function addBook(db: RsvpDatabase, input: AddBookInput): Promise<BookRecord> {
  const existing = await db.books.where('fingerprint').equals(input.fingerprint).first()
  if (existing) return existing

  const id = await db.books.add({
    title: input.title,
    source: input.source,
    totalWords: 0,
    fingerprint: input.fingerprint,
    formatId: input.formatId,
    layout: input.layout,
    page: input.page,
    chapters: input.chapters ?? [],
    ...(input.author && { author: input.author }),
    ...(input.ocr && { ocr: true as const }),
    ...(input.syncId && { syncId: input.syncId }),
    addedAt: Date.now(),
    lastOpenedAt: null,
  })
  const book = await db.books.get(id)
  if (!book) throw new Error('addBook: inserted row vanished')
  return book
}

/** List the library, most recently opened first (falling back to when it
 * was added, for a book that's never been opened) — the list screen reads
 * from here only. */
export async function listBooks(db: RsvpDatabase): Promise<BookRecord[]> {
  const books = await db.books.toArray()
  return books.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
}

export async function getBook(db: RsvpDatabase, bookId: number): Promise<BookRecord | undefined> {
  return db.books.get(bookId)
}

/** Remove a book, and tell other devices to remove it too. */
export async function removeBook(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.transaction('rw', [...bookTables(db), ...syncTables(db)], async () => {
    const book = await db.books.get(bookId)
    await deleteBookRows(db, bookId)
    if (book?.syncId) await recordChange(db, { kind: 'book', book: book.syncId, value: null })
  })
}

/** Every table that holds part of a book (shelves hold its id). */
export const bookTables = (db: RsvpDatabase) => [
  db.books,
  db.tokens,
  db.progress,
  db.files,
  db.covers,
  db.bookmarks,
  db.shelves,
]

/** Delete a book's rows, recording nothing: for a removal that came from
 * another device. Call it inside a transaction over `bookTables(db)`. */
export async function deleteBookRows(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.books.delete(bookId)
  await db.tokens.delete(bookId)
  await db.progress.delete(bookId)
  await db.files.delete(bookId)
  await db.covers.delete(bookId)
  await db.bookmarks.where('bookId').equals(bookId).delete()
  // A later book can take this id, and must not inherit its shelves or bookmarks.
  await db.shelves.toCollection().modify((shelf) => {
    shelf.bookIds = shelf.bookIds.filter((id) => id !== bookId)
  })
}

export async function touchOpened(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.books.update(bookId, { lastOpenedAt: Date.now() })
}

// --------------------------------------------------------------- tokens

/** True when the cached token list still matches the given file's bytes. */
export async function tokensAreFresh(
  db: RsvpDatabase,
  book: BookRecord,
  file: File,
): Promise<boolean> {
  if (book.totalWords <= 0) return false
  if (fingerprintOf(file) !== book.fingerprint) return false
  const record = await db.tokens.get(book.id as number)
  return record !== undefined && record.tokens.length === book.totalWords
}

export async function saveTokens(
  db: RsvpDatabase,
  bookId: number,
  tokens: Token[],
  fingerprint: string,
): Promise<void> {
  await db.transaction('rw', [db.tokens, db.books, ...syncTables(db)], async () => {
    await db.tokens.put({ bookId, tokens })
    await db.books.update(bookId, { totalWords: tokens.length, fingerprint })
    const book = await db.books.get(bookId)
    if (book?.syncId) {
      const value = { title: book.title, formatId: book.formatId, totalWords: tokens.length }
      await recordChange(db, { kind: 'book', book: book.syncId, value })
    }
  })
}

export async function getTokens(db: RsvpDatabase, bookId: number): Promise<Token[] | undefined> {
  const record = await db.tokens.get(bookId)
  return record?.tokens
}

// -------------------------------------------------------------- progress

export interface SaveProgressInput {
  wordIndex: number
  wpm: number
  mode: ReadingMode
}

export async function saveProgress(
  db: RsvpDatabase,
  bookId: number,
  input: SaveProgressInput,
): Promise<void> {
  await db.transaction('rw', [db.progress, db.books, ...syncTables(db)], async () => {
    const before = await db.progress.get(bookId)
    await db.progress.put({ bookId, ...input, updatedAt: Date.now() })
    // Saving the place this device was already at is not a change. The
    // reader saves on opening and leaving a book, and a device that only did
    // that must not send its old place over a newer one from another device
    // (docs/architecture/sync.md, section 8). A book never saved before
    // starts at word 0.
    const unmoved = before
      ? before.wordIndex === input.wordIndex &&
        before.wpm === input.wpm &&
        before.mode === input.mode
      : input.wordIndex === 0
    if (!unmoved) await recordProgress(db, bookId, input)
  })
}

/** Record this device's place as the newest, whether or not it moved: for
 * declining another device's place. */
export async function keepProgress(
  db: RsvpDatabase,
  bookId: number,
  input: SaveProgressInput,
): Promise<void> {
  await db.transaction('rw', [db.progress, db.books, ...syncTables(db)], async () => {
    await db.progress.put({ bookId, ...input, updatedAt: Date.now() })
    await recordProgress(db, bookId, input)
  })
}

async function recordProgress(db: RsvpDatabase, bookId: number, input: SaveProgressInput) {
  const book = await db.books.get(bookId)
  if (!book?.syncId) return
  const value = { wordIndex: input.wordIndex, wpm: input.wpm, mode: input.mode }
  await recordChange(db, { kind: 'progress', book: book.syncId, value })
}

export async function getProgress(
  db: RsvpDatabase,
  bookId: number,
): Promise<ProgressRecord | undefined> {
  return db.progress.get(bookId)
}

/** Reset the word index to the start, keeping the WPM/mode the reader had. */
export async function resetProgress(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.transaction('rw', [db.progress, db.books, ...syncTables(db)], async () => {
    const existing = await db.progress.get(bookId)
    const input = {
      wordIndex: 0,
      wpm: existing?.wpm ?? DEFAULT_WPM,
      mode: existing?.mode ?? 'rsvp',
    }
    await db.progress.put({ bookId, ...input, updatedAt: Date.now() })
    await recordProgress(db, bookId, input)
  })
}

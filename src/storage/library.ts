import { DEFAULT_WPM } from '../core/pacing'
import type { Token } from '../core/types'
import { fingerprintOf } from './fingerprint'
import type {
  BookRecord,
  BookSource,
  ProgressRecord,
  ReadingMode,
  RsvpDatabase,
} from './schema'

// Ported from db.py's Database class — same operations, backed by Dexie
// instead of SQLite. See DECISIONS.md for how the table shapes differ
// (packed one-row-per-book tokens, a separate progress table, no file path).

export interface AddBookInput {
  title: string
  source: BookSource
  /** Gutendex book id; used to dedup a re-import instead of the fingerprint,
   * since re-fetching the same remote book can yield slightly different
   * bytes (and so a different fingerprint) than the fingerprint the user's
   * first import produced. */
  sourceId?: string
  fingerprint: string
}

/** Add a book, or return the existing row if it's already in the library. */
export async function addBook(db: RsvpDatabase, input: AddBookInput): Promise<BookRecord> {
  const existing =
    input.source === 'gutendex' && input.sourceId
      ? await db.books.where({ source: 'gutendex', sourceId: input.sourceId }).first()
      : await db.books.where('fingerprint').equals(input.fingerprint).first()
  if (existing) return existing

  const id = await db.books.add({
    title: input.title,
    source: input.source,
    sourceId: input.sourceId,
    totalWords: 0,
    fingerprint: input.fingerprint,
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

export async function removeBook(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.transaction('rw', db.books, db.tokens, db.progress, db.files, async () => {
    await db.books.delete(bookId)
    await db.tokens.delete(bookId)
    await db.progress.delete(bookId)
    await db.files.delete(bookId)
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
  await db.transaction('rw', db.tokens, db.books, async () => {
    await db.tokens.put({ bookId, tokens })
    await db.books.update(bookId, { totalWords: tokens.length, fingerprint })
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
  await db.progress.put({ bookId, ...input, updatedAt: Date.now() })
}

export async function getProgress(
  db: RsvpDatabase,
  bookId: number,
): Promise<ProgressRecord | undefined> {
  return db.progress.get(bookId)
}

/** Reset the word index to the start, keeping the WPM/mode the reader had. */
export async function resetProgress(db: RsvpDatabase, bookId: number): Promise<void> {
  const existing = await db.progress.get(bookId)
  await db.progress.put({
    bookId,
    wordIndex: 0,
    wpm: existing?.wpm ?? DEFAULT_WPM,
    mode: existing?.mode ?? 'rsvp',
    updatedAt: Date.now(),
  })
}

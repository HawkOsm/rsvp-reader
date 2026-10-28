import type { BookmarkRecord, RsvpDatabase } from './schema'
import { recordChange, syncTables } from './sync-log'

/** Every bookmark in the library, newest first. */
export async function listBookmarks(db: RsvpDatabase): Promise<BookmarkRecord[]> {
  const all = await db.bookmarks.toArray()
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

/** One book's bookmarks, in reading order. */
export async function bookmarksOf(db: RsvpDatabase, bookId: number): Promise<BookmarkRecord[]> {
  const marks = await db.bookmarks.where('bookId').equals(bookId).toArray()
  return marks.sort((a, b) => a.wordIndex - b.wordIndex)
}

/** Mark a word. Marking the same word twice keeps the one bookmark. */
export async function addBookmark(
  db: RsvpDatabase,
  bookId: number,
  wordIndex: number,
  excerpt: string,
): Promise<BookmarkRecord> {
  return db.transaction('rw', [db.bookmarks, db.books, ...syncTables(db)], async () => {
    const existing = (await bookmarksOf(db, bookId)).find((m) => m.wordIndex === wordIndex)
    if (existing) return existing
    const mark: BookmarkRecord = { bookId, wordIndex, excerpt, createdAt: Date.now() }
    const id = await db.bookmarks.add(mark)
    await recordBookmark(db, mark, { excerpt, createdAt: mark.createdAt })
    return { ...mark, id }
  })
}

export async function removeBookmark(db: RsvpDatabase, bookmarkId: number): Promise<void> {
  await db.transaction('rw', [db.bookmarks, db.books, ...syncTables(db)], async () => {
    const mark = await db.bookmarks.get(bookmarkId)
    await db.bookmarks.delete(bookmarkId)
    if (mark) await recordBookmark(db, mark, null)
  })
}

/** A book with no sync id yet has its bookmarks sent once it gets one
 * (`ensureSyncIds`). */
async function recordBookmark(
  db: RsvpDatabase,
  { bookId, wordIndex }: BookmarkRecord,
  value: { excerpt: string; createdAt: number } | null,
) {
  const book = await db.books.get(bookId)
  if (book?.syncId) {
    await recordChange(db, { kind: 'bookmark', book: book.syncId, wordIndex, value })
  }
}

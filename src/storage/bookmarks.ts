import type { BookmarkRecord, RsvpDatabase } from './schema'

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
  const existing = (await bookmarksOf(db, bookId)).find((m) => m.wordIndex === wordIndex)
  if (existing) return existing
  const mark: BookmarkRecord = { bookId, wordIndex, excerpt, createdAt: Date.now() }
  const id = await db.bookmarks.add(mark)
  return { ...mark, id }
}

export async function removeBookmark(db: RsvpDatabase, bookmarkId: number): Promise<void> {
  await db.bookmarks.delete(bookmarkId)
}

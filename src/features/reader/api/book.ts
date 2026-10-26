import * as bookmarks from '@/storage/bookmarks'
import * as library from '@/storage/library'
import { loadFile } from '@/storage/files'
import {
  getDb,
  type BookChapter,
  type BookRecord,
  type ProgressRecord,
  type ReadingMode,
} from '@/storage/schema'
import type { Token } from '@/core/types'

// What the reader asks of storage: a book to open, and where to remember the
// reader got to. Nothing here takes or returns a handle to the database.

export type { BookChapter, BookRecord, ProgressRecord, ReadingMode }

export const touchOpened = (bookId: number) => library.touchOpened(getDb(), bookId)
export const saveProgress = (bookId: number, input: library.SaveProgressInput) =>
  library.saveProgress(getDb(), bookId, input)

export interface LoadedBookData {
  book: BookRecord | undefined
  tokens: Token[] | undefined
  progress: ProgressRecord | undefined
}

/** A book with its words and where the reader left off. */
export async function loadBook(bookId: number): Promise<LoadedBookData> {
  const db = getDb()
  const [book, tokens, progress] = await Promise.all([
    db.books.get(bookId),
    library.getTokens(db, bookId),
    library.getProgress(db, bookId),
  ])
  return { book, tokens, progress }
}

/** The original file of a book that keeps one (a PDF), if it is stored. */
export async function getBookFile(bookId: number): Promise<Blob | undefined> {
  return (await loadFile(getDb(), bookId))?.blob
}

export type { BookmarkRecord } from '@/storage/schema'
export const bookmarksOf = (bookId: number) => bookmarks.bookmarksOf(getDb(), bookId)
export const addBookmark = (bookId: number, wordIndex: number, excerpt: string) =>
  bookmarks.addBookmark(getDb(), bookId, wordIndex, excerpt)
export const removeBookmark = (bookmarkId: number) => bookmarks.removeBookmark(getDb(), bookmarkId)

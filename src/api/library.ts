import * as library from '../storage/library'
import { loadFile } from '../storage/files'
import { requestPersistence as askPersistence } from '../storage/quota'
import { getSetting, setSetting } from '../storage/settings'
import { getDb, type BookRecord, type ProgressRecord, type ReadingMode } from '../storage/schema'
import type { Token } from '../core/types'

// What the UI asks of the library, with the database kept out of sight:
// nothing here takes or returns a handle to it.

export type { BookRecord, ProgressRecord, ReadingMode }
export { importLocalFile, type ImportBookOptions } from './import-book'

export const listBooks = () => library.listBooks(getDb())
export const removeBook = (bookId: number) => library.removeBook(getDb(), bookId)
export const getProgress = (bookId: number) => library.getProgress(getDb(), bookId)
export const resetProgress = (bookId: number) => library.resetProgress(getDb(), bookId)
export const saveProgress = (bookId: number, input: library.SaveProgressInput) =>
  library.saveProgress(getDb(), bookId, input)
export const touchOpened = (bookId: number) => library.touchOpened(getDb(), bookId)

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

/** Ask the browser to keep the library from being cleared. */
export const requestPersistence = askPersistence

export const loadSetting = <T>(key: string, fallback: T) => getSetting(getDb(), key, fallback)
export const saveSetting = (key: string, value: unknown) => setSetting(getDb(), key, value)

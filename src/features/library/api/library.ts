import * as library from '@/storage/library'
import { requestPersistence as askPersistence, storageUsage } from '@/storage/quota'
import { getDb, type BookRecord } from '@/storage/schema'

// What the library screen asks of storage, with the database kept out of
// sight: nothing here takes or returns a handle to it.

export type { BookRecord }
export { importLocalFile, type ImportBookOptions } from './import-book'
export { getCover } from './covers'

export const listBooks = () => library.listBooks(getDb())
export const removeBook = (bookId: number) => library.removeBook(getDb(), bookId)
export const getProgress = (bookId: number) => library.getProgress(getDb(), bookId)
export const resetProgress = (bookId: number) => library.resetProgress(getDb(), bookId)

/** Ask the browser to keep the library from being cleared. */
export const requestPersistence = askPersistence

/** How much of the browser's storage the library takes, when it says. */
export { storageUsage }

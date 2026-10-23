import type { Token } from '../core/types'
import { loadFile, saveFile } from './files'
import {
  addBook,
  getBook,
  getProgress,
  getTokens,
  listBooks,
  listProgress,
  removeBook,
  resetProgress,
  saveProgress,
  saveTokens,
  touchOpened,
  type AddBookInput,
  type SaveProgressInput,
} from './library'
import { requestPersistence } from './quota'
import type { BookRecord, ProgressRecord, RsvpDatabase } from './schema'
import { getSetting, setSetting } from './settings'

// The services' only view of persistence (Repository). They depend on
// these interfaces, never on Dexie — so the storage engine can change, or
// be faked, without the services or the UI noticing.

export interface LibraryRepository {
  listBooks(): Promise<BookRecord[]>
  getBook(bookId: number): Promise<BookRecord | undefined>
  /** Insert, or return the existing row with the same fingerprint. */
  addBook(input: AddBookInput): Promise<BookRecord>
  removeBook(bookId: number): Promise<void>
  touchOpened(bookId: number): Promise<void>

  getTokens(bookId: number): Promise<Token[] | undefined>
  saveTokens(bookId: number, tokens: Token[], fingerprint: string, pages?: number): Promise<void>

  listProgress(): Promise<ProgressRecord[]>
  getProgress(bookId: number): Promise<ProgressRecord | undefined>
  saveProgress(bookId: number, input: SaveProgressInput): Promise<void>
  resetProgress(bookId: number): Promise<void>

  saveFile(bookId: number, file: File): Promise<void>
  loadFile(bookId: number): Promise<Blob | undefined>

  /** Ask not to be evicted under storage pressure. */
  requestPersistence(): Promise<boolean>
}

export interface SettingsRepository {
  getSetting<T>(key: string, fallback: T): Promise<T>
  setSetting(key: string, value: unknown): Promise<void>
}

/** Both repositories over one IndexedDB database (Adapter onto the
 * `src/storage/` functions, which keep their own tests). */
export class DexieRepository implements LibraryRepository, SettingsRepository {
  private readonly db: RsvpDatabase

  constructor(db: RsvpDatabase) {
    this.db = db
  }

  listBooks = () => listBooks(this.db)
  getBook = (bookId: number) => getBook(this.db, bookId)
  addBook = (input: AddBookInput) => addBook(this.db, input)
  removeBook = (bookId: number) => removeBook(this.db, bookId)
  touchOpened = (bookId: number) => touchOpened(this.db, bookId)

  getTokens = (bookId: number) => getTokens(this.db, bookId)
  saveTokens = (bookId: number, tokens: Token[], fingerprint: string, pages?: number) =>
    saveTokens(this.db, bookId, tokens, fingerprint, pages)

  listProgress = () => listProgress(this.db)
  getProgress = (bookId: number) => getProgress(this.db, bookId)
  saveProgress = (bookId: number, input: SaveProgressInput) => saveProgress(this.db, bookId, input)
  resetProgress = (bookId: number) => resetProgress(this.db, bookId)

  saveFile = (bookId: number, file: File) => saveFile(this.db, bookId, file)
  loadFile = async (bookId: number) => (await loadFile(this.db, bookId))?.blob

  requestPersistence = () => requestPersistence()

  getSetting = <T>(key: string, fallback: T) => getSetting(this.db, key, fallback)
  setSetting = (key: string, value: unknown) => setSetting(this.db, key, value)
}

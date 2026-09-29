import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../src/storage/schema'
import { getProgress, getTokens } from '../../src/storage/library'
import { loadFile } from '../../src/storage/files'
import { makeToken } from '../../src/core/types'

// Mirrors web/js/library.js's open() exactly — same store names, same
// keyPaths, no secondary indexes — to prove RsvpDatabase's version(2)
// upgrade can carry forward a database the OLD web app actually created,
// not just one Dexie itself created at "version 1" and is upgrading from
// its own prior run.
function createLegacyDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('books', { keyPath: 'id', autoIncrement: true })
      db.createObjectStore('tokens', { keyPath: 'bookId' })
      db.createObjectStore('files', { keyPath: 'bookId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function put<T>(db: IDBDatabase, store: string, value: T): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).put(value)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

let dbName: string

beforeEach(() => {
  dbName = `legacy-test-${Math.random().toString(36).slice(2)}`
})

describe('migrating a real legacy web-app database', () => {
  it('carries a TXT book, its tokens, and its progress forward', async () => {
    const legacy = await createLegacyDatabase(dbName)
    const tokens = [makeToken('Hello'), makeToken('world.', { paraEnd: true })]

    await put(legacy, 'books', {
      id: 1,
      title: 'A Short Story',
      kind: 'txt',
      size: 12345,
      totalWords: 2,
      lastIndex: 1,
      lastOpenedAt: 1_700_000_000_000,
      addedAt: 1_699_000_000_000,
    })
    await put(legacy, 'tokens', { bookId: 1, tokens })
    legacy.close()

    const db = getDb(dbName)
    const book = await db.books.get(1)
    expect(book).toMatchObject({
      id: 1,
      title: 'A Short Story',
      source: 'local',
      totalWords: 2,
      lastOpenedAt: 1_700_000_000_000,
      addedAt: 1_699_000_000_000,
    })
    expect(book?.pages).toBeUndefined() // txt, not pdf
    expect(book?.fingerprint).toBeTruthy()

    expect(await getTokens(db, 1)).toEqual(tokens)

    const progress = await getProgress(db, 1)
    expect(progress?.wordIndex).toBe(1)
    expect(progress?.mode).toBe('rsvp')
  })

  it('computes `pages` for a PDF book from its tokens, and migrates the stored file bytes', async () => {
    const legacy = await createLegacyDatabase(dbName)
    const tokens = [
      makeToken('Page', { page: 0 }),
      makeToken('one.', { page: 0, paraEnd: true }),
      makeToken('Page', { page: 1 }),
      makeToken('two.', { page: 1, paraEnd: true }),
      makeToken('Page', { page: 2 }),
      makeToken('three.', { page: 2, paraEnd: true }),
    ]
    const fileBytes = new TextEncoder().encode('%PDF-1.4 fake').buffer

    await put(legacy, 'books', {
      id: 7,
      title: 'A Long Report',
      kind: 'pdf',
      size: 99999,
      totalWords: 6,
      lastIndex: 0,
      lastOpenedAt: null,
      addedAt: 1_699_000_000_000,
    })
    await put(legacy, 'tokens', { bookId: 7, tokens })
    await put(legacy, 'files', { bookId: 7, data: fileBytes })
    legacy.close()

    const db = getDb(dbName)
    const book = await db.books.get(7)
    expect(book?.pages).toBe(3) // pages 0, 1, 2 seen -> 3 pages
    expect(book?.lastOpenedAt).toBeNull()

    // lastIndex was 0 (never actually started reading) — no progress row.
    expect(await getProgress(db, 7)).toBeUndefined()

    const file = await loadFile(db, 7)
    expect(file?.mimeType).toBe('application/pdf')
    expect(file?.fileName).toBe('A Long Report.pdf')
    expect(await file?.blob.text()).toBe('%PDF-1.4 fake')
  })

  it('migrates a whole library of multiple books in one upgrade', async () => {
    const legacy = await createLegacyDatabase(dbName)
    for (let i = 1; i <= 3; i++) {
      await put(legacy, 'books', {
        id: i,
        title: `Book ${i}`,
        kind: 'txt',
        size: 100 * i,
        totalWords: 10 * i,
        lastIndex: i,
        lastOpenedAt: 1_700_000_000_000 + i,
        addedAt: 1_699_000_000_000 + i,
      })
      await put(legacy, 'tokens', {
        bookId: i,
        tokens: [makeToken('word', { paraEnd: true })],
      })
    }
    legacy.close()

    const db = getDb(dbName)
    expect(await db.books.count()).toBe(3)
    for (let i = 1; i <= 3; i++) {
      expect((await db.books.get(i))?.title).toBe(`Book ${i}`)
    }
  })

  it('is a no-op for a brand-new user with no pre-existing database', async () => {
    const db = getDb(dbName)
    expect(await db.books.count()).toBe(0)
    expect(await db.progress.count()).toBe(0)
  })
})

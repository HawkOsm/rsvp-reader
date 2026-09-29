import { beforeEach, describe, expect, it } from 'vitest'
import {
  addBook,
  getBook,
  getProgress,
  getTokens,
  listBooks,
  removeBook,
  resetProgress,
  saveProgress,
  saveTokens,
  tokensAreFresh,
  touchOpened,
} from '../../src/storage/library'
import { getDb, type RsvpDatabase } from '../../src/storage/schema'
import { makeToken } from '../../src/core/types'

function makeFile(bytes: number, name = 'book.txt', lastModified = 1_700_000_000_000): File {
  return new File([new Uint8Array(bytes)], name, { lastModified, type: 'text/plain' })
}

let db: RsvpDatabase
let dbName: string

beforeEach(() => {
  dbName = `test-${Math.random().toString(36).slice(2)}`
  db = getDb(dbName)
})

describe('addBook', () => {
  it('adds a new local book', async () => {
    const book = await addBook(db, {
      title: 'Dr Jekyll and Mr Hyde',
      source: 'local',
      fingerprint: 'v1:163495:1700000000000',
    })
    expect(book.id).toBeTypeOf('number')
    expect(book.totalWords).toBe(0)
    expect(book.lastOpenedAt).toBeNull()
  })

  it('dedups a local re-import by fingerprint', async () => {
    const input = {
      title: 'Moby-Dick',
      source: 'local' as const,
      fingerprint: 'v1:1276267:1700000000000',
    }
    const first = await addBook(db, input)
    const second = await addBook(db, input)
    expect(second.id).toBe(first.id)
    expect(await db.books.count()).toBe(1)
  })
})

describe('listBooks', () => {
  it('orders by last opened, falling back to added, most recent first', async () => {
    const a = await addBook(db, { title: 'A', source: 'local', fingerprint: 'fa' })
    const b = await addBook(db, { title: 'B', source: 'local', fingerprint: 'fb' })
    await addBook(db, { title: 'C', source: 'local', fingerprint: 'fc' })

    await db.books.update(a.id as number, { lastOpenedAt: 100 })
    await db.books.update(b.id as number, { lastOpenedAt: 300 })
    // c never opened — falls back to addedAt, which is its insertion time
    // (later than a/b's addedAt, since it was added last).

    const ordered = await listBooks(db)
    expect(ordered.map((book) => book.title)).toEqual(['C', 'B', 'A'])
  })
})

describe('tokens', () => {
  it('round-trips through saveTokens/getTokens and updates totalWords', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f1' })
    const tokens = [makeToken('Hello'), makeToken('world.', { paraEnd: true })]
    await saveTokens(db, book.id as number, tokens, 'f1')

    expect(await getTokens(db, book.id as number)).toEqual(tokens)
    expect((await getBook(db, book.id as number))?.totalWords).toBe(2)
  })

  it('tokensAreFresh is false until the fingerprint and count both match', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'stale' })
    const file = makeFile(163495)

    expect(await tokensAreFresh(db, book, file)).toBe(false) // no tokens yet

    const tokens = [makeToken('a'), makeToken('b', { paraEnd: true })]
    const freshFingerprint = `v1:${file.size}:${file.lastModified}`
    await saveTokens(db, book.id as number, tokens, freshFingerprint)
    const updated = await getBook(db, book.id as number)
    if (!updated) throw new Error('book vanished')

    expect(await tokensAreFresh(db, updated, file)).toBe(true)
    expect(await tokensAreFresh(db, updated, makeFile(999))).toBe(false) // different file
  })
})

describe('progress', () => {
  it('round-trips through saveProgress/getProgress', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f2' })
    await saveProgress(db, book.id as number, { wordIndex: 42, wpm: 450, mode: 'rsvp' })

    const progress = await getProgress(db, book.id as number)
    expect(progress?.wordIndex).toBe(42)
    expect(progress?.wpm).toBe(450)
    expect(progress?.mode).toBe('rsvp')
  })

  it('resetProgress zeroes the index but keeps the WPM and mode', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f3' })
    await saveProgress(db, book.id as number, { wordIndex: 900, wpm: 600, mode: 'book' })
    await resetProgress(db, book.id as number)

    const progress = await getProgress(db, book.id as number)
    expect(progress?.wordIndex).toBe(0)
    expect(progress?.wpm).toBe(600)
    expect(progress?.mode).toBe('book')
  })
})

describe('touchOpened', () => {
  it('sets lastOpenedAt', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f4' })
    expect(book.lastOpenedAt).toBeNull()
    await touchOpened(db, book.id as number)
    expect((await getBook(db, book.id as number))?.lastOpenedAt).toBeTypeOf('number')
  })
})

describe('removeBook', () => {
  it('cascades to tokens, progress and files', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f5' })
    const bookId = book.id as number
    await saveTokens(db, bookId, [makeToken('x')], 'f5')
    await saveProgress(db, bookId, { wordIndex: 1, wpm: 300, mode: 'rsvp' })
    await db.files.put({
      bookId,
      blob: new Blob(['x']),
      fileName: 'x.txt',
      mimeType: 'text/plain',
    })

    await removeBook(db, bookId)

    expect(await getBook(db, bookId)).toBeUndefined()
    expect(await db.tokens.get(bookId)).toBeUndefined()
    expect(await db.progress.get(bookId)).toBeUndefined()
    expect(await db.files.get(bookId)).toBeUndefined()
  })
})

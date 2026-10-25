import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PAGE } from '@/core/page-spec'
import { compareHlc } from '@/core/sync/hlc'
import { makeToken } from '@/core/types'
import { addBook, removeBook, resetProgress, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { setSetting } from '@/storage/settings'
import { syncIdOf } from '@/storage/sync-id'
import { TEXT_BOOK } from './fixtures'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`sync-log-${Math.random().toString(36).slice(2)}`)
})

const pending = () => db.syncRegisters.where('pending').equals(1).toArray()

async function syncedBook() {
  const book = await addBook(db, {
    title: 'B',
    source: 'local',
    fingerprint: 'f',
    syncId: 'sid',
    ...TEXT_BOOK,
  })
  await saveTokens(db, book.id as number, [makeToken('a')], 'f')
  return book.id as number
}

describe('recording local changes', () => {
  it('records a synced book once its words are saved', async () => {
    await syncedBook()
    expect((await pending()).map((r) => r.change)).toEqual([
      { kind: 'book', book: 'sid', value: { title: 'B', formatId: 'text', totalWords: 1 } },
    ])
  })

  it('records progress, and skips a save that changes nothing', async () => {
    const id = await syncedBook()
    await saveProgress(db, id, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    const first = await db.syncRegisters.get('progress:sid')
    await saveProgress(db, id, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    expect(await db.syncRegisters.get('progress:sid')).toEqual(first)
    await resetProgress(db, id)
    expect((await db.syncRegisters.get('progress:sid'))?.change).toMatchObject({
      value: { wordIndex: 0 },
    })
  })

  it('records nothing for a book without a sync id', async () => {
    const book = await addBook(db, {
      title: 'Old',
      source: 'local',
      fingerprint: 'o',
      ...TEXT_BOOK,
    })
    await saveProgress(db, book.id as number, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    expect(await pending()).toEqual([])
  })

  it('records a removal as a tombstone', async () => {
    const id = await syncedBook()
    await removeBook(db, id)
    expect((await db.syncRegisters.get('book:sid'))?.change).toEqual({
      kind: 'book',
      book: 'sid',
      value: null,
    })
  })

  it('records synced settings only', async () => {
    await setSetting(db, 'theme', 'dark')
    await setSetting(db, 'bookScale', 1.5)
    expect((await pending()).map((r) => r.key)).toEqual(['setting:theme'])
  })

  it('stamps each change later than the last', async () => {
    await setSetting(db, 'theme', 'dark')
    await setSetting(db, 'fontSize', 40)
    const [a, b] = await Promise.all([
      db.syncRegisters.get('setting:theme'),
      db.syncRegisters.get('setting:fontSize'),
    ])
    expect(a!.hlc.device).toBe(b!.hlc.device)
    expect(compareHlc(b!.hlc, a!.hlc)).toBeGreaterThan(0)
  })
})

describe('syncIdOf', () => {
  it('hashes a reflowed book from its words, so the same text gets the same id', async () => {
    const tokens = [makeToken('Call'), makeToken('me')]
    const a = await syncIdOf({ kind: 'reflow' }, { tokens })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await syncIdOf({ kind: 'reflow' }, { tokens: [...tokens] })).toBe(a)
    expect(await syncIdOf({ kind: 'reflow' }, { tokens: [makeToken('Other')] })).not.toBe(a)
  })

  it('hashes a paged book from its file', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3])])
    const id = await syncIdOf({ kind: 'paged', pages: 1 }, { file, tokens: [makeToken('x')] })
    expect(id).toBe(await syncIdOf({ kind: 'paged', pages: 1 }, { file, tokens: [] }))
    expect(await syncIdOf({ kind: 'paged', pages: 1 }, {})).toBeUndefined()
  })
})

describe('the version 6 upgrade', () => {
  it('keeps a version 5 library and adds the sync tables', async () => {
    const name = `v5-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(5).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
      covers: 'bookId',
    })
    const book = {
      id: 1,
      title: 'Kept',
      source: 'local',
      totalWords: 1,
      fingerprint: 'fp',
      formatId: 'text',
      layout: { kind: 'reflow' },
      page: DEFAULT_PAGE,
      addedAt: 1,
      lastOpenedAt: null,
    }
    await old.table('books').put(book)
    await old
      .table('progress')
      .put({ bookId: 1, wordIndex: 7, wpm: 300, mode: 'rsvp', updatedAt: 2 })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toEqual(book)
    expect(await db.progress.get(1)).toMatchObject({ wordIndex: 7 })
    expect(await db.syncRegisters.count()).toBe(0)
    await db.books.update(1, { syncId: 'abc' })
    expect((await db.books.where('syncId').equals('abc').first())?.title).toBe('Kept')
  })
})

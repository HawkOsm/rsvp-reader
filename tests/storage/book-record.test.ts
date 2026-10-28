import { DEFAULT_PAGE } from '@/core/page-spec'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup, type Backup } from '@/storage/backup'
import { getDb, normalizeBookRecord, type StoredBookRecord } from '@/storage/schema'

const base: Omit<StoredBookRecord, 'id' | 'title'> = {
  source: 'local',
  totalWords: 10,
  fingerprint: 'fp',
  addedAt: 1,
  lastOpenedAt: null,
}

describe('normalizeBookRecord', () => {
  it('turns a page count into a paged PDF layout and drops `pages`', () => {
    const book = normalizeBookRecord({ ...base, title: 'P', pages: 12 })
    expect(book.formatId).toBe('pdf')
    expect(book.layout).toEqual({ kind: 'paged', pages: 12 })
    expect(book).not.toHaveProperty('pages')
  })

  it('treats a row with no page count as reflowed text', () => {
    const book = normalizeBookRecord({ ...base, title: 'T' })
    expect(book.formatId).toBe('text')
    expect(book.layout).toEqual({ kind: 'reflow' })
  })

  it('leaves an up-to-date row alone, including an EPUB', () => {
    const current = {
      ...base,
      title: 'E',
      formatId: 'epub' as const,
      layout: { kind: 'reflow' as const },
      page: DEFAULT_PAGE,
      chapters: [{ title: 'Chapter 1', startTokenIndex: 0 }],
    }
    expect(normalizeBookRecord(current)).toEqual(current)
  })

  it('gives a row from before chapters were kept an empty list', () => {
    expect(normalizeBookRecord({ ...base, title: 'T' }).chapters).toEqual([])
  })

  it('trusts a stored layout over a stray `pages`', () => {
    const book = normalizeBookRecord({
      ...base,
      title: 'X',
      layout: { kind: 'reflow' },
      pages: 4,
    })
    expect(book.layout).toEqual({ kind: 'reflow' })
  })
})

describe('the version 3 upgrade', () => {
  it('rewrites rows an existing version 2 database already holds', async () => {
    const name = `v2-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(2).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
    })
    await old.table('books').bulkPut([
      { id: 1, title: 'A PDF', ...base, fingerprint: 'a', pages: 30 },
      { id: 2, title: 'A text', ...base, fingerprint: 'b' },
    ])
    old.close()

    const db = getDb(name)
    const pdf = await db.books.get(1)
    const text = await db.books.get(2)
    expect(pdf).toMatchObject({ formatId: 'pdf', layout: { kind: 'paged', pages: 30 } })
    expect(pdf).not.toHaveProperty('pages')
    expect(text).toMatchObject({ formatId: 'text', layout: { kind: 'reflow' } })
    // Fingerprint index still works after the upgrade.
    expect((await db.books.where('fingerprint').equals('a').first())?.id).toBe(1)
  })
})

describe('the version 5 upgrade', () => {
  it('adds a covers table and keeps the books a version 4 database holds', async () => {
    const name = `v4-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(4).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
    })
    await old.table('books').put({ id: 1, title: 'Kept', ...base, fingerprint: 'k' })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toMatchObject({ title: 'Kept' })
    await db.covers.put({ bookId: 1, blob: new Blob(['jpg']) })
    expect(await db.covers.get(1)).toBeDefined()
  })
})

describe('the version 6 upgrade', () => {
  it('adds an empty shelves table and keeps what a version 5 database holds', async () => {
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
    await old.table('books').put({ id: 1, title: 'Kept', ...base, fingerprint: 'k' })
    await old.table('covers').put({ bookId: 1, blob: new Blob(['jpg']) })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toMatchObject({ title: 'Kept' })
    expect(await db.covers.get(1)).toBeDefined()
    expect(await db.shelves.count()).toBe(0)
    const id = await db.shelves.add({
      syncId: 's',
      name: 'S',
      color: 'accent',
      bookIds: [1],
      createdAt: 1,
    })
    expect(await db.shelves.get(id)).toMatchObject({ bookIds: [1] })
  })
})

describe('the version 7 upgrade', () => {
  it('adds an empty bookmarks table and keeps what a version 6 database holds', async () => {
    const name = `v6-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(6).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
      covers: 'bookId',
      shelves: '++id',
    })
    await old.table('books').put({ id: 1, title: 'Kept', ...base, fingerprint: 'k' })
    await old
      .table('shelves')
      .put({ id: 1, name: 'S', color: 'accent', bookIds: [1], createdAt: 1 })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toMatchObject({ title: 'Kept' })
    expect(await db.shelves.get(1)).toMatchObject({ bookIds: [1] })
    expect(await db.bookmarks.count()).toBe(0)
    await db.bookmarks.add({ bookId: 1, wordIndex: 4, excerpt: 'x', createdAt: 1 })
    expect(await db.bookmarks.where('bookId').equals(1).count()).toBe(1)
  })
})

describe('the version 8 upgrade', () => {
  it('gives every book a version 7 database holds an empty chapter list', async () => {
    const name = `v7-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(7).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
      covers: 'bookId',
      shelves: '++id',
      bookmarks: '++id, bookId',
    })
    const epub = {
      ...base,
      formatId: 'epub',
      layout: { kind: 'reflow' },
      page: DEFAULT_PAGE,
    }
    await old.table('books').bulkPut([
      { id: 1, title: 'Old EPUB', ...epub, fingerprint: 'e' },
      {
        id: 2,
        title: 'Old PDF',
        ...base,
        fingerprint: 'p',
        formatId: 'pdf',
        page: DEFAULT_PAGE,
        layout: { kind: 'paged', pages: 3 },
      },
    ])
    await old.table('tokens').put({ bookId: 1, tokens: [{ text: 'kept' }] })
    await old
      .table('bookmarks')
      .put({ id: 1, bookId: 1, wordIndex: 0, excerpt: 'kept', createdAt: 1 })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toMatchObject({ title: 'Old EPUB', chapters: [] })
    expect(await db.books.get(2)).toMatchObject({
      layout: { kind: 'paged', pages: 3 },
      chapters: [],
    })
    // Nothing is parsed again: the tokens are the ones stored.
    expect(await db.tokens.get(1)).toEqual({ bookId: 1, tokens: [{ text: 'kept' }] })
    expect(await db.bookmarks.count()).toBe(1)
  })
})

describe('the version 10 upgrade', () => {
  it('gives every shelf a version 9 database holds its own sync id, and keeps the rest', async () => {
    const name = `v9-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(9).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt, syncId',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
      covers: 'bookId',
      shelves: '++id',
      bookmarks: '++id, bookId',
      syncRegisters: 'key, pending',
      syncState: 'id',
    })
    await old.table('books').put({ id: 1, title: 'Kept', ...base, fingerprint: 'k', syncId: 'h' })
    await old.table('shelves').bulkPut([
      { id: 1, name: 'A', color: 'accent', bookIds: [1], createdAt: 1 },
      { id: 2, name: 'B', color: 'shelf-blue', bookIds: [], createdAt: 2 },
    ])
    await old.table('bookmarks').put({ id: 1, bookId: 1, wordIndex: 3, excerpt: 'x', createdAt: 1 })
    old.close()

    const db = getDb(name)
    const [a, b] = await db.shelves.toArray()
    expect(a).toMatchObject({ id: 1, name: 'A', bookIds: [1] })
    expect(b).toMatchObject({ id: 2, name: 'B', bookIds: [] })
    expect(a!.syncId).toMatch(/^[0-9a-f-]{36}$/)
    expect(b!.syncId).not.toBe(a!.syncId)
    expect(await db.shelves.where('syncId').equals(a!.syncId).count()).toBe(1)
    expect(await db.books.get(1)).toMatchObject({ syncId: 'h' })
    expect(await db.bookmarks.count()).toBe(1)
  })
})

describe('the version 11 upgrade', () => {
  it('adds an empty notes table and keeps what a version 10 database holds', async () => {
    const name = `v10-test-${Math.random().toString(36).slice(2)}`
    const old = new Dexie(name)
    old.version(10).stores({
      books: '++id, source, sourceId, fingerprint, addedAt, lastOpenedAt, syncId',
      tokens: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
      files: 'bookId',
      covers: 'bookId',
      shelves: '++id, syncId',
      bookmarks: '++id, bookId',
      syncRegisters: 'key, pending',
      syncState: 'id',
    })
    await old.table('books').put({ id: 1, title: 'Kept', ...base, fingerprint: 'k', syncId: 'h' })
    await old.table('syncRegisters').put({
      key: 'progress:h',
      hlc: { wall: 1, count: 0, device: 'd' },
      change: { kind: 'progress', book: 'h', value: { wordIndex: 3, wpm: 300, mode: 'rsvp' } },
    })
    old.close()

    const db = getDb(name)
    expect(await db.books.get(1)).toMatchObject({ title: 'Kept', syncId: 'h' })
    expect(await db.syncRegisters.get('progress:h')).toMatchObject({ change: { book: 'h' } })
    expect(await db.notes.count()).toBe(0)
    const anchor = { wordIndex: 0, quote: 'q' }
    const version = { edit: 'e', body: 'b', at: 1, device: 'd' }
    await db.notes.add({
      noteId: 'n',
      bookId: 1,
      anchor,
      shown: version,
      conflicts: [],
      lostDeletes: [],
      createdAt: 1,
    })
    expect(await db.notes.where('bookId').equals(1).count()).toBe(1)
    expect(await db.notes.where('noteId').equals('n').count()).toBe(1)
  })
})

describe('importing an old backup', () => {
  it('upgrades books written before formatId/layout existed', async () => {
    const backup: Backup = {
      formatVersion: 1,
      exportedAt: 1,
      books: [{ id: 5, title: 'Old PDF', ...base, pages: 8 }],
      progress: [],
      settings: [],
    }
    const db = getDb(`backup-old-${Math.random().toString(36).slice(2)}`)
    await importBackup(db, backup)

    expect(await db.books.get(5)).toMatchObject({
      formatId: 'pdf',
      layout: { kind: 'paged', pages: 8 },
    })
    const reexported = await exportBackup(db)
    expect(reexported.books[0]).not.toHaveProperty('pages')
  })
})

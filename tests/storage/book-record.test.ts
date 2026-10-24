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
    }
    expect(normalizeBookRecord(current)).toEqual(current)
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

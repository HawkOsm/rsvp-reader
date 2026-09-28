import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

// Proves the versioning mechanism itself works in this project's setup
// (Dexie + fake-indexeddb): open a v1 database, populate it, close it,
// then reopen the same database name with a v2 schema and an upgrade
// function, and check the old data survived and got migrated. schema.ts
// is only at version 1 so far — when it grows a real version 2, replace
// the inline v1/v2 classes below with imports of the real thing.

interface BookV1 {
  id?: number
  title: string
}

interface BookV2 {
  id?: number
  title: string
  /** Added in v2: defaults filled in for pre-existing rows by `.upgrade()`. */
  source: 'local' | 'gutendex'
}

class DbV1 extends Dexie {
  books!: Dexie.Table<BookV1, number>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ books: '++id, title' })
  }
}

class DbV2 extends Dexie {
  books!: Dexie.Table<BookV2, number>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ books: '++id, title' })
    this.version(2)
      .stores({ books: '++id, title, source' })
      .upgrade(async (tx) => {
        await tx
          .table('books')
          .toCollection()
          .modify((book: BookV1 & Partial<BookV2>) => {
            book.source = 'local'
          })
      })
  }
}

describe('schema migration', () => {
  it('carries v1 rows forward into v2 with the new field defaulted', async () => {
    const name = `migration-test-${Math.random().toString(36).slice(2)}`

    const v1 = new DbV1(name)
    await v1.open()
    const id = await v1.books.add({ title: 'Pre-existing book' })
    v1.close()

    const v2 = new DbV2(name)
    await v2.open()
    const migrated = await v2.books.get(id)

    expect(migrated?.title).toBe('Pre-existing book')
    expect(migrated?.source).toBe('local')
    v2.close()
  })
})

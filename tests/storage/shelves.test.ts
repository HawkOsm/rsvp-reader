import { beforeEach, describe, expect, it } from 'vitest'
import { addBook, removeBook } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { createShelf, listShelves, setOnShelf } from '@/storage/shelves'
import { TEXT_BOOK } from './fixtures'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`shelves-${Math.random().toString(36).slice(2)}`)
})

describe('shelves', () => {
  it('starts a shelf empty, and lists shelves in the order they were made', async () => {
    await createShelf(db, 'Philosophy', 'shelf-blue')
    await createShelf(db, 'To read', 'accent')
    const shelves = await listShelves(db)
    expect(shelves.map((s) => [s.name, s.color, s.bookIds])).toEqual([
      ['Philosophy', 'shelf-blue', []],
      ['To read', 'accent', []],
    ])
  })

  it('puts a book on a shelf once, and takes it off again', async () => {
    const shelf = await createShelf(db, 'S', 'accent')
    const id = shelf.id as number
    await setOnShelf(db, id, 7, true)
    await setOnShelf(db, id, 7, true)
    await setOnShelf(db, id, 8, true)
    expect((await db.shelves.get(id))?.bookIds).toEqual([7, 8])
    await setOnShelf(db, id, 7, false)
    expect((await db.shelves.get(id))?.bookIds).toEqual([8])
  })

  it('takes a removed book off every shelf', async () => {
    const book = await addBook(db, { title: 'B', source: 'local', fingerprint: 'b', ...TEXT_BOOK })
    const bookId = book.id as number
    const a = await createShelf(db, 'A', 'accent')
    const b = await createShelf(db, 'B', 'shelf-green')
    await setOnShelf(db, a.id as number, bookId, true)
    await setOnShelf(db, b.id as number, bookId, true)
    await setOnShelf(db, b.id as number, 99, true)

    await removeBook(db, bookId)
    expect((await listShelves(db)).map((s) => s.bookIds)).toEqual([[], [99]])
  })
})

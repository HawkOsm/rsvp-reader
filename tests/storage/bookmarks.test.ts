import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addBookmark, bookmarksOf, listBookmarks, removeBookmark } from '@/storage/bookmarks'
import { addBook, bookTables, deleteBookRows, removeBook } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { TEXT_BOOK } from './fixtures'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`bookmarks-${Math.random().toString(36).slice(2)}`)
})

describe('bookmarks', () => {
  it('lists every book’s bookmarks newest first, and one book’s in reading order', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1)
    await addBookmark(db, 1, 50, 'later words')
    now.mockReturnValue(2)
    await addBookmark(db, 2, 5, 'other book')
    now.mockReturnValue(3)
    await addBookmark(db, 1, 10, 'early words')
    now.mockRestore()

    expect((await listBookmarks(db)).map((m) => m.excerpt)).toEqual([
      'early words',
      'other book',
      'later words',
    ])
    expect((await bookmarksOf(db, 1)).map((m) => m.wordIndex)).toEqual([10, 50])
  })

  it('keeps one bookmark per word', async () => {
    const first = await addBookmark(db, 1, 7, 'a')
    const again = await addBookmark(db, 1, 7, 'a')
    expect(again.id).toBe(first.id)
    expect(await db.bookmarks.count()).toBe(1)
  })

  it('removes one bookmark', async () => {
    const mark = await addBookmark(db, 1, 7, 'a')
    await addBookmark(db, 1, 8, 'b')
    await removeBookmark(db, mark.id as number)
    expect((await listBookmarks(db)).map((m) => m.wordIndex)).toEqual([8])
  })

  it('goes with its book', async () => {
    const book = await addBook(db, { title: 'B', source: 'local', fingerprint: 'b', ...TEXT_BOOK })
    await addBookmark(db, book.id as number, 3, 'gone')
    await addBookmark(db, 999, 3, 'kept')
    await removeBook(db, book.id as number)
    expect((await listBookmarks(db)).map((m) => m.excerpt)).toEqual(['kept'])
  })

  it('goes with its book when another device removed it, as do its shelf places', async () => {
    const book = await addBook(db, { title: 'B', source: 'local', fingerprint: 'r', ...TEXT_BOOK })
    const bookId = book.id as number
    await addBookmark(db, bookId, 3, 'gone')
    await db.shelves.add({
      syncId: 's',
      name: 'S',
      color: 'accent',
      bookIds: [bookId, 77],
      createdAt: 1,
    })
    await db.transaction('rw', bookTables(db), () => deleteBookRows(db, bookId))
    expect(await listBookmarks(db)).toEqual([])
    expect((await db.shelves.toArray()).map((s) => s.bookIds)).toEqual([[77]])
  })
})

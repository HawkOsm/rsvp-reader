import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PAGE } from '@/core/page-spec'
import { makeToken } from '@/core/types'
import { addBookmark, listBookmarks } from '@/storage/bookmarks'
import { loadFile, saveFile } from '@/storage/files'
import { addBook, getTokens, removeBook, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { createShelf, listShelves, setOnShelf } from '@/storage/shelves'
import { syncIdOf } from '@/storage/sync-id'
import {
  booksToUpload,
  deleteRemovedBooks,
  downloadBook,
  packageFile,
  remoteBooks,
  uploadBook,
} from '@/sync/book-files'
import { syncOnce } from '@/sync/coordinator'
import { DriveTransport } from '@/sync/drive'
import { progressOffers } from '@/sync/offers'
import { MemoryTransport, type Transport } from '@/sync/transport'
import { FakeDrive } from './fake-drive'

const WORDS = ['It', 'was', 'a', 'dark', 'and', 'stormy', 'night'].map((w, i) =>
  makeToken(w, { paraEnd: i === 6 }),
)
const PAGED = WORDS.map((t, i) => ({ ...t, page: i < 4 ? 0 : 1, bbox: [i, 0, i + 1, 1] as const }))

let a: RsvpDatabase
let b: RsvpDatabase

beforeEach(() => {
  const id = Math.random().toString(36).slice(2)
  a = getDb(`books-a-${id}`)
  b = getDb(`books-b-${id}`)
})

async function importText(db: RsvpDatabase) {
  const syncId = (await syncIdOf({ kind: 'reflow' }, { tokens: WORDS }))!
  const book = await addBook(db, {
    title: 'Dark',
    author: 'Bulwer-Lytton',
    source: 'local',
    fingerprint: 'v1:40:1',
    formatId: 'epub',
    layout: { kind: 'reflow' },
    page: DEFAULT_PAGE,
    chapters: [{ title: 'One', startTokenIndex: 0 }],
    syncId,
  })
  await saveTokens(db, book.id as number, WORDS, 'v1:40:1')
  return { bookId: book.id as number, syncId }
}

async function importPdf(db: RsvpDatabase) {
  const file = new File(['%PDF-1.7 pretend bytes \u0000ÿ'], 'storm.pdf', {
    type: 'application/pdf',
  })
  const layout = { kind: 'paged', pages: 2 } as const
  const syncId = (await syncIdOf(layout, { file }))!
  const book = await addBook(db, {
    title: 'Storm',
    source: 'local',
    fingerprint: 'v1:30:2',
    formatId: 'pdf',
    layout,
    page: DEFAULT_PAGE,
    syncId,
  })
  await saveFile(db, book.id as number, file)
  await saveTokens(db, book.id as number, PAGED as never, 'v1:30:2')
  return { bookId: book.id as number, syncId, file }
}

const names = async (store: Transport) => new Set(await store.list())

describe('book files on Drive', () => {
  it('carries a reflowed book over as its words, ready to read without parsing', async () => {
    const store = new MemoryTransport()
    const { syncId } = await importText(a)
    await syncOnce(a, store)
    const [toSend] = await booksToUpload(a, await names(store))
    await uploadBook(a, store, toSend!)
    expect(await booksToUpload(a, await names(store))).toEqual([])

    await syncOnce(b, store)
    expect(await remoteBooks(b, await names(store))).toEqual([
      { syncId, title: 'Dark', formatId: 'epub', totalWords: 7, available: true },
    ])
    const bookId = await downloadBook(b, store, syncId)
    expect(await b.books.get(bookId)).toMatchObject({
      title: 'Dark',
      author: 'Bulwer-Lytton',
      formatId: 'epub',
      layout: { kind: 'reflow' },
      chapters: [{ title: 'One', startTokenIndex: 0 }],
      totalWords: 7,
      syncId,
    })
    expect(await getTokens(b, bookId)).toEqual(WORDS)
    expect(await remoteBooks(b, await names(store))).toEqual([])
    // Arriving is not a change of B's own to send back.
    expect((await syncOnce(b, store)).pushed).toBe(0)
  })

  it('carries a PDF over with its file, through Drive', async () => {
    const drive = new FakeDrive()
    const store = new DriveTransport({
      auth: { getToken: async () => 'good', renewToken: async () => null },
      fetch: drive.fetch,
      sleep: async () => {},
    })
    const { syncId, file } = await importPdf(a)
    await syncOnce(a, store)
    for (const book of await booksToUpload(a, await names(store))) await uploadBook(a, store, book)

    await syncOnce(b, store)
    const bookId = await downloadBook(b, store, syncId)
    expect(await b.books.get(bookId)).toMatchObject({ layout: { kind: 'paged', pages: 2 } })
    const saved = (await loadFile(b, bookId))!
    expect(saved).toMatchObject({ fileName: 'storm.pdf', mimeType: 'application/pdf' })
    expect(new Uint8Array(await saved.blob.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    )
    expect(await getTokens(b, bookId)).toEqual(PAGED)

    const usage = await store.usage()
    expect(usage.used).toBeGreaterThan(file.size)
    expect(usage.free).toBeNull()
    drive.free = 5_000
    expect((await store.usage()).free).toBe(5_000)
  })

  it('brings the book’s shelves and bookmarks with it, and offers its place', async () => {
    const store = new MemoryTransport()
    const { bookId, syncId } = await importText(a)
    const shelf = await createShelf(a, 'Gothic', 'shelf-violet')
    await setOnShelf(a, shelf.id as number, bookId, true)
    await addBookmark(a, bookId, 3, 'dark and stormy')
    await saveProgress(a, bookId, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    await syncOnce(a, store)
    await uploadBook(a, store, (await a.books.get(bookId))!)

    await syncOnce(b, store) // the shelf arrives first, with nothing on it here
    expect((await listShelves(b))[0]?.bookIds).toEqual([])
    const onB = await downloadBook(b, store, syncId)
    expect((await listShelves(b))[0]?.bookIds).toEqual([onB])
    expect((await listBookmarks(b)).map((m) => [m.bookId, m.wordIndex])).toEqual([[onB, 3]])
    expect((await progressOffers(b))[0]).toMatchObject({ bookId: onB, progress: { wordIndex: 5 } })
  })

  it('says when a book hasn’t been uploaded yet', async () => {
    const store = new MemoryTransport()
    const { syncId } = await importText(a)
    await syncOnce(a, store)
    await syncOnce(b, store)
    expect((await remoteBooks(b, await names(store)))[0]?.available).toBe(false)
    await expect(downloadBook(b, store, syncId)).rejects.toThrow(/hasn’t been uploaded/)
  })

  it('deletes a removed book’s files from Drive', async () => {
    const store = new MemoryTransport()
    const { bookId, syncId } = await importPdf(a)
    await syncOnce(a, store)
    await uploadBook(a, store, (await a.books.get(bookId))!)
    expect(await names(store)).toContain(packageFile(syncId))

    await removeBook(a, bookId)
    await syncOnce(a, store)
    expect(await deleteRemovedBooks(a, store, await names(store))).toBe(2)
    expect([...(await names(store))].filter((n) => n.includes(syncId))).toEqual([])
  })
})

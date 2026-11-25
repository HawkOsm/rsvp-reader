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
  deleteLegacyBookFiles,
  deleteRemovedBooks,
  downloadBook,
  legacyOriginalFile,
  legacyPackageFile,
  packageFile,
  readableBookName,
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

const gunzipJson = async (blob: Blob) =>
  JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text())

const gzipJson = async (value: unknown) =>
  new Response(
    new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip')),
  ).blob()

describe('readableBookName', () => {
  it('cleans unsafe and control characters, trailing dots and long titles', () => {
    expect(readableBookName('War: Part 1? <Draft>\\/"|*', 'EPUB', 'abcdef1234', () => false)).toBe(
      'Books/War Part 1 Draft.epub',
    )
    expect(readableBookName('A\u0000\u001fB. . ', '.PDF', 'abcdef1234', () => false)).toBe(
      'Books/A B.pdf',
    )
    expect(readableBookName('', 'txt', 'abcdef1234', () => false)).toBe('Books/Book.txt')
    expect(readableBookName('... /// \u0007', 'txt', 'abcdef1234', () => false)).toBe(
      'Books/Book.txt',
    )
    const long = `${'a'.repeat(119)}  bcdef`
    expect(readableBookName(long, 'epub', 'abcdef1234', () => false)).toBe(
      `Books/${'a'.repeat(119)}.epub`,
    )
    expect(readableBookName('x'.repeat(130), 'epub', 'abcdef1234', () => false)).toBe(
      `Books/${'x'.repeat(120)}.epub`,
    )
  })

  it('adds the first 6 syncId chars when the candidate name is taken', () => {
    expect(readableBookName('Pride and Prejudice', 'epub', '1234567890', () => true)).toBe(
      'Books/Pride and Prejudice (123456).epub',
    )
  })
})

describe('book files on Drive', () => {
  it('carries a reflowed book with no stored file over as a readable .txt and package', async () => {
    const store = new MemoryTransport()
    const twoParas = [
      makeToken('It'),
      makeToken('was', { paraEnd: true }),
      makeToken('a'),
      makeToken('dark'),
      makeToken('night.', { paraEnd: true }),
    ]
    const syncId = (await syncIdOf({ kind: 'reflow' }, { tokens: twoParas }))!
    const book = await addBook(a, {
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
    await saveTokens(a, book.id as number, twoParas, 'v1:40:1')

    await syncOnce(a, store)
    const [toSend] = await booksToUpload(a, await names(store))
    await uploadBook(a, store, toSend!)
    expect(await booksToUpload(a, await names(store))).toEqual([])
    expect(await store.read('Books/Dark.txt')).toBe('It was\n\na dark night.')
    const pack = await gunzipJson((await store.readBlob(packageFile(syncId)))!)
    expect(pack).toMatchObject({
      version: 2,
      text: 'Books/Dark.txt',
    })
    expect(pack.file).toBeUndefined()

    await syncOnce(b, store)
    expect(await remoteBooks(b, await names(store))).toEqual([
      { syncId, title: 'Dark', formatId: 'epub', totalWords: 5, available: true },
    ])
    const bookId = await downloadBook(b, store, syncId)
    expect(await b.books.get(bookId)).toMatchObject({
      title: 'Dark',
      author: 'Bulwer-Lytton',
      formatId: 'epub',
      layout: { kind: 'reflow' },
      chapters: [{ title: 'One', startTokenIndex: 0 }],
      totalWords: 5,
      syncId,
    })
    expect(await getTokens(b, bookId)).toEqual(twoParas)
    expect(await loadFile(b, bookId)).toBeUndefined()
    expect(await remoteBooks(b, await names(store))).toEqual([])
    // Arriving is not a change of B's own to send back.
    expect((await syncOnce(b, store)).pushed).toBe(0)
  })

  it('carries an EPUB or text book with a stored file over under Books/ and keeps its file', async () => {
    const store = new MemoryTransport()
    const epubFile = new File(['PK-epub-bytes'], 'noext', { type: 'application/epub+zip' })
    const syncId = (await syncIdOf({ kind: 'reflow' }, { tokens: WORDS }))!
    const book = await addBook(a, {
      title: 'Pride and Prejudice',
      source: 'local',
      fingerprint: 'v1:50:1',
      formatId: 'epub',
      layout: { kind: 'reflow' },
      page: DEFAULT_PAGE,
      syncId,
    })
    await saveFile(a, book.id as number, epubFile)
    await saveTokens(a, book.id as number, WORDS, 'v1:50:1')

    await uploadBook(a, store, (await a.books.get(book.id as number))!)
    expect(await names(store)).toContain('Books/Pride and Prejudice.epub')
    const pack = await gunzipJson((await store.readBlob(packageFile(syncId)))!)
    expect(pack.file).toEqual({
      fileName: 'noext',
      mimeType: 'application/epub+zip',
      driveName: 'Books/Pride and Prejudice.epub',
    })
    expect(pack.text).toBeUndefined()

    const onB = await downloadBook(b, store, syncId)
    const saved = (await loadFile(b, onB))!
    expect(saved).toMatchObject({ fileName: 'noext', mimeType: 'application/epub+zip' })
    expect(await saved.blob.text()).toBe('PK-epub-bytes')
    expect(await getTokens(b, onB)).toEqual(WORDS)
  })

  it('gives two books with the same title different names', async () => {
    const store = new MemoryTransport()
    const wordsOne = [makeToken('First', { paraEnd: true })]
    const wordsTwo = [makeToken('Second', { paraEnd: true })]
    const syncOne = (await syncIdOf({ kind: 'reflow' }, { tokens: wordsOne }))!
    const syncTwo = (await syncIdOf({ kind: 'reflow' }, { tokens: wordsTwo }))!
    const bookOne = await addBook(a, {
      title: 'Same Title',
      source: 'local',
      fingerprint: 'f1',
      formatId: 'text',
      layout: { kind: 'reflow' },
      page: DEFAULT_PAGE,
      syncId: syncOne,
    })
    const bookTwo = await addBook(a, {
      title: 'same title',
      source: 'local',
      fingerprint: 'f2',
      formatId: 'text',
      layout: { kind: 'reflow' },
      page: DEFAULT_PAGE,
      syncId: syncTwo,
    })
    await saveTokens(a, bookOne.id as number, wordsOne, 'f1')
    await saveTokens(a, bookTwo.id as number, wordsTwo, 'f2')

    await uploadBook(a, store, (await a.books.get(bookOne.id as number))!)
    await uploadBook(a, store, (await a.books.get(bookTwo.id as number))!)

    expect(await names(store)).toContain(`Books/Same Title (${syncOne.slice(0, 6)}).txt`)
    expect(await names(store)).toContain(`Books/same title (${syncTwo.slice(0, 6)}).txt`)
  })

  it('carries a PDF over with its file to Books/<title>.pdf, through Drive', async () => {
    const drive = new FakeDrive()
    const store = new DriveTransport({
      auth: { getToken: async () => 'good', renewToken: async () => null },
      fetch: drive.fetch,
      sleep: async () => {},
    })
    const { syncId, file } = await importPdf(a)
    await syncOnce(a, store)
    for (const book of await booksToUpload(a, await names(store))) await uploadBook(a, store, book)

    const listed = await names(store)
    expect(listed).toContain('Books/Storm.pdf')
    const pack = await gunzipJson((await store.readBlob(packageFile(syncId)))!)
    expect(pack.file).toMatchObject({ driveName: 'Books/Storm.pdf' })

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

  it('downloads from a legacy v1 package and legacy original file', async () => {
    const store = new MemoryTransport()
    const { syncId, file } = await importPdf(a)
    await syncOnce(a, store)
    await syncOnce(b, store)

    const book = (await a.books.where('syncId').equals(syncId).first())!
    await store.write(legacyOriginalFile(syncId), file)
    await store.write(
      legacyPackageFile(syncId),
      await gzipJson({
        version: 1,
        book: {
          title: book.title,
          formatId: book.formatId,
          layout: book.layout,
          page: book.page,
          chapters: book.chapters,
          fingerprint: book.fingerprint,
          syncId,
        },
        tokens: PAGED,
        file: { fileName: 'storm.pdf', mimeType: 'application/pdf' },
      }),
    )

    expect((await remoteBooks(b, await names(store)))[0]?.available).toBe(true)
    const onB = await downloadBook(b, store, syncId)
    const saved = (await loadFile(b, onB))!
    expect(saved).toMatchObject({ fileName: 'storm.pdf', mimeType: 'application/pdf' })
    expect(await saved.blob.text()).toBe(await file.text())
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

  it('deletes legacy book files only for books whose new package is listed', async () => {
    const store = new MemoryTransport()
    await store.write(packageFile('migrated'), new Blob(['v2']))
    await store.write(legacyPackageFile('migrated'), new Blob(['v1']))
    await store.write(legacyOriginalFile('migrated'), new Blob(['orig']))
    await store.write(legacyPackageFile('only-legacy'), new Blob(['v1']))
    await store.write(legacyOriginalFile('only-legacy'), new Blob(['orig']))

    expect(await deleteLegacyBookFiles(store, await names(store))).toBe(2)
    const remaining = await names(store)
    expect(remaining).toContain(packageFile('migrated'))
    expect(remaining).not.toContain(legacyPackageFile('migrated'))
    expect(remaining).not.toContain(legacyOriginalFile('migrated'))
    expect(remaining).toContain(legacyPackageFile('only-legacy'))
    expect(remaining).toContain(legacyOriginalFile('only-legacy'))
  })

  it('deletes a removed book’s Books/ file, text copy, package and legacy files from Drive', async () => {
    const store = new MemoryTransport()
    const pdf = await importPdf(a)
    const text = await importText(a)
    await syncOnce(a, store)
    await uploadBook(a, store, (await a.books.get(pdf.bookId))!)
    await uploadBook(a, store, (await a.books.get(text.bookId))!)
    await store.write(legacyPackageFile(pdf.syncId), new Blob(['old']))
    await store.write(legacyOriginalFile(pdf.syncId), new Blob(['old-orig']))
    expect(await names(store)).toContain(packageFile(pdf.syncId))
    expect(await names(store)).toContain('Books/Storm.pdf')
    expect(await names(store)).toContain('Books/Dark.txt')

    await removeBook(a, pdf.bookId)
    await removeBook(a, text.bookId)
    await syncOnce(a, store)
    expect(await deleteRemovedBooks(a, store, await names(store))).toBe(6)
    const remaining = await names(store)
    expect(remaining.has('Books/Storm.pdf')).toBe(false)
    expect(remaining.has('Books/Dark.txt')).toBe(false)
    expect([...remaining].filter((n) => n.includes(pdf.syncId) || n.includes(text.syncId))).toEqual(
      [],
    )
  })
})

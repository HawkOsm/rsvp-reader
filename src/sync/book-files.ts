import type { Token } from '@/core/types'
import { saveFile, loadFile } from '@/storage/files'
import { addBook, getTokens, saveTokens } from '@/storage/library'
import type { BookRecord, RsvpDatabase } from '@/storage/schema'
import { applyBookRegisters } from './coordinator'
import type { Transport } from './transport'

// Books themselves on Drive (docs/architecture/sync.md, section 6 and phase
// 4). Each book is stored as what every device keeps of it: its record and
// its words, gzipped, plus the original file for a paged book, which its
// pages are drawn from. So a downloaded book is never parsed or recognised
// again (invariant 2), and a reflowed book, which keeps no file, syncs too.
// Both files are named by the book's sync id, a hash of its content, so any
// device holding the book may write them: they come out the same.

export const packageFile = (syncId: string) => `book-${syncId}.json.gz`
export const originalFile = (syncId: string) => `bookfile-${syncId}`

/** What `book-<syncId>.json.gz` holds. */
interface BookPackage {
  version: 1
  book: Pick<
    BookRecord,
    'title' | 'author' | 'formatId' | 'layout' | 'page' | 'chapters' | 'ocr' | 'fingerprint'
  > & { syncId: string }
  tokens: Token[]
  /** The original file's name and type; its bytes are `bookfile-<syncId>`. */
  file?: { fileName: string; mimeType: string }
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

/** Books here whose files aren't on Drive yet, oldest first. */
export async function booksToUpload(
  db: RsvpDatabase,
  names: ReadonlySet<string>,
): Promise<BookRecord[]> {
  const books = await db.books.toArray()
  return books
    .filter((b) => b.syncId && b.totalWords > 0 && !names.has(packageFile(b.syncId)))
    .sort((a, b) => a.addedAt - b.addedAt)
}

/** Upload a book's files. The package goes last, so a device that sees it
 * can count on the original file being there too. */
export async function uploadBook(
  db: RsvpDatabase,
  transport: Transport,
  book: BookRecord,
): Promise<void> {
  const syncId = book.syncId
  const tokens = await getTokens(db, book.id as number)
  if (!syncId || !tokens) return // half imported: nothing to send yet
  const pack: BookPackage = {
    version: 1,
    book: {
      title: book.title,
      ...(book.author && { author: book.author }),
      formatId: book.formatId,
      layout: book.layout,
      page: book.page,
      chapters: book.chapters,
      ...(book.ocr && { ocr: book.ocr }),
      fingerprint: book.fingerprint,
      syncId,
    },
    tokens,
  }
  if (book.layout.kind === 'paged') {
    const file = await loadFile(db, book.id as number)
    if (file) {
      await transport.write(originalFile(syncId), file.blob)
      pack.file = { fileName: file.fileName, mimeType: file.mimeType }
    }
  }
  await transport.write(packageFile(syncId), await gzip(JSON.stringify(pack)))
}

/** A book another device has that this one doesn't. */
export interface RemoteBook {
  syncId: string
  title: string
  formatId: string
  totalWords: number
  /** Its files are on Drive, so it can be downloaded. */
  available: boolean
}

export async function remoteBooks(
  db: RsvpDatabase,
  names: ReadonlySet<string>,
): Promise<RemoteBook[]> {
  const here = new Set((await db.books.toArray()).map((b) => b.syncId))
  const remote: RemoteBook[] = []
  for (const { change } of await db.syncRegisters.where('key').startsWith('book:').toArray()) {
    if (change.kind !== 'book' || !change.value || here.has(change.book)) continue
    remote.push({
      syncId: change.book,
      ...change.value,
      available: names.has(packageFile(change.book)),
    })
  }
  return remote.sort((a, b) => a.title.localeCompare(b.title))
}

/** Bring a book from Drive into the library, with its shelves and
 * bookmarks. Its place stays an offer, as for any other device's. Returns
 * its local id. */
export async function downloadBook(
  db: RsvpDatabase,
  transport: Transport,
  syncId: string,
): Promise<number> {
  const blob = await transport.readBlob(packageFile(syncId))
  if (!blob) throw new Error('This book hasn’t been uploaded from the other device yet.')
  const pack = JSON.parse(await gunzip(blob)) as BookPackage
  const original = pack.file ? await transport.readBlob(originalFile(syncId)) : null
  if (pack.file && !original) throw new Error('The book’s file is missing from Drive.')

  const book = await addBook(db, { ...pack.book, source: 'local' })
  const bookId = book.id as number
  if (pack.file && original) {
    const { fileName, mimeType } = pack.file
    await saveFile(db, bookId, new File([original], fileName, { type: mimeType }))
  }
  await saveTokens(db, bookId, pack.tokens, pack.book.fingerprint)
  await applyBookRegisters(db, syncId)
  return bookId
}

/** Delete the files of books removed everywhere. Any device may: nothing
 * refers to a removed book, and a device that adds it again uploads it
 * again. */
export async function deleteRemovedBooks(
  db: RsvpDatabase,
  transport: Transport,
  names: ReadonlySet<string>,
): Promise<number> {
  let deleted = 0
  for (const { change } of await db.syncRegisters.where('key').startsWith('book:').toArray()) {
    if (change.kind !== 'book' || change.value !== null) continue
    for (const name of [packageFile(change.book), originalFile(change.book)]) {
      if (!names.has(name)) continue
      await transport.delete(name)
      deleted++
    }
  }
  return deleted
}

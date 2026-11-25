import type { FormatId, Token } from '@/core/types'
import { saveFile, loadFile } from '@/storage/files'
import { addBook, getTokens, saveTokens } from '@/storage/library'
import type { BookRecord, RsvpDatabase } from '@/storage/schema'
import { applyBookRegisters } from './coordinator'
import { BOOKS_DIR } from './files'
import type { Transport } from './transport'

// Books themselves on Drive (docs/architecture/sync.md, section 6 and phase
// 4). Each book has a package in App data holding its record and tokens, plus
// either its original file in Books/ or (for older reflowed books with no
// stored file) a plain-text copy of its words in Books/. Downloaded books
// still read tokens from the package so they are never parsed or recognised
// again (invariant 2).

export const packageFile = (syncId: string) => `book2-${syncId}.json.gz`
export const legacyPackageFile = (syncId: string) => `book-${syncId}.json.gz`
export const legacyOriginalFile = (syncId: string) => `bookfile-${syncId}`

const NEW_PACKAGE = /^book2-(.+)\.json\.gz$/
const UNSAFE_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])
const FORMAT_EXT: Record<FormatId, string> = {
  pdf: 'pdf',
  epub: 'epub',
  text: 'txt',
}

interface BookPackageBase {
  book: Pick<
    BookRecord,
    'title' | 'author' | 'formatId' | 'layout' | 'page' | 'chapters' | 'ocr' | 'fingerprint'
  > & { syncId: string }
  tokens: Token[]
}

/** What legacy `book-<syncId>.json.gz` holds. */
interface LegacyBookPackage extends BookPackageBase {
  version: 1
  file?: { fileName: string; mimeType: string }
}

/** What `book2-<syncId>.json.gz` holds. */
interface BookPackage extends BookPackageBase {
  version: 2
  /** The original file's name, type, and transport name in `Books/`. */
  file?: { fileName: string; mimeType: string; driveName: string }
  /** Transport name of a readable plain-text copy in `Books/`, when no
   * original file was stored. */
  text?: string
}

function sanitizeTitle(title: string): string {
  // Characters no file system takes in a name, and control characters,
  // become spaces.
  let cleaned = ''
  for (const ch of title) {
    cleaned += ch.charCodeAt(0) < 32 || UNSAFE_CHARS.has(ch) ? ' ' : ch
  }
  const collapsed = cleaned
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim()
  return collapsed || 'Book'
}

function fileExtension(fileName: string | undefined, formatId: FormatId): string {
  if (fileName) {
    const dot = fileName.lastIndexOf('.')
    if (dot > 0 && dot < fileName.length - 1) {
      const ext = fileName.slice(dot + 1)
      if (/^[a-z0-9]+$/i.test(ext)) return ext.toLowerCase()
    }
  }
  return FORMAT_EXT[formatId] ?? 'txt'
}

/** Readable transport name in `dir` (`Books/` or `Notes/`) for a book,
 * disambiguated with the first six characters of `syncId` when `taken` reports
 * a collision. */
export function readableDriveName(
  dir: string,
  title: string,
  ext: string,
  syncId: string,
  taken: (name: string) => boolean,
): string {
  const safeTitle = sanitizeTitle(title)
  const cleanExt = ext.replace(/^\.+/, '').toLowerCase()
  const candidate = `${dir}${safeTitle}.${cleanExt}`
  return taken(candidate) ? `${dir}${safeTitle} (${syncId.slice(0, 6)}).${cleanExt}` : candidate
}

/** Readable `Books/` transport name for a book, disambiguated with the first
 * six characters of `syncId` when `taken` reports a collision. */
export function readableBookName(
  title: string,
  ext: string,
  syncId: string,
  taken: (name: string) => boolean,
): string {
  return readableDriveName(BOOKS_DIR, title, ext, syncId, taken)
}

async function knownOtherTitles(db: RsvpDatabase, syncId: string): Promise<Set<string>> {
  const titles = new Set<string>()
  for (const row of await db.books.toArray()) {
    if (row.syncId !== syncId) titles.add(sanitizeTitle(row.title).toLowerCase())
  }
  for (const { change } of await db.syncRegisters.where('key').startsWith('book:').toArray()) {
    if (change.kind === 'book' && change.value && change.book !== syncId) {
      titles.add(sanitizeTitle(change.value.title).toLowerCase())
    }
  }
  return titles
}

function tokensToText(tokens: readonly Token[]): string {
  const paragraphs: string[] = []
  let current: string[] = []
  for (const token of tokens) {
    current.push(token.text)
    if (token.paraEnd) {
      paragraphs.push(current.join(' '))
      current = []
    }
  }
  if (current.length > 0) paragraphs.push(current.join(' '))
  return paragraphs.join('\n\n')
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}

/** Books here whose new package isn't on Drive yet, oldest first. */
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
 * can count on the readable file in `Books/` being there too. */
export async function uploadBook(
  db: RsvpDatabase,
  transport: Transport,
  book: BookRecord,
  names?: Set<string>,
): Promise<void> {
  const syncId = book.syncId
  const tokens = await getTokens(db, book.id as number)
  if (!syncId || !tokens) return // half imported: nothing to send yet
  const listing = names ?? new Set(await transport.list())
  const otherTitles = await knownOtherTitles(db, syncId)
  const safeTitleLower = sanitizeTitle(book.title).toLowerCase()
  const taken = (candidate: string) => listing.has(candidate) || otherTitles.has(safeTitleLower)

  const pack: BookPackage = {
    version: 2,
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
  const file = await loadFile(db, book.id as number)
  if (file) {
    const ext = fileExtension(file.fileName, book.formatId)
    const driveName = readableBookName(book.title, ext, syncId, taken)
    await transport.write(driveName, file.blob)
    listing.add(driveName)
    pack.file = { fileName: file.fileName, mimeType: file.mimeType, driveName }
  } else {
    const textName = readableBookName(book.title, 'txt', syncId, taken)
    const textBlob = new Blob([tokensToText(tokens)], { type: 'text/plain;charset=utf-8' })
    await transport.write(textName, textBlob)
    listing.add(textName)
    pack.text = textName
  }
  const pkg = packageFile(syncId)
  await transport.write(pkg, await gzip(JSON.stringify(pack)))
  listing.add(pkg)
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
      available: names.has(packageFile(change.book)) || names.has(legacyPackageFile(change.book)),
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
  const blob =
    (await transport.readBlob(packageFile(syncId))) ??
    (await transport.readBlob(legacyPackageFile(syncId)))
  if (!blob) throw new Error('This book hasn’t been uploaded from the other device yet.')
  const pack = JSON.parse(await gunzip(blob)) as BookPackage | LegacyBookPackage
  const originalName = pack.file
    ? pack.version === 2
      ? pack.file.driveName
      : legacyOriginalFile(syncId)
    : undefined
  const original = originalName ? await transport.readBlob(originalName) : null
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

/** Delete legacy `book-<syncId>.json.gz` and `bookfile-<syncId>` files for
 * every book whose new `book2-<syncId>.json.gz` package is listed. */
export async function deleteLegacyBookFiles(
  transport: Transport,
  names: ReadonlySet<string>,
): Promise<number> {
  let deleted = 0
  for (const name of [...names]) {
    const syncId = NEW_PACKAGE.exec(name)?.[1]
    if (!syncId) continue
    for (const legacy of [legacyPackageFile(syncId), legacyOriginalFile(syncId)]) {
      if (!names.has(legacy)) continue
      await transport.delete(legacy)
      deleted++
    }
  }
  return deleted
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
    const pkg = packageFile(change.book)
    if (names.has(pkg)) {
      const blob = await transport.readBlob(pkg)
      if (blob) {
        const pack = JSON.parse(await gunzip(blob)) as BookPackage | LegacyBookPackage
        if (pack.version === 2) {
          for (const extra of [pack.file?.driveName, pack.text]) {
            if (!extra || !names.has(extra)) continue
            await transport.delete(extra)
            deleted++
          }
        }
      }
      await transport.delete(pkg)
      deleted++
    }
    for (const legacy of [legacyPackageFile(change.book), legacyOriginalFile(change.book)]) {
      if (!names.has(legacy)) continue
      await transport.delete(legacy)
      deleted++
    }
  }
  return deleted
}

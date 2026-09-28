import { parseFileInWorker } from '../parse/client'
import { GutendexError, pickDownloadFormat, type GutendexBook } from '../sources/gutendex'
import { httpGet } from '../sources/http'
import { fingerprintOf } from '../storage/fingerprint'
import { saveFile } from '../storage/files'
import { addBook, saveTokens } from '../storage/library'
import { getDb, type BookRecord } from '../storage/schema'

export interface ImportBookOptions {
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
}

/** Parse a locally-picked file off the UI thread, then persist it: a
 * `books` row, its packed tokens, and — for PDFs — the original bytes too,
 * so the page panel can render offline without asking the user to
 * re-select the file. */
export async function importLocalFile(
  file: File,
  options: ImportBookOptions = {},
): Promise<BookRecord> {
  const db = getDb()
  const fingerprint = fingerprintOf(file)
  const result = await parseFileInWorker(file, options)

  const book = await addBook(db, { title: result.title, source: 'local', fingerprint })
  const bookId = book.id as number
  await saveTokens(db, bookId, result.tokens, fingerprint, result.pages)
  if (file.name.toLowerCase().endsWith('.pdf')) {
    await saveFile(db, bookId, file)
  }

  const updated = await db.books.get(bookId)
  if (!updated) throw new Error('importLocalFile: book vanished after import')
  return updated
}

/** Download a Gutendex search result (EPUB, falling back to plain text)
 * and import it the same way as a local file. Dedups against a previous
 * import of the same Gutendex book by id, not by fingerprint — see
 * DECISIONS.md (Phase 2) for why. */
export async function importGutendexBook(
  book: GutendexBook,
  options: ImportBookOptions = {},
): Promise<BookRecord> {
  const choice = pickDownloadFormat(book)
  if (!choice) {
    throw new GutendexError('This book has no EPUB or plain-text format available.')
  }

  let response: Response
  try {
    response = await httpGet(choice.url)
  } catch {
    throw new GutendexError('Could not download this book. Check your connection and try again.')
  }
  if (!response.ok) {
    throw new GutendexError(
      response.status === 429
        ? 'Gutenberg is rate-limiting downloads right now — try again shortly.'
        : `Could not download this book (${response.status}).`,
    )
  }

  const blob = await response.blob()
  const fileName = `${book.title}.${choice.kind === 'epub' ? 'epub' : 'txt'}`
  const file = new File([blob], fileName, {
    type: choice.kind === 'epub' ? 'application/epub+zip' : 'text/plain',
  })

  const db = getDb()
  const fingerprint = fingerprintOf(file)
  const result = await parseFileInWorker(file, options)

  const record = await addBook(db, {
    title: result.title || book.title,
    author: book.authors.map((a) => a.name).join(', ') || undefined,
    source: 'gutendex',
    sourceId: String(book.id),
    fingerprint,
  })
  const bookId = record.id as number
  await saveTokens(db, bookId, result.tokens, fingerprint, result.pages)

  const updated = await db.books.get(bookId)
  if (!updated) throw new Error('importGutendexBook: book vanished after import')
  return updated
}

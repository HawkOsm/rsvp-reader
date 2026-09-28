import { parseFileInWorker } from '../parse/client'
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

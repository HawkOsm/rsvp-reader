import { ocrPdfFile, type OcrLanguage } from '@/ocr'
import { parseFileInWorker } from '@/parse/client'
import { fingerprintOf } from '@/storage/fingerprint'
import { saveCover } from '@/storage/covers'
import { loadFile, saveFile } from '@/storage/files'
import { addBook, saveTokens, tokensAreFresh } from '@/storage/library'
import { getDb, type BookRecord, type RsvpDatabase } from '@/storage/schema'

export interface ImportBookOptions {
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
  /** Read a PDF by recognising its page images, for one with no text. */
  ocr?: { language: OcrLanguage }
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
  // Already in the library, and whole: hand it back rather than read it
  // again. For a scan that would be minutes of OCR, ending in a row that
  // already exists. "Whole" matters: a book restored from a backup has its
  // row but no tokens (backups leave them out, to be rebuilt from the file),
  // and one whose import stopped part-way may lack its file; both are read
  // again, which is what fills them in.
  const existing = await db.books.where('fingerprint').equals(fingerprint).first()
  if (existing && (await isComplete(db, existing, file))) return existing

  const result = options.ocr
    ? await ocrPdfFile(file, { ...options, language: options.ocr.language })
    : await parseFileInWorker(file, options)

  const book = await addBook(db, {
    title: result.title,
    source: 'local',
    fingerprint,
    formatId: result.formatId,
    layout: result.layout,
    page: result.page,
    chapters: result.chapters,
    ocr: result.ocr,
  })
  const bookId = book.id as number
  if (existing) {
    // addBook gave back the old row unchanged; the new reading decides what
    // kind of book it is (a restored legacy book gets displayed-space boxes).
    await db.books.update(bookId, {
      title: result.title,
      formatId: result.formatId,
      layout: result.layout,
      page: result.page,
      chapters: result.chapters ?? [],
      ocr: result.ocr,
    })
  }
  await saveTokens(db, bookId, result.tokens, fingerprint)
  if (result.layout.kind === 'paged') {
    await saveFile(db, bookId, file)
  }
  if (result.cover) await saveCover(db, bookId, result.cover)

  const updated = await db.books.get(bookId)
  if (!updated) throw new Error('importLocalFile: book vanished after import')
  return updated
}

/** The book has its tokens, and (if it has pages to draw) its file. */
async function isComplete(db: RsvpDatabase, book: BookRecord, file: File): Promise<boolean> {
  if (!(await tokensAreFresh(db, book, file))) return false
  if (book.layout.kind === 'paged' && !(await loadFile(db, book.id as number))) return false
  return true
}

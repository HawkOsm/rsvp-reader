import type { FileRecord, RsvpDatabase } from './schema'

/** Save the original file bytes, so PDF page rendering works offline —
 * there's no file path to reopen on web, unlike the desktop app. */
export async function saveFile(db: RsvpDatabase, bookId: number, file: File): Promise<void> {
  await db.files.put({ bookId, blob: file, fileName: file.name, mimeType: file.type })
}

export async function loadFile(
  db: RsvpDatabase,
  bookId: number,
): Promise<FileRecord | undefined> {
  return db.files.get(bookId)
}

/** "Remove file, keep progress": drop the stored bytes without touching
 * the book's tokens/progress. */
export async function removeFile(db: RsvpDatabase, bookId: number): Promise<void> {
  await db.files.delete(bookId)
}

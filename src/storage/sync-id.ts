import type { ContentLayout, Token } from '@/core/types'
import { loadFile } from './files'
import { getTokens } from './library'
import type { BookRecord, RsvpDatabase } from './schema'
import { seedChange, syncTables } from './sync-log'

// A book's sync id: the same on every device that has the same book. A paged
// book (a PDF) is hashed from its file, which it keeps. A reflowed book keeps
// only its words, so it is hashed from those, both at import and when an
// older book is given an id later; hashing its file at import would give a
// different id from the one an older copy can be given.

/** The book's sync id, from its file if it's paged, else from its words. */
export async function syncIdOf(
  layout: ContentLayout,
  source: { file?: Blob; tokens?: Token[] },
): Promise<string | undefined> {
  if (layout.kind === 'paged') {
    return source.file && sha256(await source.file.arrayBuffer())
  }
  if (!source.tokens) return undefined
  const text = source.tokens
    .map((t) => t.text)
    .join(' ')
    .normalize('NFC')
  return sha256(new TextEncoder().encode(text))
}

async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Give a book that lacks one its sync id, and queue for sending what was
 * saved of it before: the book and its progress, each with the time it was
 * really saved, so it can't overwrite a newer version from another device.
 * Returns the id, or `undefined` for a restored or half-imported book, which
 * has nothing to hash yet and gets its id when it is next imported. */
export async function giveSyncId(db: RsvpDatabase, book: BookRecord): Promise<string | undefined> {
  const bookId = book.id as number
  const syncId = await syncIdOf(book.layout, {
    file: (await loadFile(db, bookId))?.blob,
    tokens: await getTokens(db, bookId),
  })
  if (!syncId) return undefined
  await db.transaction('rw', [db.books, db.progress, ...syncTables(db)], async () => {
    await db.books.update(bookId, { syncId })
    const value = { title: book.title, formatId: book.formatId, totalWords: book.totalWords }
    await seedChange(db, { kind: 'book', book: syncId, value }, book.addedAt)
    const progress = await db.progress.get(bookId)
    if (progress) {
      const { wordIndex, wpm, mode } = progress
      const change = { kind: 'progress', book: syncId, value: { wordIndex, wpm, mode } } as const
      await seedChange(db, change, progress.updatedAt)
    }
  })
  return syncId
}

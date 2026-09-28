import { beforeEach, describe, expect, it } from 'vitest'
import { addBook, saveProgress } from '../../src/storage/library'
import { setSetting } from '../../src/storage/settings'
import { exportBackup, importBackup } from '../../src/storage/backup'
import { getDb, type RsvpDatabase } from '../../src/storage/schema'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`test-${Math.random().toString(36).slice(2)}`)
})

describe('backup', () => {
  it('exports books, progress and settings, and files only when asked', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f1' })
    await saveProgress(db, book.id as number, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    await setSetting(db, 'theme', 'dark')
    await db.files.put({
      bookId: book.id as number,
      blob: new Blob(['pdf bytes']),
      fileName: 'book.pdf',
      mimeType: 'application/pdf',
    })

    const withoutFiles = await exportBackup(db)
    expect(withoutFiles.books).toHaveLength(1)
    expect(withoutFiles.progress).toHaveLength(1)
    expect(withoutFiles.settings).toHaveLength(1)
    expect(withoutFiles.files).toBeUndefined()

    const withFiles = await exportBackup(db, { includeFiles: true })
    expect(withFiles.files?.[book.id as number]?.fileName).toBe('book.pdf')
    expect(withFiles.files?.[book.id as number]?.dataBase64.length).toBeGreaterThan(0)
  })

  it('restores into an empty database, files included', async () => {
    const source = getDb(`test-src-${Math.random().toString(36).slice(2)}`)
    const book = await addBook(source, { title: 'Restored', source: 'local', fingerprint: 'f2' })
    await saveProgress(source, book.id as number, { wordIndex: 12, wpm: 500, mode: 'book' })
    await setSetting(source, 'wpm', 500)
    await source.files.put({
      bookId: book.id as number,
      blob: new Blob(['hello pdf']),
      fileName: 'restored.pdf',
      mimeType: 'application/pdf',
    })

    const backup = await exportBackup(source, { includeFiles: true })
    await importBackup(db, backup)

    const restoredBook = await db.books.get(book.id as number)
    expect(restoredBook?.title).toBe('Restored')
    const restoredProgress = await db.progress.get(book.id as number)
    expect(restoredProgress?.wordIndex).toBe(12)
    const restoredSetting = await db.settings.get('wpm')
    expect(restoredSetting?.value).toBe(500)
    const restoredFile = await db.files.get(book.id as number)
    expect(restoredFile?.fileName).toBe('restored.pdf')
    expect(await restoredFile?.blob.text()).toBe('hello pdf')
  })

  it('rejects a backup from an unknown future format version', async () => {
    await expect(
      importBackup(db, {
        formatVersion: 999 as never,
        exportedAt: Date.now(),
        books: [],
        progress: [],
        settings: [],
      }),
    ).rejects.toThrow(/format version/)
  })
})

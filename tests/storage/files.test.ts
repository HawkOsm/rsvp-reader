import { beforeEach, describe, expect, it } from 'vitest'
import { addBook } from '../../src/storage/library'
import { loadFile, removeFile, saveFile } from '../../src/storage/files'
import { getDb, type RsvpDatabase } from '../../src/storage/schema'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`test-${Math.random().toString(36).slice(2)}`)
})

describe('files', () => {
  it('saves and loads the original bytes', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f' })
    const file = new File(['%PDF-1.4 fake pdf bytes'], 'book.pdf', {
      type: 'application/pdf',
    })

    await saveFile(db, book.id as number, file)
    const loaded = await loadFile(db, book.id as number)

    expect(loaded?.fileName).toBe('book.pdf')
    expect(loaded?.mimeType).toBe('application/pdf')
    expect(await loaded?.blob.text()).toBe('%PDF-1.4 fake pdf bytes')
  })

  it('"remove file, keep progress": removeFile only touches the files table', async () => {
    const book = await addBook(db, { title: 'T', source: 'local', fingerprint: 'f' })
    const bookId = book.id as number
    await saveFile(db, bookId, new File(['x'], 'x.pdf', { type: 'application/pdf' }))

    await removeFile(db, bookId)

    expect(await loadFile(db, bookId)).toBeUndefined()
    expect(await db.books.get(bookId)).toBeDefined() // book itself untouched
  })
})

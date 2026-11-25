import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE } from '@/core/page-spec'
import { parseNotesFile } from '@/core/sync/notes-file'
import { makeToken } from '@/core/types'
import { addBook, removeBook, saveTokens } from '@/storage/library'
import { addNote, editNote, notesOf } from '@/storage/notes'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { syncIdOf } from '@/storage/sync-id'
import { syncOnce } from '@/sync/coordinator'
import { syncNotesFiles } from '@/sync/notes-files'
import { MemoryTransport } from '@/sync/transport'
import { TEXT_BOOK } from '../storage/fixtures'

const WORDS = Array.from({ length: 20 }, (_, i) => makeToken(`word${i + 1}`))

let store: MemoryTransport
let a: RsvpDatabase
let b: RsvpDatabase
let clock: number

beforeEach(() => {
  const id = Math.random().toString(36).slice(2)
  store = new MemoryTransport()
  a = getDb(`notes-files-a-${id}`)
  b = getDb(`notes-files-b-${id}`)
  clock = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))
})

afterEach(() => vi.restoreAllMocks())

async function importReflowBook(
  db: RsvpDatabase,
  {
    title = 'Dark',
    tokens = WORDS,
  }: { title?: string; tokens?: ReturnType<typeof makeToken>[] } = {},
) {
  const syncId = (await syncIdOf({ kind: 'reflow' }, { tokens }))!
  const book = await addBook(db, {
    title,
    source: 'local',
    fingerprint: `f-${title}-${syncId}`,
    syncId,
    ...TEXT_BOOK,
  })
  await saveTokens(db, book.id as number, tokens, `f-${title}-${syncId}`)
  return { bookId: book.id as number, syncId }
}

async function importPagedBook(db: RsvpDatabase, title = 'Paged') {
  const tokens = [
    makeToken('p0a', { page: 0 }),
    makeToken('p0b', { page: 0 }),
    makeToken('p1a', { page: 1 }),
    makeToken('p1b', { page: 1 }),
    // page 2 has no tokens
    makeToken('p3a', { page: 3 }),
    makeToken('p3b', { page: 3 }),
  ]
  const syncId = (await syncIdOf({ kind: 'reflow' }, { tokens }))!
  const book = await addBook(db, {
    title,
    source: 'local',
    fingerprint: `fp-${title}`,
    formatId: 'pdf',
    layout: { kind: 'paged', pages: 4 },
    page: DEFAULT_PAGE,
    syncId,
  })
  await saveTokens(db, book.id as number, tokens, `fp-${title}`)
  return { bookId: book.id as number, syncId }
}

const listNames = async () => new Set(await store.list())

describe('MemoryTransport.versionOf', () => {
  it('derives a deterministic token that changes when content changes', async () => {
    expect(store.versionOf('Notes/A.md')).toBeUndefined()
    await store.write('Notes/A.md', 'hello')
    const v1 = store.versionOf('Notes/A.md')
    expect(v1).toEqual(expect.any(String))

    await store.write('Notes/A.md', 'hello!')
    const v2 = store.versionOf('Notes/A.md')
    expect(v2).not.toBe(v1)

    await store.write('Notes/A.md', 'hello')
    expect(store.versionOf('Notes/A.md')).toBe(v1)
  })
})

describe('syncNotesFiles', () => {
  it('1. writes Notes/<title>.md on first run with the note text and note: line', async () => {
    const { bookId } = await importReflowBook(a)
    const noteId = await addNote(a, bookId, { wordIndex: 3, quote: 'word4 word5' }, 'First note')

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 1, applied: 0 })

    const content = await store.read('Notes/Dark.md')
    expect(content).toContain(`<!-- note:${noteId} -->`)
    expect(content).toContain('First note')
  })

  it('2. writes nothing and reads no notes file on a second run when nothing changed', async () => {
    const { bookId } = await importReflowBook(a)
    await addNote(a, bookId, { wordIndex: 3, quote: 'word4 word5' }, 'First note')
    await syncNotesFiles(a, store, await listNames())

    const writeSpy = vi.spyOn(store, 'write')
    const readSpy = vi.spyOn(store, 'read')
    const readBlobSpy = vi.spyOn(store, 'readBlob')

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 0, applied: 0 })
    expect(writeSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
    expect(readBlobSpy).not.toHaveBeenCalled()
  })

  it('3. applies an edited body from Drive and syncs it to another device', async () => {
    const { bookId: onA } = await importReflowBook(a)
    const { bookId: onB } = await importReflowBook(b)
    const noteId = await addNote(a, onA, { wordIndex: 3, quote: 'word4 word5' }, 'Original text')
    await syncOnce(a, store)
    await syncOnce(b, store)
    await syncNotesFiles(a, store, await listNames())

    const currentFile = (await store.read('Notes/Dark.md'))!
    await store.write('Notes/Dark.md', currentFile.replace('Original text', 'Edited in Drive'))

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.applied).toBe(1)
    expect((await notesOf(a, onA)).find((n) => n.noteId === noteId)?.shown.body).toBe(
      'Edited in Drive',
    )

    await syncOnce(a, store)
    await syncOnce(b, store)
    expect((await notesOf(b, onB)).find((n) => n.noteId === noteId)?.shown.body).toBe(
      'Edited in Drive',
    )
  })

  it('4. adds a person-written "## Word 4" section as a new note with a 12-word quote, once', async () => {
    const { bookId } = await importReflowBook(a)
    await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Existing')
    await syncNotesFiles(a, store, await listNames())

    const currentFile = (await store.read('Notes/Dark.md'))!
    await store.write('Notes/Dark.md', `${currentFile}\n## Word 4\n\nPerson added note\n`)

    const res1 = await syncNotesFiles(a, store, await listNames())
    expect(res1).toEqual({ written: 1, applied: 1 })

    const notes = await notesOf(a, bookId)
    expect(notes).toHaveLength(2)
    const added = notes.find((n) => n.shown.body === 'Person added note')!
    expect(added.anchor).toEqual({
      wordIndex: 3,
      quote: WORDS.slice(3, 15)
        .map((t) => t.text)
        .join(' '),
    })

    const rewritten = (await store.read('Notes/Dark.md'))!
    expect(rewritten).toContain(`<!-- note:${added.noteId} -->`)

    // Running again does not duplicate it.
    const res2 = await syncNotesFiles(a, store, await listNames())
    expect(res2).toEqual({ written: 0, applied: 0 })
    expect(await notesOf(a, bookId)).toHaveLength(2)
  })

  it('5. anchors "## Page 2" to the first token of page 1, and empty pages to the nearest page', async () => {
    const { bookId } = await importPagedBook(a)
    await addNote(a, bookId, { wordIndex: 0, quote: 'p0a p0b', page: 0 }, 'Initial')
    await syncNotesFiles(a, store, await listNames())

    const currentFile = (await store.read('Notes/Paged.md'))!
    await store.write(
      'Notes/Paged.md',
      `${currentFile}\n## Page 2\n\nOn page two\n\n## Page 3\n\nOn missing page three\n`,
    )

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.applied).toBe(2)

    const notes = await notesOf(a, bookId)
    const p2 = notes.find((n) => n.shown.body === 'On page two')!
    expect(p2.anchor).toMatchObject({ wordIndex: 2, page: 1, quote: 'p1a p1b p3a p3b' })

    // Requested page 3 (0-based 2): equidistant between page 1 and page 3, picks earlier (page 1).
    const p3 = notes.find((n) => n.shown.body === 'On missing page three')!
    expect(p3.anchor).toMatchObject({ wordIndex: 2, page: 1, quote: 'p1a p1b p3a p3b' })
  })

  it('6. deletes nothing when a section is removed from the file, and puts it back on next run', async () => {
    const { bookId } = await importReflowBook(a)
    await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Note one')
    await addNote(a, bookId, { wordIndex: 5, quote: 'word6' }, 'Note two')
    await syncNotesFiles(a, store, await listNames())

    const original = (await store.read('Notes/Dark.md'))!
    const withoutSecond = original.split('\n## Word 6')[0]! + '\n'
    await store.write('Notes/Dark.md', withoutSecond)

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 1, applied: 0 })
    expect(await notesOf(a, bookId)).toHaveLength(2)
    expect(await store.read('Notes/Dark.md')).toBe(original)
  })

  it('7. ignores edits to a note that has a conflict', async () => {
    const { bookId: onA } = await importReflowBook(a)
    await importReflowBook(b)
    const noteId = await addNote(a, onA, { wordIndex: 0, quote: 'word1' }, 'Draft')
    await syncOnce(a, store)
    await syncOnce(b, store)

    await editNote(a, noteId, 'A version')
    await editNote(b, noteId, 'B version')
    await syncOnce(a, store)
    await syncOnce(b, store)
    await syncOnce(a, store)

    await syncNotesFiles(a, store, await listNames())
    const rendered = (await store.read('Notes/Dark.md'))!
    expect(rendered).toContain(`<!-- note:${noteId} conflict -->`)

    await store.write('Notes/Dark.md', rendered.replace('B version', 'Edited locked'))
    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.applied).toBe(0)
    expect(res.written).toBe(1)
    expect((await notesOf(a, onA))[0]!.shown.body).not.toBe('Edited locked')
    expect(await store.read('Notes/Dark.md')).toBe(rendered)
  })

  it('8. rewrites the file when a note is edited on this device after the file was written', async () => {
    const { bookId } = await importReflowBook(a)
    const noteId = await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Before local edit')
    await syncNotesFiles(a, store, await listNames())

    await editNote(a, noteId, 'After local edit')
    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 1, applied: 0 })
    expect(await store.read('Notes/Dark.md')).toContain('After local edit')
  })

  it('9. applies the file edit cleanly when the same note changed both locally and in the file', async () => {
    const { bookId } = await importReflowBook(a)
    const noteId = await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Base text')
    await syncNotesFiles(a, store, await listNames())

    const remoteBefore = (await store.read('Notes/Dark.md'))!
    await editNote(a, noteId, 'Local change')
    await store.write('Notes/Dark.md', remoteBefore.replace('Base text', 'Remote change'))

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.applied).toBe(1)
    const [note] = await notesOf(a, bookId)
    expect(note!.shown.body).toBe('Remote change')
    expect(note!.conflicts).toEqual([])
  })

  // The file holds every note's text as it was when last written. Taking
  // one note's edit from it must not also put back the old text of a note
  // that was edited on this device since.
  it('9b. takes only the notes changed in the file, not stale text of one changed here', async () => {
    const { bookId } = await importReflowBook(a)
    const first = await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'First as written')
    const second = await addNote(a, bookId, { wordIndex: 5, quote: 'word6' }, 'Second as written')
    await syncNotesFiles(a, store, await listNames())

    const file = (await store.read('Notes/Dark.md'))!
    await editNote(a, first, 'First, edited in the app')
    await store.write('Notes/Dark.md', file.replace('Second as written', 'Second, edited in Drive'))

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.applied).toBe(1)
    const notes = await notesOf(a, bookId)
    expect(notes.find((n) => n.noteId === first)?.shown.body).toBe('First, edited in the app')
    expect(notes.find((n) => n.noteId === second)?.shown.body).toBe('Second, edited in Drive')
    // And the file now says both.
    const after = (await store.read('Notes/Dark.md'))!
    expect(after).toContain('First, edited in the app')
    expect(after).toContain('Second, edited in Drive')
  })

  it('10. second device adopts the existing file by book id without creating a second file', async () => {
    const { bookId: onA } = await importReflowBook(a)
    await importReflowBook(b)
    await addNote(a, onA, { wordIndex: 0, quote: 'word1' }, 'Shared note')
    await syncOnce(a, store)
    await syncOnce(b, store)

    await syncNotesFiles(a, store, await listNames())
    const resB = await syncNotesFiles(b, store, await listNames())
    expect(resB).toEqual({ written: 0, applied: 0 })
    expect([...(await listNames())].filter((n) => n.startsWith('Notes/'))).toEqual([
      'Notes/Dark.md',
    ])
  })

  it('11. gives two books with the same title different file names', async () => {
    const one = await importReflowBook(a, {
      title: 'Same',
      tokens: [makeToken('First'), makeToken('book')],
    })
    const two = await importReflowBook(a, {
      title: 'Same',
      tokens: [makeToken('Second'), makeToken('book')],
    })
    await addNote(a, one.bookId, { wordIndex: 0, quote: 'First' }, 'Note 1')
    await addNote(a, two.bookId, { wordIndex: 0, quote: 'Second' }, 'Note 2')

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res.written).toBe(2)

    const notesNames = [...(await listNames())].filter((n) => n.startsWith('Notes/')).sort()
    expect(notesNames).toHaveLength(2)
    expect(notesNames).toContain('Notes/Same.md')
    expect(notesNames).toContain(`Notes/Same (${two.syncId.slice(0, 6)}).md`)
  })

  it('12. writes the notes file again if it was deleted on the transport', async () => {
    const { bookId } = await importReflowBook(a)
    await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Persistent note')
    await syncNotesFiles(a, store, await listNames())

    await store.delete('Notes/Dark.md')
    expect((await listNames()).has('Notes/Dark.md')).toBe(false)

    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 1, applied: 0 })
    expect(await store.read('Notes/Dark.md')).toContain('Persistent note')
  })

  it('13. leaves a notes file for a book not on this device untouched, and does not delete on book removal', async () => {
    const foreignText =
      '# Notes on Elsewhere\n\n<!-- rsvp-reader:book:other-book-id -->\n\n## Page 1\n\nForeign\n'
    await store.write('Notes/Elsewhere.md', foreignText)

    const { bookId } = await importReflowBook(a)
    await addNote(a, bookId, { wordIndex: 0, quote: 'word1' }, 'Mine')
    await syncNotesFiles(a, store, await listNames())
    expect(await store.read('Notes/Elsewhere.md')).toBe(foreignText)

    const mineBefore = await store.read('Notes/Dark.md')
    await removeBook(a, bookId)
    await syncNotesFiles(a, store, await listNames())
    expect(await store.read('Notes/Dark.md')).toBe(mineBefore)
    expect(await store.read('Notes/Elsewhere.md')).toBe(foreignText)
    expect(parseNotesFile(foreignText).book).toBe('other-book-id')
  })

  it('14. writes nothing for a book with no notes and no file', async () => {
    await importReflowBook(a)
    const res = await syncNotesFiles(a, store, await listNames())
    expect(res).toEqual({ written: 0, applied: 0 })
    expect([...(await listNames())]).toEqual([])
  })

  it('15. two devices that both read a hand-added section before either writes it back add one note between them', async () => {
    const { bookId: onA } = await importReflowBook(a)
    const { bookId: onB } = await importReflowBook(b)
    await addNote(a, onA, { wordIndex: 0, quote: 'word1' }, 'Existing')
    await syncOnce(a, store)
    await syncOnce(b, store)
    await syncNotesFiles(a, store, await listNames())
    await syncNotesFiles(b, store, await listNames())

    const edited = `${(await store.read('Notes/Dark.md'))!}\n## Word 4\n\nPerson added note\n`
    await store.write('Notes/Dark.md', edited)
    // B is shown Drive as it was before A wrote the note's line into the file.
    const seenByB = new MemoryTransport()
    await seenByB.write('Notes/Dark.md', edited)

    await syncNotesFiles(a, store, await listNames())
    await syncNotesFiles(b, seenByB, new Set(await seenByB.list()))
    await syncOnce(a, store)
    await syncOnce(b, store)
    await syncOnce(a, store)

    for (const [db, bookId] of [
      [a, onA],
      [b, onB],
    ] as const) {
      const added = (await notesOf(db, bookId)).filter((n) => n.shown.body === 'Person added note')
      expect(added).toHaveLength(1)
      expect(added[0]!.conflicts).toEqual([])
    }
  })
})

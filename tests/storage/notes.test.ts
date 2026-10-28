import { beforeEach, describe, expect, it } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, removeBook, saveTokens } from '@/storage/library'
import { addNote, deleteNote, editNote, keepBothNotes, notesOf, settleNote } from '@/storage/notes'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { TEXT_BOOK } from './fixtures'

let db: RsvpDatabase
const anchor = { wordIndex: 2, quote: 'a dark and stormy' }

beforeEach(() => {
  db = getDb(`notes-${Math.random().toString(36).slice(2)}`)
})

async function book(syncId?: string) {
  const added = await addBook(db, {
    title: 'Dark',
    source: 'local',
    fingerprint: `f-${Math.random()}`,
    ...(syncId && { syncId }),
    ...TEXT_BOOK,
  })
  await saveTokens(db, added.id as number, [makeToken('It'), makeToken('was')], added.fingerprint)
  return added.id as number
}

const pending = () => db.syncRegisters.where('pending').equals(1).toArray()

describe('notes', () => {
  it('adds, edits and deletes a note, recording each edit for sync', async () => {
    const bookId = await book('dark')
    const noteId = await addNote(db, bookId, anchor, 'Bulwer-Lytton’s line')
    expect(await notesOf(db, bookId)).toMatchObject([
      { noteId, anchor, shown: { body: 'Bulwer-Lytton’s line' }, conflicts: [] },
    ])

    await editNote(db, noteId, 'The opening everyone quotes')
    const [note] = await notesOf(db, bookId)
    expect(note!.shown.body).toBe('The opening everyone quotes')
    const edits = (await pending()).filter((r) => r.key.startsWith(`note:${noteId}:`))
    expect(edits).toHaveLength(2)
    expect(edits.map((r) => r.change)).toContainEqual(
      expect.objectContaining({ kind: 'note', value: expect.objectContaining({ book: 'dark' }) }),
    )

    await deleteNote(db, noteId)
    expect(await notesOf(db, bookId)).toEqual([])
    expect((await pending()).filter((r) => r.key.startsWith(`note:${noteId}:`))).toHaveLength(3)
  })

  it('gives a book from before sync its sync id, since a note names its book by it', async () => {
    const bookId = await book()
    expect((await db.books.get(bookId))?.syncId).toBeUndefined()
    await addNote(db, bookId, anchor, 'first')
    expect((await db.books.get(bookId))?.syncId).toMatch(/^[0-9a-f]{64}$/)
    expect(await db.syncRegisters.where('key').startsWith('book:').count()).toBe(1)
  })

  it('lists a book’s notes in reading order', async () => {
    const bookId = await book('dark')
    await addNote(db, bookId, { wordIndex: 9, quote: 'later' }, 'b')
    await addNote(db, bookId, { wordIndex: 1, quote: 'early' }, 'a')
    expect((await notesOf(db, bookId)).map((n) => n.shown.body)).toEqual(['a', 'b'])
  })

  it('keeps a removed book’s notes as edits, to come back with the book', async () => {
    const bookId = await book('dark')
    await addNote(db, bookId, anchor, 'kept')
    await removeBook(db, bookId)
    expect(await db.notes.count()).toBe(0)
    expect(await db.syncRegisters.where('key').startsWith('note:').count()).toBe(1)
  })

  it('settles a conflict to one text, or keeps both as two notes', async () => {
    const bookId = await book('dark')
    const noteId = await addNote(db, bookId, anchor, 'draft')
    // Another device's edit of the same version arrives.
    const [note] = await notesOf(db, bookId)
    await db.syncRegisters.put({
      key: `note:${noteId}:other`,
      hlc: { wall: Date.now() - 10_000, count: 0, device: 'phone' },
      change: {
        kind: 'note',
        note: noteId,
        edit: 'other',
        value: { book: 'dark', base: note!.shown.edit, body: 'from the phone', anchor, at: 1 },
      },
    })
    await editNote(db, noteId, 'from here') // made from the same version, so both stand
    let [both] = await notesOf(db, bookId)
    expect(both!.shown.body).toBe('from here')
    expect(both!.conflicts.map((c) => c.body)).toEqual(['from the phone'])

    await keepBothNotes(db, noteId)
    const notes = await notesOf(db, bookId)
    expect(notes.map((n) => n.shown.body).sort()).toEqual(['from here', 'from the phone'])
    expect(notes.every((n) => n.conflicts.length === 0)).toBe(true)

    // And settling to a merged text, on a fresh conflict.
    ;[both] = notes.filter((n) => n.noteId === noteId)
    await db.syncRegisters.put({
      key: `note:${noteId}:other2`,
      hlc: { wall: 1, count: 0, device: 'phone' },
      change: {
        kind: 'note',
        note: noteId,
        edit: 'other2',
        value: { book: 'dark', base: both!.shown.edit, body: 'phone again', anchor, at: 1 },
      },
    })
    await editNote(db, noteId, 'here again')
    await settleNote(db, noteId, 'here again, and phone again')
    const settled = (await notesOf(db, bookId)).find((n) => n.noteId === noteId)
    expect(settled).toMatchObject({ shown: { body: 'here again, and phone again' }, conflicts: [] })
  })
})

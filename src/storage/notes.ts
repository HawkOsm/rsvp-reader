import { foldNote, type NoteAnchor, type NoteEdit, type NoteEditRecord } from '@/core/sync/notes'
import type { NoteRecord, RsvpDatabase } from './schema'
import { giveSyncId } from './sync-id'
import { recordChange, syncTables } from './sync-log'

// Notes, kept as their edits (`core/sync/notes.ts`): every add, edit, delete
// or settled conflict is a new edit recorded for sync, and the note's row in
// `notes` is the fold of all its edits, mine and other devices'. The row is
// what the app reads; the edits are the truth.

const noteKey = (noteId: string) => `note:${noteId}:`

/** The tables a note change writes, for a caller's transaction. */
const noteTables = (db: RsvpDatabase) => [db.notes, db.books, ...syncTables(db)]

/** One book's notes, in reading order. */
export async function notesOf(db: RsvpDatabase, bookId: number): Promise<NoteRecord[]> {
  const notes = await db.notes.where('bookId').equals(bookId).toArray()
  return notes.sort((a, b) => a.anchor.wordIndex - b.anchor.wordIndex || a.createdAt - b.createdAt)
}

/** Every edit of a note there is. */
async function editsOf(db: RsvpDatabase, noteId: string): Promise<NoteEditRecord[]> {
  const registers = await db.syncRegisters.where('key').startsWith(noteKey(noteId)).toArray()
  return registers.flatMap(({ hlc, change }) =>
    change.kind === 'note' ? [{ edit: change.edit, hlc, value: change.value }] : [],
  )
}

/** Fold a note's edits into its row again: after a change here or from
 * another device. A note on a book that isn't here keeps its edits but no
 * row, until the book arrives. Call it inside a transaction over
 * `noteTables`. */
export async function refoldNote(db: RsvpDatabase, noteId: string): Promise<void> {
  const note = foldNote(await editsOf(db, noteId))
  const row = await db.notes.where('noteId').equals(noteId).first()
  const book = note && (await db.books.where('syncId').equals(note.book).first())
  if (!note || !book) {
    if (row) await db.notes.delete(row.id as number)
    return
  }
  await db.notes.put({
    ...(row && { id: row.id }),
    noteId,
    bookId: book.id as number,
    anchor: note.anchor,
    shown: note.shown,
    conflicts: note.conflicts,
    lostDeletes: note.lostDeletes,
    createdAt: note.createdAt,
  })
}

/** Record one edit of a note and fold it in. */
async function recordEdit(db: RsvpDatabase, noteId: string, value: NoteEdit): Promise<void> {
  await recordChange(db, { kind: 'note', note: noteId, edit: crypto.randomUUID(), value })
  await refoldNote(db, noteId)
}

/** The note as it stands, to make the next edit from. */
async function current(db: RsvpDatabase, noteId: string): Promise<NoteRecord> {
  const row = await db.notes.where('noteId').equals(noteId).first()
  if (!row) throw new Error('That note is gone; it may have been deleted on another device.')
  return row
}

async function bookSyncId(db: RsvpDatabase, bookId: number): Promise<string> {
  const book = await db.books.get(bookId)
  if (!book) throw new Error('That book is gone.')
  // A book from before sync existed is given its id now: a note names its
  // book by it.
  const syncId = book.syncId ?? (await giveSyncId(db, book))
  if (!syncId) throw new Error('This book can’t take notes until it has been imported again.')
  return syncId
}

/** Add a note on a word. Returns its id. */
export async function addNote(
  db: RsvpDatabase,
  bookId: number,
  anchor: NoteAnchor,
  body: string,
): Promise<string> {
  const book = await bookSyncId(db, bookId)
  const noteId = crypto.randomUUID()
  await db.transaction('rw', noteTables(db), () =>
    recordEdit(db, noteId, { book, base: null, body, anchor, at: Date.now() }),
  )
  return noteId
}

/** Change a note's text. A conflict, if there is one, stays to be settled. */
export async function editNote(db: RsvpDatabase, noteId: string, body: string): Promise<void> {
  await db.transaction('rw', noteTables(db), async () => {
    const note = await current(db, noteId)
    const book = await syncIdOf(db, note.bookId)
    await recordEdit(db, noteId, {
      book,
      base: note.shown.edit,
      // Being edited here answers a delete that lost to another edit.
      resolves: note.lostDeletes,
      body,
      anchor: note.anchor,
      at: Date.now(),
    })
  })
}

/** Delete a note, every version of it. */
export async function deleteNote(db: RsvpDatabase, noteId: string): Promise<void> {
  await db.transaction('rw', noteTables(db), async () => {
    const note = await current(db, noteId)
    const book = await syncIdOf(db, note.bookId)
    await recordEdit(db, noteId, {
      book,
      base: note.shown.edit,
      resolves: [...note.conflicts.map((c) => c.edit), ...note.lostDeletes],
      body: null,
      anchor: note.anchor,
      at: Date.now(),
    })
  })
}

/** Settle a conflict: the note becomes `body` (one of its versions, or the
 * reader's merge of them), and every other version is set aside. */
export async function settleNote(db: RsvpDatabase, noteId: string, body: string): Promise<void> {
  await db.transaction('rw', noteTables(db), async () => {
    const note = await current(db, noteId)
    const book = await syncIdOf(db, note.bookId)
    await recordEdit(db, noteId, {
      book,
      base: note.shown.edit,
      resolves: [...note.conflicts.map((c) => c.edit), ...note.lostDeletes],
      body,
      anchor: note.anchor,
      at: Date.now(),
    })
  })
}

/** Settle a conflict by keeping every version: the other versions become
 * notes of their own, on the same word. */
export async function keepBothNotes(db: RsvpDatabase, noteId: string): Promise<void> {
  await db.transaction('rw', noteTables(db), async () => {
    const note = await current(db, noteId)
    const book = await syncIdOf(db, note.bookId)
    for (const other of note.conflicts) {
      await recordEdit(db, crypto.randomUUID(), {
        book,
        base: null,
        body: other.body,
        anchor: note.anchor,
        at: Date.now(),
      })
    }
    await recordEdit(db, noteId, {
      book,
      base: note.shown.edit,
      resolves: [...note.conflicts.map((c) => c.edit), ...note.lostDeletes],
      body: note.shown.body,
      anchor: note.anchor,
      at: Date.now(),
    })
  })
}

/** The sync id of a book that has a note, so has one. */
async function syncIdOf(db: RsvpDatabase, bookId: number): Promise<string> {
  const syncId = (await db.books.get(bookId))?.syncId
  if (!syncId) throw new Error('That book is gone.')
  return syncId
}

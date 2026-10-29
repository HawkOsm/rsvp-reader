import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, saveTokens } from '@/storage/library'
import { addNote, deleteNote, editNote, notesOf, settleNote } from '@/storage/notes'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { syncIdOf } from '@/storage/sync-id'
import { downloadBook, uploadBook } from '@/sync/book-files'
import { syncOnce } from '@/sync/coordinator'
import { MemoryTransport } from '@/sync/transport'
import { TEXT_BOOK } from '../storage/fixtures'

const TOKENS = ['It', 'was', 'a', 'dark', 'and', 'stormy', 'night'].map((w) => makeToken(w))
const anchor = { wordIndex: 3, quote: 'dark and stormy night' }

let store: MemoryTransport
let a: RsvpDatabase
let b: RsvpDatabase
let clock: number

beforeEach(() => {
  const id = Math.random().toString(36).slice(2)
  store = new MemoryTransport()
  a = getDb(`notes-a-${id}`)
  b = getDb(`notes-b-${id}`)
  clock = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))
})

afterEach(() => vi.restoreAllMocks())

async function importBook(db: RsvpDatabase): Promise<number> {
  const syncId = await syncIdOf({ kind: 'reflow' }, { tokens: TOKENS })
  const book = await addBook(db, {
    title: 'Dark',
    source: 'local',
    fingerprint: 'f',
    syncId,
    ...TEXT_BOOK,
  })
  await saveTokens(db, book.id as number, TOKENS, 'f')
  return book.id as number
}

/** What a device shows of its notes, in terms both share. */
async function shown(db: RsvpDatabase, bookId: number) {
  return (await notesOf(db, bookId)).map((n) => ({
    noteId: n.noteId,
    body: n.shown.body,
    conflicts: n.conflicts.map((c) => c.body),
    lostDeletes: n.lostDeletes.length,
  }))
}

const sync = async (...dbs: RsvpDatabase[]) => {
  for (const db of dbs) await syncOnce(db, store)
}

describe('syncing notes', () => {
  it('carries a note over and back', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    const noteId = await addNote(a, onA, anchor, 'Famously bad')
    await sync(a, b)
    expect(await shown(b, onB)).toEqual([
      { noteId, body: 'Famously bad', conflicts: [], lostDeletes: 0 },
    ])

    await editNote(b, noteId, 'Famously bad, and famously quoted')
    await sync(b, a)
    expect(await shown(a, onA)).toEqual(await shown(b, onB))
    expect((await shown(a, onA))[0]!.body).toBe('Famously bad, and famously quoted')
  })

  it('keeps both versions on both devices when both edit at once, until one settles it', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    const noteId = await addNote(a, onA, anchor, 'draft')
    await sync(a, b)

    await editNote(a, noteId, 'A’s version')
    await editNote(b, noteId, 'B’s version')
    await sync(a, b, a)
    const onBoth = await shown(a, onA)
    expect(onBoth).toEqual(await shown(b, onB))
    expect([onBoth[0]!.body, ...onBoth[0]!.conflicts].sort()).toEqual([
      'A’s version',
      'B’s version',
    ])

    await settleNote(b, noteId, 'A’s and B’s, merged')
    await sync(b, a)
    expect(await shown(a, onA)).toEqual([
      { noteId, body: 'A’s and B’s, merged', conflicts: [], lostDeletes: 0 },
    ])
    expect(await shown(b, onB)).toEqual(await shown(a, onA))
  })

  it('lets an edit win over a delete made at the same time, and says so', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    const noteId = await addNote(a, onA, anchor, 'draft')
    await sync(a, b)

    await deleteNote(a, noteId)
    await editNote(b, noteId, 'still wanted')
    await sync(a, b, a)
    expect(await shown(a, onA)).toEqual([
      { noteId, body: 'still wanted', conflicts: [], lostDeletes: 1 },
    ])
    expect(await shown(b, onB)).toEqual(await shown(a, onA))

    // Editing it again answers the lost delete, everywhere.
    await editNote(a, noteId, 'still wanted, really')
    await sync(a, b)
    expect((await shown(b, onB))[0]).toMatchObject({ body: 'still wanted, really', lostDeletes: 0 })
  })

  it('brings a book’s notes with it when the book is downloaded', async () => {
    const onA = await importBook(a)
    const noteId = await addNote(a, onA, anchor, 'for later')
    await sync(a)
    await uploadBook(a, store, (await a.books.get(onA))!)

    await sync(b)
    expect(await b.notes.count()).toBe(0) // the book isn't here yet
    const onB = await downloadBook(b, store, (await a.books.get(onA))!.syncId!)
    expect(await shown(b, onB)).toEqual([
      { noteId, body: 'for later', conflicts: [], lostDeletes: 0 },
    ])
  })
})

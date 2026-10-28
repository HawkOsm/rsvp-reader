import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, getProgress, removeBook, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { addBookmark, listBookmarks, removeBookmark } from '@/storage/bookmarks'
import { getSetting, setSetting } from '@/storage/settings'
import { createShelf, listShelves, setOnShelf } from '@/storage/shelves'
import { syncIdOf } from '@/storage/sync-id'
import { SyncFormatError, syncOnce } from '@/sync/coordinator'
import { acceptProgressOffer, progressOffers } from '@/sync/offers'
import { MemoryTransport } from '@/sync/transport'
import { TEXT_BOOK } from '../storage/fixtures'

const TOKENS = [makeToken('It'), makeToken('was'), makeToken('a'), makeToken('dark')]

let store: MemoryTransport
let a: RsvpDatabase
let b: RsvpDatabase
let clock: number

beforeEach(() => {
  const id = Math.random().toString(36).slice(2)
  store = new MemoryTransport()
  a = getDb(`sync-a-${id}`)
  b = getDb(`sync-b-${id}`)
  clock = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => vi.restoreAllMocks())

/** The same book imported on a device, as `importLocalFile` stores it. */
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

const read = (db: RsvpDatabase, bookId: number, wordIndex: number) => {
  clock += 1000
  return saveProgress(db, bookId, { wordIndex, wpm: 300, mode: 'rsvp' })
}

describe('syncOnce', () => {
  it('offers another device’s position instead of jumping to it', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await read(a, onA, 3)
    await syncOnce(a, store)
    await syncOnce(b, store)

    expect(await getProgress(b, onB)).toBeUndefined()
    const [offer] = await progressOffers(b)
    expect(offer).toMatchObject({ bookId: onB, title: 'Dark', progress: { wordIndex: 3 } })

    await acceptProgressOffer(b, offer!)
    expect(await getProgress(b, onB)).toMatchObject({ wordIndex: 3 })
    expect(await progressOffers(b)).toEqual([])
  })

  it('does not let an idle device send its old position back', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await read(a, onA, 1)
    await syncOnce(a, store)
    await syncOnce(b, store)
    await read(b, onB, 3)
    await syncOnce(b, store)

    // A was left open and did nothing; it wakes and syncs.
    await syncOnce(a, store)
    expect((await progressOffers(a))[0]).toMatchObject({ progress: { wordIndex: 3 } })
    await syncOnce(b, store)
    expect(await progressOffers(b)).toEqual([])
  })

  it('lets a newer change win even when an older one is sent after it', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await read(a, onA, 1) // read on A while offline...
    await read(b, onB, 3) // ...then later on B, which syncs first
    await syncOnce(b, store)
    await syncOnce(a, store)
    await syncOnce(b, store)

    expect((await progressOffers(a))[0]).toMatchObject({ progress: { wordIndex: 3 } })
    expect(await progressOffers(b)).toEqual([])
  })

  it('does not send a place the reader opened a book at and left without moving', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await read(a, onA, 3)
    await syncOnce(a, store)
    await syncOnce(b, store)

    // B opens the book and closes it again: the reader saves where it is.
    clock += 1000
    await saveProgress(b, onB, { wordIndex: 0, wpm: 300, mode: 'rsvp' })
    await saveProgress(b, onB, { wordIndex: 0, wpm: 300, mode: 'rsvp' })
    expect((await syncOnce(b, store)).pushed).toBe(0)
    await syncOnce(a, store)
    expect(await progressOffers(a)).toEqual([])
    expect((await progressOffers(b))[0]).toMatchObject({ progress: { wordIndex: 3 } })
  })

  it('declining an offer is a newer change that wins everywhere', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await read(a, onA, 3)
    await syncOnce(a, store)
    await syncOnce(b, store)
    await read(b, onB, 1) // B keeps reading where it was
    await syncOnce(b, store)
    await syncOnce(a, store)
    expect((await progressOffers(a))[0]).toMatchObject({ progress: { wordIndex: 1 } })
  })

  it('carries settings over and says so', async () => {
    await setSetting(a, 'theme', 'dark')
    await setSetting(a, 'bookScale', 2)
    await syncOnce(a, store)
    expect(await syncOnce(b, store)).toMatchObject({ settingsChanged: true })
    expect(await getSetting(b, 'theme', 'system')).toBe('dark')
    expect(await getSetting(b, 'bookScale', null)).toBeNull()
  })

  it('removes a book removed on another device', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await syncOnce(a, store)
    await syncOnce(b, store)
    clock += 1000
    await removeBook(a, onA)
    await syncOnce(a, store)
    await syncOnce(b, store)
    expect(await b.books.get(onB)).toBeUndefined()
  })

  it('applies nothing twice', async () => {
    const onA = await importBook(a)
    await read(a, onA, 3)
    await syncOnce(a, store)
    await syncOnce(b, store)
    expect(await syncOnce(b, store)).toMatchObject({ applied: 0, pushed: 0 })
    expect(await syncOnce(a, store)).toMatchObject({ applied: 0, pushed: 0 })
  })

  it('sends what was saved before sync existed, with the time it was saved', async () => {
    const old = await addBook(a, { title: 'Dark', source: 'local', fingerprint: 'f', ...TEXT_BOOK })
    await saveTokens(a, old.id as number, TOKENS, 'f')
    await read(a, old.id as number, 2)
    const onB = await importBook(b)
    await read(b, onB, 3) // newer than A's old position

    await syncOnce(a, store)
    expect((await a.books.get(old.id as number))?.syncId).toBeTruthy()
    await syncOnce(b, store)
    expect(await progressOffers(b)).toEqual([])
    await syncOnce(a, store)
    expect((await progressOffers(a))[0]).toMatchObject({ progress: { wordIndex: 3 } })
  })

  it('never reuses a sequence number after a crash between sending and saving', async () => {
    const onA = await importBook(a)
    await read(a, onA, 1)
    await syncOnce(a, store)
    // The log was written, but the device lost its record of having sent it.
    await a.syncState.update('local', { nextSeq: 1 })
    await read(a, onA, 2)
    await syncOnce(a, store)

    const log = [...store.files].find(([name]) => name.startsWith('log-'))![1]
    const seqs = (JSON.parse(log) as { ops: { seq: number }[] }).ops.map((op) => op.seq)
    expect(seqs).toEqual([1, 2, 3])
    await syncOnce(b, store)
    const onB = await importBook(b)
    expect((await progressOffers(b))[0]).toMatchObject({ bookId: onB, progress: { wordIndex: 2 } })
  })

  it('refuses to write to a store a newer version made', async () => {
    await store.write('meta.json', JSON.stringify({ formatVersion: 99 }))
    await expect(syncOnce(a, store)).rejects.toBeInstanceOf(SyncFormatError)
  })
})

/** What a device shows, in terms every device shares: books by sync id. */
async function visible(db: RsvpDatabase) {
  const syncIds = new Map((await db.books.toArray()).map((b) => [b.id, b.syncId]))
  const shelves = (await listShelves(db)).map((s) => ({
    id: s.syncId,
    name: s.name,
    color: s.color,
    books: s.bookIds.map((id) => syncIds.get(id)),
  }))
  const marks = (await listBookmarks(db)).map((m) => `${syncIds.get(m.bookId)}:${m.wordIndex}`)
  const settings = await Promise.all(['theme', 'defaultWpm'].map((k) => getSetting(db, k, null)))
  return {
    shelves: shelves.sort((x, y) => x.id.localeCompare(y.id)),
    marks: marks.sort(),
    settings,
  }
}

describe('syncing shelves and bookmarks', () => {
  it('carries a shelf over, matching its books by sync id', async () => {
    // Another book first, so B's copy gets a different local id from A's.
    await addBook(b, { title: 'Other', source: 'local', fingerprint: 'o', ...TEXT_BOOK })
    const onB = await importBook(b)
    const onA = await importBook(a)
    expect(onB).not.toBe(onA)
    const shelf = await createShelf(a, 'Favourites', 'shelf-green')
    await setOnShelf(a, shelf.id as number, onA, true)
    await syncOnce(a, store)
    const result = await syncOnce(b, store)

    expect(result.libraryChanged).toBe(true)
    const [onShelf] = await listShelves(b)
    expect(onShelf).toMatchObject({
      syncId: shelf.syncId,
      name: 'Favourites',
      color: 'shelf-green',
    })
    expect(onShelf!.bookIds).toHaveLength(1)
    expect(await visible(b)).toEqual(await visible(a))
  })

  it('lets the newest version of a shelf win whole', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    const shelf = await createShelf(a, 'S', 'accent')
    await syncOnce(a, store)
    await syncOnce(b, store)
    const onBShelf = (await listShelves(b))[0]!.id as number

    clock += 1000
    await setOnShelf(a, shelf.id as number, onA, true)
    clock += 1000
    await setOnShelf(b, onBShelf, onB, true)
    clock += 1000
    await setOnShelf(b, onBShelf, onB, false)
    for (const db of [a, b, a]) await syncOnce(db, store)

    expect((await listShelves(a))[0]!.bookIds).toEqual([])
    expect(await visible(a)).toEqual(await visible(b))
  })

  it('carries bookmarks over, and their removal', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await addBookmark(a, onA, 1, 'was')
    await addBookmark(a, onA, 3, 'dark')
    await syncOnce(a, store)
    await syncOnce(b, store)
    expect((await listBookmarks(b)).map((m) => [m.bookId, m.wordIndex, m.excerpt])).toEqual(
      expect.arrayContaining([
        [onB, 1, 'was'],
        [onB, 3, 'dark'],
      ]),
    )

    clock += 1000
    const three = (await listBookmarks(b)).find((m) => m.wordIndex === 3)!
    await removeBookmark(b, three.id as number)
    await addBookmark(b, onB, 1, 'was') // already there: still one bookmark
    await syncOnce(b, store)
    await syncOnce(a, store)
    expect((await listBookmarks(a)).map((m) => m.wordIndex)).toEqual([1])
    expect(await visible(a)).toEqual(await visible(b))
  })

  it('sends shelves and bookmarks made before they were recorded', async () => {
    const onA = await importBook(a)
    await a.shelves.add({
      syncId: 'old-shelf',
      name: 'Old',
      color: 'accent',
      bookIds: [onA],
      createdAt: 5,
    })
    await a.bookmarks.add({ bookId: onA, wordIndex: 2, excerpt: 'a', createdAt: 6 })
    await syncOnce(a, store)
    await importBook(b)
    await syncOnce(b, store)
    expect(await visible(b)).toEqual(await visible(a))
    expect((await visible(b)).shelves).toHaveLength(1)
  })

  it('converges on progress, settings, shelves and bookmarks changed on both sides', async () => {
    const books = { a: await importBook(a), b: await importBook(b) }
    const shelf = await createShelf(a, 'Shared', 'accent')
    await syncOnce(a, store)
    await syncOnce(b, store)
    const shelfOnB = (await listShelves(b))[0]!.id as number

    // Both devices change things, some the same things, without syncing.
    clock += 1000
    await setSetting(a, 'theme', 'dark')
    await setOnShelf(a, shelf.id as number, books.a, true)
    await addBookmark(a, books.a, 0, 'It')
    await read(a, books.a, 2)
    clock += 1000
    await setSetting(b, 'theme', 'light')
    await setSetting(b, 'defaultWpm', 450)
    await createShelf(b, 'Only on B', 'shelf-amber')
    await addBookmark(b, books.b, 3, 'dark')
    await setOnShelf(b, shelfOnB, books.b, true)
    await read(b, books.b, 1)

    // Syncing in either order, twice over, ends in the same place.
    for (const db of [b, a, b, a]) await syncOnce(db, store)
    expect(await visible(a)).toEqual(await visible(b))
    expect((await visible(a)).settings).toEqual(['light', 450])
    expect((await visible(a)).shelves).toHaveLength(2)
    expect((await visible(a)).marks).toHaveLength(2)
    // B read last, so A is offered B's place, and B is offered nothing.
    expect((await progressOffers(a))[0]).toMatchObject({ progress: { wordIndex: 1 } })
    expect(await progressOffers(b)).toEqual([])
  })
})

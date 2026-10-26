import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, getProgress, removeBook, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { getSetting, setSetting } from '@/storage/settings'
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

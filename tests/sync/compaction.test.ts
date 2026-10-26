import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { listBookmarks } from '@/storage/bookmarks'
import { addBook, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { syncIdOf } from '@/storage/sync-id'
import { localSyncState, recordChange, syncTables } from '@/storage/sync-log'
import { needsSnapshot } from '@/sync/compaction'
import { syncOnce, SYNC_FORMAT_VERSION } from '@/sync/coordinator'
import { progressOffers } from '@/sync/offers'
import { MemoryTransport } from '@/sync/transport'
import { TEXT_BOOK } from '../storage/fixtures'

const DAY = 24 * 60 * 60 * 1000
const TOKENS = Array.from({ length: 1500 }, (_, i) => makeToken(`w${i}`))

let store: MemoryTransport
let a: RsvpDatabase
let b: RsvpDatabase
let clock: number

beforeEach(() => {
  const id = Math.random().toString(36).slice(2)
  store = new MemoryTransport()
  a = getDb(`compact-a-${id}`)
  b = getDb(`compact-b-${id}`)
  clock = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => vi.restoreAllMocks())

async function importBook(db: RsvpDatabase): Promise<number> {
  const syncId = await syncIdOf({ kind: 'reflow' }, { tokens: TOKENS })
  const book = await addBook(db, {
    title: 'Long',
    source: 'local',
    fingerprint: 'f',
    syncId,
    ...TEXT_BOOK,
  })
  await saveTokens(db, book.id as number, TOKENS, 'f')
  return book.id as number
}

/** Enough changes to fill a few log files and call for a snapshot: what
 * `addBookmark` leaves, written in bulk, since one at a time is too slow. */
async function markMany(db: RsvpDatabase, bookId: number, count = 1200, from = 0) {
  const state = await localSyncState(db)
  const book = (await db.books.get(bookId))!
  const words = Array.from({ length: count }, (_, i) => from + i)
  await db.bookmarks.bulkAdd(
    words.map((wordIndex) => ({ bookId, wordIndex, excerpt: `w${wordIndex}`, createdAt: clock })),
  )
  const registers = words.map((wordIndex, i) => ({
    key: `bookmark:${book.syncId}:${wordIndex}`,
    hlc: { wall: clock, count: i, device: state.device },
    change: {
      kind: 'bookmark' as const,
      book: book.syncId!,
      wordIndex,
      value: { excerpt: `w${wordIndex}`, createdAt: clock },
    },
    pending: 1 as const,
  }))
  await db.syncRegisters.bulkPut(registers)
  await db.syncState.put({ ...state, clock: registers.at(-1)!.hlc })
  clock += 1000
}

const files = (prefix: string) => [...store.files.keys()].filter((n) => n.startsWith(prefix)).sort()
const sync = (db: RsvpDatabase) => syncOnce(db, store, () => clock)

describe('snapshots and purging', () => {
  it('snapshots, purges its own read logs, and a new device starts from the snapshot', async () => {
    const onA = await importBook(a)
    await markMany(a, onA)
    const result = await sync(a)

    expect(result.snapshotWritten).toBe(true)
    expect(result.purged).toBe(2) // segments 0 and 1; the last stays
    expect(files('snapshot-')).toHaveLength(1)
    const { device } = await localSyncState(a)
    expect(files('log-')).toEqual([`log-${device}-000002.json`])

    await importBook(b)
    const onB = await sync(b)
    expect(onB.fromSnapshot).toBe(true)
    expect(await listBookmarks(b)).toHaveLength(1200)
  })

  it('keeps logs an active device hasn’t read yet, and purges them once it has', async () => {
    const onA = await importBook(a)
    await importBook(b)
    await sync(a)
    await sync(b) // B is seen, and has read nothing much

    await markMany(a, onA)
    expect((await sync(a)).purged).toBe(0)
    expect(files('log-').length).toBeGreaterThanOrEqual(3)

    const onB = await sync(b)
    expect(onB.fromSnapshot).toBe(false) // nothing was purged: B reads the logs
    expect(await listBookmarks(b)).toHaveLength(1200)
    expect((await sync(a)).purged).toBe(2)
  })

  it('doesn’t wait for a dormant or removed device', async () => {
    const onA = await importBook(a)
    await importBook(b)
    await sync(a)
    await sync(b)

    clock += 31 * DAY // B goes quiet
    await markMany(a, onA)
    expect((await sync(a)).purged).toBe(2)

    // A device the user removed doesn't count either, however recent.
    const c = getDb(`compact-c-${Math.random().toString(36).slice(2)}`)
    await importBook(c)
    await sync(c)
    clock += 1000
    const { device: cId } = await localSyncState(c)
    await a.transaction('rw', syncTables(a), () =>
      recordChange(a, { kind: 'device', device: cId, value: { removed: true } }),
    )
    await markMany(a, onA, 1200, 1200)
    const result = await sync(a)
    expect(result.purged).toBeGreaterThan(0)
    expect(result.devices.map((d) => d.device)).not.toContain(cId)

    // C syncs again after its removal, so it is back.
    clock += 1000
    await sync(c)
    expect((await sync(a)).devices.map((d) => d.device)).toContain(cId)
  })

  it('a device back after a purge keeps the change it made offline', async () => {
    const onA = await importBook(a)
    const onB = await importBook(b)
    await sync(a)
    await sync(b)

    clock += 31 * DAY
    await saveProgress(b, onB, { wordIndex: 40, wpm: 300, mode: 'rsvp' }) // offline, on B
    clock += DAY
    await markMany(a, onA)
    await saveProgress(a, onA, { wordIndex: 20, wpm: 300, mode: 'rsvp' })
    expect((await sync(a)).purged).toBe(2)
    const { device } = await localSyncState(a)
    expect(files(`log-${device}-`)).toEqual([`log-${device}-000002.json`])

    // B made its change before A's: A's is newer and wins, B is offered it.
    const back = await sync(b)
    expect(back.fromSnapshot).toBe(true)
    expect(await listBookmarks(b)).toHaveLength(1200)
    expect((await progressOffers(b))[0]).toMatchObject({ progress: { wordIndex: 20 } })
    await sync(a)
    expect(await progressOffers(a)).toEqual([])
  })

  it('deletes its own older snapshot once it writes a newer one', async () => {
    const onA = await importBook(a)
    await markMany(a, onA)
    await sync(a)
    const first = files('snapshot-')
    await markMany(a, onA, 1100, 1200)
    await sync(a)
    const second = files('snapshot-')
    expect(second).toHaveLength(1)
    expect(second).not.toEqual(first)
  })

  it('raises an older store’s format, so older versions stop before missing purged data', async () => {
    await store.write('meta.json', JSON.stringify({ formatVersion: 1 }))
    await importBook(a)
    await sync(a)
    expect(JSON.parse(store.files.get('meta.json')!)).toEqual({
      formatVersion: SYNC_FORMAT_VERSION,
    })
  })
})

describe('needsSnapshot', () => {
  it('is only when a device’s log starts after where this one stopped reading', () => {
    const names = ['log-x-000002.json', 'log-x-000003.json', 'log-me-000000.json']
    expect(needsSnapshot(names, 'me', {})).toBe(true)
    expect(needsSnapshot(names, 'me', { x: 999 })).toBe(true)
    expect(needsSnapshot(names, 'me', { x: 1000 })).toBe(false)
    expect(needsSnapshot(['log-x-000000.json'], 'me', {})).toBe(false)
  })
})

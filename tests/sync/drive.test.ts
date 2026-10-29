import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, getProgress, saveProgress, saveTokens } from '@/storage/library'
import { getDb, type RsvpDatabase } from '@/storage/schema'
import { getSetting, setSetting } from '@/storage/settings'
import { syncIdOf } from '@/storage/sync-id'
import { localSyncState } from '@/storage/sync-log'
import { syncOnce } from '@/sync/coordinator'
import {
  backoffDelay,
  DriveError,
  DriveFullError,
  DriveTransport,
  NeedsReconnectError,
  OfflineError,
  type TokenSource,
} from '@/sync/drive'
import { progressOffers } from '@/sync/offers'
import { TEXT_BOOK } from '../storage/fixtures'
import { FakeDrive } from './fake-drive'

let drive: FakeDrive
let sleeps: number[]

beforeEach(() => {
  drive = new FakeDrive()
  sleeps = []
})

function transport(
  auth: TokenSource = { getToken: async () => 'good', renewToken: async () => null },
) {
  return new DriveTransport({
    auth,
    fetch: drive.fetch,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    attempts: 4,
  })
}

describe('DriveTransport', () => {
  it('keeps files in the app folder, replacing a file rather than adding another', async () => {
    const store = transport()
    expect(await store.list()).toEqual([])
    expect(await store.read('meta.json')).toBeNull()
    await store.write('meta.json', '{"v":1}')
    await store.write('a.json', 'a')
    await store.write('b.json', 'b')
    await store.write('meta.json', '{"v":2}')

    expect(drive.files.map((f) => f.name)).toEqual(['meta.json', 'a.json', 'b.json'])
    // A second device sees them, across pages of the listing.
    const other = transport()
    expect((await other.list()).sort()).toEqual(['a.json', 'b.json', 'meta.json'])
    expect(await other.read('meta.json')).toBe('{"v":2}')
    expect(drive.requests.every((r) => !r.includes('spaces=drive'))).toBe(true)
  })

  it('makes a file again if it was deleted on Drive since it was listed', async () => {
    const store = transport()
    await store.write('a.json', 'a')
    drive.files.length = 0
    expect(await store.read('a.json')).toBeNull()
    await store.write('a.json', 'again')
    expect(drive.byName('a.json')).toBe('again')
  })

  it('deletes a file, and a file already gone is no error', async () => {
    const store = transport()
    await store.write('a.json', 'a')
    await store.write('b.json', 'b')
    await store.delete('a.json')
    expect(drive.files.map((f) => f.name)).toEqual(['b.json'])
    await store.delete('a.json')
    drive.files.length = 0 // gone from Drive behind this transport's back
    await store.delete('b.json')
    expect(await transport().list()).toEqual([])
  })

  it('stores bytes as they are, and says how much it holds and how much room is left', async () => {
    const store = transport()
    const bytes = new Uint8Array([0, 255, 1, 128, 10, 13])
    await store.write('bookfile-x', new Blob([bytes]))
    await store.write('bookfile-x', new Blob([bytes, bytes])) // replaced, not added
    await store.write('meta.json', '{}')
    const read = await transport().readBlob('bookfile-x')
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(new Uint8Array([...bytes, ...bytes]))
    expect(drive.files.map((f) => f.name)).toEqual(['bookfile-x', 'meta.json'])
    expect(await store.readBlob('missing')).toBeNull()

    expect(await store.usage()).toEqual({ used: 14, free: null })
    drive.free = 1000
    expect(await store.usage()).toEqual({ used: 14, free: 1000 })
  })

  it('backs off and retries on rate limits and server errors', async () => {
    const store = transport()
    await store.list()
    drive.failNext(503)
    drive.failNext(429)
    drive.failNext(403, 1, 'userRateLimitExceeded')
    await store.write('a.json', 'a')
    expect(drive.byName('a.json')).toBe('a')
    // Half of a doubling ceiling: 500, 1000, 2000 ms.
    expect(sleeps).toEqual([250, 500, 1000])
  })

  it('gives up after its attempts, and says Drive is full or unreachable', async () => {
    const store = transport()
    await store.list()
    drive.failNext(500, 4)
    await expect(store.write('a.json', 'a')).rejects.toThrow(DriveError)
    drive.failNext(0, 4)
    await expect(store.write('a.json', 'a')).rejects.toThrow(OfflineError)
    drive.failNext(403, 1, 'accessNotConfigured')
    await expect(store.write('a.json', 'a')).rejects.toThrow(/Drive API isn’t enabled/)
    drive.failNext(403, 1, 'storageQuotaExceeded')
    sleeps = []
    await expect(store.write('a.json', 'a')).rejects.toThrow(DriveFullError)
    expect(sleeps).toEqual([])
  })

  it('asks for a new token once after a 401, then needs a reconnect', async () => {
    let token = 'stale'
    const renewToken = vi.fn(async () => (token = 'good'))
    const store = transport({ getToken: async () => token, renewToken })
    expect(await store.list()).toEqual([])
    expect(renewToken).toHaveBeenCalledOnce()

    drive.tokens.clear()
    await expect(store.list()).rejects.toThrow(NeedsReconnectError)
    expect(renewToken).toHaveBeenCalledTimes(2)

    const signedOut = transport({ getToken: async () => null, renewToken: async () => null })
    const before = drive.requests.length
    await expect(signedOut.list()).rejects.toThrow(NeedsReconnectError)
    expect(drive.requests.length).toBe(before)
  })

  it('never waits longer than the ceiling', () => {
    expect(backoffDelay(0, 1)).toBe(500)
    expect(backoffDelay(3, 1)).toBe(4000)
    expect(backoffDelay(20, 1)).toBe(32_000)
    expect(backoffDelay(5, 0)).toBe(0)
  })
})

describe('two devices syncing through Drive', () => {
  const TOKENS = [makeToken('It'), makeToken('was'), makeToken('a'), makeToken('dark')]
  let a: RsvpDatabase
  let b: RsvpDatabase

  beforeEach(() => {
    const id = Math.random().toString(36).slice(2)
    a = getDb(`drive-a-${id}`)
    b = getDb(`drive-b-${id}`)
  })

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

  it('registers a device once, however often it connects, fails and reconnects', async () => {
    const onA = await importBook(a)
    const { device } = await localSyncState(a)
    // A first attempt that fails partway (offline), then one that works.
    drive.failNext(0, 4)
    await expect(syncOnce(a, transport())).rejects.toThrow(OfflineError)
    await syncOnce(a, transport())
    // Disconnect and connect again: a new transport, nothing remembered.
    await saveProgress(a, onA, { wordIndex: 2, wpm: 300, mode: 'rsvp' })
    await syncOnce(a, transport())
    await syncOnce(a, transport())

    expect((await localSyncState(a)).device).toBe(device)
    expect(await a.syncState.count()).toBe(1)
    const deviceFiles = drive.files.filter((f) => f.name.startsWith('device-'))
    expect(deviceFiles.map((f) => f.name)).toEqual([`device-${device}.json`])
    const logs = drive.files.filter((f) => f.name.startsWith('log-')).map((f) => f.name)
    expect(new Set(logs).size).toBe(logs.length)
    expect(logs.every((name) => name.startsWith(`log-${device}-`))).toBe(true)
  })

  it('converge on progress and settings', async () => {
    const onA = await importBook(a)
    await importBook(b)
    await saveProgress(a, onA, { wordIndex: 2, wpm: 300, mode: 'rsvp' })
    await setSetting(a, 'theme', 'light')

    await syncOnce(a, transport())
    await syncOnce(b, transport())
    expect(await getSetting(b, 'theme', 'system')).toBe('light')
    expect((await progressOffers(b))[0]).toMatchObject({ progress: { wordIndex: 2 } })
  })

  it('keeps changes queued through a 401 mid-run, and sends them on reconnect', async () => {
    const onA = await importBook(a)
    await syncOnce(a, transport())
    await saveProgress(a, onA, { wordIndex: 3, wpm: 300, mode: 'rsvp' })

    // The token is refused just as the change is being uploaded, after the
    // pull, and can't be renewed.
    let token: string | null = 'good'
    const auth = { getToken: async () => token, renewToken: async () => (token = null) }
    let revoked = false
    const store = new DriveTransport({
      auth,
      fetch: async (input, init) => {
        if (!revoked && init?.method === 'PATCH' && String(init.body).includes('"wordIndex":3')) {
          revoked = true
          drive.tokens.clear()
        }
        return drive.fetch(input, init)
      },
      sleep: async () => {},
    })
    await expect(syncOnce(a, store)).rejects.toThrow(NeedsReconnectError)
    expect(drive.requests.at(-1)).toMatch(/^PATCH \/upload\/drive\/v3\/files\/f\d+/)
    expect(await a.syncRegisters.where('pending').equals(1).count()).toBe(1)
    expect(JSON.stringify(drive.files)).not.toContain('"wordIndex":3')

    drive.tokens.add('again')
    token = 'again'
    expect((await syncOnce(a, store)).pushed).toBe(1)
    await importBook(b)
    await syncOnce(b, transport({ getToken: async () => 'again', renewToken: async () => null }))
    expect((await progressOffers(b))[0]).toMatchObject({ progress: { wordIndex: 3 } })
    expect(await getProgress(a, onA)).toMatchObject({ wordIndex: 3 })
  })

  it('sends changes made offline once it is back online', async () => {
    const onA = await importBook(a)
    await saveProgress(a, onA, { wordIndex: 1, wpm: 300, mode: 'rsvp' })
    drive.failNext(0, 4)
    await expect(syncOnce(a, transport())).rejects.toThrow(OfflineError)
    expect(drive.files).toEqual([])

    expect((await syncOnce(a, transport())).pushed).toBeGreaterThan(0)
    await importBook(b)
    await syncOnce(b, transport())
    expect((await progressOffers(b))[0]).toMatchObject({ progress: { wordIndex: 1 } })
  })
})

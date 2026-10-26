import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSync } from '@/app/hooks/useSync'
import { readErrorLog } from '@/lib/error-log'
import { flags } from '@/lib/flags'
import { readSyncRuns } from '@/lib/sync-runs'
import type { SyncAuth, SyncAuthState } from '@/platform'
import { NeedsReconnectError } from '@/sync/drive'
import { MemoryTransport } from '@/sync/transport'
import { makeToken } from '@/core/types'
import { addBook, saveTokens } from '@/storage/library'
import { getDb } from '@/storage/schema'
import { TEXT_BOOK } from '../storage/fixtures'

const store = new MemoryTransport()
let failWith: Error | null = null

vi.mock('@/stores/api/sync', async (original) => ({
  ...(await original<typeof import('@/stores/api/sync')>()),
  driveTransport: () => ({
    list: () => (failWith ? Promise.reject(failWith) : store.list()),
    read: (name: string) => store.read(name),
    write: (name: string, data: string) => store.write(name, data),
    delete: (name: string) => store.delete(name),
    readBlob: (name: string) => store.readBlob(name),
    usage: () => store.usage(),
  }),
}))

/** Sign-in that the test drives. */
function fakeAuth(initial: SyncAuthState): SyncAuth & { set(state: SyncAuthState): void } {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (next: SyncAuthState) => {
    state = next
    listeners.forEach((l) => l())
  }
  return {
    set,
    state: () => state,
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    getToken: async () => (state === 'signed-in' ? 'tok' : null),
    renewToken: async () => null,
    signIn: async () => set('signed-in'),
    signOut: async () => set('signed-out'),
  }
}

let auth: ReturnType<typeof fakeAuth>
vi.mock('@/platform', () => ({ getPlatform: async () => ({ syncAuth: auth }) }))

const { useSyncStore } = await import('@/stores/sync-store')

/** Let the platform promise settle, and any sync run finish. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
    await vi.waitFor(() => expect(useSyncStore.getState().running).toBe(false))
  })
const runs = (count: number) => vi.waitFor(() => expect(readSyncRuns()).toHaveLength(count))

beforeEach(() => {
  localStorage.clear()
  store.files.clear()
  store.blobs.clear()
  failWith = null
})

let stop: (() => void) | null = null
afterEach(async () => {
  stop?.()
  stop = null
  await settle()
})

describe('the sync store', () => {
  it('does nothing before the user connects, then syncs on connecting', async () => {
    auth = fakeAuth('signed-out')
    stop = useSyncStore.getState().start()
    await settle()
    expect(useSyncStore.getState().auth).toBe('signed-out')
    expect(store.files.size).toBe(0)

    await act(() => useSyncStore.getState().connect())
    await runs(1)
    expect(store.files.has('meta.json')).toBe(true)
    expect(readSyncRuns().at(-1)).toMatchObject({ outcome: 'synced' })
    expect(useSyncStore.getState().lastSyncedAt).not.toBeNull()
  })

  it('syncs again when the app comes back online or to the front', async () => {
    auth = fakeAuth('signed-in')
    stop = useSyncStore.getState().start()
    await runs(1) // on opening
    await settle()
    window.dispatchEvent(new Event('online'))
    await runs(2)
    await settle()
    document.dispatchEvent(new Event('visibilitychange'))
    await runs(3)
    await settle()

    stop()
    stop = null
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(readSyncRuns().length).toBe(3)
  })

  it('records a lost token in the sync log, not the error log', async () => {
    auth = fakeAuth('signed-in')
    failWith = new NeedsReconnectError()
    const errors = readErrorLog().length
    stop = useSyncStore.getState().start()
    await runs(1)
    await settle()
    expect(readSyncRuns().at(-1)).toMatchObject({ outcome: 'needs-reconnect' })
    expect(readErrorLog().length).toBe(errors)

    failWith = new Error('Drive broke')
    await act(() => useSyncStore.getState().syncNow())
    expect(readSyncRuns().at(-1)).toMatchObject({ outcome: 'error', error: 'Drive broke' })
    expect(readErrorLog().at(-1)).toMatchObject({ where: 'sync', message: 'Drive broke' })
  })

  it('forgets the log on disconnecting', async () => {
    auth = fakeAuth('signed-in')
    stop = useSyncStore.getState().start()
    await runs(1)
    await settle()
    await act(() => useSyncStore.getState().disconnect())
    expect(useSyncStore.getState().auth).toBe('signed-out')
    expect(readSyncRuns()).toEqual([])
  })
})

describe('book files', () => {
  async function bookHere(syncId: string) {
    const db = getDb()
    const book = await addBook(db, {
      title: `Book ${syncId}`,
      source: 'local',
      fingerprint: `f-${syncId}`,
      syncId,
      ...TEXT_BOOK,
    })
    await saveTokens(db, book.id as number, [makeToken('word')], `f-${syncId}`)
  }

  it('uploads this device’s books after a sync, and says how much Drive holds', async () => {
    await bookHere(`up-${Math.random()}`)
    auth = fakeAuth('signed-in')
    stop = useSyncStore.getState().start()
    await vi.waitFor(() => expect(useSyncStore.getState().usage).not.toBeNull())
    expect([...store.blobs.keys()].some((n) => n.startsWith('book-up-'))).toBe(true)
    expect(useSyncStore.getState().upload).toBeNull()
    expect(useSyncStore.getState().usage!.used).toBeGreaterThan(0)
  })

  it('uploads nothing with book files switched off, and remembers that', async () => {
    useSyncStore.getState().setBookFiles(false)
    await bookHere(`off-${Math.random()}`)
    auth = fakeAuth('signed-in')
    stop = useSyncStore.getState().start()
    await vi.waitFor(() => expect(useSyncStore.getState().usage).not.toBeNull())
    expect([...store.blobs.keys()].some((n) => n.startsWith('book-off-'))).toBe(false)
    expect(localStorage.getItem('rsvp-reader:sync-book-files')).toBe('off')
    useSyncStore.getState().setBookFiles(true)
  })
})

describe('useSync', () => {
  it('starts sync only with the sync flag on', () => {
    const start = vi.fn(() => () => {})
    useSyncStore.setState({ start })
    flags.setEnabled('sync', false)
    const { rerender } = renderHook(() => useSync())
    expect(start).not.toHaveBeenCalled()
    act(() => flags.setEnabled('sync', true))
    rerender()
    expect(start).toHaveBeenCalledOnce()
    flags.setEnabled('sync', false)
  })
})

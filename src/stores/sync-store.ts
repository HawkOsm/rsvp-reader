import { create } from 'zustand'
import type { SyncOutcome } from '@/core/sync/run'
import { logError } from '@/lib/error-log'
import {
  addSyncRun,
  clearSyncLog,
  deviceName,
  readSyncRuns,
  saveSeenDevices,
} from '@/lib/sync-runs'
import { getPlatform, type SyncAuth, type SyncAuthState } from '@/platform'
import {
  createSyncRunner,
  driveTransport,
  isExpected,
  phaseOf,
  runRecord,
  runSync,
  type SyncPhase,
  type SyncRunner,
} from './api/sync'
import { useAppStore } from './app-store'

// Sync while the app is open (docs/architecture/sync.md, section 8): when it
// opens, comes back online or to the foreground, after a pause in reading,
// and every few minutes, one run at a time and never in the way of reading.
// Nothing here runs until `start` is called, which the app does only with
// the `sync` flag on; until the user connects, a run does nothing at all.

/** How often to sync while the app is open and in front. */
const EVERY_MS = 5 * 60_000
/** How long a final sync before an update may hold the update up. */
const FINAL_SYNC_MS = 10_000

interface SyncStore {
  /** `null` where this shell can't sign in, or before `start`. */
  auth: SyncAuthState | null
  running: boolean
  lastOutcome: SyncOutcome | null
  lastSyncedAt: number | null
  /** Why the last run failed. */
  error: string | null
  /** Why the last sign-in didn't finish: a closed window, a blocked pop-up. */
  connectError: string | null
  /** Counts runs that brought changes in, so screens that show synced data
   * read it again when it changes. */
  revision: number

  /** Start syncing; returns a function that stops. */
  start: () => () => void
  /** Sign in and sync. Call it from a click. */
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  /** Sync once reading has paused for a few seconds. */
  syncSoon: () => void
  /** Sync before the app updates, if connected, for a few seconds at most. */
  finalSync: () => Promise<void>
}

let auth: SyncAuth | null = null
let runner: SyncRunner | null = null
let transport: ReturnType<typeof driveTransport> | null = null

const lastSynced = () => readSyncRuns().findLast((run) => run.outcome === 'synced')?.at ?? null

export const useSyncStore = create<SyncStore>((set, get) => {
  /** One sync run. Never rejects: what went wrong goes to the sync log, and
   * to the error log unless it is a state sync waits out (offline, signed
   * out), which is not a fault. */
  async function task() {
    if (!auth || auth.state() !== 'signed-in') return
    transport ??= driveTransport(auth)
    set({ running: true })
    const started = Date.now()
    let result: Awaited<ReturnType<typeof runSync>> | null = null
    let error: unknown
    try {
      result = await runSync(transport, deviceName(navigator.userAgent))
    } catch (err) {
      error = err ?? new Error('sync failed')
    }
    const run = runRecord(started, Date.now() - started, result, error)
    addSyncRun(run)
    if (!isExpected(run.outcome)) logError('sync', error)
    if (result) {
      saveSeenDevices(result.devices)
      if (result.settingsChanged) {
        await useAppStore
          .getState()
          .loadSettings()
          .catch((err: unknown) => logError('sync: settings', err))
      }
    }
    set((s) => ({
      running: false,
      lastOutcome: run.outcome,
      lastSyncedAt: run.outcome === 'synced' ? started : s.lastSyncedAt,
      error: run.error ?? null,
      revision: result && result.applied > 0 ? s.revision + 1 : s.revision,
    }))
  }

  return {
    auth: null,
    running: false,
    lastOutcome: null,
    lastSyncedAt: lastSynced(),
    error: null,
    connectError: null,
    revision: 0,

    start() {
      let stopped = false
      const stops: (() => void)[] = []
      void getPlatform()
        .then((platform) => {
          if (stopped || !platform.syncAuth) return
          const signIn = platform.syncAuth
          auth = signIn
          const local = createSyncRunner(task)
          runner = local
          const onAuth = () => {
            set({ auth: signIn.state() })
            if (signIn.state() === 'signed-in') void local.now()
          }
          stops.push(signIn.subscribe(onAuth))
          onAuth()

          const onVisible = () => {
            if (document.visibilityState === 'visible') void local.now()
          }
          const onOnline = () => void local.now()
          document.addEventListener('visibilitychange', onVisible)
          window.addEventListener('online', onOnline)
          const every = setInterval(onVisible, EVERY_MS)
          stops.push(() => {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('online', onOnline)
            clearInterval(every)
            local.stop()
          })
        })
        .catch((err: unknown) => logError('sync: start', err))
      return () => {
        stopped = true
        stops.forEach((stop) => stop())
        auth = null
        runner = null
        set({ auth: null })
      }
    },

    async connect() {
      if (!auth) return
      set({ connectError: null })
      try {
        await auth.signIn() // the auth listener starts the first run
      } catch (err) {
        // Not logged: a closed window or a blocked pop-up is the user's
        // doing, and the message says what to do about it.
        set({ connectError: err instanceof Error ? err.message : String(err) })
      }
    },

    async disconnect() {
      await auth?.signOut()
      transport = null
      clearSyncLog()
      set({ lastOutcome: null, lastSyncedAt: null, error: null, connectError: null })
    },

    syncNow: () => runner?.now() ?? Promise.resolve(),
    syncSoon: () => runner?.soon(),

    async finalSync() {
      if (!runner || get().auth !== 'signed-in') return
      await Promise.race([
        runner.now(),
        new Promise<void>((resolve) => setTimeout(resolve, FINAL_SYNC_MS)),
      ])
    },
  }
})

export type { SyncPhase }

/** Where sync stands, for Settings. */
export const useSyncPhase = (): SyncPhase =>
  useSyncStore((s) => phaseOf(s.auth, s.running, s.lastOutcome))

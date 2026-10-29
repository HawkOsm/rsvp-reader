import { tick, type Hlc } from '@/core/sync/hlc'
import { keyOf, type Change } from '@/core/sync/merge'
import type { RsvpDatabase, SyncStateRecord } from './schema'

// Local changes, recorded for sync as they are saved: each one becomes the
// newest version of its register, marked pending until it has been sent.
// Recording happens whether or not sync is connected, so a device that
// connects later sends its changes with the time they were really made.

/** The settings that follow the user to other devices. The rest (panel
 * open, page scale, spread) belong to this screen. */
export const SYNCED_SETTINGS: ReadonlySet<string> = new Set([
  'theme',
  'defaultWpm',
  'fontFamily',
  'fontSize',
  'orpColor',
  'showHints',
])

/** The tables `recordChange` writes, for a caller's transaction. */
export const syncTables = (db: RsvpDatabase) => [db.syncState, db.syncRegisters]

/** This device's sync state, made on first use. Read and made in one
 * transaction, so two callers at once (a sync run and the sync log, on a
 * new device) can't both make one. */
export async function localSyncState(db: RsvpDatabase): Promise<SyncStateRecord> {
  return db.transaction('rw', db.syncState, async () => {
    const existing = await db.syncState.get('local')
    if (existing) return existing
    const fresh: SyncStateRecord = {
      id: 'local',
      device: crypto.randomUUID(),
      clock: null,
      nextSeq: 1,
      cursors: {},
      seeded: false,
    }
    await db.syncState.add(fresh)
    return fresh
  })
}

/** Record a local change. Call it inside a transaction that includes
 * `syncTables(db)`, so the change and its record are saved together. A
 * change to the value already recorded is not a change, and is skipped. */
export async function recordChange(
  db: RsvpDatabase,
  change: Change,
  now = Date.now(),
): Promise<void> {
  const key = keyOf(change)
  const current = await db.syncRegisters.get(key)
  if (current && JSON.stringify(current.change) === JSON.stringify(change)) return
  const state = await localSyncState(db)
  const hlc = tick(state.clock, now, state.device)
  await db.syncRegisters.put({ key, hlc, change, pending: 1 })
  await db.syncState.put({ ...state, clock: hlc })
}

/** Record something that existed before it could be recorded, with the time
 * it was made (`wall`), unless a version of it is already recorded. */
export async function seedChange(db: RsvpDatabase, change: Change, wall: number): Promise<void> {
  const key = keyOf(change)
  if (await db.syncRegisters.get(key)) return
  const { device } = await localSyncState(db)
  const hlc: Hlc = { wall, count: 0, device }
  await db.syncRegisters.put({ key, hlc, change, pending: 1 })
}

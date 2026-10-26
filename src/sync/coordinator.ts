import { compareHlc, receive, type Hlc } from '@/core/sync/hlc'
import type { DeviceInfo } from '@/core/sync/run'
import { keyOf, newerRegisters, type Register, type SyncOp } from '@/core/sync/merge'
import { bookTables, deleteBookRows } from '@/storage/library'
import {
  SHELF_COLORS,
  type RsvpDatabase,
  type ShelfColor,
  type SyncStateRecord,
} from '@/storage/schema'
import { localSyncState, syncTables } from '@/storage/sync-log'
import { ensureSyncIds } from './identity'
import type { Transport } from './transport'

// One sync run (docs/architecture/sync.md, section 8): pull what other
// devices published, merge it in, then publish this device's own changes.
// Every step can be retried from the top after a crash or a lost connection.
// Not built yet: purging old logs, snapshots, and book files.

/** The version of the files below. A device that finds a newer one stops,
 * rather than write files a newer version can't read. */
export const SYNC_FORMAT_VERSION = 1

/** Changes per log file, so each stays small. */
export const OPS_PER_SEGMENT = 500

const META = 'meta.json'
const deviceFile = (device: string) => `device-${device}.json`
const logFile = (device: string, segment: number) =>
  `log-${device}-${String(segment).padStart(6, '0')}.json`
const LOG_NAME = /^log-(.+)-(\d{6})\.json$/
const DEVICE_NAME = /^device-(.+)\.json$/

/** The log segment that holds sequence number `seq`. */
const segmentOf = (seq: number) => Math.floor((seq - 1) / OPS_PER_SEGMENT)

interface LogSegment {
  device: string
  ops: SyncOp[]
}

export class SyncFormatError extends Error {
  constructor(found: number) {
    super(
      `The synced data is format ${found}; this version reads ${SYNC_FORMAT_VERSION}. Update the app.`,
    )
    this.name = 'SyncFormatError'
  }
}

export interface SyncResult {
  /** Changes from other devices that were newer than what was here. */
  applied: number
  /** This device's changes sent. */
  pushed: number
  /** Changes stamped more than a day ahead of this device's clock. They are
   * applied (every device must end up the same), but the clock doesn't
   * follow them. */
  skewed: number
  /** A synced setting changed here; the app should load its settings again. */
  settingsChanged: boolean
  /** A book was removed, or a shelf or bookmark changed: the library should
   * be read again. */
  libraryChanged: boolean
  /** Every other device that has synced, as it last described itself. */
  devices: DeviceInfo[]
}

/** One sync run. `name` is how other devices will name this one. */
export async function syncOnce(
  db: RsvpDatabase,
  transport: Transport,
  now: () => number = Date.now,
  name?: string,
): Promise<SyncResult> {
  await ensureSyncIds(db)
  await checkFormat(transport)
  const names = await transport.list()
  const state = await localSyncState(db)

  const { ops, cursors } = await pull(transport, names, state)
  const merged = await merge(db, ops, cursors, now())
  const pushed = await push(db, transport, names, now(), name)
  const devices = await otherDevices(transport, names, state.device)
  return { ...merged, pushed, devices }
}

async function otherDevices(
  transport: Transport,
  names: string[],
  self: string,
): Promise<DeviceInfo[]> {
  const devices: DeviceInfo[] = []
  for (const name of names) {
    const device = DEVICE_NAME.exec(name)?.[1]
    if (!device || device === self) continue
    const data = await transport.read(name)
    if (data !== null) {
      const { name: label, lastSeen } = JSON.parse(data) as Partial<DeviceInfo>
      devices.push({ device, name: label, lastSeen: lastSeen ?? 0 })
    }
  }
  return devices
}

async function checkFormat(transport: Transport): Promise<void> {
  const meta = await transport.read(META)
  if (meta === null) {
    await transport.write(META, JSON.stringify({ formatVersion: SYNC_FORMAT_VERSION }))
    return
  }
  const { formatVersion } = JSON.parse(meta) as { formatVersion: number }
  if (formatVersion > SYNC_FORMAT_VERSION) throw new SyncFormatError(formatVersion)
}

/** Every op other devices published since this one last pulled. */
async function pull(transport: Transport, names: string[], state: SyncStateRecord) {
  const ops: SyncOp[] = []
  const cursors = { ...state.cursors }
  for (const name of names) {
    const match = LOG_NAME.exec(name)
    const [, device, segment] = match ?? []
    if (!device || device === state.device) continue
    const cursor = state.cursors[device] ?? 0
    // Segments wholly at or below the cursor were read on an earlier run.
    if (Number(segment) < segmentOf(cursor + 1)) continue
    const data = await transport.read(name)
    if (data === null) continue
    for (const op of (JSON.parse(data) as LogSegment).ops) {
      if (op.seq <= cursor) continue
      ops.push(op)
      cursors[device] = Math.max(cursors[device] ?? 0, op.seq)
    }
  }
  return { ops, cursors }
}

/** Apply the ops that are newer than what this device holds, in one
 * transaction with the cursors, so a crash can't apply half of them. */
async function merge(
  db: RsvpDatabase,
  ops: SyncOp[],
  cursors: Record<string, number>,
  now: number,
): Promise<Omit<SyncResult, 'pushed' | 'devices'>> {
  const tables = [...syncTables(db), ...bookTables(db), db.settings]
  return db.transaction('rw', tables, async () => {
    const state = await localSyncState(db)
    const keys = [...new Set(ops.map((op) => keyOf(op.change)))]
    const current = new Map<string, Register>()
    for (const register of await db.syncRegisters.bulkGet(keys)) {
      if (register) current.set(register.key, register)
    }

    const winners = newerRegisters(current, ops)
    let settingsChanged = false
    let libraryChanged = false
    for (const register of winners) {
      // Stored without `pending`: a local change this replaces lost, and
      // there's no point sending it.
      await db.syncRegisters.put(register)
      const changed = await applyToLibrary(db, register)
      settingsChanged ||= changed === 'settings'
      libraryChanged ||= changed === 'library'
    }

    let clock: Hlc | null = state.clock
    let skewed = 0
    for (const op of ops) {
      const next = receive(clock, op.hlc, now, state.device)
      clock = next.clock
      if (next.skewed) skewed++
    }
    await db.syncState.put({ ...state, clock, cursors })
    return { applied: winners.length, skewed, settingsChanged, libraryChanged }
  })
}

/** Make another device's change real here. Progress is left for the user to
 * accept (`progressOffers`): the reader never jumps on its own. Returns what
 * changed, if anything did. */
async function applyToLibrary(
  db: RsvpDatabase,
  { change }: Register,
): Promise<'settings' | 'library' | null> {
  switch (change.kind) {
    case 'setting':
      await db.settings.put({ key: change.key, value: change.value })
      return 'settings'
    case 'book': {
      // A book added elsewhere has no file here yet (book files don't sync
      // yet), so only a removal changes the library.
      if (change.value !== null) return null
      const books = await db.books.where('syncId').equals(change.book).toArray()
      for (const book of books) await deleteBookRows(db, book.id as number)
      return books.length > 0 ? 'library' : null
    }
    case 'shelf': {
      const local = await db.shelves.where('syncId').equals(change.shelf).first()
      if (change.value === null) {
        if (local) await db.shelves.delete(local.id as number)
        return local ? 'library' : null
      }
      const { name, color, books, createdAt } = change.value
      // Books this device doesn't have are left off; the shelf's register
      // keeps them, so they aren't lost when the shelf is next changed here.
      const ids = new Map<string, number>()
      for (const book of await db.books.where('syncId').anyOf(books).toArray()) {
        ids.set(book.syncId as string, book.id as number)
      }
      await db.shelves.put({
        ...(local && { id: local.id }),
        syncId: change.shelf,
        name,
        color: (SHELF_COLORS as readonly string[]).includes(color)
          ? (color as ShelfColor)
          : 'accent',
        bookIds: books.flatMap((id) => ids.get(id) ?? []),
        createdAt,
      })
      return 'library'
    }
    case 'bookmark': {
      const book = await db.books.where('syncId').equals(change.book).first()
      if (!book) return null
      const bookId = book.id as number
      const marks = db.bookmarks
        .where('bookId')
        .equals(bookId)
        .filter((m) => m.wordIndex === change.wordIndex)
      if (change.value === null) return (await marks.delete()) > 0 ? 'library' : null
      if ((await marks.count()) > 0) return null
      await db.bookmarks.add({ bookId, wordIndex: change.wordIndex, ...change.value })
      return 'library'
    }
    case 'progress':
      return null
  }
}

/** Publish this device's pending changes by appending them to its own log. */
async function push(
  db: RsvpDatabase,
  transport: Transport,
  names: string[],
  now: number,
  name: string | undefined,
): Promise<number> {
  const state = await localSyncState(db)
  const pending = (await db.syncRegisters.where('pending').equals(1).toArray()).sort((a, b) =>
    compareHlc(a.hlc, b.hlc),
  )

  // If an earlier run wrote its log but crashed before saving `nextSeq`, the
  // log is ahead; carry on after it, so no number is used twice.
  const own = names.filter((n) => LOG_NAME.exec(n)?.[1] === state.device).sort()
  const lastFile = own.at(-1)
  const last = lastFile ? await readSegment(transport, lastFile) : null
  let seq = Math.max(state.nextSeq, (last?.ops.at(-1)?.seq ?? 0) + 1)

  const segments = new Map<number, SyncOp[]>()
  for (const { hlc, change } of pending) {
    const segment = segmentOf(seq)
    if (!segments.has(segment)) {
      const existing = lastFile === logFile(state.device, segment) ? (last?.ops ?? []) : []
      segments.set(segment, [...existing])
    }
    segments.get(segment)!.push({ device: state.device, seq, hlc, change })
    seq++
  }
  for (const [segment, ops] of segments) {
    const data: LogSegment = { device: state.device, ops }
    await transport.write(logFile(state.device, segment), JSON.stringify(data))
  }

  await db.transaction('rw', syncTables(db), async () => {
    const latest = await localSyncState(db)
    for (const sent of pending) {
      // Changed again while it was being sent: the newer version still waits.
      await db.syncRegisters
        .where('key')
        .equals(sent.key)
        .filter((r) => compareHlc(r.hlc, sent.hlc) === 0)
        .modify((r) => void delete r.pending)
    }
    await db.syncState.put({ ...latest, nextSeq: seq })
  })

  const device = {
    device: state.device,
    name,
    lastSeen: now,
    cursors: (await localSyncState(db)).cursors,
  }
  await transport.write(deviceFile(state.device), JSON.stringify(device))
  return pending.length
}

async function readSegment(transport: Transport, name: string): Promise<LogSegment | null> {
  const data = await transport.read(name)
  return data === null ? null : (JSON.parse(data) as LogSegment)
}

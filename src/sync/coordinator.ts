import { compareHlc, receive, type Hlc } from '@/core/sync/hlc'
import type { DeviceInfo } from '@/core/sync/run'
import { keyOf, newerRegisters, type Register, type SyncOp } from '@/core/sync/merge'
import { bookTables, deleteBookRows } from '@/storage/library'
import { SHELF_COLORS, type RsvpDatabase, type ShelfColor } from '@/storage/schema'
import { localSyncState, syncTables } from '@/storage/sync-log'
import { compact, needsSnapshot, readSnapshot } from './compaction'
import {
  DEVICE_NAME,
  deviceFile,
  LOG_NAME,
  logFile,
  META,
  newestSnapshot,
  segmentOf,
  type DeviceFile,
  type LogSegment,
} from './files'
import { ensureSyncIds } from './identity'
import type { Transport } from './transport'

// One sync run (docs/architecture/sync.md, section 8): pull what other
// devices published, merge it in, then publish this device's own changes.
// Every step can be retried from the top after a crash or a lost connection.
// A device that fell behind what the logs still hold starts from the newest
// snapshot; after pushing, `compact` keeps the store from growing forever.
// Not built yet: book files.

/** The version of the files below. A device that finds a newer one stops,
 * rather than write files a newer version can't read. 2 added snapshots and
 * purging: a version 1 device would miss whatever was purged. */
export const SYNC_FORMAT_VERSION = 2

export { OPS_PER_SEGMENT } from './files'

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
  /** Every other device that has synced, as it last described itself,
   * except those the user removed since. */
  devices: DeviceInfo[]
  /** This run started from a snapshot, having fallen behind the logs. */
  fromSnapshot: boolean
  /** This run wrote a snapshot. */
  snapshotWritten: boolean
  /** This device's own old log files deleted this run. */
  purged: number
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

  // Fallen behind what the logs hold: start from the newest snapshot, then
  // read on from where it ends.
  const latest = needsSnapshot(names, state.device, state.cursors) ? newestSnapshot(names) : null
  const snapshot = latest ? await readSnapshot(transport, latest.name) : null
  const start = { ...state.cursors }
  for (const [device, seq] of Object.entries(snapshot?.covers ?? {})) {
    if (device !== state.device) start[device] = Math.max(start[device] ?? 0, seq)
  }
  const fromSnapshot: SyncOp[] = (snapshot?.registers ?? []).map(({ hlc, change }) => ({
    device: hlc.device,
    seq: 0,
    hlc,
    change,
  }))

  const { ops, cursors } = await pull(transport, names, state.device, start)
  const merged = await merge(db, [...fromSnapshot, ...ops], cursors, now())
  const { pushed, written } = await push(db, transport, names, now(), name)
  const peers = await otherDevices(transport, names, state.device)
  const removed = await removedDevices(db)
  const compacted = await compact(
    db,
    transport,
    [...new Set([...names, ...written])],
    peers,
    removed,
    now(),
  )
  const devices = peers
    .filter((p) => !((removed.get(p.device) ?? -1) >= p.lastSeen))
    .map(({ device, name, lastSeen }) => ({ device, name, lastSeen }))
  return {
    ...merged,
    pushed,
    devices,
    fromSnapshot: snapshot !== null,
    snapshotWritten: compacted.snapshot,
    purged: compacted.purged,
  }
}

async function otherDevices(
  transport: Transport,
  names: string[],
  self: string,
): Promise<DeviceFile[]> {
  const devices: DeviceFile[] = []
  for (const name of names) {
    const device = DEVICE_NAME.exec(name)?.[1]
    if (!device || device === self) continue
    const data = await transport.read(name)
    if (data !== null) {
      const file = JSON.parse(data) as Partial<DeviceFile>
      devices.push({
        device,
        name: file.name,
        lastSeen: file.lastSeen ?? 0,
        cursors: file.cursors ?? {},
      })
    }
  }
  return devices
}

/** When the user removed each device they removed. */
async function removedDevices(db: RsvpDatabase): Promise<Map<string, number>> {
  const removed = new Map<string, number>()
  for (const { change, hlc } of await db.syncRegisters
    .where('key')
    .startsWith('device:')
    .toArray()) {
    if (change.kind === 'device' && change.value) removed.set(change.device, hlc.wall)
  }
  return removed
}

async function checkFormat(transport: Transport): Promise<void> {
  const meta = await transport.read(META)
  const formatVersion =
    meta === null ? 0 : (JSON.parse(meta) as { formatVersion: number }).formatVersion
  if (formatVersion > SYNC_FORMAT_VERSION) throw new SyncFormatError(formatVersion)
  // New, or written by an older version: raise it, so older versions stop
  // before they miss anything this one purges.
  if (formatVersion < SYNC_FORMAT_VERSION) {
    await transport.write(META, JSON.stringify({ formatVersion: SYNC_FORMAT_VERSION }))
  }
}

/** Every op other devices published after `start`, their sequence numbers
 * this device has already read up to. */
async function pull(
  transport: Transport,
  names: string[],
  self: string,
  start: Record<string, number>,
) {
  const ops: SyncOp[] = []
  const cursors = { ...start }
  for (const name of names) {
    const match = LOG_NAME.exec(name)
    const [, device, segment] = match ?? []
    if (!device || device === self) continue
    const cursor = start[device] ?? 0
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
): Promise<Pick<SyncResult, 'applied' | 'skewed' | 'settingsChanged' | 'libraryChanged'>> {
  const tables = [...syncTables(db), ...bookTables(db), db.settings]
  return db.transaction('rw', tables, async () => {
    const state = await localSyncState(db)
    const keys = [...new Set(ops.map((op) => keyOf(op.change)))]
    const current = new Map<string, Register>()
    for (const register of await db.syncRegisters.bulkGet(keys)) {
      if (register) current.set(register.key, register)
    }

    const winners = newerRegisters(current, ops)
    const marks = new Map<number, Map<number, number>>()
    let settingsChanged = false
    let libraryChanged = false
    for (const register of winners) {
      // Stored without `pending`: a local change this replaces lost, and
      // there's no point sending it.
      await db.syncRegisters.put(register)
      const changed = await applyToLibrary(db, register, marks)
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

/** Apply what is already known about a book that has only now arrived here
 * (downloaded from Drive): the shelves it is on, and its bookmarks. */
export async function applyBookRegisters(db: RsvpDatabase, syncId: string): Promise<void> {
  const tables = [...syncTables(db), ...bookTables(db), db.settings]
  await db.transaction('rw', tables, async () => {
    const marks = new Map<number, Map<number, number>>()
    for (const register of await db.syncRegisters.toArray()) {
      const { change } = register
      const about =
        (change.kind === 'shelf' && change.value?.books.includes(syncId)) ||
        (change.kind === 'bookmark' && change.book === syncId)
      if (about) await applyToLibrary(db, register, marks)
    }
  })
}

/** Make another device's change real here. Progress is left for the user to
 * accept (`progressOffers`): the reader never jumps on its own. Returns what
 * changed, if anything did. `marks` holds each book's bookmarks (word index
 * to row id) once read, since a new device can apply thousands in one go. */
async function applyToLibrary(
  db: RsvpDatabase,
  { change }: Register,
  marks: Map<number, Map<number, number>>,
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
      let here = marks.get(bookId)
      if (!here) {
        const rows = await db.bookmarks.where('bookId').equals(bookId).toArray()
        here = new Map(rows.map((m) => [m.wordIndex, m.id as number]))
        marks.set(bookId, here)
      }
      const id = here.get(change.wordIndex)
      if (change.value === null) {
        if (id === undefined) return null
        await db.bookmarks.delete(id)
        here.delete(change.wordIndex)
        return 'library'
      }
      if (id !== undefined) return null
      const added = await db.bookmarks.add({ bookId, wordIndex: change.wordIndex, ...change.value })
      here.set(change.wordIndex, added)
      return 'library'
    }
    case 'progress':
    case 'device':
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
): Promise<{ pushed: number; written: string[] }> {
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
  const written: string[] = []
  for (const [segment, ops] of segments) {
    const data: LogSegment = { device: state.device, ops }
    await transport.write(logFile(state.device, segment), JSON.stringify(data))
    written.push(logFile(state.device, segment))
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
  return { pushed: pending.length, written }
}

async function readSegment(transport: Transport, name: string): Promise<LogSegment | null> {
  const data = await transport.read(name)
  return data === null ? null : (JSON.parse(data) as LogSegment)
}

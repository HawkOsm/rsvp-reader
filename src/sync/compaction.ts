import { compareHlc, type Hlc } from '@/core/sync/hlc'
import type { Register } from '@/core/sync/merge'
import type { RsvpDatabase } from '@/storage/schema'
import { localSyncState } from '@/storage/sync-log'
import {
  LOG_NAME,
  lastSeqOf,
  logFile,
  newestSnapshot,
  parseSnapshotName,
  segmentOf,
  snapshotFile,
  type DeviceFile,
  type LogSegment,
  type Snapshot,
} from './files'
import type { Transport } from './transport'

// Keeping the shared store from growing forever (docs/architecture/sync.md,
// section 10). Now and then a device writes a snapshot of everything it
// knows; then each device deletes its own old log files once a snapshot
// covers them and every active device has read them, or they are past the
// retention window. A device that has fallen behind what the logs still
// hold starts from the newest snapshot instead.

const DAY = 24 * 60 * 60 * 1000
/** Changes published since the newest snapshot before a device writes
 * another. */
export const SNAPSHOT_EVERY = 1000
/** A device not seen for this long doesn't hold back purging (decision 8). */
export const DORMANT_MS = 30 * DAY
/** How long a change is kept for a device that hasn't read it, and how long
 * a deletion is remembered. */
export const RETENTION_MS = 90 * DAY

/** Whether this device needs a snapshot: some device's log no longer starts
 * where this one stopped reading it, because older files were purged. */
export function needsSnapshot(
  names: readonly string[],
  self: string,
  cursors: Readonly<Record<string, number>>,
): boolean {
  const first = new Map<string, number>()
  for (const name of names) {
    const [, device, segment] = LOG_NAME.exec(name) ?? []
    if (!device || device === self) continue
    first.set(device, Math.min(first.get(device) ?? Infinity, Number(segment)))
  }
  for (const [device, segment] of first) {
    if (segmentOf((cursors[device] ?? 0) + 1) < segment) return true
  }
  return false
}

export async function readSnapshot(transport: Transport, name: string): Promise<Snapshot | null> {
  const data = await transport.read(name)
  return data === null ? null : (JSON.parse(data) as Snapshot)
}

/** Whether a device counts when deciding what may be purged: seen within
 * the dormancy window, and not removed by the user since. */
export function isActive(peer: DeviceFile, removedAt: number | undefined, now: number): boolean {
  if (removedAt !== undefined && removedAt >= peer.lastSeen) return false
  return now - peer.lastSeen <= DORMANT_MS
}

/** A deletion old enough to forget. Anything that still has it was dormant
 * past the retention window, and may bring the item back. */
const expired = ({ change, hlc }: Register, now: number) =>
  change.kind !== 'setting' && change.value === null && now - hlc.wall > RETENTION_MS

export interface CompactResult {
  snapshot: boolean
  purged: number
}

/** Write a snapshot if enough has happened since the last, then delete this
 * device's own files that nothing needs any more. Call it after a push, with
 * every file name the run knows of, including the ones it wrote. */
export async function compact(
  db: RsvpDatabase,
  transport: Transport,
  names: readonly string[],
  peers: readonly DeviceFile[],
  removed: ReadonlyMap<string, number>,
  now: number,
): Promise<CompactResult> {
  const state = await localSyncState(db)
  const self = state.device
  const covers = { ...state.cursors, [self]: state.nextSeq - 1 }
  const total = Object.values(covers).reduce((sum, seq) => sum + seq, 0)

  let latest = newestSnapshot(names)
  let written: Snapshot | null = null
  if (total - (latest?.total ?? 0) >= SNAPSHOT_EVERY) {
    // Pending changes aren't in `covers` yet; they go out in a later push.
    const registers = (await db.syncRegisters.toArray())
      .filter((r) => !r.pending && !expired(r, now))
      .map(({ key, hlc, change }) => ({ key, hlc, change }))
    const top = registers.reduce<Hlc | null>(
      (max, r) => (max && compareHlc(max, r.hlc) >= 0 ? max : r.hlc),
      null,
    )
    if (top) {
      // Named with this device's id, so it can delete it later.
      const name = snapshotFile({ ...top, device: self }, total)
      written = { covers, registers }
      await transport.write(name, JSON.stringify(written))
      latest = parseSnapshotName(name)
    }
  }

  // This device's own older snapshots, now that a newer one exists.
  for (const name of names) {
    const snapshot = parseSnapshotName(name)
    if (snapshot?.device === self && snapshot.name !== latest?.name) await transport.delete(name)
  }

  // This device's own log files. The last one stays: the next push carries
  // on its numbering.
  const own = names
    .map((name) => LOG_NAME.exec(name))
    .filter((match) => match?.[1] === self)
    .map((match) => Number(match![2]))
    .sort((a, b) => a - b)
    .slice(0, -1)
  let purged = 0
  if (own.length === 0 || !latest) return { snapshot: written !== null, purged }

  const snapshot = written ?? (await readSnapshot(transport, latest.name))
  const covered = snapshot?.covers[self] ?? 0
  const active = peers.filter((p) => isActive(p, removed.get(p.device), now))
  for (const segment of own) {
    const top = lastSeqOf(segment)
    if (covered < top) break
    const read = active.every((p) => (p.cursors[self] ?? 0) >= top)
    if (!read) {
      const data = await transport.read(logFile(self, segment))
      const ops = data === null ? [] : (JSON.parse(data) as LogSegment).ops
      if (now - (ops.at(-1)?.hlc.wall ?? 0) <= RETENTION_MS) break
    }
    await transport.delete(logFile(self, segment))
    purged++
  }
  return { snapshot: written !== null, purged }
}

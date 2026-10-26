import type { Hlc } from '@/core/sync/hlc'
import type { Register, SyncOp } from '@/core/sync/merge'

// The files in the shared store, and their names (docs/architecture/sync.md,
// section 6). Every file has one writer: the device named in it.

export const META = 'meta.json'

/** Changes per log file, so each stays small. */
export const OPS_PER_SEGMENT = 500

export const deviceFile = (device: string) => `device-${device}.json`
export const DEVICE_NAME = /^device-(.+)\.json$/

export const logFile = (device: string, segment: number) =>
  `log-${device}-${String(segment).padStart(6, '0')}.json`
export const LOG_NAME = /^log-(.+)-(\d{6})\.json$/

/** The log segment that holds sequence number `seq`. */
export const segmentOf = (seq: number) => Math.floor((seq - 1) / OPS_PER_SEGMENT)

/** The highest sequence number segment `segment` can hold. */
export const lastSeqOf = (segment: number) => (segment + 1) * OPS_PER_SEGMENT

export interface LogSegment {
  device: string
  ops: SyncOp[]
}

/** What a device says about itself: `DeviceInfo` and its ack cursors. */
export interface DeviceFile {
  device: string
  name?: string
  lastSeen: number
  /** Per other device, the highest sequence number this one has applied. */
  cursors: Record<string, number>
}

/** The whole merged state as of `covers` (section 10). Named by its clock
 * and the total of `covers`, so a device can tell how much has happened
 * since without reading it. */
export interface Snapshot {
  /** Per device, the highest sequence number whose change is included. */
  covers: Record<string, number>
  registers: Register[]
}

export const snapshotFile = (hlc: Hlc, total: number) =>
  `snapshot-${String(hlc.wall).padStart(15, '0')}-${String(hlc.count).padStart(6, '0')}-${hlc.device}-${total}.json`
const SNAPSHOT_NAME = /^snapshot-(\d{15})-(\d{6})-(.+)-(\d+)\.json$/

export interface SnapshotName {
  name: string
  /** The device that wrote it. */
  device: string
  /** The sum of its `covers`. */
  total: number
}

export function parseSnapshotName(name: string): SnapshotName | null {
  const match = SNAPSHOT_NAME.exec(name)
  if (!match) return null
  return { name, device: match[3]!, total: Number(match[4]) }
}

/** The newest snapshot: the highest clock. The padding makes that the last
 * name in sorted order. */
export function newestSnapshot(names: readonly string[]): SnapshotName | null {
  const snapshots = names.filter((n) => SNAPSHOT_NAME.test(n)).sort()
  const newest = snapshots.at(-1)
  return newest ? parseSnapshotName(newest) : null
}

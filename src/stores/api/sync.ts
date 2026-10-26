import { getDb } from '@/storage/schema'
import { localSyncState, recordChange, syncTables } from '@/storage/sync-log'
import { syncOnce } from '@/sync/coordinator'
import * as books from '@/sync/book-files'
import { DriveTransport, type TokenSource } from '@/sync/drive'
import type { Transport } from '@/sync/transport'

// The sync store's one door to the sync engine (docs/architecture/sync.md).

export { createSyncRunner, type SyncRunner } from '@/sync/runner'
export { DORMANT_MS } from '@/sync/compaction'
export { isExpected, outcomeOf, phaseOf, runRecord, type SyncPhase } from '@/sync/status'
export { packageFile, type RemoteBook } from '@/sync/book-files'
export type { StoreUsage } from '@/sync/transport'

export const driveTransport = (auth: TokenSource): Transport => new DriveTransport({ auth })

/** One sync run against the user's Drive. */
export const runSync = (transport: Transport, deviceName: string) =>
  syncOnce(getDb(), transport, Date.now, deviceName)

/** This device's id in the synced data. */
export const thisDeviceId = async () => (await localSyncState(getDb())).device

/** Take a device off the list everywhere, and stop it holding back purging,
 * until it syncs again. */
export async function removeSyncDevice(device: string): Promise<void> {
  const db = getDb()
  await db.transaction('rw', syncTables(db), () =>
    recordChange(db, { kind: 'device', device, value: { removed: true } }),
  )
}

// Book files on Drive (phase 4).
export const booksToUpload = (names: ReadonlySet<string>) => books.booksToUpload(getDb(), names)
export const uploadBook = (transport: Transport, book: Parameters<typeof books.uploadBook>[2]) =>
  books.uploadBook(getDb(), transport, book)
export const remoteBooks = (names: ReadonlySet<string>) => books.remoteBooks(getDb(), names)
export const downloadBook = (transport: Transport, syncId: string) =>
  books.downloadBook(getDb(), transport, syncId)
export const deleteRemovedBooks = (transport: Transport, names: ReadonlySet<string>) =>
  books.deleteRemovedBooks(getDb(), transport, names)

import { getDb } from '@/storage/schema'
import { localSyncState } from '@/storage/sync-log'
import { syncOnce } from '@/sync/coordinator'
import { DriveTransport, type TokenSource } from '@/sync/drive'
import type { Transport } from '@/sync/transport'

// The sync store's one door to the sync engine (docs/architecture/sync.md).

export { createSyncRunner, type SyncRunner } from '@/sync/runner'
export { isExpected, phaseOf, runRecord, type SyncPhase } from '@/sync/status'

export const driveTransport = (auth: TokenSource): Transport => new DriveTransport({ auth })

/** One sync run against the user's Drive. */
export const runSync = (transport: Transport, deviceName: string) =>
  syncOnce(getDb(), transport, Date.now, deviceName)

/** This device's id in the synced data. */
export const thisDeviceId = async () => (await localSyncState(getDb())).device

import { getDb } from '@/storage/schema'
import { localSyncState } from '@/storage/sync-log'

// What the sync log asks of storage: this device's id in the synced data.

export const thisDeviceId = async () => (await localSyncState(getDb())).device

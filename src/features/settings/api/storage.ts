import { isPersisted, storageUsage } from '@/storage/quota'
import { getDb } from '@/storage/schema'

// What the settings screen asks of storage: how much the library takes.

export interface StorageSummary {
  /** Bytes the browser says the app uses, when it says. */
  usageBytes: number | null
  /** The share of the browser's allowance that is, 0–1, when it says. */
  fraction: number | null
  books: number
  /** The browser has agreed not to clear the library. */
  persisted: boolean
}

export async function storageSummary(): Promise<StorageSummary> {
  const [usage, books, persisted] = await Promise.all([
    storageUsage(),
    getDb().books.count(),
    isPersisted(),
  ])
  return {
    usageBytes: usage?.usageBytes ?? null,
    fraction: usage && usage.quotaBytes > 0 ? usage.usageBytes / usage.quotaBytes : null,
    books,
    persisted,
  }
}

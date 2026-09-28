/** Ask the browser not to evict this origin's storage under pressure. Call
 * once, on first book import. Returns whether it was granted — the caller
 * decides how (or whether) to warn the user when it's refused. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export interface StorageUsage {
  usageBytes: number
  quotaBytes: number
}

export async function storageUsage(): Promise<StorageUsage | null> {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  if (usage === undefined || quota === undefined) return null
  return { usageBytes: usage, quotaBytes: quota }
}

import type { RsvpDatabase } from './schema'

export async function getSetting<T>(db: RsvpDatabase, key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(db: RsvpDatabase, key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

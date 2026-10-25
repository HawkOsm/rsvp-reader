import type { RsvpDatabase } from './schema'
import { recordChange, SYNCED_SETTINGS, syncTables } from './sync-log'

export async function getSetting<T>(db: RsvpDatabase, key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(db: RsvpDatabase, key: string, value: unknown): Promise<void> {
  await db.transaction('rw', [db.settings, ...syncTables(db)], async () => {
    await db.settings.put({ key, value })
    if (SYNCED_SETTINGS.has(key)) await recordChange(db, { kind: 'setting', key, value })
  })
}

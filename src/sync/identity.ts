import { shelfChange } from '@/storage/shelves'
import type { RsvpDatabase } from '@/storage/schema'
import { giveSyncId } from '@/storage/sync-id'
import { localSyncState, seedChange, SYNCED_SETTINGS, syncTables } from '@/storage/sync-log'

/** Give every book that lacks one its sync id, and queue for sending what
 * was saved before sync existed: those books, their progress, shelves,
 * bookmarks, and the synced settings. Each keeps the time it was really saved, so it can't overwrite a
 * newer version from another device. Settings have no such time, so another
 * device's settings win over this one's on first sync. */
export async function ensureSyncIds(db: RsvpDatabase): Promise<void> {
  for (const book of await db.books.filter((b) => !b.syncId).toArray()) {
    await giveSyncId(db, book)
  }

  // Shelves and bookmarks made before they were recorded. Checked every run,
  // since a bookmark's book may only now have been given its id.
  await db.transaction('rw', [db.shelves, db.books, db.bookmarks, ...syncTables(db)], async () => {
    for (const shelf of await db.shelves.toArray()) {
      if (await db.syncRegisters.get(`shelf:${shelf.syncId}`)) continue
      await seedChange(db, await shelfChange(db, shelf), shelf.createdAt)
    }
    for (const { bookId, wordIndex, excerpt, createdAt } of await db.bookmarks.toArray()) {
      const book = await db.books.get(bookId)
      if (!book?.syncId) continue
      const value = { excerpt, createdAt }
      await seedChange(db, { kind: 'bookmark', book: book.syncId, wordIndex, value }, createdAt)
    }
  })

  await db.transaction('rw', [db.settings, ...syncTables(db)], async () => {
    const state = await localSyncState(db)
    if (state.seeded) return
    for (const { key, value } of await db.settings.toArray()) {
      if (SYNCED_SETTINGS.has(key)) await seedChange(db, { kind: 'setting', key, value }, 0)
    }
    await db.syncState.put({ ...state, seeded: true })
  })
}

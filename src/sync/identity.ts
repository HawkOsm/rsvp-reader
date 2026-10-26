import { getTokens } from '@/storage/library'
import { loadFile } from '@/storage/files'
import type { RsvpDatabase } from '@/storage/schema'
import { syncIdOf } from '@/storage/sync-id'
import { localSyncState, seedChange, SYNCED_SETTINGS, syncTables } from '@/storage/sync-log'

/** Give every book that lacks one its sync id, and queue for sending what
 * was saved before sync existed: those books, their progress, and the synced
 * settings. Each keeps the time it was really saved, so it can't overwrite a
 * newer version from another device. Settings have no such time, so another
 * device's settings win over this one's on first sync. */
export async function ensureSyncIds(db: RsvpDatabase): Promise<void> {
  for (const book of await db.books.filter((b) => !b.syncId).toArray()) {
    const bookId = book.id as number
    const syncId = await syncIdOf(book.layout, {
      file: (await loadFile(db, bookId))?.blob,
      tokens: await getTokens(db, bookId),
    })
    // A restored or half-imported book has nothing to hash yet; it gets its
    // id when it is next imported.
    if (!syncId) continue
    await db.transaction('rw', [db.books, db.progress, ...syncTables(db)], async () => {
      await db.books.update(bookId, { syncId })
      const value = { title: book.title, formatId: book.formatId, totalWords: book.totalWords }
      await seedChange(db, { kind: 'book', book: syncId, value }, book.addedAt)
      const progress = await db.progress.get(bookId)
      if (progress) {
        const { wordIndex, wpm, mode } = progress
        const change = { kind: 'progress', book: syncId, value: { wordIndex, wpm, mode } } as const
        await seedChange(db, change, progress.updatedAt)
      }
    })
  }

  await db.transaction('rw', [db.settings, ...syncTables(db)], async () => {
    const state = await localSyncState(db)
    if (state.seeded) return
    for (const { key, value } of await db.settings.toArray()) {
      if (SYNCED_SETTINGS.has(key)) await seedChange(db, { kind: 'setting', key, value }, 0)
    }
    await db.syncState.put({ ...state, seeded: true })
  })
}

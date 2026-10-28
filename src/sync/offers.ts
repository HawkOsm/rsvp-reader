import type { SyncedProgress } from '@/core/sync/merge'
import { keepProgress, type SaveProgressInput } from '@/storage/library'
import type { RsvpDatabase } from '@/storage/schema'
import { localSyncState } from '@/storage/sync-log'

/** Another device got further in (or back through) a book than this one
 * shows. The app asks before moving there (docs/architecture/sync.md,
 * decision 7). Declining is saving this device's own position again, which
 * makes it the newer one. */
export interface ProgressOffer {
  bookId: number
  title: string
  /** The device the position came from. */
  device: string
  progress: SyncedProgress
}

/** Every book whose newest position came from another device and isn't the
 * one shown here. */
export async function progressOffers(db: RsvpDatabase): Promise<ProgressOffer[]> {
  const { device } = await localSyncState(db)
  const offers: ProgressOffer[] = []
  for (const register of await db.syncRegisters.where('key').startsWith('progress:').toArray()) {
    const { change, hlc } = register
    if (change.kind !== 'progress' || hlc.device === device) continue
    const book = await db.books.where('syncId').equals(change.book).first()
    if (!book) continue
    const local = await db.progress.get(book.id as number)
    if (local?.wordIndex === change.value.wordIndex) continue
    offers.push({
      bookId: book.id as number,
      title: book.title,
      device: hlc.device,
      progress: change.value,
    })
  }
  return offers
}

/** Move to another device's position. Not recorded as a change: it is the
 * newest version already. */
export async function acceptProgressOffer(db: RsvpDatabase, offer: ProgressOffer): Promise<void> {
  await db.progress.put({ bookId: offer.bookId, ...offer.progress, updatedAt: Date.now() })
}

/** Stay where this device is: its place becomes the newest, here and on
 * every device that syncs next. */
export const declineProgressOffer = (
  db: RsvpDatabase,
  offer: ProgressOffer,
  here: SaveProgressInput,
) => keepProgress(db, offer.bookId, here)

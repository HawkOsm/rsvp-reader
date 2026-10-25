import type { RsvpDatabase } from './schema'

export async function saveCover(db: RsvpDatabase, bookId: number, blob: Blob): Promise<void> {
  await db.covers.put({ bookId, blob })
}

export async function loadCover(db: RsvpDatabase, bookId: number): Promise<Blob | undefined> {
  return (await db.covers.get(bookId))?.blob
}

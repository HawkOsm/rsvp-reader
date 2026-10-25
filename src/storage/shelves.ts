import type { RsvpDatabase, ShelfColor, ShelfRecord } from './schema'

/** Every shelf, oldest first: the order the reader made them in. */
export async function listShelves(db: RsvpDatabase): Promise<ShelfRecord[]> {
  return db.shelves.toArray()
}

export async function createShelf(
  db: RsvpDatabase,
  name: string,
  color: ShelfColor,
): Promise<ShelfRecord> {
  const shelf: ShelfRecord = { name, color, bookIds: [], createdAt: Date.now() }
  const id = await db.shelves.add(shelf)
  return { ...shelf, id }
}

/** Put a book on a shelf, or take it off. */
export async function setOnShelf(
  db: RsvpDatabase,
  shelfId: number,
  bookId: number,
  on: boolean,
): Promise<void> {
  await db.shelves
    .where('id')
    .equals(shelfId)
    .modify((shelf) => {
      const rest = shelf.bookIds.filter((id) => id !== bookId)
      shelf.bookIds = on ? [...rest, bookId] : rest
    })
}

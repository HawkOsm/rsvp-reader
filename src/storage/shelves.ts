import type { Change } from '@/core/sync/merge'
import type { RsvpDatabase, ShelfColor, ShelfRecord } from './schema'
import { recordChange, syncTables } from './sync-log'

/** Every shelf, oldest first: the order the reader made them in. */
export async function listShelves(db: RsvpDatabase): Promise<ShelfRecord[]> {
  return db.shelves.toArray()
}

export async function createShelf(
  db: RsvpDatabase,
  name: string,
  color: ShelfColor,
): Promise<ShelfRecord> {
  const shelf: ShelfRecord = {
    syncId: crypto.randomUUID(),
    name,
    color,
    bookIds: [],
    createdAt: Date.now(),
  }
  return db.transaction('rw', [db.shelves, db.books, ...syncTables(db)], async () => {
    const id = await db.shelves.add(shelf)
    await recordChange(db, await shelfChange(db, shelf))
    return { ...shelf, id }
  })
}

/** Put a book on a shelf, or take it off. */
export async function setOnShelf(
  db: RsvpDatabase,
  shelfId: number,
  bookId: number,
  on: boolean,
): Promise<void> {
  await db.transaction('rw', [db.shelves, db.books, ...syncTables(db)], async () => {
    const shelf = await db.shelves.get(shelfId)
    if (!shelf) return
    const rest = shelf.bookIds.filter((id) => id !== bookId)
    shelf.bookIds = on ? [...rest, bookId] : rest
    await db.shelves.put(shelf)
    await recordChange(db, await shelfChange(db, shelf))
  })
}

/** The shelf as other devices are sent it, its books named by sync id. A
 * book this device doesn't have, put on the shelf on another device, stays
 * on it. A book with no sync id yet can't be named, and isn't sent. Call it
 * inside a transaction over the shelves, books and `syncTables`. */
export async function shelfChange(db: RsvpDatabase, shelf: ShelfRecord): Promise<Change> {
  const sent = await db.syncRegisters.get(`shelf:${shelf.syncId}`)
  const before = sent?.change.kind === 'shelf' ? (sent.change.value?.books ?? []) : []
  const here = new Set(
    (await db.books.where('syncId').anyOf(before).toArray()).map((book) => book.syncId),
  )
  const members = (await db.books.bulkGet(shelf.bookIds))
    .map((book) => book?.syncId)
    .filter((id): id is string => id !== undefined)
  const elsewhere = before.filter((id) => !here.has(id) && !members.includes(id))
  const { name, color, createdAt } = shelf
  return {
    kind: 'shelf',
    shelf: shelf.syncId,
    value: { name, color, books: [...members, ...elsewhere], createdAt },
  }
}

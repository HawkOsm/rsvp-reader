import { compareHlc, type Hlc } from './hlc'

// What sync carries, and how two versions of it are reconciled
// (docs/architecture/sync.md, sections 5 and 7). Every synced thing is a
// register: one value under one key, and the version with the newest clock
// wins. A deleted book, shelf or bookmark is a register whose value is `null`
// (a tombstone), so a delete beats older edits and loses to a newer re-add.
// A shelf is one register, so the newest version of it wins whole: name,
// colour and books. Bookmarks are a set: one register per book and word.

/** A book's cross-device identity: a hash of its content (`storage/sync-id.ts`). */
export type SyncId = string

export interface SyncedProgress {
  wordIndex: number
  wpm: number
  mode: 'rsvp' | 'book'
}

/** What other devices learn about a book. Its words and file stay local. */
export interface SyncedBook {
  title: string
  formatId: string
  totalWords: number
}

/** A shelf as other devices see it. Its books are listed by sync id, since
 * each device numbers its books its own way. */
export interface SyncedShelf {
  name: string
  color: string
  books: SyncId[]
  createdAt: number
}

/** A bookmark: its book and word are its key, so this is what it carries. */
export interface SyncedBookmark {
  excerpt: string
  createdAt: number
}

export type Change =
  | { kind: 'progress'; book: SyncId; value: SyncedProgress }
  | { kind: 'setting'; key: string; value: unknown }
  | { kind: 'book'; book: SyncId; value: SyncedBook | null }
  /** `shelf` is the shelf's own random id. */
  | { kind: 'shelf'; shelf: string; value: SyncedShelf | null }
  | { kind: 'bookmark'; book: SyncId; wordIndex: number; value: SyncedBookmark | null }

/** One change as a device published it. `seq` counts up from 1 per device. */
export interface SyncOp {
  device: string
  seq: number
  hlc: Hlc
  change: Change
}

/** The newest known version of one key. */
export interface Register {
  key: string
  hlc: Hlc
  change: Change
}

export function keyOf(change: Change): string {
  switch (change.kind) {
    case 'progress':
      return `progress:${change.book}`
    case 'setting':
      return `setting:${change.key}`
    case 'book':
      return `book:${change.book}`
    case 'shelf':
      return `shelf:${change.shelf}`
    case 'bookmark':
      return `bookmark:${change.book}:${change.wordIndex}`
  }
}

/** The registers that `ops` replace: per key, the newest op, if it is newer
 * than what `current` holds. The result is the same whatever order the ops
 * come in, and applying an op twice changes nothing. */
export function newerRegisters(
  current: ReadonlyMap<string, Register>,
  ops: readonly SyncOp[],
): Register[] {
  const best = new Map<string, Register>()
  for (const op of ops) {
    const key = keyOf(op.change)
    const known = best.get(key) ?? current.get(key)
    if (known && compareHlc(op.hlc, known.hlc) <= 0) continue
    best.set(key, { key, hlc: op.hlc, change: op.change })
  }
  return [...best.values()]
}

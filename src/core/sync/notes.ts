import { compareHlc, type Hlc } from './hlc'
import type { SyncId } from './merge'

// Notes (docs/architecture/sync.md, sections 7 and 9). Unlike a reading
// position, a note is something the reader wrote, so no version of it may be
// lost to "newest wins". Every edit is kept as its own record and names the
// version it was made from (`base`). The note is then whatever no later edit
// was made from: one such "head" is the note; two are two devices' edits
// made from the same version, a conflict, and both are kept until the reader
// chooses. Folding the same set of edits gives the same note on every device,
// whatever order they arrived in.

/** Where a note is in its book. */
export interface NoteAnchor {
  /** The word the note was made on. */
  wordIndex: number
  /** The words from there, so a list can say where it is, and an export can
   * quote the passage, without loading the book. */
  quote: string
  /** The PDF page the word is on, from 0; absent for a book without pages. */
  page?: number
}

/** One edit of a note, as synced. */
export interface NoteEdit {
  book: SyncId
  /** The edit this one was made from; `null` for the first. */
  base: string | null
  /** Other versions this edit replaces too: those it settled, when the
   * reader resolved a conflict, or deleted along with the note. */
  resolves?: string[]
  /** The note's text; `null` deletes the note. */
  body: string | null
  anchor: NoteAnchor
  /** When it was made, by the clock of the device that made it, to show. */
  at: number
}

/** An edit with what identifies it: its id, and the clock it was made at. */
export interface NoteEditRecord {
  edit: string
  hlc: Hlc
  value: NoteEdit
}

/** One version of a note's text, to show. */
export interface NoteVersion {
  edit: string
  body: string
  at: number
  /** The device that made it. */
  device: string
}

/** A note as the reader sees it. */
export interface FoldedNote {
  book: SyncId
  anchor: NoteAnchor
  /** The version shown: the newest, if there is more than one. */
  shown: NoteVersion
  /** Versions made alongside it, from the same one, newest first: a
   * conflict for the reader to settle. Empty almost always. */
  conflicts: NoteVersion[]
  /** A delete came in for a version that another device then edited: the
   * edit won and the note is still here, which the reader should be told. */
  deleteLost: boolean
  /** When the note was first made. */
  createdAt: number
}

/** What a note's edits come to: the note, or `null` if it was deleted (or
 * there are no edits). */
export function foldNote(edits: readonly NoteEditRecord[]): FoldedNote | null {
  if (edits.length === 0) return null
  const replaced = new Set<string>()
  for (const { value } of edits) {
    if (value.base !== null) replaced.add(value.base)
    for (const id of value.resolves ?? []) replaced.add(id)
  }
  const heads = edits.filter((e) => !replaced.has(e.edit)).sort((a, b) => compareHlc(b.hlc, a.hlc))
  const living = heads.filter((e) => e.value.body !== null)
  if (living.length === 0) return null

  const version = ({ edit, hlc, value }: NoteEditRecord): NoteVersion => ({
    edit,
    body: value.body as string,
    at: value.at,
    device: hlc.device,
  })
  const [newest, ...others] = living
  const first = edits.reduce((a, b) => (compareHlc(a.hlc, b.hlc) <= 0 ? a : b))
  return {
    book: newest!.value.book,
    anchor: newest!.value.anchor,
    shown: version(newest!),
    conflicts: others.map(version),
    deleteLost: heads.length > living.length,
    createdAt: first.value.at,
  }
}

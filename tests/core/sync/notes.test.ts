import { describe, expect, it } from 'vitest'
import type { Hlc } from '@/core/sync/hlc'
import { foldNote, type NoteEdit, type NoteEditRecord } from '@/core/sync/notes'

const anchor = { wordIndex: 12, quote: 'It was a dark and stormy night' }

/** An edit made on `device` at clock `wall`. */
function edit(
  id: string,
  device: string,
  wall: number,
  base: string | null,
  body: string | null,
  resolves?: string[],
): NoteEditRecord {
  const hlc: Hlc = { wall, count: 0, device }
  const value: NoteEdit = { book: 'b', base, body, anchor, at: wall, ...(resolves && { resolves }) }
  return { edit: id, hlc, value }
}

/** Every order of `items`. */
function orders<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

describe('foldNote', () => {
  it('is the newest edit of a note edited in turn', () => {
    const note = foldNote([
      edit('e1', 'A', 1, null, 'first'),
      edit('e2', 'B', 2, 'e1', 'second'),
      edit('e3', 'A', 3, 'e2', 'third'),
    ])
    expect(note).toMatchObject({ shown: { edit: 'e3', body: 'third' }, conflicts: [] })
    expect(note!.createdAt).toBe(1)
  })

  it('keeps both versions when two devices edit the same version', () => {
    const note = foldNote([
      edit('e1', 'A', 1, null, 'draft'),
      edit('a', 'A', 5, 'e1', 'A’s words'),
      edit('b', 'B', 7, 'e1', 'B’s words'),
    ])
    expect(note!.shown).toMatchObject({ edit: 'b', body: 'B’s words', device: 'B' })
    expect(note!.conflicts).toEqual([{ edit: 'a', body: 'A’s words', at: 5, device: 'A' }])
  })

  it('settles a conflict with an edit that resolves the other version', () => {
    const note = foldNote([
      edit('e1', 'A', 1, null, 'draft'),
      edit('a', 'A', 5, 'e1', 'A’s words'),
      edit('b', 'B', 7, 'e1', 'B’s words'),
      edit('r', 'A', 9, 'a', 'A’s words', ['b']),
    ])
    expect(note).toMatchObject({ shown: { edit: 'r', body: 'A’s words' }, conflicts: [] })
  })

  it('is gone once deleted, and a delete loses to an edit made alongside it', () => {
    const made = edit('e1', 'A', 1, null, 'draft')
    expect(foldNote([made, edit('d', 'A', 2, 'e1', null)])).toBeNull()

    const note = foldNote([made, edit('d', 'A', 2, 'e1', null), edit('x', 'B', 3, 'e1', 'kept')])
    expect(note).toMatchObject({ shown: { body: 'kept' }, deleteLost: true, conflicts: [] })
    // Deleting it again, from the version that won, deletes it.
    expect(
      foldNote([
        made,
        edit('d', 'A', 2, 'e1', null),
        edit('x', 'B', 3, 'e1', 'kept'),
        edit('d2', 'A', 4, 'x', null, ['d']),
      ]),
    ).toBeNull()
  })

  it('comes out the same whatever order the edits arrive in', () => {
    const edits = [
      edit('e1', 'A', 1, null, 'draft'),
      edit('a', 'A', 5, 'e1', 'A'),
      edit('b', 'B', 7, 'e1', 'B'),
      edit('c', 'C', 6, 'a', 'C on A'),
      edit('d', 'B', 8, 'b', null),
    ]
    const results = orders(edits).map((order) => JSON.stringify(foldNote(order)))
    expect(new Set(results).size).toBe(1)
    // A delete made from B's version, alongside C's edit of A's: C's stands.
    expect(foldNote(edits)).toMatchObject({
      shown: { edit: 'c' },
      conflicts: [],
      deleteLost: true,
    })
  })

  it('shows an edit whose base hasn’t arrived yet', () => {
    expect(foldNote([edit('e2', 'B', 2, 'e1', 'later')])).toMatchObject({
      shown: { body: 'later' },
    })
    expect(foldNote([])).toBeNull()
  })
})

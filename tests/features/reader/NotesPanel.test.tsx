import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { NotesPanel } from '@/features/reader/components/NotesPanel'
import { EngineProvider } from '@/features/reader/engine-context'
import { addBook, saveTokens } from '@/storage/library'
import { addNote, notesOf } from '@/storage/notes'
import { getDb } from '@/storage/schema'
import { TEXT_BOOK } from '../../storage/fixtures'

const db = getDb()
const onClose = vi.fn()
const words = 'It was a dark and stormy night the rain fell in torrents'.split(' ')
let bookId: number

beforeEach(async () => {
  await Promise.all([db.books.clear(), db.notes.clear(), db.syncRegisters.clear()])
  const book = await addBook(db, {
    title: 'Paul Clifford',
    source: 'local',
    fingerprint: `f${Math.random()}`,
    syncId: 'paul',
    ...TEXT_BOOK,
  })
  bookId = book.id as number
  await saveTokens(
    db,
    bookId,
    words.map((w) => makeToken(w)),
    book.fingerprint,
  )
})

function renderPanel() {
  const engine = createEngine(words.map((w) => makeToken(w)))
  render(
    <EngineProvider value={engine}>
      <NotesPanel
        bookId={bookId}
        title="Paul Clifford"
        totalWords={words.length}
        onClose={onClose}
      />
    </EngineProvider>,
  )
  return engine
}

describe('NotesPanel', () => {
  it('adds a note on the word being read, and jumps back to it', async () => {
    const engine = renderPanel()
    act(() => engine.seek(3))
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'New note' }), 'Famously bad')
    await user.click(screen.getByRole('button', { name: 'Add note' }))

    const list = await screen.findByRole('list', { name: 'Notes in this book' })
    expect(list).toHaveTextContent('Famously bad')
    expect(list).toHaveTextContent('“dark and stormy night')
    expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('')
    expect((await notesOf(db, bookId))[0]?.anchor.wordIndex).toBe(3)

    act(() => engine.seek(9))
    await user.click(within(list).getByTitle('Go to this passage'))
    expect(engine.index).toBe(3)
  })

  it('edits a note, and deletes one only once confirmed', async () => {
    const noteId = await addNote(db, bookId, { wordIndex: 0, quote: 'It was' }, 'first')
    renderPanel()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('textbox', { name: 'Edit note' })
    await user.clear(box)
    await user.type(box, 'second')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await notesOf(db, bookId))[0]?.shown.body).toBe('second'))

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete this note?')).toBeInTheDocument()
    expect(await notesOf(db, bookId)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await notesOf(db, bookId)).toEqual([]))
    expect(await screen.findByText('No notes in this book yet.')).toBeInTheDocument()
    void noteId
  })

  it('shows both versions of a conflict, and keeps the one chosen', async () => {
    const noteId = await addNote(db, bookId, { wordIndex: 0, quote: 'It was' }, 'draft')
    const [note] = await notesOf(db, bookId)
    // Another device's edit of the same version, then one here.
    await db.syncRegisters.put({
      key: `note:${noteId}:phone`,
      hlc: { wall: 1, count: 0, device: 'phone' },
      change: {
        kind: 'note',
        note: noteId,
        edit: 'phone',
        value: {
          book: 'paul',
          base: note!.shown.edit,
          body: 'from the phone',
          anchor: note!.anchor,
          at: 1,
        },
      },
    })
    const { editNote } = await import('@/storage/notes')
    await editNote(db, noteId, 'from here')

    renderPanel()
    const conflict = await screen.findByRole('group', { name: 'Edited on two devices' })
    expect(conflict).toHaveTextContent('from here')
    expect(conflict).toHaveTextContent('from the phone')
    const phone = within(conflict).getByText('from the phone').parentElement!
    await userEvent.setup().click(within(phone).getByRole('button', { name: 'Keep this one' }))
    await waitFor(async () =>
      expect((await notesOf(db, bookId))[0]).toMatchObject({
        shown: { body: 'from the phone' },
        conflicts: [],
      }),
    )
  })

  it('copies the notes as Markdown', async () => {
    await addNote(db, bookId, { wordIndex: 0, quote: 'It was' }, 'first')
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Copy as Markdown/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# Notes on Paul Clifford'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('first'))
  })

  it('closes from its own button', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Close notes' }))
    expect(onClose).toHaveBeenCalled()
  })
})

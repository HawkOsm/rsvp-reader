import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { addBook, getProgress, saveProgress } from '../../src/storage/library'
import { getDb } from '../../src/storage/schema'
import { LibraryScreen } from '../../src/ui/screens/LibraryScreen'

async function clearDb() {
  const db = getDb()
  await Promise.all([
    db.books.clear(),
    db.tokens.clear(),
    db.progress.clear(),
    db.settings.clear(),
    db.files.clear(),
  ])
}

beforeEach(async () => {
  await clearDb()
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/reader/:bookId" element={<div data-testid="reader-screen">reader</div>} />
        <Route path="/settings" element={<div data-testid="settings-screen">settings</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LibraryScreen', () => {
  it('shows an empty state with no books', async () => {
    renderLibrary()
    expect(await screen.findByText(/No books yet/i)).toBeInTheDocument()
  })

  it('lists a book with its title and progress', async () => {
    const db = getDb()
    const book = await addBook(db, { title: 'Dr Jekyll and Mr Hyde', source: 'local', fingerprint: 'f1' })
    await getDb().books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 25, wpm: 300, mode: 'rsvp' })

    renderLibrary()

    expect(await screen.findByText('Dr Jekyll and Mr Hyde')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('book-progress')).toHaveTextContent('25%'))
  })

  it('navigates straight to the reader for a book with no progress', async () => {
    const db = getDb()
    await addBook(db, { title: 'Fresh Book', source: 'local', fingerprint: 'f2' })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await screen.findByText('Fresh Book'))

    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
  })

  it('shows a resume dialog for a book already in progress, and "Start over" resets it', async () => {
    const db = getDb()
    const book = await addBook(db, { title: 'Partly Read', source: 'local', fingerprint: 'f3' })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 40, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await screen.findByText('Partly Read'))

    expect(await screen.findByRole('dialog', { name: /resume reading/i })).toBeInTheDocument()
    expect(screen.getByText(/40% through/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
    const progress = await getProgress(db, book.id as number)
    expect(progress?.wordIndex).toBe(0)
  })

  it('cancelling the resume dialog stays on the library', async () => {
    const db = getDb()
    const book = await addBook(db, { title: 'Partly Read 2', source: 'local', fingerprint: 'f4' })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 10, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await screen.findByText('Partly Read 2'))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reader-screen')).not.toBeInTheDocument()
  })

  it('the Reset button zeroes progress without opening the book', async () => {
    const db = getDb()
    const book = await addBook(db, { title: 'To Reset', source: 'local', fingerprint: 'f5' })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 60, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await screen.findByText('To Reset')
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.queryByTestId('reader-screen')).not.toBeInTheDocument()
    await waitFor(async () => {
      const progress = await getProgress(db, book.id as number)
      expect(progress?.wordIndex).toBe(0)
    })
  })

  it('the Remove button deletes the book from the library', async () => {
    const db = getDb()
    await addBook(db, { title: 'To Remove', source: 'local', fingerprint: 'f6' })

    const user = userEvent.setup()
    renderLibrary()
    await screen.findByText('To Remove')
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('To Remove')).not.toBeInTheDocument())
  })

  it('links to the Settings screen', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
  })
})

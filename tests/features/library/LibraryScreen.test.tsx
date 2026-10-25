import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addBookmark } from '@/storage/bookmarks'
import { addBook, getProgress, saveProgress } from '@/storage/library'
import { getDb } from '@/storage/schema'
import { LibraryScreen } from '@/features/library/components/LibraryScreen'
import { useAppStore } from '@/stores/app-store'
import { TEXT_BOOK } from '../../storage/fixtures'

async function clearDb() {
  const db = getDb()
  await Promise.all([
    db.books.clear(),
    db.tokens.clear(),
    db.progress.clear(),
    db.settings.clear(),
    db.files.clear(),
    db.covers.clear(),
    db.shelves.clear(),
    db.bookmarks.clear(),
  ])
}

/** Stands in for the reader, showing the address it was opened at. */
function ReaderStub() {
  const location = useLocation()
  return <div data-testid="reader-screen">{location.pathname + location.search}</div>
}

beforeEach(async () => {
  await clearDb()
  useAppStore.setState({ libraryView: 'grid' })
  // jsdom's createObjectURL cannot read the Node Blob tests/setup.ts swaps in.
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

/** The book's tile in the grid. Its title shows more than once: on a
 * cover without an image, and under "Continue reading". */
async function findRow(title: string) {
  const rows = await screen.findAllByTestId('book-row')
  const row = rows.find((r) => within(r).queryAllByText(title).length > 0)
  if (!row) throw new Error(`no row for ${title}`)
  return row
}

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/reader/:bookId" element={<ReaderStub />} />
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
    const book = await addBook(db, {
      title: 'Dr Jekyll and Mr Hyde',
      source: 'local',
      fingerprint: 'f1',
      ...TEXT_BOOK,
    })
    await getDb().books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 25, wpm: 300, mode: 'rsvp' })

    renderLibrary()

    expect(await findRow('Dr Jekyll and Mr Hyde')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('book-progress')).toHaveTextContent('25%'))
  })

  it('navigates straight to the reader for a book with no progress', async () => {
    const db = getDb()
    await addBook(db, { title: 'Fresh Book', source: 'local', fingerprint: 'f2', ...TEXT_BOOK })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await findRow('Fresh Book'))

    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
  })

  it('shows a resume dialog for a book already in progress, and "Start over" resets it', async () => {
    const db = getDb()
    const book = await addBook(db, {
      title: 'Partly Read',
      source: 'local',
      fingerprint: 'f3',
      ...TEXT_BOOK,
    })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 40, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await findRow('Partly Read'))

    expect(await screen.findByRole('dialog', { name: /resume reading/i })).toBeInTheDocument()
    expect(screen.getByText(/40% through/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
    const progress = await getProgress(db, book.id as number)
    expect(progress?.wordIndex).toBe(0)
  })

  it('cancelling the resume dialog stays on the library', async () => {
    const db = getDb()
    const book = await addBook(db, {
      title: 'Partly Read 2',
      source: 'local',
      fingerprint: 'f4',
      ...TEXT_BOOK,
    })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 10, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await user.click(await findRow('Partly Read 2'))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reader-screen')).not.toBeInTheDocument()
  })

  it('the Reset button zeroes progress without opening the book', async () => {
    const db = getDb()
    const book = await addBook(db, {
      title: 'To Reset',
      source: 'local',
      fingerprint: 'f5',
      ...TEXT_BOOK,
    })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 60, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    const row = await findRow('To Reset')
    await user.click(within(row).getByRole('button', { name: 'Book actions' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.queryByTestId('reader-screen')).not.toBeInTheDocument()
    await waitFor(async () => {
      const progress = await getProgress(db, book.id as number)
      expect(progress?.wordIndex).toBe(0)
    })
  })

  it('the Remove button deletes the book from the library', async () => {
    const db = getDb()
    await addBook(db, { title: 'To Remove', source: 'local', fingerprint: 'f6', ...TEXT_BOOK })

    const user = userEvent.setup()
    renderLibrary()
    const row = await findRow('To Remove')
    await user.click(within(row).getByRole('button', { name: 'Book actions' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryAllByText('To Remove')).toHaveLength(0))
  })

  it('offers the book in progress under "Continue reading", and Resume opens it', async () => {
    const db = getDb()
    await addBook(db, { title: 'Unstarted', source: 'local', fingerprint: 'r0', ...TEXT_BOOK })
    const book = await addBook(db, {
      title: 'Halfway',
      source: 'local',
      fingerprint: 'r1',
      ...TEXT_BOOK,
    })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 50, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    const section = await screen.findByRole('region', { name: 'Continue reading' })
    expect(section).toHaveTextContent('Halfway')
    expect(section).not.toHaveTextContent('Unstarted')

    await user.click(within(section).getByRole('button', { name: 'Resume' }))
    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the sidebar sections and the search box narrow the grid', async () => {
    const db = getDb()
    await addBook(db, { title: 'Unread Novel', source: 'local', fingerprint: 's0', ...TEXT_BOOK })
    const started = await addBook(db, {
      title: 'Started Essay',
      source: 'local',
      fingerprint: 's1',
      ...TEXT_BOOK,
    })
    await db.books.update(started.id as number, { totalWords: 100 })
    await saveProgress(db, started.id as number, { wordIndex: 30, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await findRow('Unread Novel')
    const titlesShown = () =>
      screen.getAllByTestId('book-row').map((row) => row.querySelector('[title]')?.textContent)

    await user.click(screen.getByRole('button', { name: /^Reading/ }))
    expect(titlesShown()).toEqual(['Started Essay'])

    await user.click(screen.getByRole('button', { name: /^All books/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Search books' }), 'novel')
    expect(titlesShown()).toEqual(['Unread Novel'])
  })

  it('makes a shelf, puts a book on it from the tile menu, and filters by it', async () => {
    const db = getDb()
    await addBook(db, { title: 'Walden', source: 'local', fingerprint: 'w', ...TEXT_BOOK })
    await addBook(db, { title: 'Dracula', source: 'local', fingerprint: 'd', ...TEXT_BOOK })

    const user = userEvent.setup()
    renderLibrary()
    await findRow('Walden')
    const titlesShown = () =>
      screen.getAllByTestId('book-row').map((row) => row.querySelector('[title]')?.textContent)

    await user.click(screen.getByRole('button', { name: 'New shelf' }))
    const dialog = screen.getByRole('dialog', { name: 'New shelf' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Nature')
    await user.click(within(dialog).getByRole('button', { name: 'Create shelf' }))

    // The new shelf is picked, and has nothing on it yet.
    const shelvesNav = () => screen.getByRole('navigation', { name: 'Shelves' })
    const shelfButton = await within(shelvesNav()).findByRole('button', { name: /^Nature/ })
    expect(shelfButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nature')
    expect(screen.queryAllByTestId('book-row')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /^All books/ }))
    const row = await findRow('Walden')
    await user.click(within(row).getByRole('button', { name: 'Book actions' }))
    await user.click(within(row).getByRole('button', { name: 'Add to shelf' }))
    await user.click(within(row).getByRole('button', { name: 'Nature' }))
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: 'Nature' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(screen.queryByTestId('reader-screen')).not.toBeInTheDocument()

    await user.click(within(shelvesNav()).getByRole('button', { name: /^Nature/ }))
    expect(titlesShown()).toEqual(['Walden'])
    expect(within(shelvesNav()).getByRole('button', { name: /^Nature/ })).toHaveTextContent('1')
  })

  it('lists bookmarks across books, opens one at its word, and removes one', async () => {
    const db = getDb()
    const book = await addBook(db, {
      title: 'Walden',
      source: 'local',
      fingerprint: 'bm',
      ...TEXT_BOOK,
    })
    const id = book.id as number
    await db.books.update(id, { totalWords: 100 })
    await addBookmark(db, id, 40, 'I went to the woods')
    await addBookmark(db, 12345, 1, 'a book that is gone')

    const user = userEvent.setup()
    const { unmount } = renderLibrary()
    const list = await screen.findByRole('region', { name: 'Bookmarks' })
    await within(list).findByText('40% · I went to the woods')
    expect(list).not.toHaveTextContent('a book that is gone')

    await user.click(within(list).getByRole('button', { name: /^Walden/ }))
    expect(await screen.findByTestId('reader-screen')).toHaveTextContent(`/reader/${id}?at=40`)
    unmount()

    renderLibrary()
    const again = await screen.findByRole('region', { name: 'Bookmarks' })
    await user.click(
      await within(again).findByRole('button', { name: 'Remove bookmark in Walden' }),
    )
    await within(again).findByText(/Bookmark a word in the reader/)
  })

  it('switches to a list of rows and back, and remembers the choice', async () => {
    const db = getDb()
    const book = await addBook(db, {
      title: 'Listed',
      source: 'local',
      fingerprint: 'l',
      ...TEXT_BOOK,
    })
    await db.books.update(book.id as number, { totalWords: 100 })
    await saveProgress(db, book.id as number, { wordIndex: 70, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await findRow('Listed')
    expect(screen.getByRole('button', { name: /Drop a file here/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(useAppStore.getState().libraryView).toBe('list')
    expect(screen.queryByRole('button', { name: /Drop a file here/ })).not.toBeInTheDocument()
    const row = await findRow('Listed')
    expect(within(row).getByTestId('book-progress')).toHaveTextContent('70%')
    await user.click(within(row).getByRole('button', { name: 'Book actions' }))
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(useAppStore.getState().libraryView).toBe('grid')
  })

  it('links to the Settings screen', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
  })

  it('marks a book whose text was recognised from images', async () => {
    const db = getDb()
    await addBook(db, {
      title: 'Scanned',
      source: 'local',
      fingerprint: 'ocr1',
      ...TEXT_BOOK,
      ocr: true,
    })
    await addBook(db, { title: 'Normal', source: 'local', fingerprint: 'ocr2', ...TEXT_BOOK })
    renderLibrary()
    const rows = await screen.findAllByTestId('book-row')
    const scanned = rows.find((row) => row.textContent?.includes('Scanned'))
    const normal = rows.find((row) => row.textContent?.includes('Normal'))
    expect(scanned).toHaveTextContent('OCR')
    expect(normal).not.toHaveTextContent('OCR')
  })

  it('shows a stored cover, and a title card for a book without one', async () => {
    const db = getDb()
    const withCover = await addBook(db, {
      title: 'Covered',
      source: 'local',
      fingerprint: 'c1',
      ...TEXT_BOOK,
    })
    await addBook(db, { title: 'Bare', source: 'local', fingerprint: 'c2', ...TEXT_BOOK })
    await db.covers.put({
      bookId: withCover.id as number,
      blob: new Blob(['jpg'], { type: 'image/jpeg' }),
    })

    renderLibrary()
    const rows = await screen.findAllByTestId('book-row')
    const covered = rows.find((row) => row.textContent?.includes('Covered'))
    const bare = rows.find((row) => row.textContent?.includes('Bare'))
    await waitFor(() => expect(covered?.querySelector('img')).not.toBeNull())
    expect(bare?.querySelector('img')).toBeNull()
  })
})

describe('LibraryScreen on a phone', () => {
  beforeEach(() => {
    // Narrower than the `sm` breakpoint.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    return () => vi.unstubAllGlobals()
  })

  it('swaps the side menu for a tab bar, and the Shelves tab picks what the books show', async () => {
    const db = getDb()
    await addBook(db, { title: 'Unread Novel', source: 'local', fingerprint: 'p0', ...TEXT_BOOK })
    const started = await addBook(db, {
      title: 'Started Essay',
      source: 'local',
      fingerprint: 'p1',
      ...TEXT_BOOK,
    })
    await db.books.update(started.id as number, { totalWords: 100 })
    await saveProgress(db, started.id as number, { wordIndex: 30, wpm: 300, mode: 'rsvp' })

    const user = userEvent.setup()
    renderLibrary()
    await findRow('Unread Novel')
    const tabs = screen.getByRole('navigation', { name: 'Tabs' })
    expect(screen.queryByRole('navigation', { name: 'Library sections' })).not.toBeInTheDocument()
    expect(within(tabs).getByRole('button', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(within(tabs).getByRole('button', { name: 'Shelves' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shelves')
    expect(screen.queryAllByTestId('book-row')).toHaveLength(0)
    // The tab bar is the way to settings here, so the menu has none of its own.
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /^Reading/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reading')
    expect(screen.getAllByTestId('book-row')).toHaveLength(1)
    expect(within(tabs).getByRole('button', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(within(tabs).getByRole('button', { name: 'Settings' }))
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
  })
})

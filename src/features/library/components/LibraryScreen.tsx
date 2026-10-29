import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ACCEPTED_EXTENSIONS,
  ExtractionError,
  NoTextLayerError,
  type OcrLanguage,
} from '@/features/library/api/files'
import {
  createShelf,
  getProgress,
  importLocalFile,
  listBookmarks,
  listShelves,
  removeBookmark,
  listBooks,
  removeBook,
  requestPersistence,
  resetProgress,
  setOnShelf,
  storageUsage,
  type BookRecord,
  type BookmarkRecord,
  type ShelfRecord,
} from '@/features/library/api/library'
import { bookmarkRows } from '@/features/library/bookmarks'
import { bookToContinue, percentRead } from '@/features/library/progress'
import {
  FILTERS,
  SORTS,
  SECTIONS,
  nextShelfColor,
  sectionCounts,
  shelve,
  type Filter,
  type SortKey,
} from '@/features/library/shelf'
import { BookCover } from './BookCover'
import { BookListRow, BookTile, ProgressBar } from './BookTile'
import { BookmarkList } from './BookmarkList'
import { RemoteBooks } from './RemoteBooks'
import { LibrarySidebar, type Place } from './LibrarySidebar'
import { NewShelfDialog } from './NewShelfDialog'
import { OcrDialog } from './OcrDialog'
import { ResumeDialog } from './ResumeDialog'
import { getPlatform } from '@/platform'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Page } from '@/components/Page'
import { PhoneTabBar } from '@/components/PhoneTabBar'
import { logError } from '@/lib/error-log'
import { useMediaQuery, WIDE } from '@/lib/media'
import { useAppStore, type LibraryView } from '@/stores/app-store'
import { useSyncStore } from '@/stores/sync-store'

const VIEWS: { value: LibraryView; label: string; icon: 'grid' | 'list' }[] = [
  { value: 'grid', label: 'Grid view', icon: 'grid' },
  { value: 'list', label: 'List view', icon: 'list' },
]

interface PendingResume {
  book: BookRecord
  wordIndex: number
}

export function LibraryScreen() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const wide = useMediaQuery(WIDE)
  /** A phone shows the side menu as its own tab, instead of the books. */
  const phoneShelves = !wide && search.get('tab') === 'shelves'
  const [books, setBooks] = useState<BookRecord[]>([])
  /** Each book's saved word index, by book id. */
  const [wordIndexes, setWordIndexes] = useState<Record<number, number>>({})
  const [place, setPlace] = useState<Place>({ kind: 'section', section: 'all' })
  const [filter, setFilter] = useState<Filter>('all')
  const [shelves, setShelves] = useState<ShelfRecord[]>([])
  /** A phone keeps the search box folded behind a button. */
  const [searchOpen, setSearchOpen] = useState(false)
  const [makingShelf, setMakingShelf] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const view = useAppStore((s) => s.libraryView)
  const setView = useAppStore((s) => s.setLibraryView)
  const [usageBytes, setUsageBytes] = useState<number | null>(null)
  const [importing, setImporting] = useState<{ fraction: number; message?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null)
  const [dragOver, setDragOver] = useState(false)
  /** A PDF with no text, waiting for the reader to say whether to OCR it. */
  const [ocrOffer, setOcrOffer] = useState<File | null>(null)
  /** The import in progress, if any: what Cancel stops, and what stops the
   * second import from starting. */
  const abortRef = useRef<AbortController | null>(null)
  const aliveRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [list, shelfList, marks] = await Promise.all([
      listBooks(),
      listShelves(),
      listBookmarks(),
    ])
    const entries = await Promise.all(
      list.map(async (book) => {
        const progress = await getProgress(book.id as number)
        return [book.id as number, progress?.wordIndex ?? 0] as const
      }),
    )
    setWordIndexes(Object.fromEntries(entries))
    setBooks(list)
    setShelves(shelfList)
    setBookmarks(marks)
    storageUsage()
      .then((usage) => setUsageBytes(usage?.usageBytes ?? null))
      .catch((err) => logError('storage usage', err))
  }, [])

  // Again whenever sync brings a change in: a shelf, a bookmark, a removal.
  const syncRevision = useSyncStore((s) => s.revision)
  useEffect(() => {
    void refresh()
  }, [refresh, syncRevision])

  // Leaving the screen ends an import: OCR can run for minutes, and the
  // reader should not be pulled into a book they walked away from.
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        if (!abortRef.current) fileInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const addFile = useCallback(
    async (file: File, ocr?: { language: OcrLanguage }) => {
      if (abortRef.current) return // one at a time
      setOcrOffer(null) // a new file replaces any offer still open for an earlier one
      setError(null)
      setImporting({ fraction: 0 })
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const book = await importLocalFile(file, {
          ocr,
          signal: controller.signal,
          onProgress: (fraction, message) => setImporting({ fraction, message }),
        })
        void requestPersistence()
        if (!aliveRef.current) return
        await refresh()
        navigate(`/reader/${book.id}`)
      } catch (err) {
        if (!aliveRef.current) return
        if (err instanceof NoTextLayerError && !ocr) setOcrOffer(file)
        else if (err instanceof DOMException && err.name === 'AbortError') setError(null)
        else if (err instanceof ExtractionError) setError(err.message)
        else {
          logError('import', err)
          setError('Could not add that file. Settings → Error log has the details.')
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (aliveRef.current) setImporting(null)
      }
    },
    [navigate, refresh],
  )

  useEffect(() => {
    void getPlatform()
      .then((platform) => platform.takeLaunchFile())
      .then((file) => {
        if (file) void addFile(file)
      })
    // Only on mount: a CLI-launch argument is only ever relevant once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void addFile(file)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void addFile(file)
  }

  async function openBook(book: BookRecord) {
    const progress = await getProgress(book.id as number)
    if (progress && progress.wordIndex > 0) {
      setPendingResume({ book, wordIndex: progress.wordIndex })
    } else {
      navigate(`/reader/${book.id}`)
    }
  }

  async function onRemove(book: BookRecord) {
    await removeBook(book.id as number)
    await refresh()
  }

  async function onResetProgress(book: BookRecord) {
    await resetProgress(book.id as number)
    await refresh()
  }

  async function onShelveBook(book: BookRecord, shelf: number, on: boolean) {
    await setOnShelf(shelf, book.id as number, on)
    await refresh()
  }

  async function onCreateShelf(name: string, color: ShelfRecord['color']) {
    setMakingShelf(false)
    const shelf = await createShelf(name, color)
    await refresh()
    setPlace({ kind: 'shelf', shelfId: shelf.id as number })
  }

  const percentOf = (book: BookRecord) =>
    percentRead(book.totalWords, wordIndexes[book.id as number])
  const shelf = place.kind === 'shelf' ? shelves.find((s) => s.id === place.shelfId) : undefined
  const section = place.kind === 'section' ? place.section : 'all'
  const percents = books.map(percentOf)
  const counts = sectionCounts(percents)
  const continuing =
    place.kind === 'section' && section === 'all' && filter === 'all' && query.trim() === ''
      ? bookToContinue(books, (id) => wordIndexes[id])
      : undefined
  const shown = shelve(books, percentOf, {
    section,
    query,
    sort,
    filter,
    // A shelf that has just gone shows nothing rather than everything.
    shelfBookIds: place.kind === 'shelf' ? (shelf?.bookIds ?? []) : undefined,
  })
  const Item = view === 'grid' ? BookTile : BookListRow
  const heading =
    place.kind === 'bookmarks'
      ? 'Bookmarks'
      : place.kind === 'shelf'
        ? (shelf?.name ?? '')
        : SECTIONS.find((s) => s.value === section)?.label
  const marks = bookmarkRows(bookmarks, books)
  const subtitle = `${books.length} ${books.length === 1 ? 'book' : 'books'} · ${counts.reading} in progress`

  const searchBox = (
    <label className="flex h-10 w-60 max-w-full items-center gap-2 rounded-[10px] border border-border bg-bg-raised px-3 text-text-dim">
      <Icon name="search" size={16} />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search titles and authors"
        aria-label="Search books"
        autoFocus={!wide}
        className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-dim"
      />
    </label>
  )

  // On a phone, picking from the side menu goes back to the books it picked.
  const sidebar = (
    <LibrarySidebar
      place={place}
      onPlace={(next) => {
        setPlace(next)
        if (phoneShelves) setSearch({})
      }}
      counts={counts}
      bookmarkCount={marks.length}
      shelves={shelves}
      onNewShelf={() => setMakingShelf(true)}
      usageBytes={usageBytes}
      onSettings={wide ? () => navigate('/settings') : undefined}
    />
  )

  return (
    <Page
      title={phoneShelves ? 'Shelves' : 'Library'}
      subtitle={!phoneShelves && wide && subtitle}
      sidebar={wide && sidebar}
      tabBar={
        !wide && (
          <PhoneTabBar
            active={phoneShelves ? 'shelves' : 'library'}
            onSelect={(tab) => {
              if (tab === 'settings') navigate('/settings')
              else setSearch(tab === 'shelves' ? { tab: 'shelves' } : {})
            }}
          />
        )
      }
      actions={
        phoneShelves ? undefined : !wide ? (
          <>
            <button
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-raised text-text"
            >
              <Icon name="search" size={18} />
            </button>
            <button
              type="button"
              aria-label="Add a book"
              disabled={importing !== null}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-bg disabled:opacity-40"
            >
              <Icon name="plus" size={18} />
            </button>
          </>
        ) : (
          <>
            {searchBox}
            <label className="flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg-raised px-3 text-sm text-text-dim">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort books"
                className="bg-transparent text-text outline-none"
              >
                {SORTS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="group"
              aria-label="View"
              className="flex h-10 items-center rounded-[10px] border border-border bg-bg-raised p-0.5"
            >
              {VIEWS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === value}
                  title={label}
                  onClick={() => setView(value)}
                  className={`flex h-full w-9 items-center justify-center rounded-md ${
                    view === value ? 'bg-bg-hover text-text' : 'text-text-dim hover:text-text'
                  }`}
                >
                  <Icon name={icon} size={16} />
                </button>
              ))}
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="primary"
              disabled={importing !== null}
              className="flex h-10 items-center gap-1.5 rounded-[10px]! px-4! font-semibold!"
            >
              <Icon name="plus" size={16} />
              Add book
            </Button>
          </>
        )
      }
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={onFilePicked}
        aria-label="Add book"
      />

      {phoneShelves ? (
        sidebar
      ) : (
        <>
          {!wide && searchOpen && searchBox}
          {dragOver && (
            <div className="rounded border-2 border-dashed border-accent p-6 text-center text-sm text-text-dim">
              Drop to add
            </div>
          )}

          {importing && (
            <div className="text-sm text-text-dim" role="status">
              Adding book{importing.message ? `: ${importing.message}` : '…'} (
              {Math.round(importing.fraction * 100)}%){' '}
              <Button onClick={() => abortRef.current?.abort()} variant="link" small>
                Cancel
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded border border-accent p-3 text-sm text-accent">{error}</div>
          )}

          {continuing && (
            <section aria-labelledby="continue-heading" className="flex flex-col gap-3">
              <h2 id="continue-heading" className="text-sm font-semibold">
                Continue reading
              </h2>
              <div className="flex max-w-xl gap-4 rounded-xl border border-border bg-bg-raised p-4">
                <div className="w-20 shrink-0">
                  <BookCover book={continuing} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex flex-col gap-0.5">
                    <span className="line-clamp-2 font-serif text-lg">{continuing.title}</span>
                    {continuing.author && (
                      <span className="text-[13px] text-text-dim">{continuing.author}</span>
                    )}
                  </span>
                  <div className="mt-auto flex flex-col gap-1.5">
                    <ProgressBar percent={percentOf(continuing)} />
                    <span className="text-xs text-text-dim">
                      {percentOf(continuing).toFixed(0)}% read
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/reader/${continuing.id}`)}
                    className="flex items-center gap-1.5 self-start rounded-lg! px-4! py-2!"
                  >
                    <Icon name="play" size={12} />
                    Resume
                  </Button>
                </div>
              </div>
            </section>
          )}

          {place.kind === 'section' && section === 'all' && <RemoteBooks />}

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-2 text-[15px] font-semibold">{heading}</h2>
            {place.kind !== 'bookmarks' && (
              <div
                role="group"
                aria-label="Filter"
                className="-mx-6 flex gap-1.5 overflow-x-auto px-6 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
              >
                {FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={`h-8 shrink-0 rounded-full border px-3 text-[13px] ${
                      filter === value
                        ? 'border-text bg-text font-semibold text-bg'
                        : 'border-border text-text-dim hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {place.kind === 'bookmarks' ? (
            <BookmarkList
              bookmarks={marks}
              onOpen={(mark) => navigate(`/reader/${mark.bookId}?at=${mark.wordIndex}`)}
              onRemove={(mark) => void removeBookmark(mark.id).then(refresh)}
            />
          ) : books.length === 0 && !importing ? (
            <p className="text-sm text-text-dim">No books yet — add one, or drag a file in.</p>
          ) : (
            <ul
              className={
                view === 'grid'
                  ? 'grid grid-cols-3 gap-x-3.5 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] sm:gap-x-5 sm:gap-y-7'
                  : 'flex flex-col gap-1'
              }
            >
              {shown.length === 0 && (
                <li className="col-span-full text-sm text-text-dim">No books match.</li>
              )}
              {shown.map((book) => (
                <Item
                  key={book.id}
                  book={book}
                  percent={percentOf(book)}
                  shelves={shelves}
                  onOpen={() => void openBook(book)}
                  onShelf={(id, on) => void onShelveBook(book, id, on)}
                  onReset={() => void onResetProgress(book)}
                  onRemove={() => void onRemove(book)}
                />
              ))}
              {view === 'grid' && wide && (
                <li>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing !== null}
                    className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-guide p-4 text-xs leading-relaxed text-text-dim hover:border-text-dim hover:text-text disabled:opacity-40"
                  >
                    <Icon name="plus" size={22} />
                    <span>
                      Drop a file here
                      <br />
                      EPUB · PDF · TXT · MD
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {makingShelf && (
        <NewShelfDialog
          color={nextShelfColor(shelves.map((s) => s.color))}
          onCreate={(name, color) => void onCreateShelf(name, color)}
          onCancel={() => setMakingShelf(false)}
        />
      )}

      {ocrOffer && (
        <OcrDialog
          fileName={ocrOffer.name}
          onStart={(language) => {
            const file = ocrOffer
            setOcrOffer(null)
            void addFile(file, { language })
          }}
          onCancel={() => setOcrOffer(null)}
        />
      )}

      {pendingResume && (
        <ResumeDialog
          title={pendingResume.book.title}
          progressPercent={
            pendingResume.book.totalWords > 0
              ? Math.min(100, (pendingResume.wordIndex / pendingResume.book.totalWords) * 100)
              : 0
          }
          onResume={() => {
            const book = pendingResume.book
            setPendingResume(null)
            navigate(`/reader/${book.id}`)
          }}
          onStartOver={() => {
            const book = pendingResume.book
            setPendingResume(null)
            void resetProgress(book.id as number).then(() => navigate(`/reader/${book.id}`))
          }}
          onCancel={() => setPendingResume(null)}
        />
      )}
    </Page>
  )
}

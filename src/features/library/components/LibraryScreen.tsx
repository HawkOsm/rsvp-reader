import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  SORTS,
  SECTIONS,
  nextShelfColor,
  sectionCounts,
  shelve,
  type Section,
  type SortKey,
} from '@/features/library/shelf'
import { BookCover } from './BookCover'
import { BookTile, ProgressBar } from './BookTile'
import { LibrarySidebar } from './LibrarySidebar'
import { NewShelfDialog } from './NewShelfDialog'
import { OcrDialog } from './OcrDialog'
import { ResumeDialog } from './ResumeDialog'
import { getPlatform } from '@/platform'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Page } from '@/components/Page'
import { logError } from '@/lib/error-log'

interface PendingResume {
  book: BookRecord
  wordIndex: number
}

export function LibraryScreen() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookRecord[]>([])
  /** Each book's saved word index, by book id. */
  const [wordIndexes, setWordIndexes] = useState<Record<number, number>>({})
  const [section, setSection] = useState<Section>('all')
  const [shelves, setShelves] = useState<ShelfRecord[]>([])
  /** The shelf picked in the sidebar; it replaces the section while set. */
  const [shelfId, setShelfId] = useState<number | null>(null)
  const [makingShelf, setMakingShelf] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
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

  useEffect(() => {
    void refresh()
  }, [refresh])

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
    setShelfId(shelf.id as number)
  }

  const percentOf = (book: BookRecord) =>
    percentRead(book.totalWords, wordIndexes[book.id as number])
  const shelf = shelves.find((s) => s.id === shelfId)
  const continuing =
    section === 'all' && !shelf && query.trim() === ''
      ? bookToContinue(books, (id) => wordIndexes[id])
      : undefined
  const shown = shelve(books, percentOf, {
    section: shelf ? 'all' : section,
    query,
    sort,
    shelfBookIds: shelf?.bookIds,
  })
  const title = shelf ? shelf.name : SECTIONS.find((s) => s.value === section)?.label

  return (
    <Page
      title={title}
      sidebar={
        <LibrarySidebar
          section={shelf ? null : section}
          counts={sectionCounts(books.map(percentOf))}
          onSection={(next) => {
            setShelfId(null)
            setSection(next)
          }}
          shelves={shelves}
          shelfId={shelf ? shelfId : null}
          onShelf={setShelfId}
          onNewShelf={() => setMakingShelf(true)}
          bookmarks={bookmarkRows(bookmarks, books)}
          onBookmark={(mark) => navigate(`/reader/${mark.bookId}?at=${mark.wordIndex}`)}
          onRemoveBookmark={(mark) => void removeBookmark(mark.id).then(refresh)}
          usageBytes={usageBytes}
          onSettings={() => navigate('/settings')}
        />
      }
      actions={
        <>
          <label className="flex h-10 w-60 max-w-full items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 text-text-dim">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles"
              aria-label="Search books"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-dim"
            />
          </label>
          <label className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-bg-raised px-3 text-sm text-text-dim">
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
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="primary"
            disabled={importing !== null}
            className="flex items-center gap-1.5 rounded-lg! px-4! py-2!"
          >
            <Icon name="plus" size={16} />
            Add book
          </Button>
        </>
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

      {error && <div className="rounded border border-accent p-3 text-sm text-accent">{error}</div>}

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
              <span className="line-clamp-2 font-serif text-lg">{continuing.title}</span>
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

      {books.length === 0 && !importing ? (
        <p className="text-sm text-text-dim">No books yet — add one, or drag a file in.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-5 gap-y-7">
          {shown.length === 0 && (
            <li className="col-span-full text-sm text-text-dim">No books match.</li>
          )}
          {shown.map((book) => (
            <BookTile
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
        </ul>
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

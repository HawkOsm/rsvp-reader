import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ACCEPTED_EXTENSIONS,
  ExtractionError,
  NoTextLayerError,
  type OcrLanguage,
} from '@/features/library/api/files'
import {
  getProgress,
  importLocalFile,
  listBooks,
  removeBook,
  requestPersistence,
  resetProgress,
  type BookRecord,
} from '@/features/library/api/library'
import { BookCover } from './BookCover'
import { OcrDialog } from './OcrDialog'
import { ResumeDialog } from './ResumeDialog'
import { getPlatform } from '@/platform'
import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { logError } from '@/lib/error-log'

interface PendingResume {
  book: BookRecord
  wordIndex: number
}

export function LibraryScreen() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookRecord[]>([])
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
    setBooks(await listBooks())
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

  async function onRemove(book: BookRecord, e: React.MouseEvent) {
    e.stopPropagation()
    await removeBook(book.id as number)
    await refresh()
  }

  async function onResetProgress(book: BookRecord, e: React.MouseEvent) {
    e.stopPropagation()
    await resetProgress(book.id as number)
    await refresh()
  }

  return (
    <Page
      title="RSVP Reader"
      actions={
        <>
          <Button onClick={() => navigate('/settings')} variant="link">
            Settings
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="primary"
            disabled={importing !== null}
          >
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

      {books.length === 0 && !importing ? (
        <p className="text-sm text-text-dim">No books yet — add one, or drag a file in.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
          {books.map((book) => (
            <li
              key={book.id}
              onClick={() => void openBook(book)}
              className="group flex cursor-pointer flex-col gap-2"
              data-testid="book-row"
            >
              <div className="transition-transform group-hover:-translate-y-1">
                <BookCover book={book} />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="line-clamp-2 font-medium" title={book.title}>
                  {book.title}
                </span>
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <span data-testid="book-progress">
                    <BookProgress book={book} />
                  </span>
                  <span>
                    {book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString() : '—'}
                  </span>
                  {book.ocr && (
                    <span
                      className="rounded border border-border px-1"
                      title="The text was recognised from page images, so expect the odd mistake"
                    >
                      OCR
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={(e) => void onResetProgress(book, e)} variant="link" small>
                    Reset
                  </Button>
                  <Button onClick={(e) => void onRemove(book, e)} variant="danger" small>
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
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

function BookProgress({ book }: { book: BookRecord }) {
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void getProgress(book.id as number).then((progress) => {
      if (cancelled) return
      if (!progress || book.totalWords <= 0) {
        setPercent(0)
        return
      }
      setPercent(Math.min(100, (progress.wordIndex / book.totalWords) * 100))
    })
    return () => {
      cancelled = true
    }
  }, [book.id, book.totalWords])

  return <span>{percent === null ? '…' : `${percent.toFixed(0)}%`}</span>
}

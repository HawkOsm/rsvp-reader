import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExtractionError } from '../../parse'
import {
  getProgress,
  listBooks,
  removeBook,
  resetProgress,
} from '../../storage/library'
import { getDb, type BookRecord } from '../../storage/schema'
import { ResumeDialog } from '../components/ResumeDialog'
import { importLocalFile } from '../import-book'
import { requestPersistence } from '../../storage/quota'
import { pendingOpenFile } from '../tauri-open'
import { Button } from '../components/Button'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setBooks(await listBooks(getDb()))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        fileInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const addFile = useCallback(
    async (file: File) => {
      setError(null)
      setImporting({ fraction: 0 })
      try {
        const book = await importLocalFile(file, {
          onProgress: (fraction, message) => setImporting({ fraction, message }),
        })
        void requestPersistence()
        await refresh()
        navigate(`/reader/${book.id}`)
      } catch (err) {
        setError(err instanceof ExtractionError ? err.message : 'Could not add that file.')
      } finally {
        setImporting(null)
      }
    },
    [navigate, refresh],
  )

  useEffect(() => {
    void pendingOpenFile().then((file) => {
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
    const progress = await getProgress(getDb(), book.id as number)
    if (progress && progress.wordIndex > 0) {
      setPendingResume({ book, wordIndex: progress.wordIndex })
    } else {
      navigate(`/reader/${book.id}`)
    }
  }

  async function onRemove(book: BookRecord, e: React.MouseEvent) {
    e.stopPropagation()
    await removeBook(getDb(), book.id as number)
    await refresh()
  }

  async function onResetProgress(book: BookRecord, e: React.MouseEvent) {
    e.stopPropagation()
    await resetProgress(getDb(), book.id as number)
    await refresh()
  }

  return (
    <div
      className="flex min-h-screen flex-col gap-4 bg-[var(--color-bg)] p-6 text-[var(--color-text)]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">RSVP Reader</h1>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate('/settings')}
            variant="link"
          >
            Settings
          </Button>
          <Button
            onClick={() => navigate('/search')}
            variant="link"
          >
            Find a book
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="primary"
          >
            Add book
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.text,.rst,.org,.pdf,.epub"
          className="hidden"
          onChange={onFilePicked}
          aria-label="Add book"
        />
      </div>

      {dragOver && (
        <div className="rounded border-2 border-dashed border-[var(--color-accent)] p-6 text-center text-sm text-[var(--color-text-dim)]">
          Drop to add
        </div>
      )}

      {importing && (
        <div className="text-sm text-[var(--color-text-dim)]" role="status">
          Adding book{importing.message ? `: ${importing.message}` : '…'} (
          {Math.round(importing.fraction * 100)}%)
        </div>
      )}

      {error && (
        <div className="rounded border border-[var(--color-accent)] p-3 text-sm text-[var(--color-accent)]">
          {error}
        </div>
      )}

      {books.length === 0 && !importing ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          No books yet — add one, or drag a file in.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--color-text-dim)]">
            <tr>
              <th className="py-2 font-normal">Title</th>
              <th className="py-2 font-normal">Progress</th>
              <th className="py-2 font-normal">Last opened</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr
                key={book.id}
                onClick={() => void openBook(book)}
                className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]"
                data-testid="book-row"
              >
                <td className="py-2">{book.title}</td>
                <td className="py-2" data-testid="book-progress">
                  <BookProgress book={book} />
                </td>
                <td className="py-2 text-[var(--color-text-dim)]">
                  {book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString() : '—'}
                </td>
                <td className="py-2 text-right">
                  <Button
                    onClick={(e) => void onResetProgress(book, e)}
                    variant="link" small className="mr-2"
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={(e) => void onRemove(book, e)}
                    variant="danger" small
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            void resetProgress(getDb(), book.id as number).then(() => navigate(`/reader/${book.id}`))
          }}
          onCancel={() => setPendingResume(null)}
        />
      )}
    </div>
  )
}

function BookProgress({ book }: { book: BookRecord }) {
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void getProgress(getDb(), book.id as number).then((progress) => {
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

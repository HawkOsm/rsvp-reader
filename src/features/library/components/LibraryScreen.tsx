import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImportError } from '@/features/library/api/import-error'
import { getImportService } from '@/features/library/api/import-service'
import { getLibraryService } from '@/features/library/api/library-service'
import type { BookSummary } from '@/features/library/api/types'
import { Button } from '@/components/Button'
import { ResumeDialog } from './ResumeDialog'
import { pendingOpenFile } from '@/features/library/tauri-open'

export function LibraryScreen() {
  const navigate = useNavigate()
  const library = getLibraryService()
  const importer = getImportService()
  const [books, setBooks] = useState<BookSummary[]>([])
  const [importing, setImporting] = useState<{ fraction: number; message?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingResume, setPendingResume] = useState<BookSummary | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setBooks(await library.list())
  }, [library])

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
        const book = await importer.importFile(file, {
          onProgress: (fraction, message) => setImporting({ fraction, message }),
        })
        await refresh()
        navigate(`/reader/${book.id}`)
      } catch (err) {
        setError(err instanceof ImportError ? err.message : 'Could not add that file.')
      } finally {
        setImporting(null)
      }
    },
    [importer, navigate, refresh],
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

  function openBook(book: BookSummary) {
    if (book.wordIndex > 0) {
      setPendingResume(book)
    } else {
      navigate(`/reader/${book.id}`)
    }
  }

  async function onRemove(book: BookSummary, e: React.MouseEvent) {
    e.stopPropagation()
    await library.remove(book.id)
    await refresh()
  }

  async function onResetProgress(book: BookSummary, e: React.MouseEvent) {
    e.stopPropagation()
    await library.resetPosition(book.id)
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
          <Button onClick={() => navigate('/settings')} variant="link">
            Settings
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} variant="primary">
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
                onClick={() => openBook(book)}
                className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]"
                data-testid="book-row"
              >
                <td className="py-2">{book.title}</td>
                <td className="py-2" data-testid="book-progress">
                  {book.percent.toFixed(0)}%
                </td>
                <td className="py-2 text-[var(--color-text-dim)]">
                  {book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString() : '—'}
                </td>
                <td className="py-2 text-right">
                  <Button
                    onClick={(e) => void onResetProgress(book, e)}
                    variant="link"
                    small
                    className="mr-2"
                  >
                    Reset
                  </Button>
                  <Button onClick={(e) => void onRemove(book, e)} variant="danger" small>
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
          title={pendingResume.title}
          progressPercent={pendingResume.percent}
          onResume={() => {
            const book = pendingResume
            setPendingResume(null)
            navigate(`/reader/${book.id}`)
          }}
          onStartOver={() => {
            const book = pendingResume
            setPendingResume(null)
            void library.resetPosition(book.id).then(() => navigate(`/reader/${book.id}`))
          }}
          onCancel={() => setPendingResume(null)}
        />
      )}
    </div>
  )
}

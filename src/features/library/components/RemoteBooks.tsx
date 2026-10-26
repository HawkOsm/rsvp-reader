import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logError } from '@/lib/error-log'
import { useFlag } from '@/lib/flags'
import { useSyncStore } from '@/stores/sync-store'

const BUTTON =
  'h-8 shrink-0 rounded-lg border border-border px-3 text-[13px] hover:bg-bg-hover disabled:opacity-60'

/** Books on the user's other devices and not on this one, with sync on:
 * downloaded from Google Drive when asked, then opened. */
export function RemoteBooks() {
  const sync = useFlag('sync')
  const books = useSyncStore((s) => s.remoteBooks)
  const download = useSyncStore((s) => s.downloadBook)
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!sync || books.length === 0) return null

  async function fetchBook(syncId: string) {
    setBusy(syncId)
    setError(null)
    try {
      navigate(`/reader/${await download(syncId)}`)
    } catch (err) {
      logError('sync: download', err)
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="remote-heading" className="flex flex-col gap-3">
      <h2 id="remote-heading" className="text-sm font-semibold">
        On your other devices
      </h2>
      <ul className="flex max-w-xl flex-col divide-y divide-border rounded-xl border border-border bg-bg-raised">
        {books.map((book) => (
          <li key={book.syncId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-serif">{book.title}</span>
              <span className="text-xs text-text-dim">
                {book.formatId.toUpperCase()} · {book.totalWords.toLocaleString()} words
              </span>
            </span>
            {book.available ? (
              <button
                type="button"
                aria-label={`Download ${book.title}`}
                disabled={busy !== null}
                className={BUTTON}
                onClick={() => void fetchBook(book.syncId)}
              >
                {busy === book.syncId ? 'Downloading…' : 'Download'}
              </button>
            ) : (
              <span className="text-xs text-text-dim">Not uploaded yet</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-accent">{error}</p>}
    </section>
  )
}

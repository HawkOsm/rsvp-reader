import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cachedSearch } from '../gutendex-cache'
import { GutendexError, type GutendexBook } from '../../sources/gutendex'
import { importGutendexBook } from '../import-book'

const DEBOUNCE_MS = 300
const LANGUAGE_CHOICES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Turkish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
]

export function SearchScreen() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('')
  const [results, setResults] = useState<GutendexBook[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length === 0) {
      setResults([])
      setError(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setError(null)
      cachedSearch(query, { languages: language ? [language] : undefined })
        .then((r) => setResults(r.results))
        .catch((err: unknown) => {
          setError(
            err instanceof GutendexError
              ? err.message
              : navigator.onLine === false
                ? "You're offline — search needs a connection."
                : 'Search failed. Try again.',
          )
          setResults([])
        })
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, language])

  async function onImport(book: GutendexBook) {
    setImportingId(book.id)
    setError(null)
    try {
      const record = await importGutendexBook(book)
      navigate(`/reader/${record.id}`)
    } catch (err) {
      setError(err instanceof GutendexError ? err.message : 'Could not import this book.')
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => navigate('/')} className="text-sm text-[var(--color-text-dim)]">
          ← Library
        </button>
        <h1 className="text-xl font-semibold">Find a book</h1>
      </div>

      <div className="flex gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Project Gutenberg…"
          autoFocus
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-3 py-1.5"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-2 py-1.5"
        >
          {LANGUAGE_CHOICES.map((choice) => (
            <option key={choice.code} value={choice.code}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-[var(--color-text-dim)]">Searching…</p>}
      {error && (
        <div className="rounded border border-[var(--color-accent)] p-3 text-sm text-[var(--color-accent)]">
          {error}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {results.map((book) => (
          <li
            key={book.id}
            className="flex items-center justify-between gap-4 rounded border border-[var(--color-border)] p-3"
          >
            <div>
              <p className="font-medium">{book.title}</p>
              <p className="text-sm text-[var(--color-text-dim)]">
                {book.authors.map((a) => a.name).join(', ') || 'Unknown author'}
                {' · '}
                {book.languages.join(', ') || '—'}
                {' · '}
                {book.downloadCount.toLocaleString()} downloads
              </p>
            </div>
            <button
              type="button"
              disabled={importingId === book.id}
              onClick={() => void onImport(book)}
              className="shrink-0 rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-bg)] disabled:opacity-50"
            >
              {importingId === book.id ? 'Adding…' : 'Add'}
            </button>
          </li>
        ))}
      </ul>

      {!loading && query.trim().length > 0 && results.length === 0 && !error && (
        <p className="text-sm text-[var(--color-text-dim)]">No results.</p>
      )}

      <p className="mt-auto text-xs text-[var(--color-text-dim)]">
        Search and books via{' '}
        <a
          href="https://www.gutenberg.org"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Project Gutenberg
        </a>
        , indexed by{' '}
        <a href="https://gutendex.com" target="_blank" rel="noreferrer" className="underline">
          Gutendex
        </a>
        . Public-domain in the US; check your own country's copyright law.
      </p>
    </div>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_WPM } from '../../core/pacing'
import { createEngine } from '../../core/engine'
import type { Token } from '../../core/types'
import { getProgress, getTokens, touchOpened } from '../../storage/library'
import { getDb, type BookRecord } from '../../storage/schema'
import { BookControls } from '../components/BookControls'
import { Button } from '../components/Button'
import { PagePanel } from '../components/PagePanel'
import { ReaderHints } from '../components/ReaderHints'
import { RsvpCanvas } from '../components/RsvpCanvas'
import { TransportBar } from '../components/TransportBar'
import { EngineProvider, useEngine, useEnginePlaying } from '../engine-context'
import { useAutosaveProgress } from '../hooks/useAutosaveProgress'
import { useReaderKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useTouchControls } from '../hooks/useTouchControls'
import { useWakeLock } from '../hooks/useWakeLock'
import { useAppStore } from '../store'

interface LoadedBook {
  book: BookRecord
  tokens: Token[]
  startIndex: number
  startWpm: number
}

function Centered({ children, dim }: { children: ReactNode; dim?: boolean }) {
  const color = dim ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text)]'
  return (
    <div className={`flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 ${color}`}>
      {children}
    </div>
  )
}

export function ReaderScreen() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const setMode = useAppStore((s) => s.setMode)
  const [loaded, setLoaded] = useState<LoadedBook | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const id = Number(bookId)
    if (!Number.isFinite(id)) {
      setLoadError('Invalid book.')
      return
    }
    let cancelled = false
    void (async () => {
      const db = getDb()
      const [book, tokens, progress] = await Promise.all([
        db.books.get(id),
        getTokens(db, id),
        getProgress(db, id),
      ])
      if (cancelled) return
      if (!book || !tokens) {
        setLoadError('This book could not be found. It may have been removed.')
        return
      }
      void touchOpened(db, id)
      setMode(progress?.mode ?? 'rsvp')
      setLoaded({
        book,
        tokens,
        startIndex: progress?.wordIndex ?? 0,
        startWpm: progress?.wpm ?? DEFAULT_WPM,
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per bookId, not on setMode identity
  }, [bookId])

  if (loadError) {
    return (
      <Centered>
        <p>{loadError}</p>
        <Button
          onClick={() => navigate('/')}
          variant="primary"
        >
          Back to library
        </Button>
      </Centered>
    )
  }
  if (!loaded) return <Centered dim>Loading…</Centered>

  return <ReaderContent loaded={loaded} />
}

function ReaderContent({ loaded }: { loaded: LoadedBook }) {
  const { book, tokens, startIndex, startWpm } = loaded
  const engine = useMemo(
    () => createEngine(tokens, { index: startIndex, wpm: startWpm }),
    // Deliberately excludes startIndex/startWpm: the engine owns playback
    // state from here on; re-running this on every index change would
    // recreate it on every word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokens],
  )
  useEffect(() => () => engine.destroy(), [engine])

  return (
    <EngineProvider value={engine}>
      <ReaderBody book={book} />
    </EngineProvider>
  )
}

function ReaderBody({ book }: { book: BookRecord }) {
  const bookId = book.id as number
  const pages = book.pages
  const navigate = useNavigate()
  const engine = useEngine()
  const playing = useEnginePlaying()
  const onTap = useTouchControls()
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)

  useReaderKeyboardShortcuts(pages)
  useAutosaveProgress(bookId, mode)
  useWakeLock(playing)

  // Flashing words while reading a page would be absurd.
  useEffect(() => {
    if (mode === 'book') engine.pause()
  }, [mode, engine])

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--color-border)] px-4 py-2 text-sm">
        <div>
          <Button onClick={() => navigate('/')}>‹ Library</Button>
        </div>
        <span className="max-w-[40vw] truncate">{book.title}</span>
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setMode(mode === 'book' ? 'rsvp' : 'book')}
            title={mode === 'book' ? 'Back to one word at a time  (B)' : 'Read normally, a page at a time  (B)'}
          >
            {mode === 'book' ? 'RSVP' : 'Book'}
          </Button>
          {mode === 'rsvp' && (
            <Button onClick={() => setPanelOpen(!panelOpen)} title="Show the page you are on  (P)">
              {panelOpen ? 'Page ‹' : 'Page ›'}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {mode === 'rsvp' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" onClick={onTap}>
            <RsvpCanvas />
          </div>
        )}
        {(mode === 'book' || panelOpen) && (
          <div
            className={
              mode === 'book'
                ? 'relative min-h-0 flex-1'
                : 'relative min-h-0 w-[min(380px,45%)] shrink-0 border-l border-[var(--color-border)]'
            }
          >
            <div className="absolute inset-0">
              <PagePanel bookId={bookId} pages={pages} variant={mode === 'book' ? 'book' : 'side'} />
            </div>
          </div>
        )}
      </div>

      {mode === 'book' && pages !== undefined ? (
        <BookControls pageCount={pages} />
      ) : (
        <TransportBar totalPages={pages} />
      )}
      <ReaderHints mode={mode} paged={pages !== undefined} />
    </div>
  )
}

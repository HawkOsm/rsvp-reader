import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_WPM } from '../../core/pacing'
import { createEngine } from '../../core/engine'
import type { Token } from '../../core/types'
import { getProgress, getTokens, touchOpened } from '../../storage/library'
import { getDb, type BookRecord } from '../../storage/schema'
import { PagePanel } from '../components/PagePanel'
import { RsvpCanvas } from '../components/RsvpCanvas'
import { TransportBar } from '../components/TransportBar'
import { EngineProvider, useEngine } from '../engine-context'
import { useAutosaveProgress } from '../hooks/useAutosaveProgress'
import { useReaderKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useTouchControls } from '../hooks/useTouchControls'
import { useWakeLock } from '../hooks/useWakeLock'
import { useAppStore } from '../store'
import { resolvePalette } from '../theme'

interface LoadedBook {
  book: BookRecord
  tokens: Token[]
  startIndex: number
  startWpm: number
}

export function ReaderScreen() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<LoadedBook | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const theme = useAppStore((s) => s.theme)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const orpColor = useAppStore((s) => s.orpColor)
  const mode = useAppStore((s) => s.mode)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setMode = useAppStore((s) => s.setMode)

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-bg)]"
        >
          Back to library
        </button>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-dim)]">
        Loading…
      </div>
    )
  }

  return (
    <ReaderContent
      loaded={loaded}
      mode={mode}
      panelOpen={panelOpen}
      palette={resolvePalette(theme)}
      fontFamily={fontFamily}
      fontSize={fontSize}
      orpColor={orpColor}
    />
  )
}

interface ReaderContentProps {
  loaded: LoadedBook
  mode: 'rsvp' | 'book'
  panelOpen: boolean
  palette: ReturnType<typeof resolvePalette>
  fontFamily: string
  fontSize: number
  orpColor: string | null
}

function ReaderContent({
  loaded,
  mode,
  panelOpen,
  palette,
  fontFamily,
  fontSize,
  orpColor,
}: ReaderContentProps) {
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
      <ReaderBody
        bookId={book.id as number}
        title={book.title}
        pages={book.pages}
        mode={mode}
        panelOpen={panelOpen}
        palette={palette}
        fontFamily={fontFamily}
        fontSize={fontSize}
        orpColor={orpColor}
      />
    </EngineProvider>
  )
}

interface ReaderBodyProps {
  bookId: number
  title: string
  pages?: number
  mode: 'rsvp' | 'book'
  panelOpen: boolean
  palette: ReturnType<typeof resolvePalette>
  fontFamily: string
  fontSize: number
  orpColor: string | null
}

function ReaderBody({
  bookId,
  title,
  pages,
  mode,
  panelOpen,
  palette,
  fontFamily,
  fontSize,
  orpColor,
}: ReaderBodyProps) {
  const [playing, setPlaying] = useState(false)
  const navigate = useNavigate()
  const onTap = useTouchControls()

  useReaderKeyboardShortcuts()
  useAutosaveProgress(bookId, mode)
  useWakeLock(playing)

  const showPanel = mode === 'book' || panelOpen

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 text-sm">
        <button type="button" onClick={() => navigate('/')} className="text-[var(--color-text-dim)]">
          ← Library
        </button>
        <span className="truncate">{title}</span>
        <span className="w-16" />
      </header>

      <div className="flex min-h-0 flex-1">
        {mode === 'rsvp' && (
          <div className="flex min-h-0 flex-1 flex-col" onClick={onTap}>
            <RsvpCanvas
              palette={palette}
              fontFamily={fontFamily}
              fontSizePx={fontSize}
              orpColor={orpColor}
            />
          </div>
        )}
        {showPanel && (
          <div className={mode === 'book' ? 'min-h-0 flex-1' : 'min-h-0 w-[45%] border-l border-[var(--color-border)]'}>
            <PagePanel bookId={bookId} pages={pages} />
          </div>
        )}
      </div>

      <PlayingWatcher onChange={setPlaying} />
      <TransportBar totalPages={pages} />
    </div>
  )
}

/** A dedicated subscriber for the wake-lock flag, so that flag's own state
 * doesn't live in ReaderBody (which would re-render the header/layout on
 * every play/pause too). */
function PlayingWatcher({ onChange }: { onChange: (playing: boolean) => void }) {
  const engine = useEngine()
  useEffect(() => {
    onChange(engine.isPlaying)
    return engine.on('playing', onChange)
  }, [engine, onChange])
  return null
}

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createEngine } from '@/core/engine'
import { BookControls } from './BookControls'
import { Button } from '@/components/Button'
import { resolvePage } from '@/core/page-spec'
import type { BookRecord } from '@/features/reader/api/book'
import { PageOverlay } from './PageOverlay'
import { PagePanel } from './PagePanel'
import { ReaderHints } from './ReaderHints'
import { RsvpCanvas } from './RsvpCanvas'
import { TransportBar } from './TransportBar'
import { EngineProvider, useEngine, useEnginePlaying } from '@/features/reader/engine-context'
import { useAutosaveProgress } from '@/features/reader/hooks/useAutosaveProgress'
import { useLoadedBook, type LoadedBook } from '@/features/reader/hooks/useLoadedBook'
import { usePageOverlay } from '@/features/reader/hooks/usePageOverlay'
import { useReaderKeyboardShortcuts } from '@/features/reader/hooks/useReaderKeyboardShortcuts'
import { useTouchControls } from '@/features/reader/hooks/useTouchControls'
import { useWakeLock } from '@/features/reader/hooks/useWakeLock'
import { useAppStore } from '@/stores/app-store'

function Centered({ children, dim }: { children: ReactNode; dim?: boolean }) {
  const color = dim ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text)]'
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 ${color}`}
    >
      {children}
    </div>
  )
}

export function ReaderScreen() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const state = useLoadedBook(bookId)

  if (state.status === 'error') {
    return (
      <Centered>
        <p>{state.message}</p>
        <Button onClick={() => navigate('/')} variant="primary">
          Back to library
        </Button>
      </Centered>
    )
  }
  if (state.status === 'loading') return <Centered dim>Loading…</Centered>

  return <ReaderContent loaded={state.loaded} />
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
  const layout = book.layout
  const navigate = useNavigate()
  const engine = useEngine()
  const playing = useEnginePlaying()
  const onTap = useTouchControls()
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)
  const areaRef = useRef<HTMLDivElement>(null)
  const overlay = usePageOverlay(areaRef)

  useReaderKeyboardShortcuts(layout)
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
            title={
              mode === 'book'
                ? 'Back to one word at a time  (B)'
                : 'Read normally, a page at a time  (B)'
            }
          >
            {mode === 'book' ? 'RSVP' : 'Book'}
          </Button>
          {mode === 'rsvp' && (
            <Button
              onClick={() => setPanelOpen(!panelOpen)}
              disabled={overlay === null}
              title={
                overlay === null
                  ? 'No room for the page without covering the word: use a smaller text size, or turn the screen upright'
                  : 'Show the page you are on  (P)'
              }
            >
              {panelOpen && overlay ? 'Page ‹' : 'Page ›'}
            </Button>
          )}
        </div>
      </header>

      <div ref={areaRef} className="relative flex min-h-0 flex-1">
        {mode === 'rsvp' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" onClick={onTap}>
            <RsvpCanvas />
          </div>
        )}
        {mode === 'book' && (
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              <PagePanel bookId={bookId} layout={layout} variant="book" />
            </div>
          </div>
        )}
        {/* Over the reading area, never beside the word: see page-overlay.ts. */}
        {mode === 'rsvp' && panelOpen && overlay && (
          <PageOverlay box={overlay} page={resolvePage(book.page)} plain={layout.kind === 'paged'}>
            <PagePanel bookId={bookId} layout={layout} variant="side" />
          </PageOverlay>
        )}
      </div>

      {mode === 'book' && layout.kind === 'paged' ? (
        <BookControls pageCount={layout.pages} />
      ) : (
        <TransportBar layout={layout} />
      )}
      <ReaderHints mode={mode} layout={layout} />
    </div>
  )
}

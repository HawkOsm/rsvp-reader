import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createEngine } from '@/core/engine'
import { BookControls } from './BookControls'
import { BookmarkButton } from './BookmarkButton'
import { ChapterName, ContentsPanel } from './ContentsPanel'
import { DisplayPanel } from './DisplayPanel'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Centered } from '@/components/Page'
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
import { useMediaQuery, WIDE } from '@/lib/media'

const MODES = [
  { value: 'rsvp', label: 'RSVP', icon: 'bolt', title: 'Back to one word at a time  (B)' },
  { value: 'book', label: 'Book', icon: 'book', title: 'Read normally, a page at a time  (B)' },
] as const

export function ReaderScreen() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const state = useLoadedBook(bookId, search.get('at'))
  // A bookmark's `?at=` has done its job once the book is open; left in the
  // address, a reload would jump back to the bookmark.
  const opened = state.status === 'ready'
  useEffect(() => {
    if (opened && search.has('at')) setSearch({}, { replace: true })
  }, [opened, search, setSearch])

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
  const showHints = useAppStore((s) => s.showHints)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)
  const areaRef = useRef<HTMLDivElement>(null)
  const overlay = usePageOverlay(areaRef)
  const wide = useMediaQuery(WIDE)
  // In book mode on a wide screen, beside the page and open at first. Over
  // the reading area otherwise (on a phone, or by the RSVP word), closed at
  // first and closed again once a chapter is picked.
  const contentsBeside = wide && mode === 'book'
  const [contentsOpen, setContentsOpen] = useState(contentsBeside)
  const hasContents = book.chapters.length > 0
  useEffect(() => setContentsOpen(contentsBeside), [contentsBeside])

  useReaderKeyboardShortcuts(layout)
  useAutosaveProgress(bookId, mode)
  useWakeLock(playing)

  // Flashing words while reading a page would be absurd.
  useEffect(() => {
    if (mode === 'book') engine.pause()
  }, [mode, engine])

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-2 py-2 text-sm sm:gap-3 sm:px-4">
        <div>
          <Button
            variant="link"
            onClick={() => navigate('/')}
            className="flex items-center gap-1 py-1.5 pr-2"
          >
            <Icon name="back" />
            <span className="sr-only sm:not-sr-only">Library</span>
          </Button>
        </div>
        <span className="flex min-w-0 flex-col items-center">
          <span className="max-w-[40vw] truncate font-serif text-[15px] font-medium">
            {book.title}
          </span>
          {hasContents && <ChapterName chapters={book.chapters} />}
        </span>
        <div className="flex items-center justify-end gap-0.5 sm:gap-2">
          <div
            role="group"
            aria-label="Reading mode"
            className="flex rounded-lg border border-border bg-bg-raised p-0.5"
          >
            {MODES.map(({ value, label, icon, title }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                title={title}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${
                  mode === value
                    ? 'bg-bg-hover font-medium text-text'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                <Icon name={icon} size={14} />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </button>
            ))}
          </div>
          {hasContents && (
            <button
              type="button"
              aria-label="Contents"
              aria-expanded={contentsOpen}
              title="Chapters"
              onClick={() => setContentsOpen(!contentsOpen)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bg-hover ${
                contentsOpen ? 'text-text' : 'text-text-dim hover:text-text'
              }`}
            >
              <Icon name="contents" size={17} />
            </button>
          )}
          {mode === 'rsvp' && (
            <Button
              className="flex items-center gap-1.5"
              aria-label={panelOpen && overlay ? 'Hide page' : 'Show page'}
              onClick={() => setPanelOpen(!panelOpen)}
              disabled={overlay === null}
              title={
                overlay === null
                  ? 'No room for the page without covering the word: use a smaller text size, or turn the screen upright'
                  : 'Show the page you are on  (P)'
              }
            >
              <Icon name="page" size={16} />
              <span className="hidden sm:inline">{panelOpen && overlay ? 'Page ‹' : 'Page ›'}</span>
            </Button>
          )}
          <BookmarkButton bookId={bookId} />
          <DisplayPanel />
        </div>
      </header>

      <div ref={areaRef} className="relative flex min-h-0 flex-1">
        {mode === 'rsvp' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" onClick={onTap}>
            <RsvpCanvas />
          </div>
        )}
        {hasContents && contentsOpen && (
          <div className={contentsBeside ? 'min-h-0' : 'absolute inset-y-0 left-0 z-20 shadow-xl'}>
            <ContentsPanel
              chapters={book.chapters}
              onPicked={contentsBeside ? undefined : () => setContentsOpen(false)}
            />
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
        <TransportBar layout={layout} chapters={book.chapters} />
      )}
      {showHints && <ReaderHints mode={mode} layout={layout} />}
    </div>
  )
}

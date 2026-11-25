import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createEngine } from '@/core/engine'
import { BookNav } from './BookNav'
import { BookmarkButton } from './BookmarkButton'
import { ReaderMenu } from './ReaderMenu'
import { Byline, ContentsPanel } from './ContentsPanel'
import { DisplayPanel } from './DisplayPanel'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Centered } from '@/components/Page'
import { resolvePage } from '@/core/page-spec'
import type { BookRecord } from '@/features/reader/api/book'
import { PageOverlay } from './PageOverlay'
import { PagePanel } from './PagePanel'
import { NotesPanel } from './NotesPanel'
import { PositionOffer } from './PositionOffer'
import { ReaderHints } from './ReaderHints'
import { RsvpCanvas } from './RsvpCanvas'
import { TransportBar } from './TransportBar'
import { EngineProvider, useEngine, useEnginePlaying } from '@/features/reader/engine-context'
import { useAutosaveProgress } from '@/features/reader/hooks/useAutosaveProgress'
import { useJumps } from '@/features/reader/hooks/useJumps'
import { useLoadedBook, type LoadedBook } from '@/features/reader/hooks/useLoadedBook'
import { usePageOverlay } from '@/features/reader/hooks/usePageOverlay'
import { useReaderKeyboardShortcuts } from '@/features/reader/hooks/useReaderKeyboardShortcuts'
import { useTouchControls } from '@/features/reader/hooks/useTouchControls'
import { useWakeLock } from '@/features/reader/hooks/useWakeLock'
import { useAppStore } from '@/stores/app-store'
import { HAS_KEYBOARD, useMediaQuery, WIDE } from '@/lib/media'

/** A mouse this near the top edge brings the header back (Readest's 44). */
const REVEAL_PX = 44
/** …and it goes this long after the mouse has left it. */
const LEAVE_MS = 500

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
  const [notesOpen, setNotesOpen] = useState(false)
  useEffect(() => setContentsOpen(contentsBeside), [contentsBeside])
  const keyboard = useMediaQuery(HAS_KEYBOARD)

  // Book mode gives the page the whole screen, however it is read. The
  // header starts in its place ('docked') and goes away as soon as the
  // reader moves through the book. After that it is laid over the page and
  // taken off again by a tap in the middle of the page, by Enter, or by a
  // mouse reaching the top edge and leaving. Over, not beside, so the page
  // keeps its size and isn't drawn again each time. Under the page there is
  // only BookNav's one line.
  const [bookControls, setBookControls] = useState<'docked' | 'hidden' | 'over'>('docked')
  useEffect(() => setBookControls('docked'), [mode])
  const onControls = useCallback(
    (show: 'toggle' | false) =>
      setBookControls((now) => (show === false || now !== 'hidden' ? 'hidden' : 'over')),
    [],
  )
  useEffect(() => {
    if (mode !== 'book') return
    return engine.on('word', () => setBookControls('hidden'))
  }, [mode, engine])
  const controlsAre = mode === 'book' ? bookControls : 'docked'
  const over = controlsAre === 'over'

  // A mouse at the top edge brings the header over the page; it goes again
  // a moment after the mouse has left it (SumatraPDF's half second).
  const headerRef = useRef<HTMLElement>(null)
  const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(leaving.current), [])
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== 'book' || event.pointerType !== 'mouse' || bookControls === 'docked') return
    const fromTop = event.clientY - event.currentTarget.getBoundingClientRect().top
    if (fromTop <= REVEAL_PX || headerRef.current?.contains(event.target as Node)) {
      clearTimeout(leaving.current)
      leaving.current = undefined
      if (bookControls === 'hidden') setBookControls('over')
    } else if (bookControls === 'over' && leaving.current === undefined) {
      leaving.current = setTimeout(() => {
        leaving.current = undefined
        setBookControls((now) => (now === 'over' ? 'hidden' : now))
      }, LEAVE_MS)
    }
  }

  const jumps = useJumps()
  const [jumpOpen, setJumpOpen] = useState(false)
  useReaderKeyboardShortcuts(layout, {
    jumps,
    onToggleControls: () => onControls('toggle'),
    onOpenJump: () => setJumpOpen(true),
  })
  useAutosaveProgress(bookId, mode)
  // Reading a page is using the screen too, without touching it for minutes.
  useWakeLock(playing || mode === 'book')

  // Flashing words while reading a page would be absurd.
  useEffect(() => {
    if (mode === 'book') engine.pause()
  }, [mode, engine])

  // Beside the title on a wide screen; behind the "⋯" menu on a phone.
  const controls = (
    <>
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
              mode === value ? 'bg-bg-hover font-medium text-text' : 'text-text-dim hover:text-text'
            }`}
          >
            <Icon name={icon} size={14} />
            {label}
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
          className={`flex items-center gap-1.5 ${
            panelOpen && overlay ? 'text-text' : 'text-text-dim hover:text-text'
          }`}
          aria-label={panelOpen && overlay ? 'Hide page' : 'Show page'}
          aria-pressed={Boolean(panelOpen && overlay)}
          onClick={() => setPanelOpen(!panelOpen)}
          disabled={overlay === null}
          title={
            overlay === null
              ? 'No room for the page without covering the word: use a smaller text size, or turn the screen upright'
              : 'Show the page you are on  (P)'
          }
        >
          <Icon name="page" size={16} />
          <span>Page</span>
        </Button>
      )}
      <BookmarkButton bookId={bookId} />
      <button
        type="button"
        aria-label="Notes"
        aria-expanded={notesOpen}
        title="Notes on this book"
        onClick={() => setNotesOpen(!notesOpen)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bg-hover ${
          notesOpen ? 'text-text' : 'text-text-dim hover:text-text'
        }`}
      >
        <Icon name="note" size={17} />
      </button>
    </>
  )

  // The root is as tall as what can be seen: less a mobile browser's address
  // bar (dvh), and less the insets the body pads itself with (index.css).
  return (
    <div
      onPointerMove={onPointerMove}
      className="relative flex h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] flex-col bg-bg text-text"
    >
      <header
        ref={headerRef}
        hidden={controlsAre === 'hidden'}
        className={`grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-2 py-2 text-sm [&:not([hidden])]:grid sm:gap-3 sm:px-4 ${
          over ? 'absolute inset-x-0 top-0 z-30 bg-bg' : ''
        }`}
      >
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
          <Byline author={book.author} chapters={book.chapters} />
        </span>
        <div className="flex items-center justify-end gap-2">
          {wide ? (
            <>
              {controls}
              <DisplayPanel />
            </>
          ) : (
            <>
              <DisplayPanel />
              <ReaderMenu>{controls}</ReaderMenu>
            </>
          )}
        </div>
      </header>
      <PositionOffer bookId={bookId} layout={layout} />

      <div ref={areaRef} className="relative flex min-h-0 flex-1">
        {mode === 'rsvp' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" onClick={onTap}>
            <RsvpCanvas />
          </div>
        )}
        {/* The panels lie over the reading area, and over the controls when
            those are laid over the page (z-30). */}
        {/* Over the page, a tap beside the list closes it, and is no tap on
            the page. */}
        {hasContents && contentsOpen && !contentsBeside && (
          <div
            aria-hidden
            data-testid="contents-backdrop"
            className="absolute inset-0 z-40"
            onClick={() => setContentsOpen(false)}
          />
        )}
        {hasContents && contentsOpen && (
          <div className={contentsBeside ? 'min-h-0' : 'absolute inset-y-0 left-0 z-40 shadow-xl'}>
            <ContentsPanel
              chapters={book.chapters}
              go={jumps.to}
              onPicked={contentsBeside ? undefined : () => setContentsOpen(false)}
            />
          </div>
        )}
        {mode === 'book' && (
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              <PagePanel bookId={bookId} layout={layout} variant="book" onControls={onControls} />
            </div>
          </div>
        )}
        {notesOpen && (
          <div className="absolute inset-y-0 right-0 z-40 shadow-xl">
            <NotesPanel
              bookId={bookId}
              title={book.title}
              author={book.author}
              totalWords={book.totalWords}
              onClose={() => setNotesOpen(false)}
            />
          </div>
        )}
        {/* Over the reading area, never beside the word: see page-overlay.ts. */}
        {mode === 'rsvp' && panelOpen && overlay && (
          <PageOverlay box={overlay} page={resolvePage(book.page)} plain={layout.kind === 'paged'}>
            <PagePanel bookId={bookId} layout={layout} variant="side" />
          </PageOverlay>
        )}
      </div>

      {mode === 'book' ? (
        <BookNav
          layout={layout}
          chapters={book.chapters}
          jumps={jumps}
          open={jumpOpen}
          onOpen={setJumpOpen}
        />
      ) : (
        <TransportBar layout={layout} chapters={book.chapters} />
      )}
      {/* Keys are no use to a finger; and in book mode they are shown only
          until the reading starts. */}
      {showHints && keyboard && controlsAre === 'docked' && (
        <ReaderHints mode={mode} layout={layout} />
      )}
    </div>
  )
}
